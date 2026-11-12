import { GameState } from './GameState.js';
import { PlayerInput, PlayerState, TileType } from '../shared/types.js';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../shared/constants.js';

interface Point {
  gx: number;
  gy: number;
}

export class BotAI {
  private botId: string;
  private actionCooldown: number = 0;
  private targetTile: Point | null = null;

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

    // 1. Build Danger Grid
    const dangerGrid = this.buildDangerGrid(state);
    const isCurrentlyInDanger = dangerGrid[botGy]?.[botGx] > 0;

    // 2. High Priority: Evade Danger!
    if (isCurrentlyInDanger) {
      const safeTile = this.findNearestSafeTile(state, botGx, botGy, dangerGrid);
      if (safeTile) {
        return this.moveTowardTile(bot, safeTile.gx, safeTile.gy, false);
      }
    }

    // 3. If safe, decide whether to place a bomb
    if (this.actionCooldown <= 0 && bot.activeBombs < bot.powerUps.bombLimit) {
      if (this.shouldPlaceBomb(state, botGx, botGy, dangerGrid)) {
        this.actionCooldown = 1.2; // Don't spam immediately
        return { ...this.moveTowardTile(bot, botGx, botGy, false), placeBomb: true };
      }
    }

    // 4. Seek nearest Power-Up
    if (state.powerUps.length > 0) {
      const nearestPowerUp = this.findNearestPowerUp(state, botGx, botGy, dangerGrid);
      if (nearestPowerUp) {
        return this.moveTowardTile(bot, nearestPowerUp.gx, nearestPowerUp.gy, false);
      }
    }

    // 5. Seek nearest opponent or soft block
    const target = this.findTargetTile(state, botGx, botGy, dangerGrid);
    if (target) {
      return this.moveTowardTile(bot, target.gx, target.gy, false);
    }

    return defaultInput;
  }

  private buildDangerGrid(state: GameState): number[][] {
    const danger: number[][] = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(0)
    );

    // Active explosions (maximum danger)
    for (const exp of state.explosions) {
      for (const cell of exp.cells) {
        if (cell.gy >= 0 && cell.gy < GRID_ROWS && cell.gx >= 0 && cell.gx < GRID_COLS) {
          danger[cell.gy][cell.gx] = 100;
        }
      }
    }

    // Active bombs danger rays
    for (const bomb of state.bombs) {
      danger[bomb.gy][bomb.gx] = Math.max(danger[bomb.gy][bomb.gx], 80);

      const dirs = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
      ];

      for (const d of dirs) {
        for (let dist = 1; dist <= bomb.fireRange; dist++) {
          const gx = bomb.gx + d.dx * dist;
          const gy = bomb.gy + d.dy * dist;

          if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) break;

          const tile = state.grid[gy][gx];
          if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) {
            break;
          }

          danger[gy][gx] = Math.max(danger[gy][gx], 80);

          if (tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK) {
            break;
          }
        }
      }
    }

    return danger;
  }

  private findNearestSafeTile(state: GameState, startGx: number, startGy: number, danger: number[][]): Point | null {
    const queue: Point[] = [{ gx: startGx, gy: startGy }];
    const visited = new Set<string>();
    visited.add(`${startGx},${startGy}`);

    while (queue.length > 0) {
      const cur = queue.shift()!;

      // If this tile is completely safe, return it
      if (danger[cur.gy][cur.gx] === 0) {
        return cur;
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

          if (isWalkable && !hasBomb) {
            queue.push(n);
          }
        }
      }
    }

    return null;
  }

  private shouldPlaceBomb(state: GameState, gx: number, gy: number, danger: number[][]): boolean {
    // Only place bomb if we have an adjacent soft block or nearby enemy
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

    // Check if an enemy is close
    if (!hasTarget) {
      for (const p of state.players.values()) {
        if (p.id !== this.botId && p.alive) {
          const egx = Math.floor(p.x / TILE_SIZE);
          const egy = Math.floor(p.y / TILE_SIZE);
          const dist = Math.abs(egx - gx) + Math.abs(egy - gy);
          if (dist <= 2) {
            hasTarget = true;
            break;
          }
        }
      }
    }

    if (!hasTarget) return false;

    // CRITICAL: Ensure there is at least one walkable escape route if we drop a bomb here!
    let escapeRoutes = 0;
    for (const n of neighbors) {
      if (n.gx >= 1 && n.gx < GRID_COLS - 1 && n.gy >= 1 && n.gy < GRID_ROWS - 1) {
        const tile = state.grid[n.gy][n.gx];
        const isWalkable = tile === TileType.EMPTY || tile === TileType.CONVEYOR_UP ||
                          tile === TileType.CONVEYOR_DOWN || tile === TileType.CONVEYOR_LEFT ||
                          tile === TileType.CONVEYOR_RIGHT;
        if (isWalkable && danger[n.gy][n.gx] < 80) {
          escapeRoutes++;
        }
      }
    }

    return escapeRoutes >= 1;
  }

  private findNearestPowerUp(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    let bestDist = Infinity;
    let bestPoint: Point | null = null;

    for (const p of state.powerUps) {
      if (danger[p.gy]?.[p.gx] === 0) {
        const d = Math.abs(p.gx - botGx) + Math.abs(p.gy - botGy);
        if (d < bestDist) {
          bestDist = d;
          bestPoint = { gx: p.gx, gy: p.gy };
        }
      }
    }

    return bestPoint;
  }

  private findTargetTile(state: GameState, botGx: number, botGy: number, danger: number[][]): Point | null {
    // Find closest alive opponent
    let bestDist = Infinity;
    let bestTarget: Point | null = null;

    for (const player of state.players.values()) {
      if (player.id !== this.botId && player.alive) {
        const pgx = Math.floor(player.x / TILE_SIZE);
        const pgy = Math.floor(player.y / TILE_SIZE);
        const d = Math.abs(pgx - botGx) + Math.abs(pgy - botGy);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = { gx: pgx, gy: pgy };
        }
      }
    }

    return bestTarget;
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
