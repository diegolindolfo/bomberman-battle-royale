import { test, describe } from 'node:test';
import assert from 'node:assert';
import { GameState } from '../GameState.js';
import { TileType, PowerUpType } from '../../shared/types.js';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../../shared/constants.js';

describe('Bomberman Battle Royale GameState Core Tests', () => {
  test('Initializes grid correctly with border hard walls and classic pillars', () => {
    const state = new GameState('classic');

    // Outer border hard walls
    assert.strictEqual(state.grid[0][0], TileType.HARD_WALL);
    assert.strictEqual(state.grid[0][GRID_COLS - 1], TileType.HARD_WALL);
    assert.strictEqual(state.grid[GRID_ROWS - 1][0], TileType.HARD_WALL);
    assert.strictEqual(state.grid[GRID_ROWS - 1][GRID_COLS - 1], TileType.HARD_WALL);

    // Pillar at (2, 2)
    assert.strictEqual(state.grid[2][2], TileType.HARD_WALL);

    // Spawn corner at (1, 1) should be walkable/empty
    assert.strictEqual(state.grid[1][1], TileType.EMPTY);
  });

  test('Player joins and places bomb accurately on grid', () => {
    const state = new GameState('classic');
    const player = state.addPlayer('p1', 'Player 1', false);
    state.startGame();

    // Spawn point is at (1, 1)
    assert.strictEqual(player.alive, true);
    assert.strictEqual(player.activeBombs, 0);

    // Place bomb
    const placed = state.placeBomb(player);
    assert.strictEqual(placed, true);
    assert.strictEqual(state.bombs.length, 1);
    assert.strictEqual(player.activeBombs, 1);

    const bomb = state.bombs[0];
    assert.strictEqual(bomb.gx, 1);
    assert.strictEqual(bomb.gy, 1);

    // Cannot place second bomb if limit is 1
    const secondPlaced = state.placeBomb(player);
    assert.strictEqual(secondPlaced, false);
  });

  test('Bomb detonation propagates orthogonally and destroys soft blocks', () => {
    const state = new GameState('classic');
    const player = state.addPlayer('p1', 'Player 1', false);
    state.startGame();

    // Place a soft block explicitly at (1, 2)
    state.grid[2][1] = TileType.SOFT_BLOCK;

    state.placeBomb(player);
    const bomb = state.bombs[0];

    // Detonate
    state.detonateBomb(bomb);

    assert.strictEqual(state.bombs.length, 0);
    assert.strictEqual(player.activeBombs, 0);
    assert.strictEqual(state.explosions.length, 1);

    // Soft block at (1, 2) should now be destroyed (EMPTY)
    assert.strictEqual(state.grid[2][1], TileType.EMPTY);
  });

  test('Chain reaction detonates adjacent bomb immediately', () => {
    const state = new GameState('classic');
    const p1 = state.addPlayer('p1', 'Player 1', false);
    const p2 = state.addPlayer('p2', 'Player 2', false);
    p1.powerUps.bombLimit = 5;
    p2.powerUps.bombLimit = 5;
    state.startGame();

    // Clear path between (1, 1) and (1, 2)
    state.grid[1][1] = TileType.EMPTY;
    state.grid[2][1] = TileType.EMPTY;

    // Place first bomb at (1, 1)
    p1.x = 1 * TILE_SIZE + 24;
    p1.y = 1 * TILE_SIZE + 24;
    state.placeBomb(p1);

    // Place second bomb at (1, 2)
    p2.x = 1 * TILE_SIZE + 24;
    p2.y = 2 * TILE_SIZE + 24;
    state.placeBomb(p2);

    assert.strictEqual(state.bombs.length, 2);

    // Detonate first bomb
    state.detonateBomb(state.bombs[0]);

    // Both bombs should have exploded from chain reaction!
    assert.strictEqual(state.bombs.length, 0);
    assert.ok(state.explosions.length >= 2);
  });

  test('Sudden death ring drops blocks inward and crushes players', () => {
    const state = new GameState('classic');
    const player = state.addPlayer('p1', 'Player 1', false);
    state.startGame();

    // Trigger sudden death
    state.suddenDeathActive = true;
    player.invincibleTimer = 0; // remove spawn immunity
    player.x = 1 * TILE_SIZE + 24; // (1, 1)
    player.y = 1 * TILE_SIZE + 24;

    // First block of sudden death falls at (1, 1)
    // Run update with enough delta to trigger drop
    state.update(1.0);

    assert.strictEqual(state.grid[1][1], TileType.SUDDEN_DEATH_BLOCK);
    // Player should have been eliminated by the falling block
    assert.strictEqual(player.alive, false);
  });

  test('Shield power-up saves player from one explosion', () => {
    const state = new GameState('classic');
    const p1 = state.addPlayer('p1', 'Player 1', false);
    const p2 = state.addPlayer('p2', 'Player 2', false);
    state.startGame();

    p2.powerUps.hasShield = true;
    p2.invincibleTimer = 0;
    p2.x = 1 * TILE_SIZE + 24;
    p2.y = 2 * TILE_SIZE + 24;

    // Detonate bomb at (1, 1)
    p1.x = 1 * TILE_SIZE + 24;
    p1.y = 1 * TILE_SIZE + 24;
    state.placeBomb(p1);
    state.detonateBomb(state.bombs[0]);

    // Check damage
    state.update(0.05);

    // Shield should have broken, but player is still alive!
    assert.strictEqual(p2.powerUps.hasShield, false);
    assert.strictEqual(p2.alive, true);
  });

  test('Player can smoothly walk out of their placed bomb without getting stuck', () => {
    const state = new GameState('classic');
    const player = state.addPlayer('p1', 'Player 1', false);
    state.startGame();

    // Spawn is at (1, 1), center (72, 72)
    player.x = 1 * TILE_SIZE + 24;
    player.y = 1 * TILE_SIZE + 24;

    const placed = state.placeBomb(player);
    assert.strictEqual(placed, true);

    // Player inputs move right (+X)
    state.handleInput(player.id, { dx: 1, dy: 0, placeBomb: false });

    // Update several ticks
    for (let i = 0; i < 10; i++) {
      state.update(0.033);
    }

    // Player should have advanced to the right towards (2, 1) and NOT be stuck at 72!
    assert.ok(player.x > 72, `Player x should have moved forward, actual: ${player.x}`);
  });
});
