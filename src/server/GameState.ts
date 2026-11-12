import {
  ArenaTheme,
  BlockBreakAnimation,
  Bomb,
  ChainReactionEntry,
  Direction,
  Explosion,
  ExplosionCell,
  GamePhase,
  GameSnapshot,
  PlayerInput,
  PlayerState,
  PowerUpItem,
  PowerUpType,
  TileType
} from '../shared/types.js';
import {
  ARENAS,
  BASE_BOMB_LIMIT,
  BASE_FIRE_RANGE,
  BASE_PLAYER_SPEED,
  BLOCK_BREAK_DURATION,
  BOMB_FUSE_TIME,
  BOMB_SLIDE_SPEED,
  CHAIN_REACTION_DELAY,
  CORNER_ROUNDING_THRESHOLD,
  CRYO_ICE_FRICTION,
  EXPLOSION_DURATION,
  GRID_COLS,
  GRID_ROWS,
  HITSTOP_DURATION,
  INPUT_BUFFER_WINDOW,
  INVINCIBLE_TIME_ON_START,
  MAX_BOMB_LIMIT,
  MAX_FIRE_RANGE,
  MAX_PLAYER_SPEED,
  PLAYER_COLORS,
  PLAYER_HITBOX_RADIUS,
  ROUND_TIME_TOTAL,
  SPEED_UP_BOOST,
  SUDDEN_DEATH_DROP_INTERVAL,
  SUDDEN_DEATH_START_TIME,
  TICK_DELTA,
  TILE_SIZE
} from '../shared/constants.js';

export class GameState {
  public phase: GamePhase = 'waiting';
  public timer: number = ROUND_TIME_TOTAL;
  public suddenDeathActive: boolean = false;
  public arena: ArenaTheme = 'ruins';
  public grid: number[][] = [];
  public players: Map<string, PlayerState> = new Map();
  public bombs: Bomb[] = [];
  public explosions: Explosion[] = [];
  public powerUps: PowerUpItem[] = [];
  public breakingBlocks: BlockBreakAnimation[] = [];
  public winner: PlayerState | null = null;
  public hitstopTimer: number = 0;

  // Stepped chain reactions (50ms cascade delay)
  private chainQueue: ChainReactionEntry[] = [];

  // Sudden death spiral tracker
  private suddenDeathPath: { x: number; y: number }[] = [];
  private suddenDeathIndex: number = 0;
  private suddenDeathTimer: number = 0;

  // Teleport cooldowns
  private teleportCooldowns: Map<string, number> = new Map();

  constructor(arena: ArenaTheme = 'ruins') {
    this.arena = this.normalizeArena(arena);
    this.initGrid();
    this.generateSuddenDeathPath();
  }

  private normalizeArena(arena: string): ArenaTheme {
    if (arena === 'classic') return 'ruins';
    if (arena === 'magma') return 'foundry';
    if (arena === 'cyber') return 'cryo';
    if (arena === 'ruins' || arena === 'cryo' || arena === 'foundry') return arena;
    return 'ruins';
  }

  public setArena(arena: ArenaTheme): void {
    this.arena = this.normalizeArena(arena);
  }

