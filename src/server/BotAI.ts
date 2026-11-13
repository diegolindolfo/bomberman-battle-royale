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
  private reactionTimer: number = 0; // Humanized reaction window
  private currentPathStep: Point | null = null;
  private actionCooldown: number = 0;

  constructor(botId: string, personality: BotPersonality = 'strategist') {
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
    if (this.personality === 'aggressive') {
      // Fast, reactive hunter (110ms - 200ms)
      this.reactionTimer = 0.11 + Math.random() * 0.09;
    } else if (this.personality === 'defensive') {
      // Cautious, steady pacing (180ms - 280ms)
      this.reactionTimer = 0.18 + Math.random() * 0.10;
    } else {
      // Strategist balanced deliberation (140ms - 230ms)
      this.reactionTimer = 0.14 + Math.random() * 0.09;
    }
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

    // Immediate emergency reaction when in danger, or regular decision window
    if (isCurrentlyInDanger || (this.reactionTimer <= 0 && !this.currentPathStep) || this.reactionTimer <= -0.15) {
      this.resetReactionTimer();

      // --- HIERARQUIA 1 (COMUM): SOBREVIVÊNCIA (Evade) ---
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

      if (this.personality === 'defensive') {
        // --- PERFIL DEFENSIVO: Controle de zona segura, escudo/velocidade e baixo risco ---
        // 1. Retreats inward early before Sudden Death traps outer ring
        const onOuterPerimeter = botGx <= 2 || botGx >= GRID_COLS - 3 || botGy <= 2 || botGy >= GRID_ROWS - 3;
        if ((state.suddenDeathActive || state.timer <= 15) && onOuterPerimeter) {
          const inwardStep = this.findStepTowardSafeCenter(state, botGx, botGy, dangerTimers);
          if (inwardStep) {
            this.currentPathStep = inwardStep;
            return this.moveTowardTile(bot, inwardStep.gx, inwardStep.gy, false);
          }
        }

        // 2. Prioritizes defensive & survival power-ups (Shield > Speed > Kick)
        if (state.powerUps.length > 0) {
          const farmStep = this.findStepTowardPowerUp(
            state,
            botGx,
            botGy,
            dangerTimers,
            11,
            [PowerUpType.SHIELD, PowerUpType.SPEED_UP, PowerUpType.BOMB_KICK]
          );
          if (farmStep) {
            this.currentPathStep = farmStep;
            return this.moveTowardTile(bot, farmStep.gx, farmStep.gy, false);
          }
        }

        // 3. Only drops bomb with strict safety margin (1.65s) and safe cover
        if (canDropBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers, 1.65, true);
          if (escapeStep) {
            this.actionCooldown = 1.65;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        // 4. Keeps comfortable distance from aggressive enemies or opens safe crates
        const keepAwayStep = this.findDefensiveSpacingStep(state, botGx, botGy, dangerTimers);
        if (keepAwayStep) {
          this.currentPathStep = keepAwayStep;
          return this.moveTowardTile(bot, keepAwayStep.gx, keepAwayStep.gy, false);
        }

        const safeExpandStep = this.findStepTowardBreakableBlock(state, botGx, botGy, dangerTimers, true);
        if (safeExpandStep) {
          this.currentPathStep = safeExpandStep;
          return this.moveTowardTile(bot, safeExpandStep.gx, safeExpandStep.gy, false);
        }
      } else if (this.personality === 'aggressive') {
        // --- PERFIL ATAQUE: Pressão constante, caça direta aos oponentes e ritmo acelerado ---
        if (canDropBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers, 1.80, false);
          if (escapeStep) {
            this.actionCooldown = 0.85;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        // 1. Hunts nearest reachable enemy immediately
        const huntStep = this.findStepTowardEnemy(state, botGx, botGy, dangerTimers);
        if (huntStep) {
          this.currentPathStep = huntStep;
          return this.moveTowardTile(bot, huntStep.gx, huntStep.gy, false);
        }

        // 2. Grabs nearby offensive upgrades along the route
        if (state.powerUps.length > 0) {
          const nearbyFarm = this.findStepTowardPowerUp(
            state,
            botGx,
            botGy,
            dangerTimers,
            5,
            [PowerUpType.FIRE_UP, PowerUpType.BOMB_UP, PowerUpType.SPEED_UP]
          );
          if (nearbyFarm) {
            this.currentPathStep = nearbyFarm;
            return this.moveTowardTile(bot, nearbyFarm.gx, nearbyFarm.gy, false);
          }
        }

        // 3. Blasts directly through crates along shortest path toward closest opponent
        const breachStep = this.findStepTowardBreakableBlock(state, botGx, botGy, dangerTimers, false);
        if (breachStep) {
          this.currentPathStep = breachStep;
          return this.moveTowardTile(bot, breachStep.gx, breachStep.gy, false);
        }
      } else {
        // --- PERFIL ESTRATEGISTA: Maximiza multi-blocos, barris voláteis, armadilhas e power-ups ---
        // 1. Wide tactical farm prioritizing Fire, Bomb, Kick, Shield
        if (state.powerUps.length > 0) {
          const farmStep = this.findStepTowardPowerUp(
            state,
            botGx,
            botGy,
            dangerTimers,
            16,
            [PowerUpType.FIRE_UP, PowerUpType.BOMB_UP, PowerUpType.BOMB_KICK, PowerUpType.SHIELD]
          );
          if (farmStep) {
            this.currentPathStep = farmStep;
            return this.moveTowardTile(bot, farmStep.gx, farmStep.gy, false);
          }
        }

        // 2. Drop bomb if current tile offers high tactical value (multi-crate, volatile chain, or enemy line)
        if (canDropBomb) {
          const score = this.evaluateStrategicTileScore(state, bot, botGx, botGy);
          const bestNearbyTile = this.findStepTowardBestStrategicTile(state, bot, botGx, botGy, dangerTimers);
          // Drop immediately if current position is already high-value (>=2) or hits an enemy, or no higher spot is nearby
          if (score >= 2 || !bestNearbyTile) {
            const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers, 1.85, false);
            if (escapeStep) {
              this.actionCooldown = 1.25;
              this.currentPathStep = escapeStep;
              return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
            }
          } else {
            this.currentPathStep = bestNearbyTile;
            return this.moveTowardTile(bot, bestNearbyTile.gx, bestNearbyTile.gy, false);
          }
        }

        const strategicStep =
          this.findStepTowardBestStrategicTile(state, bot, botGx, botGy, dangerTimers) ??
          this.findStepTowardEnemy(state, botGx, botGy, dangerTimers) ??
          this.findStepTowardBreakableBlock(state, botGx, botGy, dangerTimers, false);

        if (strategicStep) {
          this.currentPathStep = strategicStep;
          return this.moveTowardTile(bot, strategicStep.gx, strategicStep.gy, false);
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
    danger: number[][],
    maxEscapeSec: number = 1.85,
    requireMultiExit: boolean = false
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

      const blastCells = this.computeBombBlastTiles(state.grid, gx, gy, bot.powerUps.fireRange);
      if (enemyCoords.some(e => blastCells.some(c => c.gx === e.gx && c.gy === e.gy))) {
        hasTarget = true;
      } else if (
        this.personality === 'aggressive' &&
        enemyCoords.some(e => Math.abs(e.gx - gx) + Math.abs(e.gy - gy) <= 3)
      ) {
        hasTarget = true;
      } else if (
        this.personality === 'strategist' &&
        enemyCoords.some(e => Math.abs(e.gx - gx) + Math.abs(e.gy - gy) <= 2)
      ) {
        hasTarget = true;
      }
    }

    if (!hasTarget) return null;

    // Simulate danger grid adding our bomb
    const simDanger = danger.map(row => [...row]);
    this.markBombDanger(simDanger, state.grid, gx, gy, bot.powerUps.fireRange, BOMB_FUSE_TIME - 0.3);

    // Defensive bots avoid trapping themselves into 1-way dead-ends
    if (requireMultiExit) {
      const safeNeighbors = neighbors.filter(
        n => this.isTileWalkableForBot(state, n.gx, n.gy) && simDanger[n.gy][n.gx] >= 0.40
      );
      if (safeNeighbors.length < 1) return null;
    }

    const escapeStep = this.findImmediateStepToSafety(state, gx, gy, simDanger, bot.powerUps.speed, maxEscapeSec);
    if (!escapeStep) return null;

    if (requireMultiExit) {
      // Confirm escape direction has at least 2 walkable exits once cleared so defensive bot isn't easily cornered
      const exitsFromEscape = [
        { gx: escapeStep.gx, gy: escapeStep.gy - 1 },
        { gx: escapeStep.gx, gy: escapeStep.gy + 1 },
        { gx: escapeStep.gx - 1, gy: escapeStep.gy },
        { gx: escapeStep.gx + 1, gy: escapeStep.gy }
      ].filter(n => this.isTileWalkableForBot(state, n.gx, n.gy)).length;
      if (exitsFromEscape < 2) return null;
    }

    return escapeStep;
  }

  private findStepTowardPowerUp(
    state: GameState,
    botGx: number,
    botGy: number,
    danger: number[][],
    maxDist: number,
    priorityOrder: PowerUpType[] = []
  ): Point | null {
    let bestStep: Point | null = null;
    let bestScore = Infinity;

    for (const p of state.powerUps) {
      // Never intentionally pursue Skull curse!
      if (p.type === PowerUpType.SKULL) continue;
      if (danger[p.gy]?.[p.gx] !== Infinity) continue;

      const res = this.bfsToDestination(state, botGx, botGy, p.gx, p.gy, danger, 0, maxDist);
      if (res) {
        const prioIdx = priorityOrder.indexOf(p.type);
        const prioBonus = prioIdx >= 0 ? (priorityOrder.length - prioIdx) * 1.4 : 0;
        const score = res.dist - prioBonus;
        if (score < bestScore) {
          bestScore = score;
          bestStep = res.step;
        }
      }
    }
    return bestStep;
  }

  private findStepTowardSafeCenter(
    state: GameState,
    botGx: number,
    botGy: number,
    danger: number[][]
  ): Point | null {
    const cx = Math.floor(GRID_COLS / 2);
    const cy = Math.floor(GRID_ROWS / 2);
    const res = this.bfsToDestination(state, botGx, botGy, cx, cy, danger, 2, 16);
    return res ? res.step : null;
  }

  private findDefensiveSpacingStep(
    state: GameState,
    botGx: number,
    botGy: number,
    danger: number[][]
  ): Point | null {
    let tooCloseEnemy: Point | null = null;
    let closestDist = Infinity;

    for (const p of state.players.values()) {
      if (p.id !== this.botId && p.alive) {
        const egx = Math.floor(p.x / TILE_SIZE);
        const egy = Math.floor(p.y / TILE_SIZE);
        const d = Math.abs(egx - botGx) + Math.abs(egy - botGy);
        if (d <= 2 && d < closestDist) {
          closestDist = d;
          tooCloseEnemy = { gx: egx, gy: egy };
        }
      }
    }

    if (!tooCloseEnemy) return null;

    const neighbors = [
      { gx: botGx, gy: botGy - 1 },
      { gx: botGx, gy: botGy + 1 },
      { gx: botGx - 1, gy: botGy },
      { gx: botGx + 1, gy: botGy }
    ];

    let bestTile: Point | null = null;
    let bestScore = -Infinity;
    const cx = Math.floor(GRID_COLS / 2);
    const cy = Math.floor(GRID_ROWS / 2);

    for (const n of neighbors) {
      if (!this.isTileWalkableForBot(state, n.gx, n.gy)) continue;
      if (danger[n.gy][n.gx] !== Infinity) continue;

      const enemyDist = Math.abs(n.gx - tooCloseEnemy.gx) + Math.abs(n.gy - tooCloseEnemy.gy);
      const centerBonus = -(Math.abs(n.gx - cx) + Math.abs(n.gy - cy)) * 0.25;
      const score = enemyDist + centerBonus;
      if (score > bestScore) {
        bestScore = score;
        bestTile = n;
      }
    }
    return bestTile;
  }

  private evaluateStrategicTileScore(
    state: GameState,
    bot: PlayerState,
    gx: number,
    gy: number
  ): number {
    const blastCells = this.computeBombBlastTiles(state.grid, gx, gy, bot.powerUps.fireRange);
    let score = 0;

    for (const c of blastCells) {
      const tile = state.grid[c.gy]?.[c.gx];
      if (tile === TileType.SOFT_BLOCK) score += 1;
      else if (tile === TileType.VOLATILE_BLOCK) score += 2.5;
    }

    for (const p of state.players.values()) {
      if (p.id !== this.botId && p.alive) {
        const egx = Math.floor(p.x / TILE_SIZE);
        const egy = Math.floor(p.y / TILE_SIZE);
        if (blastCells.some(c => c.gx === egx && c.gy === egy)) {
          score += 3;
        } else if (Math.abs(egx - gx) + Math.abs(egy - gy) <= 2) {
          score += 1.5;
        }
      }
    }

    return score;
  }

  private findStepTowardBestStrategicTile(
    state: GameState,
    bot: PlayerState,
    startGx: number,
    startGy: number,
    danger: number[][]
  ): Point | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>([`${startGx},${startGy}`]);

    let bestCandidate: PathNode | null = null;
    let bestValue = -Infinity;

    while (queue.length > 0 && visited.size < 120) {
      const cur = queue.shift()!;

      if (cur.dist > 0 && cur.dist <= 7) {
        const tileScore = this.evaluateStrategicTileScore(state, bot, cur.gx, cur.gy);
        if (tileScore >= 2) {
          const value = tileScore * 2.2 - cur.dist;
          if (value > bestValue) {
            bestValue = value;
            bestCandidate = cur;
          }
        }
      }

      if (cur.dist >= 7) continue;

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

    return bestCandidate ? this.getFirstStepFromPath(bestCandidate, startGx, startGy) : null;
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
   * find the nearest safe walkable tile adjacent to a destructible block.
   * Aggressive/Strategist bias toward enemies; Defensive biases toward safe central lanes.
   */
  private findStepTowardBreakableBlock(
    state: GameState,
    startGx: number,
    startGy: number,
    danger: number[][],
    preferCenterSafety: boolean = false
  ): Point | null {
    let goalX = Math.floor(GRID_COLS / 2);
    let goalY = Math.floor(GRID_ROWS / 2);

    if (!preferCenterSafety) {
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

    if (Math.abs(diffX) >= Math.abs(diffY)) {
      if (Math.abs(diffX) > 2) {
        dx = diffX > 0 ? 1 : -1;
      }
      if (Math.abs(diffY) > 1.5 && Math.abs(diffY) <= 12) {
        dy = Math.max(-0.35, Math.min(0.35, diffY / 16));
      } else if (Math.abs(diffY) > 12) {
        dy = diffY > 0 ? 1 : -1;
      }
    } else {
      if (Math.abs(diffY) > 2) {
        dy = diffY > 0 ? 1 : -1;
      }
      if (Math.abs(diffX) > 1.5 && Math.abs(diffX) <= 12) {
        dx = Math.max(-0.35, Math.min(0.35, diffX / 16));
      } else if (Math.abs(diffX) > 12) {
        dx = diffX > 0 ? 1 : -1;
      }
    }

    return { dx, dy, placeBomb };
  }
}
