import { GameState } from './GameState.js';
import { BotPersonality, PlayerInput, PlayerState, PowerUpType, TileType } from '../shared/types.js';
import {
  BOMB_FUSE_TIME,
  CHAIN_REACTION_DELAY,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE
} from '../shared/constants.js';

interface Point {
  gx: number;
  gy: number;
}

interface PathNode {
  gx: number;
  gy: number;
  parent: PathNode | null;
  dist: number;
}

export class BotAI {
  private botId: string;
  private personality: BotPersonality;
  private reactionTimer: number = 0; // Humanized reaction window (150ms - 280ms)
  private currentPathStep: Point | null = null;
  private actionCooldown: number = 0;

  constructor(botId: string, personality: BotPersonality = 'tactical') {
    this.botId = botId;
    this.personality = personality;
    this.resetReactionTimer();
  }

  public reset(): void {
    this.currentPathStep = null;
    this.actionCooldown = 0;
    this.resetReactionTimer();
  }

  private resetReactionTimer(): void {
    // Humanized reaction window between 150ms and 280ms
    this.reactionTimer = 0.15 + Math.random() * 0.13;
  }

  public computeInput(state: GameState, dt: number): PlayerInput {
    const defaultInput: PlayerInput = { dx: 0, dy: 0, placeBomb: false };
    const bot = state.players.get(this.botId);
    if (!bot || !bot.alive || state.phase !== 'playing') {
      return defaultInput;
    }

    if (bot.botPersonality && bot.botPersonality !== this.personality) {
      this.personality = bot.botPersonality;
    }

    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.reactionTimer -= dt;

    const botGx = Math.floor(bot.x / TILE_SIZE);
    const botGy = Math.floor(bot.y / TILE_SIZE);

    // 1. Build Real-Time Danger Grid (bombs + chain reactions + volatiles + sliding bombs + sudden death)
    const dangerTimers = this.buildDangerGrid(state);
    const curDanger = dangerTimers[botGy]?.[botGx] ?? Infinity;
    const isCurrentlyInDanger = curDanger !== Infinity;

    // Clear finished path step once centered inside target tile
    if (this.currentPathStep) {
      const targetCenterX = this.currentPathStep.gx * TILE_SIZE + TILE_SIZE / 2;
      const targetCenterY = this.currentPathStep.gy * TILE_SIZE + TILE_SIZE / 2;
      if (Math.hypot(bot.x - targetCenterX, bot.y - targetCenterY) <= 4) {
        this.currentPathStep = null;
      } else if (!isCurrentlyInDanger) {
        // Cancel queued move immediately if target step just became unsafe or blocked
        const stepDanger = dangerTimers[this.currentPathStep.gy]?.[this.currentPathStep.gx] ?? 0;
        const stepWalkable = this.isTileWalkableForBot(state, this.currentPathStep.gx, this.currentPathStep.gy);
        if (stepDanger !== Infinity || !stepWalkable) {
          this.currentPathStep = null;
          this.reactionTimer = 0;
        }
      }
    }

    // Immediate emergency reaction when in danger, or regular tactical decision window
    if (isCurrentlyInDanger || (this.reactionTimer <= 0 && !this.currentPathStep) || this.reactionTimer <= -0.15) {
      this.resetReactionTimer();

      // --- HIERARQUIA 1: SOBREVIVÊNCIA (Evade) ---
      if (isCurrentlyInDanger) {
        this.currentPathStep = this.findImmediateStepToSafety(state, botGx, botGy, dangerTimers, bot.powerUps.speed);
        if (this.currentPathStep) {
          return this.moveTowardTile(bot, this.currentPathStep.gx, this.currentPathStep.gy, false);
        }
        return defaultInput;
      }

      const canDropBomb =
        this.actionCooldown <= 0 &&
        bot.activeBombs < bot.powerUps.bombLimit &&
        !state.bombs.some(b => b.gx === botGx && b.gy === botGy);

      if (this.personality === 'tactical') {
        // --- HIERARQUIA 2 (Tactical): COLETA (Farm visible safe power-ups) ---
        if (state.powerUps.length > 0) {
          const farmStep = this.findStepTowardPowerUp(state, botGx, botGy, dangerTimers, 14);
          if (farmStep) {
            this.currentPathStep = farmStep;
            return this.moveTowardTile(bot, farmStep.gx, farmStep.gy, false);
          }
        }

        // --- HIERARQUIA 3: ATAQUE / EXPANSÃO (Anti-Suicide Lookahead) ---
        if (canDropBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers);
          if (escapeStep) {
            this.actionCooldown = 1.35;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        const engageStep =
          this.findStepTowardEnemy(state, botGx, botGy, dangerTimers) ??
          this.findStepTowardBreakableBlock(state, botGx, botGy, dangerTimers);

        if (engageStep) {
          this.currentPathStep = engageStep;
          return this.moveTowardTile(bot, engageStep.gx, engageStep.gy, false);
        }
      } else {
        // Aggressive bot: pressures enemies & clears crates aggressively, farms nearby upgrades
        if (canDropBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers);
          if (escapeStep) {
            this.actionCooldown = 1.15;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        if (state.powerUps.length > 0) {
          const nearbyFarm = this.findStepTowardPowerUp(state, botGx, botGy, dangerTimers, 5);
          if (nearbyFarm) {
            this.currentPathStep = nearbyFarm;
            return this.moveTowardTile(bot, nearbyFarm.gx, nearbyFarm.gy, false);
          }
        }

        const engageStep =
          this.findStepTowardEnemy(state, botGx, botGy, dangerTimers) ??
          this.findStepTowardBreakableBlock(state, botGx, botGy, dangerTimers);

        if (engageStep) {
          this.currentPathStep = engageStep;
          return this.moveTowardTile(bot, engageStep.gx, engageStep.gy, false);
        }
      }
    }

    if (this.currentPathStep) {
      return this.moveTowardTile(bot, this.currentPathStep.gx, this.currentPathStep.gy, false);
    }

    return defaultInput;
  }

  /**
   * Real-Time Danger Grid:
   * Maps 2D grid storing minimum remaining seconds until explosion per tile.
   * Accounts for explosions, bombs, chained detonations, volatile barrels,
   * kicked/sliding bombs, and imminent Sudden Death tiles.
   */
  public buildDangerGrid(state: GameState): number[][] {
    const danger: number[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(Infinity)
    );

    // Active explosions = immediate danger (0.0s)
    for (const exp of state.explosions) {
      for (const cell of exp.cells) {
        if (cell.gy >= 0 && cell.gy < GRID_ROWS && cell.gx >= 0 && cell.gx < GRID_COLS) {
          danger[cell.gy][cell.gx] = 0.0;
        }
      }
    }

    // Imminent Sudden Death drops
    const upcomingSudden = state.getUpcomingSuddenDeathTiles(3);
    upcomingSudden.forEach((pt, idx) => {
      if (pt.y >= 0 && pt.y < GRID_ROWS && pt.x >= 0 && pt.x < GRID_COLS) {
        const eta = idx === 0 ? 0.55 : idx * 0.85;
        danger[pt.y][pt.x] = Math.min(danger[pt.y][pt.x], eta);
      }
    });

    if (state.bombs.length === 0) return danger;

    // Seed effective fuse timers (factoring in active chainQueue delays)
    const chainQueue = state.getChainQueue();
    const effectiveFuses = state.bombs.map((b) => {
      const queued = chainQueue.find(e => e.bomb === b);
      return queued ? Math.min(b.fuseTimer, Math.max(0.01, queued.delayTimer)) : b.fuseTimer;
    });

    // Propagate bomb-to-bomb chain reactions (3 passes covers deep chains cleanly)
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < state.bombs.length; i++) {
        const bA = state.bombs[i];
        const fuseA = effectiveFuses[i];
        const cellsA = this.computeBombBlastTiles(state.grid, bA.gx, bA.gy, bA.fireRange);

        for (let j = 0; j < state.bombs.length; j++) {
          if (i === j) continue;
          const bB = state.bombs[j];
          if (cellsA.some(c => c.gx === bB.gx && c.gy === bB.gy)) {
            const chainFuse = fuseA + CHAIN_REACTION_DELAY;
            if (chainFuse < effectiveFuses[j]) {
              effectiveFuses[j] = chainFuse;
              changed = true;
            }
          }
        }
      }
      if (!changed) break;
    }

    // Apply all bombs + sliding projections + volatile bursts to danger matrix
    for (let i = 0; i < state.bombs.length; i++) {
      const bomb = state.bombs[i];
      const fuse = effectiveFuses[i];
      this.markBombDanger(danger, state.grid, bomb.gx, bomb.gy, bomb.fireRange, fuse);

      // Project trajectory if sliding on conveyor or kicked
      if (bomb.slidingVx !== 0 || bomb.slidingVy !== 0) {
        const stepX = Math.sign(bomb.slidingVx);
        const stepY = Math.sign(bomb.slidingVy);
        const slideSpeed = Math.hypot(bomb.slidingVx, bomb.slidingVy);
        for (let s = 1; s <= 4; s++) {
          const px = bomb.gx + stepX * s;
          const py = bomb.gy + stepY * s;
          if (!this.isTileWalkableForBot(state, px, py)) break;
          const eta = Math.min(fuse, (s * TILE_SIZE) / Math.max(80, slideSpeed));
          danger[py][px] = Math.min(danger[py][px], Math.max(0.1, eta));
          this.markBombDanger(danger, state.grid, px, py, bomb.fireRange, Math.max(0.25, fuse));
        }
      }
    }

    return danger;
  }