  /**
   * Procedural map generator with guaranteed L-shape (min 3 clear tiles) at all spawns
   */
  public initGrid(): void {
    this.grid = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      const row: number[] = [];
      for (let x = 0; x < GRID_COLS; x++) {
        // Outer boundaries are indestructible hard walls
        if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) {
          row.push(TileType.HARD_WALL);
        }
        // Classic pillar grid at alternating even coordinates
        else if (x % 2 === 0 && y % 2 === 0) {
          row.push(TileType.HARD_WALL);
        } else {
          row.push(TileType.EMPTY);
        }
      }
      this.grid.push(row);
    }

    // Guaranteed L-shape (minimum 3 clear tiles) around each of the 8 spawn points
    const spawnClearZones = [
      // Top-Left (1, 1)
      [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      // Bottom-Right
      [{ x: GRID_COLS - 2, y: GRID_ROWS - 2 }, { x: GRID_COLS - 3, y: GRID_ROWS - 2 }, { x: GRID_COLS - 2, y: GRID_ROWS - 3 }],
      // Top-Right
      [{ x: GRID_COLS - 2, y: 1 }, { x: GRID_COLS - 3, y: 1 }, { x: GRID_COLS - 2, y: 2 }],
      // Bottom-Left
      [{ x: 1, y: GRID_ROWS - 2 }, { x: 2, y: GRID_ROWS - 2 }, { x: 1, y: GRID_ROWS - 3 }],
      // Top-Mid
      [{ x: Math.floor(GRID_COLS / 2), y: 1 }, { x: Math.floor(GRID_COLS / 2) - 1, y: 1 }, { x: Math.floor(GRID_COLS / 2), y: 2 }],
      // Bottom-Mid
      [{ x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 2 }, { x: Math.floor(GRID_COLS / 2) + 1, y: GRID_ROWS - 2 }, { x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 3 }],
      // Left-Mid
      [{ x: 1, y: Math.floor(GRID_ROWS / 2) }, { x: 1, y: Math.floor(GRID_ROWS / 2) - 1 }, { x: 2, y: Math.floor(GRID_ROWS / 2) }],
      // Right-Mid
      [{ x: GRID_COLS - 2, y: Math.floor(GRID_ROWS / 2) }, { x: GRID_COLS - 2, y: Math.floor(GRID_ROWS / 2) + 1 }, { x: GRID_COLS - 3, y: Math.floor(GRID_ROWS / 2) }]
    ];

    const isSpawnProtected = (gx: number, gy: number) => {
      for (const zone of spawnClearZones) {
        if (zone.some(pt => pt.x === gx && pt.y === gy)) return true;
      }
      return false;
    };

    const normArena = this.normalizeArena(this.arena);

    if (normArena === 'foundry') {
      this.generateFoundryProcedural(isSpawnProtected);
    } else if (normArena === 'cryo') {
      this.generateCryoProcedural(isSpawnProtected);
    } else {
      this.generateRuinsProcedural(isSpawnProtected);
    }
  }

  private generateRuinsProcedural(isSpawnProtected: (gx: number, gy: number) => boolean): void {
    // Ruínas da Arena: Balanced 65% destructible block density with organic symmetry
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] === TileType.HARD_WALL || isSpawnProtected(x, y)) continue;

        const symX = Math.min(x, GRID_COLS - 1 - x);
        const symY = Math.min(y, GRID_ROWS - 1 - y);
        const seedVal = Math.sin(symX * 12.9898 + symY * 78.233) * 43758.5453;
        const noise = seedVal - Math.floor(seedVal);
        const weighted = noise * 0.45 + Math.random() * 0.55;

        if (weighted < 0.65) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        }
      }
    }
  }

  private generateCryoProcedural(isSpawnProtected: (gx: number, gy: number) => boolean): void {
    // Laboratório Criogênico: Quantum portal pair, ice acceleration lanes, and crystal blocks
    // Place symmetrical Quantum Portals in open corridor intersections (odd, odd)
    this.grid[3][3] = TileType.TELEPORT_A;
    this.grid[GRID_ROWS - 4][GRID_COLS - 4] = TileType.TELEPORT_B;

    // Symmetrical acceleration lanes near center wings
    const cryoConveyors = [
      { x: 6, y: 3, tile: TileType.CONVEYOR_RIGHT },
      { x: 7, y: 3, tile: TileType.CONVEYOR_RIGHT },
      { x: 8, y: 3, tile: TileType.CONVEYOR_RIGHT },
      { x: 6, y: 9, tile: TileType.CONVEYOR_LEFT },
      { x: 7, y: 9, tile: TileType.CONVEYOR_LEFT },
      { x: 8, y: 9, tile: TileType.CONVEYOR_LEFT }
    ];
    for (const c of cryoConveyors) {
      if (!isSpawnProtected(c.x, c.y) && this.grid[c.y][c.x] === TileType.EMPTY) {
        this.grid[c.y][c.x] = c.tile;
      }
    }

    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] !== TileType.EMPTY || isSpawnProtected(x, y)) continue;

        const rand = Math.random();
        if (rand < 0.52) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        } else if (rand < 0.88) {
          this.grid[y][x] = TileType.ICE_FLOOR;
        }
      }
    }
  }

  private generateFoundryProcedural(isSpawnProtected: (gx: number, gy: number) => boolean): void {
    // Fundição Industrial: Conveyor lanes and volatile hazardous barrels (safe from spawns)
    const conveyorLanes = [
      { y: 3, fromX: 3, toX: 5, tile: TileType.CONVEYOR_RIGHT },
      { y: 3, fromX: 9, toX: 11, tile: TileType.CONVEYOR_RIGHT },
      { y: 9, fromX: 3, toX: 5, tile: TileType.CONVEYOR_LEFT },
      { y: 9, fromX: 9, toX: 11, tile: TileType.CONVEYOR_LEFT }
    ];

    for (const lane of conveyorLanes) {
      for (let x = lane.fromX; x <= lane.toX; x++) {
        if (!isSpawnProtected(x, lane.y) && this.grid[lane.y][x] !== TileType.HARD_WALL) {
          this.grid[lane.y][x] = lane.tile;
        }
      }
    }

    const isNearSpawnZone = (gx: number, gy: number) =>
      isSpawnProtected(gx, gy) ||
      isSpawnProtected(gx - 1, gy) ||
      isSpawnProtected(gx + 1, gy) ||
      isSpawnProtected(gx, gy - 1) ||
      isSpawnProtected(gx, gy + 1);

    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] !== TileType.EMPTY || isSpawnProtected(x, y)) continue;

        const rand = Math.random();
        if (rand < 0.14 && !isNearSpawnZone(x, y)) {
          this.grid[y][x] = TileType.VOLATILE_BLOCK;
        } else if (rand < 0.68) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        }
      }
    }
  }

  public getUpcomingSuddenDeathTiles(count: number = 3): { x: number; y: number }[] {
    if (!this.suddenDeathActive) return [];
    return this.suddenDeathPath.slice(this.suddenDeathIndex, this.suddenDeathIndex + count);
  }

  public getChainQueue(): readonly ChainReactionEntry[] {
    return this.chainQueue;
  }

  private generateSuddenDeathPath(): void {
    this.suddenDeathPath = [];
    let top = 1;
    let bottom = GRID_ROWS - 2;
    let left = 1;
    let right = GRID_COLS - 2;

    while (top <= bottom && left <= right) {
      for (let col = left; col <= right; col++) {
        this.suddenDeathPath.push({ x: col, y: top });
      }
      top++;

      for (let row = top; row <= bottom; row++) {
        this.suddenDeathPath.push({ x: right, y: row });
      }
      right--;

      if (top <= bottom) {
        for (let col = right; col >= left; col--) {
          this.suddenDeathPath.push({ x: col, y: bottom });
        }
        bottom--;
      }

      if (left <= right) {
        for (let row = bottom; row >= top; row--) {
          this.suddenDeathPath.push({ x: left, y: row });
        }
        left++;
      }
    }
  }

  public getSpawnPosition(slotIndex: number): { x: number; y: number } {
    const spawns = [
      { gx: 1, gy: 1 },
      { gx: GRID_COLS - 2, gy: GRID_ROWS - 2 },
      { gx: GRID_COLS - 2, gy: 1 },
      { gx: 1, gy: GRID_ROWS - 2 },
      { gx: Math.floor(GRID_COLS / 2), gy: 1 },
      { gx: Math.floor(GRID_COLS / 2), gy: GRID_ROWS - 2 },
      { gx: 1, gy: Math.floor(GRID_ROWS / 2) },
      { gx: GRID_COLS - 2, gy: Math.floor(GRID_ROWS / 2) }
    ];
    const s = spawns[slotIndex % spawns.length];
    return {
      x: s.gx * TILE_SIZE + TILE_SIZE / 2,
      y: s.gy * TILE_SIZE + TILE_SIZE / 2
    };
  }

  public addPlayer(id: string, name: string, isBot: boolean = false, customColor?: string): PlayerState {
    const slotIndex = this.players.size;
    const spawn = this.getSpawnPosition(slotIndex);

    let color = customColor;
    if (!color) {
      const taken = new Set(Array.from(this.players.values()).map(p => p.color.toLowerCase()));
      const available = PLAYER_COLORS.filter(c => !taken.has(c.toLowerCase()));
      color = available.length > 0 ? available[0] : PLAYER_COLORS[slotIndex % PLAYER_COLORS.length];
    }

    const player: PlayerState = {
      id,
      name: name || `Operador ${slotIndex + 1}`,
      color,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      desiredDx: 0,
      desiredDy: 0,
      facing: 'down',
      isMoving: false,
      alive: true,
      isBot,
      botPersonality: isBot ? (slotIndex % 2 === 0 ? 'aggressive' : 'tactical') : undefined,
      kills: 0,
      powerUps: {
        bombLimit: BASE_BOMB_LIMIT,
        fireRange: BASE_FIRE_RANGE,
        speed: BASE_PLAYER_SPEED,
        canKick: false,
        hasShield: false,
        isCursed: false,
        curseTimer: 0
      },
      activeBombs: 0,
      invincibleTimer: INVINCIBLE_TIME_ON_START,
      bombInputBufferTimer: 0
    };

    this.players.set(id, player);
    return player;
  }

  public removePlayer(id: string): void {
    this.players.delete(id);
    this.teleportCooldowns.delete(id);
    if (this.phase === 'playing') {
      this.checkWinCondition();
    }
  }

  public startGame(): void {
    this.phase = 'playing';
    this.timer = ROUND_TIME_TOTAL;
    this.suddenDeathActive = false;
    this.suddenDeathIndex = 0;
    this.suddenDeathTimer = 0;
    this.bombs = [];
    this.explosions = [];
    this.powerUps = [];
    this.breakingBlocks = [];
    this.chainQueue = [];
    this.teleportCooldowns.clear();
    this.winner = null;
    this.hitstopTimer = 0;

    let index = 0;
    for (const player of this.players.values()) {
      const spawn = this.getSpawnPosition(index++);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.desiredDx = 0;
      player.desiredDy = 0;
      player.facing = 'down';
      player.isMoving = false;
      player.alive = true;
      player.kills = 0;
      player.activeBombs = 0;
      player.invincibleTimer = INVINCIBLE_TIME_ON_START;
      player.bombInputBufferTimer = 0;
      player.powerUps = {
        bombLimit: BASE_BOMB_LIMIT,
        fireRange: BASE_FIRE_RANGE,
        speed: BASE_PLAYER_SPEED,
        canKick: false,
        hasShield: false,
        isCursed: false,
        curseTimer: 0
      };
    }
  }

  public handleInput(playerId: string, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player || !player.alive || this.phase !== 'playing') return;

    let dx = Math.max(-1, Math.min(1, input.dx));
    let dy = Math.max(-1, Math.min(1, input.dy));

    if (player.powerUps.isCursed) {
      dx = -dx;
      dy = -dy;
    }

    player.desiredDx = dx;
    player.desiredDy = dy;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx < 0) player.facing = 'left';
      else if (dx > 0) player.facing = 'right';
      else if (dy < 0) player.facing = 'up';
      else if (dy > 0) player.facing = 'down';
    } else {
      if (dy < 0) player.facing = 'up';
      else if (dy > 0) player.facing = 'down';
    }

    // Input buffering for bomb placement
    if (input.placeBomb) {
      player.bombInputBufferTimer = INPUT_BUFFER_WINDOW;
    }
  }

  private doesPlayerOverlapTile(player: PlayerState, gx: number, gy: number): boolean {
    const r = PLAYER_HITBOX_RADIUS;
    const leftGx = Math.floor((player.x - r) / TILE_SIZE);
    const rightGx = Math.floor((player.x + r - 0.01) / TILE_SIZE);
    const topGy = Math.floor((player.y - r) / TILE_SIZE);
    const bottomGy = Math.floor((player.y + r - 0.01) / TILE_SIZE);
    return leftGx <= gx && gx <= rightGx && topGy <= gy && gy <= bottomGy;
  }

  public placeBomb(player: PlayerState): boolean {
    if (player.activeBombs >= player.powerUps.bombLimit) {
      return false;
    }

    const gx = Math.floor(player.x / TILE_SIZE);
    const gy = Math.floor(player.y / TILE_SIZE);

    if (gx < 1 || gx >= GRID_COLS - 1 || gy < 1 || gy >= GRID_ROWS - 1) {
      return false;
    }

    if (this.bombs.some(b => b.gx === gx && b.gy === gy)) {
      return false;
    }

    const tile = this.grid[gy][gx];
    if (
      tile === TileType.HARD_WALL ||
      tile === TileType.SOFT_BLOCK ||
      tile === TileType.VOLATILE_BLOCK ||
      tile === TileType.SUDDEN_DEATH_BLOCK
    ) {
      return false;
    }

    // One-way passability: allow all alive players whose hitbox overlaps this tile to step off cleanly
    const overlappingIds: string[] = [];
    for (const p of this.players.values()) {
      if (p.alive && (p.id === player.id || this.doesPlayerOverlapTile(p, gx, gy))) {
        overlappingIds.push(p.id);
      }
    }

    const bomb: Bomb = {
      id: `bomb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ownerId: player.id,
      gx,
      gy,
      x: gx * TILE_SIZE + TILE_SIZE / 2,
      y: gy * TILE_SIZE + TILE_SIZE / 2,
      fuseTimer: BOMB_FUSE_TIME,
      fireRange: player.powerUps.fireRange,
      slidingVx: 0,
      slidingVy: 0,
      isConveyorSliding: false,
      overlapPlayers: overlappingIds
    };

    this.bombs.push(bomb);
    player.activeBombs++;
    return true;
  }

  public update(dt: number = TICK_DELTA): void {
    // Hitstop frame freeze handling (30ms - 40ms), including finishing gracefully on final kill
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (this.phase !== 'playing') {
      if (this.phase === 'game_over') {
        for (let i = this.breakingBlocks.length - 1; i >= 0; i--) {
          this.breakingBlocks[i].timer -= dt;
          if (this.breakingBlocks[i].timer <= 0) this.breakingBlocks.splice(i, 1);
        }
        for (let i = this.explosions.length - 1; i >= 0; i--) {
          this.explosions[i].duration -= dt;
          if (this.explosions[i].duration <= 0) this.explosions.splice(i, 1);
        }
      }
      return;
    }

    // 1. Process Stepped Chain Reactions (50ms cascade delay)
    this.updateChainReactions(dt);

    // 2. Update Breaking Blocks Animations
    for (let i = this.breakingBlocks.length - 1; i >= 0; i--) {
      this.breakingBlocks[i].timer -= dt;
      if (this.breakingBlocks[i].timer <= 0) {
        this.breakingBlocks.splice(i, 1);
      }
    }

    // 3. Timer & Sudden Death
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer <= SUDDEN_DEATH_START_TIME && !this.suddenDeathActive) {
      this.suddenDeathActive = true;
    }

    if (this.suddenDeathActive) {
      this.suddenDeathTimer += dt;
      if (this.suddenDeathTimer >= SUDDEN_DEATH_DROP_INTERVAL) {
        this.suddenDeathTimer = 0;
        this.dropNextSuddenDeathBlock();
      }
    }

    // 4. Update Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.duration -= dt;
      if (exp.duration <= 0) {
        this.explosions.splice(i, 1);
      }
    }

    // 5. Update Bombs & Fuse
    this.updateBombs(dt);

    // 6. Update Players (Movement with Corner Rounding & Buffered Inputs)
    this.updatePlayers(dt);

    // 7. Check Damage
    this.checkExplosionDamage();

    // 8. Win Condition
    this.checkWinCondition();
  }

  private updateChainReactions(dt: number): void {
    for (let i = this.chainQueue.length - 1; i >= 0; i--) {
      const entry = this.chainQueue[i];
      entry.delayTimer -= dt;
      if (entry.delayTimer <= 0) {
        this.chainQueue.splice(i, 1);
        if (this.bombs.includes(entry.bomb)) {
          this.detonateBomb(entry.bomb);
        }
      }
    }
  }

  private dropNextSuddenDeathBlock(): void {
    if (this.suddenDeathIndex >= this.suddenDeathPath.length) return;

    const pt = this.suddenDeathPath[this.suddenDeathIndex++];
    this.grid[pt.y][pt.x] = TileType.SUDDEN_DEATH_BLOCK;

    this.powerUps = this.powerUps.filter(p => !(p.gx === pt.x && p.gy === pt.y));
    this.breakingBlocks = this.breakingBlocks.filter(b => !(b.gx === pt.x && b.gy === pt.y));

    const bomb = this.bombs.find(b => b.gx === pt.x && b.gy === pt.y);
    if (bomb) {
      this.detonateBomb(bomb);
    }

    const cellBounds = {
      minX: pt.x * TILE_SIZE,
      maxX: (pt.x + 1) * TILE_SIZE,
      minY: pt.y * TILE_SIZE,
      maxY: (pt.y + 1) * TILE_SIZE
    };

    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (
        player.x >= cellBounds.minX &&
        player.x <= cellBounds.maxX &&
        player.y >= cellBounds.minY &&
        player.y <= cellBounds.maxY
      ) {
        player.alive = false;
        this.hitstopTimer = HITSTOP_DURATION;
      }
    }
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      if (!bomb) continue;

      // Exact AABB One-Way Passability cleanup:
      // Keeps player passable while ANY corner of their hitbox intersects (bomb.gx, bomb.gy).
      if (bomb.overlapPlayers && bomb.overlapPlayers.length > 0) {
        bomb.overlapPlayers = bomb.overlapPlayers.filter(pid => {
          const p = this.players.get(pid);
          if (!p || !p.alive) return false;
          return this.doesPlayerOverlapTile(p, bomb.gx, bomb.gy);
        });
      }

      // Conveyor belts push stationary bombs cleanly across belt tiles
      const tile = this.grid[bomb.gy]?.[bomb.gx] ?? TileType.EMPTY;
      if (bomb.slidingVx === 0 && bomb.slidingVy === 0) {
        if (tile === TileType.CONVEYOR_UP) {
          bomb.slidingVy = -95;
          bomb.isConveyorSliding = true;
        } else if (tile === TileType.CONVEYOR_DOWN) {
          bomb.slidingVy = 95;
          bomb.isConveyorSliding = true;
        } else if (tile === TileType.CONVEYOR_LEFT) {
          bomb.slidingVx = -95;
          bomb.isConveyorSliding = true;
        } else if (tile === TileType.CONVEYOR_RIGHT) {
          bomb.slidingVx = 95;
          bomb.isConveyorSliding = true;
        }
      }

      // Sub-pixel sliding bomb physics
      if (bomb.slidingVx !== 0 || bomb.slidingVy !== 0) {
        const nextX = bomb.x + bomb.slidingVx * dt;
        const nextY = bomb.y + bomb.slidingVy * dt;

        const dirX = Math.sign(bomb.slidingVx);
        const dirY = Math.sign(bomb.slidingVy);
        const leadX = nextX + dirX * (TILE_SIZE / 2 - 2);
        const leadY = nextY + dirY * (TILE_SIZE / 2 - 2);
        const frontGx = Math.floor(leadX / TILE_SIZE);
        const frontGy = Math.floor(leadY / TILE_SIZE);

        const movingToNewTile = frontGx !== bomb.gx || frontGy !== bomb.gy;
        let blocked = false;

        if (movingToNewTile && this.isTileBlockedForBomb(frontGx, frontGy, bomb)) {
          blocked = true;
        } else {
          // Stop if colliding with any alive player (not inside overlapPlayers) ahead of bomb
          for (const p of this.players.values()) {
            if (!p.alive || bomb.overlapPlayers.includes(p.id)) continue;
            if (Math.abs(p.x - nextX) < TILE_SIZE / 2 + PLAYER_HITBOX_RADIUS - 3 &&
                Math.abs(p.y - nextY) < TILE_SIZE / 2 + PLAYER_HITBOX_RADIUS - 3) {
              blocked = true;
              break;
            }
          }
        }

        if (blocked) {
          bomb.x = bomb.gx * TILE_SIZE + TILE_SIZE / 2;
          bomb.y = bomb.gy * TILE_SIZE + TILE_SIZE / 2;
          bomb.slidingVx = 0;
          bomb.slidingVy = 0;
          bomb.isConveyorSliding = false;
        } else {
          bomb.x = nextX;
          bomb.y = nextY;
          bomb.gx = Math.floor(bomb.x / TILE_SIZE);
          bomb.gy = Math.floor(bomb.y / TILE_SIZE);

          // If conveyor-carried bomb reached a non-conveyor tile center, snap & stop
          const newTile = this.grid[bomb.gy]?.[bomb.gx] ?? TileType.EMPTY;
          const isStillOnConveyor =
            newTile === TileType.CONVEYOR_UP ||
            newTile === TileType.CONVEYOR_DOWN ||
            newTile === TileType.CONVEYOR_LEFT ||
            newTile === TileType.CONVEYOR_RIGHT;

          if (bomb.isConveyorSliding && !isStillOnConveyor) {
            const cX = bomb.gx * TILE_SIZE + TILE_SIZE / 2;
            const cY = bomb.gy * TILE_SIZE + TILE_SIZE / 2;
            if (Math.hypot(bomb.x - cX, bomb.y - cY) < 4) {
              bomb.x = cX;
              bomb.y = cY;
              bomb.slidingVx = 0;
              bomb.slidingVy = 0;
              bomb.isConveyorSliding = false;
            }
          }

          // Quantum portal teleportation for kicked bombs
          if (!bomb.isConveyorSliding && (newTile === TileType.TELEPORT_A || newTile === TileType.TELEPORT_B)) {
            const cX = bomb.gx * TILE_SIZE + TILE_SIZE / 2;
            const cY = bomb.gy * TILE_SIZE + TILE_SIZE / 2;
            if (Math.hypot(bomb.x - cX, bomb.y - cY) < 8) {
              const targetPortal = this.findMatchingPortal(newTile);
              if (targetPortal && !this.isTileBlockedForBomb(targetPortal.gx, targetPortal.gy, bomb)) {
                bomb.gx = targetPortal.gx;
                bomb.gy = targetPortal.gy;
                bomb.x = targetPortal.gx * TILE_SIZE + TILE_SIZE / 2 + dirX * 14;
                bomb.y = targetPortal.gy * TILE_SIZE + TILE_SIZE / 2 + dirY * 14;
              }
            }
          }
        }
      }

      // Fuse Countdown
      bomb.fuseTimer -= dt;
      if (bomb.fuseTimer <= 0) {
        this.detonateBomb(bomb);
      }
    }
  }

  private findMatchingPortal(sourceTile: TileType): { gx: number; gy: number } | null {
    const targetTile = sourceTile === TileType.TELEPORT_A ? TileType.TELEPORT_B : TileType.TELEPORT_A;
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (this.grid[y][x] === targetTile) {
          return { gx: x, gy: y };
        }
      }
    }
    return null;
  }

  private isTileBlockedForBomb(gx: number, gy: number, ignoreBomb?: Bomb): boolean {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return true;
    const tile = this.grid[gy][gx];
    if (
      tile !== TileType.EMPTY &&
      tile !== TileType.ICE_FLOOR &&
      tile !== TileType.TELEPORT_A &&
      tile !== TileType.TELEPORT_B &&
      tile !== TileType.CONVEYOR_UP &&
      tile !== TileType.CONVEYOR_DOWN &&
      tile !== TileType.CONVEYOR_LEFT &&
      tile !== TileType.CONVEYOR_RIGHT
    ) {
      return true;
    }
    if (this.bombs.some(b => b !== ignoreBomb && b.gx === gx && b.gy === gy)) {
      return true;
    }
    return false;
  }

  public detonateBomb(bomb: Bomb): void {
    const bombIndex = this.bombs.indexOf(bomb);
    if (bombIndex === -1) return;
    this.bombs.splice(bombIndex, 1);

    const owner = this.players.get(bomb.ownerId);
    if (owner && owner.activeBombs > 0) {
      owner.activeBombs--;
    }

    const cells: ExplosionCell[] = [
      { gx: bomb.gx, gy: bomb.gy, direction: 'center' }
    ];

    const directions: { dx: number; dy: number; dir: 'horizontal' | 'vertical'; endDir: 'end_up' | 'end_down' | 'end_left' | 'end_right' }[] = [
      { dx: 0, dy: -1, dir: 'vertical', endDir: 'end_up' },
      { dx: 0, dy: 1, dir: 'vertical', endDir: 'end_down' },
      { dx: -1, dy: 0, dir: 'horizontal', endDir: 'end_left' },
      { dx: 1, dy: 0, dir: 'horizontal', endDir: 'end_right' }
    ];

    const visitedVolatile = new Set<string>();

    for (const d of directions) {
      for (let dist = 1; dist <= bomb.fireRange; dist++) {
        const gx = bomb.gx + d.dx * dist;
        const gy = bomb.gy + d.dy * dist;

        if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) break;

        const tile = this.grid[gy][gx];

        // Indestructible walls stop flame immediately
        if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) {
          break;
        }

        // Stepped 50ms Chain Reaction: queue adjacent armed bomb!
        const hitBomb = this.bombs.find(b => b.gx === gx && b.gy === gy);
        if (hitBomb && !this.chainQueue.some(e => e.bomb === hitBomb)) {
          this.chainQueue.push({ bomb: hitBomb, delayTimer: CHAIN_REACTION_DELAY });
        }

        const isEnd = dist === bomb.fireRange || tile === TileType.SOFT_BLOCK || tile === TileType.VOLATILE_BLOCK;
        cells.push({
          gx,
          gy,
          direction: isEnd ? d.endDir : d.dir
        });

        // Soft Block: destroys block, queues break animation, and STOPS flame on that tile!
        if (tile === TileType.SOFT_BLOCK) {
          this.grid[gy][gx] = TileType.EMPTY;
          this.breakingBlocks.push({ gx, gy, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
          this.rollPowerUpDrop(gx, gy);
          break; // Does NOT penetrate through multiple soft blocks!
        }

        // Volatile Block (Foundry/TNT): triggers immediate radial burst and stops
        if (tile === TileType.VOLATILE_BLOCK) {
          this.grid[gy][gx] = TileType.EMPTY;
          this.breakingBlocks.push({ gx, gy, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
          this.triggerVolatileBurst(gx, gy, bomb.ownerId, visitedVolatile);
          break;
        }
      }
    }

    this.explosions.push({
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ownerId: bomb.ownerId,
      cells,
      duration: EXPLOSION_DURATION
    });
  }

  private triggerVolatileBurst(
    gx: number,
    gy: number,
    ownerId: string,
    visited: Set<string> = new Set()
  ): void {
    const key = `${gx},${gy}`;
    if (visited.has(key)) return;
    visited.add(key);

    const burstCells: ExplosionCell[] = [{ gx, gy, direction: 'center' }];
    const offsets: { dx: number; dy: number; dir: ExplosionCell['direction'] }[] = [
      { dx: 0, dy: -1, dir: 'end_up' },
      { dx: 0, dy: 1, dir: 'end_down' },
      { dx: -1, dy: 0, dir: 'end_left' },
      { dx: 1, dy: 0, dir: 'end_right' },
      { dx: -1, dy: -1, dir: 'center' },
      { dx: 1, dy: -1, dir: 'center' },
      { dx: -1, dy: 1, dir: 'center' },
      { dx: 1, dy: 1, dir: 'center' }
    ];

    for (const o of offsets) {
      const nx = gx + o.dx;
      const ny = gy + o.dy;
      if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;

      const tile = this.grid[ny][nx];
      if (tile === TileType.HARD_WALL || tile === TileType.SUDDEN_DEATH_BLOCK) {
        continue;
      }

      if (tile === TileType.SOFT_BLOCK) {
        this.grid[ny][nx] = TileType.EMPTY;
        this.breakingBlocks.push({ gx: nx, gy: ny, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
        this.rollPowerUpDrop(nx, ny);
      } else if (tile === TileType.VOLATILE_BLOCK) {
        this.grid[ny][nx] = TileType.EMPTY;
        this.breakingBlocks.push({ gx: nx, gy: ny, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
        this.triggerVolatileBurst(nx, ny, ownerId, visited);
      }

      const hitBomb = this.bombs.find(b => b.gx === nx && b.gy === ny);
      if (hitBomb && !this.chainQueue.some(e => e.bomb === hitBomb)) {
        this.chainQueue.push({ bomb: hitBomb, delayTimer: CHAIN_REACTION_DELAY });
      }

      burstCells.push({ gx: nx, gy: ny, direction: o.dir });
    }

    this.explosions.push({
      id: `vol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ownerId,
      cells: burstCells,
      duration: EXPLOSION_DURATION
    });
  }

  private rollPowerUpDrop(gx: number, gy: number): void {
    if (Math.random() > 0.40) return;

    const roll = Math.random();
    let type = PowerUpType.FIRE_UP;

    if (roll < 0.28) type = PowerUpType.FIRE_UP;
    else if (roll < 0.54) type = PowerUpType.BOMB_UP;
    else if (roll < 0.74) type = PowerUpType.SPEED_UP;
    else if (roll < 0.88) type = PowerUpType.BOMB_KICK;
    else if (roll < 0.96) type = PowerUpType.SHIELD;
    else type = PowerUpType.SKULL;

    this.powerUps.push({
      id: `pup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      gx,
      gy,
      type
    });
  }

  private isTileWalkableForPlayer(gx: number, gy: number, player: PlayerState): boolean {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return false;
    const tile = this.grid[gy][gx];
    if (
      tile === TileType.HARD_WALL ||
      tile === TileType.SOFT_BLOCK ||
      tile === TileType.VOLATILE_BLOCK ||
      tile === TileType.SUDDEN_DEATH_BLOCK
    ) {
      return false;
    }
    const bomb = this.bombs.find(b => b.gx === gx && b.gy === gy);
    if (bomb && !(bomb.overlapPlayers && bomb.overlapPlayers.includes(player.id))) {
      return false;
    }
    return true;
  }

  private tryKickBlockingBomb(player: PlayerState, nextX: number, nextY: number, dirX: number, dirY: number): boolean {
    if (!player.powerUps.canKick) return false;
    const r = PLAYER_HITBOX_RADIUS;
    const leftGx = Math.floor((nextX - r) / TILE_SIZE);
    const rightGx = Math.floor((nextX + r - 0.01) / TILE_SIZE);
    const topGy = Math.floor((nextY - r) / TILE_SIZE);
    const bottomGy = Math.floor((nextY + r - 0.01) / TILE_SIZE);

    for (const bomb of this.bombs) {
      if (bomb.slidingVx !== 0 || bomb.slidingVy !== 0) continue;
      if (bomb.overlapPlayers && bomb.overlapPlayers.includes(player.id)) continue;

      if (bomb.gx >= leftGx && bomb.gx <= rightGx && bomb.gy >= topGy && bomb.gy <= bottomGy) {
        const destGx = bomb.gx + dirX;
        const destGy = bomb.gy + dirY;
        if (!this.isTileBlockedForBomb(destGx, destGy, bomb)) {
          bomb.slidingVx = dirX * BOMB_SLIDE_SPEED;
          bomb.slidingVy = dirY * BOMB_SLIDE_SPEED;
          bomb.isConveyorSliding = false;
          return true;
        }
      }
    }
    return false;
  }

  private updatePlayers(dt: number): void {
    const r = PLAYER_HITBOX_RADIUS;
    const isCryoArena = this.normalizeArena(this.arena) === 'cryo';

    for (const player of this.players.values()) {
      if (!player.alive) continue;

      if (player.invincibleTimer > 0) {
        player.invincibleTimer -= dt;
      }

      if (player.powerUps.isCursed) {
        player.powerUps.curseTimer -= dt;
        if (player.powerUps.curseTimer <= 0) {
          player.powerUps.isCursed = false;
        }
      }

      const tpCd = this.teleportCooldowns.get(player.id) ?? 0;
      if (tpCd > 0) {
        this.teleportCooldowns.set(player.id, Math.max(0, tpCd - dt));
      }

      // Input buffer execution for bomb placement
      if (player.bombInputBufferTimer > 0) {
        player.bombInputBufferTimer -= dt;
        const placed = this.placeBomb(player);
        if (placed) {
          player.bombInputBufferTimer = 0;
        }
      }

      // Frame-rate-independent Velocity & Cryogenic Ice Drift
      const curGx = Math.floor(player.x / TILE_SIZE);
      const curGy = Math.floor(player.y / TILE_SIZE);
      const tileUnder = this.grid[curGy]?.[curGx] ?? TileType.EMPTY;
      const onIcePatch = tileUnder === TileType.ICE_FLOOR;

      let dX = player.desiredDx;
      let dY = player.desiredDy;
      const speed = player.powerUps.speed;

      // Normalize diagonal speed ONLY when both axes can advance freely (preserves 100% speed sliding along walls)
      if (dX !== 0 && dY !== 0) {
        const testX = this.canPlayerMoveTo(player.x + Math.sign(dX) * 4, player.y, r, player);
        const testY = this.canPlayerMoveTo(player.x, player.y + Math.sign(dY) * 4, r, player);
        if (testX && testY) {
          const inv = 1 / Math.hypot(dX, dY);
          dX *= inv;
          dY *= inv;
        }
      }

      const targetVx = dX * speed;
      const targetVy = dY * speed;

      if (onIcePatch) {
        const keep = Math.pow(0.05, dt); // smooth crystalline glide
        player.vx = player.vx * keep + targetVx * (1 - keep);
        player.vy = player.vy * keep + targetVy * (1 - keep);
      } else if (isCryoArena) {
        const keep = Math.pow(0.0001, dt); // light snappy inertia on sub-zero lab floor
        player.vx = player.vx * keep + targetVx * (1 - keep);
        player.vy = player.vy * keep + targetVy * (1 - keep);
      } else {
        player.vx = targetVx;
        player.vy = targetVy;
      }

      if (Math.abs(player.vx) < 3 && targetVx === 0) player.vx = 0;
      if (Math.abs(player.vy) < 3 && targetVy === 0) player.vy = 0;
      player.isMoving = Math.hypot(player.vx, player.vy) > 10;

      // Conveyor Belt transport (collision-safe!)
      if (curGx >= 0 && curGx < GRID_COLS && curGy >= 0 && curGy < GRID_ROWS) {
        const convStep = 95 * dt;
        if (tileUnder === TileType.CONVEYOR_UP && this.canPlayerMoveTo(player.x, player.y - convStep, r, player)) {
          player.y -= convStep;
        } else if (tileUnder === TileType.CONVEYOR_DOWN && this.canPlayerMoveTo(player.x, player.y + convStep, r, player)) {
          player.y += convStep;
        } else if (tileUnder === TileType.CONVEYOR_LEFT && this.canPlayerMoveTo(player.x - convStep, player.y, r, player)) {
          player.x -= convStep;
        } else if (tileUnder === TileType.CONVEYOR_RIGHT && this.canPlayerMoveTo(player.x + convStep, player.y, r, player)) {
          player.x += convStep;
        }
      }

      // --- HORIZONTAL MOVEMENT + EXACT CORNER ROUNDING (<40% NUDGE) + KICK ---
      if (player.vx !== 0) {
        const nextX = player.x + player.vx * dt;
        if (this.canPlayerMoveTo(nextX, player.y, r, player)) {
          player.x = nextX;
        } else {
          // Kick stationary bomb if walking against one
          this.tryKickBlockingBomb(player, nextX, player.y, Math.sign(player.vx), 0);

          // Exact leading-edge corner rounding into open adjacent corridor
          const targetGx = Math.floor((nextX + Math.sign(player.vx) * r - (player.vx > 0 ? 0.01 : 0)) / TILE_SIZE);
          const topGy = Math.floor((player.y - r) / TILE_SIZE);
          const bottomGy = Math.floor((player.y + r - 0.01) / TILE_SIZE);

          if (topGy !== bottomGy) {
            const topOpen = this.isTileWalkableForPlayer(targetGx, topGy, player);
            const bottomOpen = this.isTileWalkableForPlayer(targetGx, bottomGy, player);

            if (topOpen && !bottomOpen) {
              const overlap = (player.y + r) - bottomGy * TILE_SIZE;
              if (overlap > 0 && overlap <= CORNER_ROUNDING_THRESHOLD) {
                const nudge = -Math.min(overlap + 0.5, speed * dt * 1.15);
                if (this.canPlayerMoveTo(player.x, player.y + nudge, r, player)) {
                  player.y += nudge;
                  if (this.canPlayerMoveTo(nextX, player.y, r, player)) {
                    player.x = nextX;
                  }
                }
              }
            } else if (!topOpen && bottomOpen) {
              const overlap = bottomGy * TILE_SIZE - (player.y - r);
              if (overlap > 0 && overlap <= CORNER_ROUNDING_THRESHOLD) {
                const nudge = Math.min(overlap + 0.5, speed * dt * 1.15);
                if (this.canPlayerMoveTo(player.x, player.y + nudge, r, player)) {
                  player.y += nudge;
                  if (this.canPlayerMoveTo(nextX, player.y, r, player)) {
                    player.x = nextX;
                  }
                }
              }
            }
          }
        }
      }

      // --- VERTICAL MOVEMENT + EXACT CORNER ROUNDING (<40% NUDGE) + KICK ---
      if (player.vy !== 0) {
        const nextY = player.y + player.vy * dt;
        if (this.canPlayerMoveTo(player.x, nextY, r, player)) {
          player.y = nextY;
        } else {
          // Kick stationary bomb if walking against one
          this.tryKickBlockingBomb(player, player.x, nextY, 0, Math.sign(player.vy));

          const targetGy = Math.floor((nextY + Math.sign(player.vy) * r - (player.vy > 0 ? 0.01 : 0)) / TILE_SIZE);
          const leftGx = Math.floor((player.x - r) / TILE_SIZE);
          const rightGx = Math.floor((player.x + r - 0.01) / TILE_SIZE);

          if (leftGx !== rightGx) {
            const leftOpen = this.isTileWalkableForPlayer(leftGx, targetGy, player);
            const rightOpen = this.isTileWalkableForPlayer(rightGx, targetGy, player);

            if (leftOpen && !rightOpen) {
              const overlap = (player.x + r) - rightGx * TILE_SIZE;
              if (overlap > 0 && overlap <= CORNER_ROUNDING_THRESHOLD) {
                const nudge = -Math.min(overlap + 0.5, speed * dt * 1.15);
                if (this.canPlayerMoveTo(player.x + nudge, player.y, r, player)) {
                  player.x += nudge;
                  if (this.canPlayerMoveTo(player.x, nextY, r, player)) {
                    player.y = nextY;
                  }
                }
              }
            } else if (!leftOpen && rightOpen) {
              const overlap = rightGx * TILE_SIZE - (player.x - r);
              if (overlap > 0 && overlap <= CORNER_ROUNDING_THRESHOLD) {
                const nudge = Math.min(overlap + 0.5, speed * dt * 1.15);
                if (this.canPlayerMoveTo(player.x + nudge, player.y, r, player)) {
                  player.x += nudge;
                  if (this.canPlayerMoveTo(player.x, nextY, r, player)) {
                    player.y = nextY;
                  }
                }
              }
            }
          }
        }
      }

      // Power-up pickups
      const pGx = Math.floor(player.x / TILE_SIZE);
      const pGy = Math.floor(player.y / TILE_SIZE);
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        const pup = this.powerUps[i];
        if (pup.gx === pGx && pup.gy === pGy) {
          this.applyPowerUp(player, pup.type);
          this.powerUps.splice(i, 1);
        }
      }

      // Quantum Portal Teleportation (TELEPORT_A <-> TELEPORT_B)
      const portalTile = this.grid[pGy]?.[pGx];
      if ((portalTile === TileType.TELEPORT_A || portalTile === TileType.TELEPORT_B) &&
          (this.teleportCooldowns.get(player.id) ?? 0) <= 0) {
        const cX = pGx * TILE_SIZE + TILE_SIZE / 2;
        const cY = pGy * TILE_SIZE + TILE_SIZE / 2;
        if (Math.hypot(player.x - cX, player.y - cY) < 14) {
          const dest = this.findMatchingPortal(portalTile);
          if (dest && !this.bombs.some(b => b.gx === dest.gx && b.gy === dest.gy)) {
            player.x = dest.gx * TILE_SIZE + TILE_SIZE / 2;
            player.y = dest.gy * TILE_SIZE + TILE_SIZE / 2;
            player.vx *= 0.25;
            player.vy *= 0.25;
            this.teleportCooldowns.set(player.id, 1.6);
          }
        }
      }
    }
  }

  private canPlayerMoveTo(x: number, y: number, radius: number, player: PlayerState): boolean {
    const leftGx = Math.floor((x - radius) / TILE_SIZE);
    const rightGx = Math.floor((x + radius - 0.01) / TILE_SIZE);
    const topGy = Math.floor((y - radius) / TILE_SIZE);
    const bottomGy = Math.floor((y + radius - 0.01) / TILE_SIZE);

    for (let gy = topGy; gy <= bottomGy; gy++) {
      for (let gx = leftGx; gx <= rightGx; gx++) {
        if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return false;

        const tile = this.grid[gy][gx];
        if (
          tile === TileType.HARD_WALL ||
          tile === TileType.SOFT_BLOCK ||
          tile === TileType.VOLATILE_BLOCK ||
          tile === TileType.SUDDEN_DEATH_BLOCK
        ) {
          return false;
        }

        // Bomb collision: one-way passability for overlapping players until they step off tile
        const bomb = this.bombs.find(b => b.gx === gx && b.gy === gy);
        if (bomb) {
          if (bomb.overlapPlayers && bomb.overlapPlayers.includes(player.id)) {
            continue; // freely pass through
          }
          return false; // solid obstacle for all others
        }
      }
    }
    return true;
  }

  private applyPowerUp(player: PlayerState, type: PowerUpType): void {
    switch (type) {
      case PowerUpType.FIRE_UP:
        player.powerUps.fireRange = Math.min(MAX_FIRE_RANGE, player.powerUps.fireRange + 1);
        break;
      case PowerUpType.BOMB_UP:
        player.powerUps.bombLimit = Math.min(MAX_BOMB_LIMIT, player.powerUps.bombLimit + 1);
        break;
      case PowerUpType.SPEED_UP:
        player.powerUps.speed = Math.min(MAX_PLAYER_SPEED, player.powerUps.speed + SPEED_UP_BOOST);
        break;
      case PowerUpType.BOMB_KICK:
        player.powerUps.canKick = true;
        break;
      case PowerUpType.SHIELD:
        player.powerUps.hasShield = true;
        break;
      case PowerUpType.SKULL:
        player.powerUps.isCursed = true;
        player.powerUps.curseTimer = 8.0;
        break;
    }
  }

  private checkExplosionDamage(): void {
    for (const exp of this.explosions) {
      for (const cell of exp.cells) {
        const cellLeft = cell.gx * TILE_SIZE;
        const cellRight = (cell.gx + 1) * TILE_SIZE;
        const cellTop = cell.gy * TILE_SIZE;
        const cellBottom = (cell.gy + 1) * TILE_SIZE;

        for (const player of this.players.values()) {
          if (!player.alive || player.invincibleTimer > 0) continue;

          if (
            player.x >= cellLeft - 6 &&
            player.x <= cellRight + 6 &&
            player.y >= cellTop - 6 &&
            player.y <= cellBottom + 6
          ) {
            if (player.powerUps.hasShield) {
              player.powerUps.hasShield = false;
              player.invincibleTimer = 1.5;
            } else {
              player.alive = false;
              if (exp.ownerId && exp.ownerId !== player.id) {
                const killer = this.players.get(exp.ownerId);
                if (killer) killer.kills++;
              }
              // Trigger 35ms hitstop on player elimination!
              this.hitstopTimer = HITSTOP_DURATION;
            }
          }
        }
      }
    }
  }

  public checkWinCondition(): void {
    if (this.phase !== 'playing') return;

    const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);

    if (this.players.size > 1 && alivePlayers.length <= 1) {
      this.phase = 'game_over';
      this.winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
    } else if (this.players.size === 1 && alivePlayers.length === 0) {
      this.phase = 'game_over';
      this.winner = null;
    }
  }

  public getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      timer: Math.max(0, Math.ceil(this.timer)),
      suddenDeathActive: this.suddenDeathActive,
      arena: this.arena,
      grid: this.grid,
      players: Array.from(this.players.values()),
      bombs: this.bombs,
      explosions: this.explosions,
      powerUps: this.powerUps,
      breakingBlocks: this.breakingBlocks,
      winner: this.winner,
      hitstopTimer: this.hitstopTimer
    };
  }
}
