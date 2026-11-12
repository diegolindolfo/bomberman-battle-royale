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

    // Second bomb is queued for 50ms cascade delay
    assert.strictEqual(state.bombs.length, 1);

    // After 60ms update, cascading chain reaction detonates adjacent bomb
    state.update(0.06);
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

    // Continue walking until completely clear of tile (1, 1) (right border x=96 + radius 13 = 109)
    for (let i = 0; i < 20; i++) {
      state.update(0.033);
    }
    assert.ok(player.x > 109, `Player should cross x=109 cleanly, got ${player.x}`);
    assert.strictEqual(state.bombs[0].overlapPlayers.includes(player.id), false);

    // Once exited, walking back left must treat bomb as solid obstacle
    const stopX = player.x;
    state.handleInput(player.id, { dx: -1, dy: 0, placeBomb: false });
    for (let i = 0; i < 10; i++) {
      state.update(0.033);
    }
    assert.ok(player.x >= 96 + 13 - 1, `Solid bomb must block reentry from outside: x=${player.x}, was=${stopX}`);
  });

  test('Corner rounding nudges player smoothly when overlapping solid corner < 40%', () => {
    const state = new GameState('ruins');
    const p1 = state.addPlayer('p1', 'CornerTester', false);
    state.startGame();

    // Clear (1,1) and (2,1); (2,2) is HARD_WALL starting at x=96, y=96
    state.grid[1][1] = TileType.EMPTY;
    state.grid[1][2] = TileType.EMPTY;
    state.grid[1][3] = TileType.EMPTY;

    // Position flush against x=96 (p1.x = 83 with radius 13) and y=95 (overlap = 95+13-96 = 12px <= 19px)
    p1.x = 83;
    p1.y = 95;
    state.handleInput(p1.id, { dx: 1, dy: 0, placeBomb: false });

    for (let i = 0; i < 15; i++) {
      state.update(0.033);
    }

    assert.ok(p1.x > 96, `Player should corner-round cleanly past pillar x=96, got x=${p1.x}`);
    assert.ok(p1.y < 95, `Player should have nudged upward into corridor (2,1), got y=${p1.y}`);
  });

  test('Bomb kick slides bomb smoothly across floor and stops against walls', () => {
    const state = new GameState('ruins');
    const p1 = state.addPlayer('p1', 'Kicker', false);
    state.startGame();

    // Clear row y=1 cols 1..5
    for (let gx = 1; gx <= 5; gx++) {
      state.grid[1][gx] = TileType.EMPTY;
    }
    // Put solid soft block at (5,1)
    state.grid[1][5] = TileType.SOFT_BLOCK;

    p1.powerUps.canKick = true;
    p1.x = 2 * TILE_SIZE + 24;
    p1.y = 1 * TILE_SIZE + 24;
    assert.strictEqual(state.placeBomb(p1), true);

    // Step left completely off tile (2,1) into (1,1)
    state.handleInput(p1.id, { dx: -1, dy: 0, placeBomb: false });
    for (let i = 0; i < 16; i++) {
      state.update(0.033);
    }
    assert.strictEqual(state.bombs[0].overlapPlayers.length, 0);

    // Walk right back into stationary bomb at (2,1) to kick it right
    state.handleInput(p1.id, { dx: 1, dy: 0, placeBomb: false });
    for (let i = 0; i < 15; i++) {
      state.update(0.033);
    }

    const kickedBomb = state.bombs[0];
    assert.ok(kickedBomb.slidingVx > 0 || kickedBomb.gx > 2, 'Bomb should be kicked rightward');

    // Run until bomb stops before wall at (5,1) -> lands cleanly on col 4
    state.handleInput(p1.id, { dx: 0, dy: 0, placeBomb: false });
    for (let i = 0; i < 30; i++) {
      state.update(0.033);
    }
    assert.strictEqual(kickedBomb.gx, 4);
    assert.strictEqual(kickedBomb.slidingVx, 0);
  });

  test('Cryo arena initializes quantum portals and teleports players cleanly', () => {
    const state = new GameState('cryo');
    const p1 = state.addPlayer('p1', 'CryoRunner', false);
    state.startGame();

    assert.strictEqual(state.grid[3][3], TileType.TELEPORT_A);
    assert.strictEqual(state.grid[GRID_ROWS - 4][GRID_COLS - 4], TileType.TELEPORT_B);

    // Place player near center of TELEPORT_A (3,3)
    p1.x = 3 * TILE_SIZE + 24;
    p1.y = 3 * TILE_SIZE + 24;
    state.update(0.033);

    const pGx = Math.floor(p1.x / TILE_SIZE);
    const pGy = Math.floor(p1.y / TILE_SIZE);
    assert.strictEqual(pGx, GRID_COLS - 4);
    assert.strictEqual(pGy, GRID_ROWS - 4);
  });

  test('Foundry volatile block detonates 3x3 radius, credits kill, and triggers hitstop', () => {
    const state = new GameState('foundry');
    const p1 = state.addPlayer('p1', 'Attacker', false);
    const p2 = state.addPlayer('p2', 'Target', false);
    state.startGame();

    // Clear top corridor; place VOLATILE_BLOCK at (3,1) and enemy diagonally at (4,2) — wait (4,2) is pillar, use (4,3)
    // Better: clear around (3,3): put bomb at (2,3), volatile block at (3,3), enemy at (4,4)? (4,4) is pillar. Use (4,2)? (4,2) is pillar. Wait (3,3) diagonals are even-even pillars! Put VOLATILE_BLOCK at (4,3) and enemies at (3,2) / (5,3):
    state.grid[3][2] = TileType.EMPTY;
    state.grid[3][3] = TileType.EMPTY;
    state.grid[3][4] = TileType.VOLATILE_BLOCK;
    state.grid[2][3] = TileType.EMPTY; // diagonal to (4,3)! (3,2) is odd,even -> empty floor!

    p1.x = 3 * TILE_SIZE + 24;
    p1.y = 3 * TILE_SIZE + 24;
    p1.invincibleTimer = 0;

    p2.x = 3 * TILE_SIZE + 24;
    p2.y = 2 * TILE_SIZE + 24; // (3,2) is diagonal to volatile block at (4,3), NOT directly on bomb cross at (3,3)? Wait bomb cross at (3,3) hits (3,2)!
    // Put volatile block at (2,3), bomb at (1,3), enemy at (3,2) -> bomb at (1,3) range 2 hits (2,3), does NOT directly hit (3,2)!
    state.grid[3][4] = TileType.EMPTY;
    state.grid[3][1] = TileType.EMPTY;
    state.grid[3][2] = TileType.VOLATILE_BLOCK;
    state.grid[2][3] = TileType.EMPTY;

    p1.x = 1 * TILE_SIZE + 24;
    p1.y = 3 * TILE_SIZE + 24;
    p2.x = 3 * TILE_SIZE + 24;
    p2.y = 2 * TILE_SIZE + 24;
    p2.invincibleTimer = 0;

    assert.strictEqual(state.placeBomb(p1), true);
    state.detonateBomb(state.bombs[0]);
    state.update(0.02); // Apply explosion damage

    assert.strictEqual(p2.alive, false, 'Diagonal neighbor of volatile barrel should be eliminated by 3x3 blast');
    assert.strictEqual(p1.kills, 1, 'Attacker should be credited with kill via volatile burst');
    assert.ok(state.hitstopTimer > 0, 'Elimination should trigger hitstop frame freeze');

    // Next tiny update during hitstop freezes bombs/positions
    const prevHitstop = state.hitstopTimer;
    state.update(0.01);
    assert.ok(state.hitstopTimer < prevHitstop);
  });

  test('BotAI never suicides when boxed in and actively navigates out of spawn to break blocks', async () => {
    const { BotAI } = await import('../BotAI.js');

    // Case 1: Boxed into (1,1) surrounded completely by walls/blocks — Bot MUST NOT drop suicidal bomb!
    const boxedState = new GameState('ruins');
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (boxedState.grid[y][x] !== TileType.HARD_WALL) {
          boxedState.grid[y][x] = TileType.SOFT_BLOCK;
        }
      }
    }
    boxedState.grid[1][1] = TileType.EMPTY;
    // Remove L clear except (1,1) to test strict dead-end anti-suicide
    const boxedBot = boxedState.addPlayer('b1', 'BoxedBot', true);
    boxedState.addPlayer('b2', 'EnemyBot', true);
    boxedState.startGame();

    const aiBoxed = new BotAI('b1', 'tactical');
    const dangerBoxed = aiBoxed.buildDangerGrid(boxedState);
    const simResult = aiBoxed.checkSafeBombPlacement(boxedState, boxedBot, 1, 1, dangerBoxed);
    assert.strictEqual(simResult, null, 'Bot must refuse to place bomb when no safe escape tile exists');

    // Case 2: Normal spawn L-shape (1,1), (2,1), (1,2) with soft blocks at (3,1) and (1,3)
    const normalState = new GameState('ruins');
    normalState.grid[1][1] = TileType.EMPTY;
    normalState.grid[1][2] = TileType.EMPTY;
    normalState.grid[2][1] = TileType.EMPTY;
    normalState.grid[1][3] = TileType.SOFT_BLOCK;
    normalState.grid[3][1] = TileType.SOFT_BLOCK;

    const bot = normalState.addPlayer('b_spawn', 'SmartBot', true);
    normalState.addPlayer('enemy', 'Opponent', true);
    normalState.startGame();

    const ai = new BotAI('b_spawn', 'tactical');
    let placedAtLeastOneBomb = false;

    for (let step = 0; step < 180; step++) { // ~6 seconds simulated
      const inp = ai.computeInput(normalState, 0.033);
      if (inp.placeBomb) placedAtLeastOneBomb = true;
      normalState.handleInput('b_spawn', inp);
      normalState.update(0.033);
    }

    assert.strictEqual(placedAtLeastOneBomb, true, 'Bot should walk out of spawn corner and bomb blocking crate');
    assert.strictEqual(bot.alive, true, 'Bot must safely evade around L-corner and survive its own bomb');
    assert.ok(
      normalState.grid[1][3] === TileType.EMPTY || normalState.grid[3][1] === TileType.EMPTY,
      'Bot bomb should have blown open an exit path'
    );
  });
});
