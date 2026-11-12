import { GameState } from './GameState.js';
import { BotPersonality, PlayerInput, PlayerState, TileType } from '../shared/types.js';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../shared/constants.js';

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
  private reactionTimer: number = 0; // Humanized reaction delay (150ms - 280ms)
  private currentPathStep: Point | null = null;
  private actionCooldown: number = 0;

  constructor(botId: string, personality: BotPersonality = 'tactical') {
    this.botId = botId;
    this.personality = personality;
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

    // 1. Build Real-Time Danger Grid storing nearest explosion fuseTimer per tile
    const dangerTimers = this.buildDangerGrid(state);
    const isCurrentlyInDanger = dangerTimers[botGy]?.[botGx] !== Infinity;

    // Recalculate decision if reaction timer expired or emergency danger
    if (this.reactionTimer <= 0 || isCurrentlyInDanger) {
      this.resetReactionTimer();

      // --- HIERARQUIA 1: SOBREVIVÊNCIA (Evade) ---
      if (isCurrentlyInDanger) {
        this.currentPathStep = this.findImmediateStepToSafety(state, botGx, botGy, dangerTimers);
        if (this.currentPathStep) {
          return this.moveTowardTile(bot, this.currentPathStep.gx, this.currentPathStep.gy, false);
        }
      }

      // --- HIERARQUIA 2 & 3: DECISÃO TÁTICA (Farm vs Engage) ---
      let shouldTryBomb = this.actionCooldown <= 0 && bot.activeBombs < bot.powerUps.bombLimit;

      if (this.personality === 'tactical') {
        // Tactical bot: prioritizes collecting powerups (Farm) before engaging
        if (state.powerUps.length > 0) {
          const farmStep = this.findStepTowardPowerUp(state, botGx, botGy, dangerTimers);
          if (farmStep) {
            this.currentPathStep = farmStep;
            return this.moveTowardTile(bot, farmStep.gx, farmStep.gy, false);
          }
        }

        // Lookahead Anti-Suicide check for planting bomb to open map / clear blocks
        if (shouldTryBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers);
          if (escapeStep) {
            this.actionCooldown = 1.3;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        // Advance toward targets
        const targetStep = this.findStepTowardTarget(state, botGx, botGy, dangerTimers);
        if (targetStep) {
          this.currentPathStep = targetStep;
          return this.moveTowardTile(bot, targetStep.gx, targetStep.gy, false);
        }
      } else {
        // Aggressive bot: prioritizes hunting players and planting pressure bombs
        if (shouldTryBomb) {
          const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerTimers);
          if (escapeStep) {
            this.actionCooldown = 1.2;
            this.currentPathStep = escapeStep;
            return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
          }
        }

        const targetStep = this.findStepTowardTarget(state, botGx, botGy, dangerTimers);
        if (targetStep) {
          this.currentPathStep = targetStep;
          return this.moveTowardTile(bot, targetStep.gx, targetStep.gy, false);
        }

        if (state.powerUps.length > 0) {
          const farmStep = this.findStepTowardPowerUp(state, botGx, botGy, dangerTimers);
          if (farmStep) {
            this.currentPathStep = farmStep;
            return this.moveTowardTile(bot, farmStep.gx, farmStep.gy, false);
          }
        }
      }
    }

    // Continue following current path step smoothly
    if (this.currentPathStep) {
      return this.moveTowardTile(bot, this.currentPathStep.gx, this.currentPathStep.gy, false);
    }

    return defaultInput;
  }

  /**
   * Real-Time Danger Grid:
   * Maps 2D grid storing minimum remaining seconds until explosion per tile.
   * Infinity means completely safe tile!
   */
  private buildDangerGrid(state: GameState): number[][] {
    const danger: number[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(Infinity)
    );

    // Active explosions (imminent lethal danger = 0.0s)
    for (const exp of state.explosions) {
      for (const cell of exp.cells) {
        if (cell.gy >= 0 && cell.gy < GRID_ROWS && cell.gx >= 0 && cell.gx < GRID_COLS) {
          danger[cell.gy][cell.gx] = 0.0;
        }
      }
    }

    // Active bombs and flame lines
    for (const bomb of state.bombs) {
      this.markBombDanger(danger, state.grid, bomb.gx, bomb.gy, bomb.fireRange, bomb.fuseTimer);
    }

    return danger;
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

        if (tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK) {
          break;
        }
      }
    }
  }

  /**
   * BFS to find closest safe tile before timer expires.
   * CRITICAL RULE: Never cross a tile whose explosion timer is < 0.4s!
   */
  private findImmediateStepToSafety(
    state: GameState,
    startGx: number,
    startGy: number,
    danger: number[][]
  ): Point | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>();
    visited.add(`${startGx},${startGy}`);

    while (queue.length > 0) {
      const cur = queue.shift()!;

      // Reached safe tile!
      if (danger[cur.gy][cur.gx] === Infinity) {
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
        if (
          n.gx >= 1 && n.gx < GRID_COLS - 1 &&
          n.gy >= 1 && n.gy < GRID_ROWS - 1 &&
          !visited.has(key)
        ) {
          visited.add(key);
          const tile = state.grid[n.gy][n.gx];
          const hasBomb = state.bombs.some(b => b.gx === n.gx && b.gy === n.gy);
          const isWalkable = tile === TileType.EMPTY || tile === TileType.ICE_FLOOR ||
                            tile === TileType.CONVEYOR_UP || tile === TileType.CONVEYOR_DOWN ||
                            tile === TileType.CONVEYOR_LEFT || tile === TileType.CONVEYOR_RIGHT ||
                            tile === TileType.TELEPORT_A || tile === TileType.TELEPORT_B;

          const nTimer = danger[n.gy][n.gx];
          // SAFETY LOOKAHEAD: Never cross a tile whose explosion timer is less than 0.4s!
          const isLethalImminent = nTimer < 0.40;

          if (isWalkable && !hasBomb && !isLethalImminent) {
            queue.push({ gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 });
          }
        }
      }
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
   * Simulates the new danger grid resulting from placing a bomb.
   * Confirms at least one valid escape path to a safe tile exists.
   */
  private checkSafeBombPlacement(
    state: GameState,
    bot: PlayerState,
    gx: number,
    gy: number,
    danger: number[][]
  ): Point | null {
    let hasTarget = false;
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

    if (!hasTarget) {
      for (const p of state.players.values()) {
        if (p.id !== this.botId && p.alive) {
          const egx = Math.floor(p.x / TILE_SIZE);
          const egy = Math.floor(p.y / TILE_SIZE);
          if (Math.abs(egx - gx) + Math.abs(egy - gy) <= 2) {
            hasTarget = true;
            break;
          }
        }
      }
    }

    if (!hasTarget) return null;

    // Simulate danger grid with the new bomb placed at (gx, gy)
    const simDanger = danger.map(row => [...row]);
    this.markBombDanger(simDanger, state.grid, gx, gy, bot.powerUps.fireRange, 2.8);

    // Lookahead: Confirm at least one safe escape route exists before placing
    const escapeStep = this.findImmediateStepToSafety(state, gx, gy, simDanger);
    return escapeStep;
  }

  private findStepTowardPowerUp(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    for (const p of state.powerUps) {
      if (danger[p.gy]?.[p.gx] === Infinity) {
        const step = this.bfsToDestination(state, botGx, botGy, p.gx, p.gy, danger);
        if (step) return step;
      }
    }
    return null;
  }

  private findStepTowardTarget(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    let closestEnemy: PlayerState | null = null;
    let minDist = Infinity;

    for (const p of state.players.values()) {
      if (p.id !== this.botId && p.alive) {
        const egx = Math.floor(p.x / TILE_SIZE);
        const egy = Math.floor(p.y / TILE_SIZE);
        const dist = Math.abs(egx - botGx) + Math.abs(egy - botGy);
        if (dist < minDist) {
          minDist = dist;
          closestEnemy = p;
        }
      }
    }

    if (closestEnemy) {
      const egx = Math.floor(closestEnemy.x / TILE_SIZE);
      const egy = Math.floor(closestEnemy.y / TILE_SIZE);
      return this.bfsToDestination(state, botGx, botGy, egx, egy, danger);
    }

    return null;
  }

  private bfsToDestination(
    state: GameState,
    startGx: number,
    startGy: number,
    destGx: number,
    destGy: number,
    danger: number[][]
  ): Point | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null, dist: 0 }];
    const visited = new Set<string>();
    visited.add(`${startGx},${startGy}`);

    let steps = 0;
    while (queue.length > 0 && steps < 70) {
      steps++;
      const cur = queue.shift()!;

      if (Math.abs(cur.gx - destGx) + Math.abs(cur.gy - destGy) <= 1) {
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
        if (
          n.gx >= 1 && n.gx < GRID_COLS - 1 &&
          n.gy >= 1 && n.gy < GRID_ROWS - 1 &&
          !visited.has(key)
        ) {
          visited.add(key);
          const tile = state.grid[n.gy][n.gx];
          const hasBomb = state.bombs.some(b => b.gx === n.gx && b.gy === n.gy);
          const isWalkable = tile === TileType.EMPTY || tile === TileType.ICE_FLOOR ||
                            tile === TileType.CONVEYOR_UP || tile === TileType.CONVEYOR_DOWN ||
                            tile === TileType.CONVEYOR_LEFT || tile === TileType.CONVEYOR_RIGHT;

          if (isWalkable && !hasBomb && danger[n.gy][n.gx] === Infinity) {
            queue.push({ gx: n.gx, gy: n.gy, parent: cur, dist: cur.dist + 1 });
          }
        }
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

    const threshold = 4;

    if (Math.abs(diffX) > threshold) {
      dx = diffX > 0 ? 1 : -1;
    } else if (Math.abs(diffY) > threshold) {
      dy = diffY > 0 ? 1 : -1;
    }

    return { dx, dy, placeBomb };
  }
}
