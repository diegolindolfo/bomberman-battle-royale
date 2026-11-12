import { GameState } from './GameState.js';
import { PlayerInput, PlayerState, TileType } from '../shared/types.js';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../shared/constants.js';

interface Point {
  gx: number;
  gy: number;
}

interface PathNode {
  gx: number;
  gy: number;
  parent: PathNode | null;
}

export class BotAI {
  private botId: string;
  private actionCooldown: number = 0;

  constructor(botId: string) {
    this.botId = botId;
  }

  public computeInput(state: GameState, dt: number): PlayerInput {
    const defaultInput: PlayerInput = { dx: 0, dy: 0, placeBomb: false };
    const bot = state.players.get(this.botId);
    if (!bot || !bot.alive || state.phase !== 'playing') {
      return defaultInput;
    }

    this.actionCooldown = Math.max(0, this.actionCooldown - dt);

    const botGx = Math.floor(bot.x / TILE_SIZE);
    const botGy = Math.floor(bot.y / TILE_SIZE);

    // 1. Build Danger Grid of real active hazards
    const dangerGrid = this.buildDangerGrid(state);
    const isCurrentlyInDanger = (dangerGrid[botGy]?.[botGx] ?? 0) > 0;

    // 2. High Priority: Evade Danger immediately using step-by-step BFS path
    if (isCurrentlyInDanger) {
      const nextStep = this.findImmediateStepToSafety(state, botGx, botGy, dangerGrid);
      if (nextStep) {
        return this.moveTowardTile(bot, nextStep.gx, nextStep.gy, false);
      }
    }

    // 3. If safe, decide whether to place a bomb
    if (this.actionCooldown <= 0 && bot.activeBombs < bot.powerUps.bombLimit) {
      const escapeStep = this.checkSafeBombPlacement(state, bot, botGx, botGy, dangerGrid);
      if (escapeStep) {
        this.actionCooldown = 1.4; // Cooldown to ensure escape
        // Drop bomb and immediately step toward escape route!
        return { ...this.moveTowardTile(bot, escapeStep.gx, escapeStep.gy, false), placeBomb: true };
      }
    }

    // 4. Seek nearest Power-Up if safe
    if (state.powerUps.length > 0) {
      const nextStep = this.findStepTowardPowerUp(state, botGx, botGy, dangerGrid);
      if (nextStep) {
        return this.moveTowardTile(bot, nextStep.gx, nextStep.gy, false);
      }
    }

    // 5. Seek nearest opponent or soft block
    const targetStep = this.findStepTowardTarget(state, botGx, botGy, dangerGrid);
    if (targetStep) {
      return this.moveTowardTile(bot, targetStep.gx, targetStep.gy, false);
    }

    return defaultInput;
  }

  private buildDangerGrid(state: GameState): number[][] {
    const danger: number[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(0)
    );

    // Active explosions (maximum hazard)
    for (const exp of state.explosions) {
      for (const cell of exp.cells) {
        if (cell.gy >= 0 && cell.gy < GRID_ROWS && cell.gx >= 0 && cell.gx < GRID_COLS) {
          danger[cell.gy][cell.gx] = 100;
        }
      }
    }

    // Active bombs blast paths
    for (const bomb of state.bombs) {
      this.markBombDanger(danger, state.grid, bomb.gx, bomb.gy, bomb.fireRange);
    }

    return danger;
  }

  private markBombDanger(danger: number[][], grid: number[][], bgx: number, bgy: number, range: number): void {
    if (bgy >= 0 && bgy < GRID_ROWS && bgx >= 0 && bgx < GRID_COLS) {
      danger[bgy][bgx] = Math.max(danger[bgy][bgx], 85);
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

        danger[gy][gx] = Math.max(danger[gy][gx], 85);

        if (tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK) {
          break;
        }
      }
    }
  }

  /**
   * Performs BFS and returns the FIRST ADJACENT STEP along the path to the nearest safe tile
   */
  private findImmediateStepToSafety(state: GameState, startGx: number, startGy: number, danger: number[][]): Point | null {
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null }];
    const visited = new Set<string>();
    visited.add(`${startGx},${startGy}`);

    while (queue.length > 0) {
      const cur = queue.shift()!;

      // Found safe tile!
      if (danger[cur.gy][cur.gx] === 0) {
        // Reconstruct path to find the immediate next step from start
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
          const isWalkable = tile === TileType.EMPTY || tile === TileType.CONVEYOR_UP ||
                            tile === TileType.CONVEYOR_DOWN || tile === TileType.CONVEYOR_LEFT ||
                            tile === TileType.CONVEYOR_RIGHT || tile === TileType.TELEPORT_A ||
                            tile === TileType.TELEPORT_B;

          // Prefer walking onto tiles that are either safe or at least not active explosions
          if (isWalkable && !hasBomb && danger[n.gy][n.gx] < 100) {
            queue.push({ gx: n.gx, gy: n.gy, parent: cur });
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

    // path[0] is start. path[1] is the immediate adjacent step!
    if (path.length > 1) {
      return path[1];
    }
    return { gx: startGx, gy: startGy };
  }

  /**
   * Verifies if dropping a bomb here is safe.
   * Simulates the bomb and ensures at least one escape path to safety exists.
   */
  private checkSafeBombPlacement(
    state: GameState,
    bot: PlayerState,
    gx: number,
    gy: number,
    danger: number[][]
  ): Point | null {
    // Check if there is an adjacent breakable soft block or nearby enemy
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

    // Simulate danger grid if bomb was dropped right here
    const simDanger = danger.map(row => [...row]);
    this.markBombDanger(simDanger, state.grid, gx, gy, bot.powerUps.fireRange);

    // Search for escape path from here to a tile with 0 simulated danger
    const escapeStep = this.findImmediateStepToSafety(state, gx, gy, simDanger);
    return escapeStep;
  }

  private findStepTowardPowerUp(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    for (const p of state.powerUps) {
      if (danger[p.gy]?.[p.gx] === 0) {
        const step = this.bfsToDestination(state, botGx, botGy, p.gx, p.gy, danger);
        if (step) return step;
      }
    }
    return null;
  }

  private findStepTowardTarget(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    // Find closest alive opponent
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
    const queue: PathNode[] = [{ gx: startGx, gy: startGy, parent: null }];
    const visited = new Set<string>();
    visited.add(`${startGx},${startGy}`);

    let steps = 0;
    while (queue.length > 0 && steps < 60) {
      steps++;
      const cur = queue.shift()!;

      // Reached adjacent to or directly at destination
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
          const isWalkable = tile === TileType.EMPTY || tile === TileType.CONVEYOR_UP ||
                            tile === TileType.CONVEYOR_DOWN || tile === TileType.CONVEYOR_LEFT ||
                            tile === TileType.CONVEYOR_RIGHT;

          if (isWalkable && !hasBomb && danger[n.gy][n.gx] === 0) {
            queue.push({ gx: n.gx, gy: n.gy, parent: cur });
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

    const threshold = 5;

    if (Math.abs(diffX) > threshold) {
      dx = diffX > 0 ? 1 : -1;
    } else if (Math.abs(diffY) > threshold) {
      dy = diffY > 0 ? 1 : -1;
    }

    return { dx, dy, placeBomb };
  }
}