  private computeBombBlastTiles(
    grid: number[][],
    bgx: number,
    bgy: number,
    range: number
  ): Point[] {
    const out: Point[] = [{ gx: bgx, gy: bgy }];
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const d of dirs) {
      for (let dist = 1; dist <= range; dist++) {
        const gx = bgx + d.dx * dist;
        const gy = bgy + d.dy * dist;
        if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) break;

        const tile = grid[gy][gx];
        if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) break;
        out.push({ gx, gy });
        if (tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK) break;
      }
    }
    return out;
  }

  private markBombDanger(
    danger: number[][],
    grid: number[][],
    bgx: number,
    bgy: number,
    range: number,
    fuseTimer: number
  ): void {
    if (bgy >= 0 && bgy < GRID_ROWS && bgx >= 0 && bgx < GRID_COLS) {
      danger[bgy][bgx] = Math.min(danger[bgy][bgx], fuseTimer);
    }

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    const visitedVolatiles = new Set<string>();

    for (const d of dirs) {
      for (let dist = 1; dist <= range; dist++) {
        const gx = bgx + d.dx * dist;
        const gy = bgy + d.dy * dist;

        if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) break;

        const tile = grid[gy][gx];
        if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) {
          break;
        }

        danger[gy][gx] = Math.min(danger[gy][gx], fuseTimer);

        if (tile === TileType.VOLATILE_BLOCK) {
          this.markVolatileDanger(danger, grid, gx, gy, fuseTimer, visitedVolatiles);
          break;
        }

        if (tile === TileType.SOFT_BLOCK) {
          break;
        }
      }
    }
  }

  private markVolatileDanger(
    danger: number[][],
    grid: number[][],
    vx: number,
    vy: number,
    fuseTimer: number,
    visited: Set<string>
  ): void {
    const key = `${vx},${vy}`;
    if (visited.has(key)) return;
    visited.add(key);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = vx + dx;
        const ny = vy + dy;
        if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;
        const tile = grid[ny][nx];
        if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) continue;
        danger[ny][nx] = Math.min(danger[ny][nx], fuseTimer);
        if (tile === TileType.VOLATILE_BLOCK) {
          this.markVolatileDanger(danger, grid, nx, ny, fuseTimer, visited);
        }
      }
    }
  }

  private isTileWalkableForBot(state: GameState, gx: number, gy: number): boolean {
    if (gx < 1 || gx >= GRID_COLS - 1 || gy < 1 || gy >= GRID_ROWS - 1) return false;
    const tile = state.grid[gy][gx];
    const walkableType =
      tile === TileType.EMPTY ||
      tile === TileType.ICE_FLOOR ||
      tile === TileType.CONVEYOR_UP ||
      tile === TileType.CONVEYOR_DOWN ||
      tile === TileType.CONVEYOR_LEFT ||
      tile === TileType.CONVEYOR_RIGHT ||
      tile === TileType.TELEPORT_A ||
      tile === TileType.TELEPORT_B;

    if (!walkableType) return false;

    const blockingBomb = state.bombs.some(
      b => b.gx === gx && b.gy === gy && !(b.overlapPlayers && b.overlapPlayers.includes(this.botId))
    );
    return !blockingBomb;
  }

  /**
   * BFS to find closest reachable SAFE (Infinity) tile before timer expires.
   * CRITICAL RULE: Never cross a tile whose explosion timer is < 0.40s
   * or expires before the bot reaches it!
   */
  private findImmediateStepToSafety(
    state: GameState,
    startGx: number,
    startGy: number,
    danger: number[][],
    speed: number,
    maxTravelSec: number = Infinity
  ): Point | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>([`${startGx},${startGy}`]);

    let fallbackNode: PathNode | null = null;
    let bestFallbackTimer = danger[startGy]?.[startGx] ?? 0;

    while (queue.length > 0) {
      const cur = queue.shift()!;

      if (cur.dist > 0 && danger[cur.gy][cur.gx] === Infinity) {
        return this.getFirstStepFromPath(cur, startGx, startGy);
      }

      const neighbors = [
        { gx: cur.gx, gy: cur.gy - 1 },
        { gx: cur.gx, gy: cur.gy + 1 },
        { gx: cur.gx - 1, gy: cur.gy },
        { gx: cur.gx + 1, gy: cur.gy }
      ];

      for (const n of neighbors) {
        const key = `${n.gx},${n.gy}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (!this.isTileWalkableForBot(state, n.gx, n.gy)) continue;
        // Also avoid stepping onto another bomb tile when evacuating
        if (state.bombs.some(b => b.gx === n.gx && b.gy === n.gy)) continue;

        const travelSec = ((cur.dist + 1) * TILE_SIZE) / Math.max(110, speed) + 0.18;
        if (travelSec > maxTravelSec) continue;

        const nTimer = danger[n.gy][n.gx];

        // Track safest fallback neighbor just in case bot was boxed in by players
        if (nTimer >= 0.40 && nTimer > bestFallbackTimer) {
          bestFallbackTimer = nTimer;
          fallbackNode = { gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 };
        }

        // Strict survival rule: never traverse tiles under 0.40s or expiring before arrival
        if (nTimer !== Infinity && (nTimer < 0.40 || nTimer <= travelSec)) {
          continue;
        }

        queue.push({ gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 });
      }
    }

    if (maxTravelSec === Infinity && fallbackNode) {
      return this.getFirstStepFromPath(fallbackNode, startGx, startGy);
    }

    return null;
  }

  private getFirstStepFromPath(node: PathNode, startGx: number, startGy: number): Point {
    const path: Point[] = [];
    let curr: PathNode | null = node;
    while (curr) {
      path.unshift({ gx: curr.gx, gy: curr.gy });
      curr = curr.parent;
    }

    if (path.length > 1) {
      return path[1];
    }
    return { gx: startGx, gy: startGy };
  }

  /**
   * Lookahead Anti-Suicide Rule:
   * Confirms bot is centered on current safe tile, has a valid target
   * (adjacent soft/volatile block or enemy in LOS), AND simulates new Danger Grid
   * confirming a safe escape tile is strictly reachable in time.
   */
  public checkSafeBombPlacement(
    state: GameState,
    bot: PlayerState,
    gx: number,
    gy: number,
    danger: number[][]
  ): Point | null {
    // Only drop offensive bombs when currently safe & near tile center
    if (danger[gy]?.[gx] !== Infinity) return null;

    const tileCenterX = gx * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = gy * TILE_SIZE + TILE_SIZE / 2;
    if (Math.hypot(bot.x - tileCenterX, bot.y - tileCenterY) > 12) return null;

    let hasTarget = false;

    // Target 1: Adjacent destructible or volatile block
    const neighbors = [
      { gx, gy: gy - 1 },
      { gx, gy: gy + 1 },
      { gx: gx - 1, gy },
      { gx: gx + 1, gy }
    ];
    for (const n of neighbors) {
      if (n.gx >= 0 && n.gx < GRID_COLS && n.gy >= 0 && n.gy < GRID_ROWS) {
        const tile = state.grid[n.gy][n.gx];
        if (tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK) {
          hasTarget = true;
          break;
        }
      }
    }

    // Target 2: Opponent in orthogonal blast line of sight or close corner trap
    if (!hasTarget) {
      const enemyCoords: Point[] = [];
      for (const p of state.players.values()) {
        if (p.id !== this.botId && p.alive) {
          enemyCoords.push({ gx: Math.floor(p.x / TILE_SIZE), gy: Math.floor(p.y / TILE_SIZE) });
        }
      }

      // Check blast rays for unobstructed enemy
      const blastCells = this.computeBombBlastTiles(state.grid, gx, gy, bot.powerUps.fireRange);
      if (enemyCoords.some(e => blastCells.some(c => c.gx === e.gx && c.gy === e.gy))) {
        hasTarget = true;
      } else if (
        this.personality === 'aggressive' &&
        enemyCoords.some(e => Math.abs(e.gx - gx) + Math.abs(e.gy - gy) <= 2)
      ) {
        hasTarget = true;
      }
    }

    if (!hasTarget) return null;

    // Simulate danger grid adding our bomb (reserve 0.45s margin against reaction + cornering)
    const simDanger = danger.map(row => [...row]);
    this.markBombDanger(simDanger, state.grid, gx, gy, bot.powerUps.fireRange, BOMB_FUSE_TIME - 0.3);

    // Require an actual SAFE (Infinity) tile reachable strictly within 1.85s
    const escapeStep = this.findImmediateStepToSafety(state, gx, gy, simDanger, bot.powerUps.speed, 1.85);
    return escapeStep;
  }

  private findStepTowardPowerUp(
    state: GameState,
    botGx: number,
    botGy: number,
    danger: number[][],
    maxDist: number
  ): Point | null {
    let bestStep: Point | null = null;
    let bestDist = Infinity;

    for (const p of state.powerUps) {
      // Never intentionally pursue Skull curse!
      if (p.type === PowerUpType.SKULL) continue;
      if (danger[p.gy]?.[p.gx] !== Infinity) continue;

      const res = this.bfsToDestination(state, botGx, botGy, p.gx, p.gy, danger, 0, maxDist);
      if (res && res.dist < bestDist) {
        bestDist = res.dist;
        bestStep = res.step;
      }
    }
    return bestStep;
  }

  private findStepTowardEnemy(
    state: GameState,
    botGx: number,
    botGy: number,
    danger: number[][]
  ): Point | null {
    let closestEnemy: PlayerState | null = null;
    let minManhattan = Infinity;

    for (const p of state.players.values()) {
      if (p.id !== this.botId && p.alive) {
        const egx = Math.floor(p.x / TILE_SIZE);
        const egy = Math.floor(p.y / TILE_SIZE);
        const dist = Math.abs(egx - botGx) + Math.abs(egy - botGy);
        if (dist < minManhattan) {
          minManhattan = dist;
          closestEnemy = p;
        }
      }
    }

    if (!closestEnemy) return null;
    const egx = Math.floor(closestEnemy.x / TILE_SIZE);
    const egy = Math.floor(closestEnemy.y / TILE_SIZE);
    const res = this.bfsToDestination(state, botGx, botGy, egx, egy, danger, 1, 24);
    return res ? res.step : null;
  }

  /**
   * When direct corridors to opponents are sealed by SOFT_BLOCKs (such as at match start),
   * find the nearest safe walkable tile adjacent to a destructible block biased toward enemies.
   */
  private findStepTowardBreakableBlock(
    state: GameState,
    startGx: number,
    startGy: number,
    danger: number[][]
  ): Point | null {
    // Reference goal = closest alive opponent (or arena center)
    let goalX = Math.floor(GRID_COLS / 2);
    let goalY = Math.floor(GRID_ROWS / 2);
    let bestEnemyDist = Infinity;

    for (const p of state.players.values()) {
      if (p.id !== this.botId && p.alive) {
        const egx = Math.floor(p.x / TILE_SIZE);
        const egy = Math.floor(p.y / TILE_SIZE);
        const d = Math.abs(egx - startGx) + Math.abs(egy - startGy);
        if (d < bestEnemyDist) {
          bestEnemyDist = d;
          goalX = egx;
          goalY = egy;
        }
      }
    }

    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>([`${startGx},${startGy}`]);

    let bestCandidate: PathNode | null = null;
    let bestScore = Infinity;

    while (queue.length > 0 && visited.size < 160) {
      const cur = queue.shift()!;

      if (cur.dist > 0) {
        const adj = [
          { gx: cur.gx, gy: cur.gy - 1 },
          { gx: cur.gx, gy: cur.gy + 1 },
          { gx: cur.gx - 1, gy: cur.gy },
          { gx: cur.gx + 1, gy: cur.gy }
        ];
        const touchesSoftBlock = adj.some(a => {
          const t = state.grid[a.gy]?.[a.gx];
          return t === TileType.SOFT_BLOCK || t === TileType.VOLATILE_BLOCK;
        });

        if (touchesSoftBlock) {
          const score = cur.dist * 1.35 + Math.abs(cur.gx - goalX) + Math.abs(cur.gy - goalY);
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = cur;
          }
        }
      }

      const neighbors = [
        { gx: cur.gx, gy: cur.gy - 1 },
        { gx: cur.gx, gy: cur.gy + 1 },
        { gx: cur.gx - 1, gy: cur.gy },
        { gx: cur.gx + 1, gy: cur.gy }
      ];

      for (const n of neighbors) {
        const key = `${n.gx},${n.gy}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (!this.isTileWalkableForBot(state, n.gx, n.gy)) continue;
        if (danger[n.gy][n.gx] !== Infinity) continue;

        queue.push({ gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 });
      }
    }

    if (bestCandidate) {
      return this.getFirstStepFromPath(bestCandidate, startGx, startGy);
    }
    return null;
  }

  private bfsToDestination(
    state: GameState,
    startGx: number,
    startGy: number,
    destGx: number,
    destGy: number,
    danger: number[][],
    stopDistance: number,
    maxDist: number
  ): { step: Point; dist: number } | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>([`${startGx},${startGy}`]);

    while (queue.length > 0) {
      const cur = queue.shift()!;

      if (Math.abs(cur.gx - destGx) + Math.abs(cur.gy - destGy) <= stopDistance) {
        if (cur.dist === 0) return null;
        return {
          step: this.getFirstStepFromPath(cur, startGx, startGy),
          dist: cur.dist
        };
      }

      if (cur.dist >= maxDist) continue;

      const neighbors = [
        { gx: cur.gx, gy: cur.gy - 1 },
        { gx: cur.gx, gy: cur.gy + 1 },
        { gx: cur.gx - 1, gy: cur.gy },
        { gx: cur.gx + 1, gy: cur.gy }
      ];

      for (const n of neighbors) {
        const key = `${n.gx},${n.gy}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (!this.isTileWalkableForBot(state, n.gx, n.gy)) continue;
        if (danger[n.gy][n.gx] !== Infinity) continue;

        queue.push({ gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 });
      }
    }

    return null;
  }

  private moveTowardTile(bot: PlayerState, targetGx: number, targetGy: number, placeBomb: boolean): PlayerInput {
    const targetCenterX = targetGx * TILE_SIZE + TILE_SIZE / 2;
    const targetCenterY = targetGy * TILE_SIZE + TILE_SIZE / 2;

    const diffX = targetCenterX - bot.x;
    const diffY = targetCenterY - bot.y;

    let dx = 0;
    let dy = 0;

    const threshold = 3;

    if (Math.abs(diffX) > threshold) {
      dx = diffX > 0 ? 1 : -1;
    } else if (Math.abs(diffY) > threshold) {
      dy = diffY > 0 ? 1 : -1;
    }

    return { dx, dy, placeBomb };
  }
}
