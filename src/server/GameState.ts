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
    // Ruínas da Arena: 65% destructible block density with balanced organic clusters
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] === TileType.HARD_WALL || isSpawnProtected(x, y)) continue;

        const symX = Math.min(x, GRID_COLS - 1 - x);
        const symY = Math.min(y, GRID_ROWS - 1 - y);
        const seedVal = Math.sin(symX * 12.9898 + symY * 78.233) * 43758.5453;
        const noise = seedVal - Math.floor(seedVal);

        if (noise < 0.65 || Math.random() < 0.60) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        }
      }
    }
  }

  private generateCryoProcedural(isSpawnProtected: (gx: number, gy: number) => boolean): void {
    // Laboratório Criogênico: Ice patches in open areas with crystal blocks
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] === TileType.HARD_WALL || isSpawnProtected(x, y)) continue;

        const rand = Math.random();
        if (rand < 0.55) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        } else if (rand < 0.85) {
          this.grid[y][x] = TileType.ICE_FLOOR;
        }
      }
    }
  }

  private generateFoundryProcedural(isSpawnProtected: (gx: number, gy: number) => boolean): void {
    // Fundição Industrial: Conveyor lanes and volatile hazardous barrels
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

    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] !== TileType.EMPTY || isSpawnProtected(x, y)) continue;

        const rand = Math.random();
        if (rand < 0.15) {
          this.grid[y][x] = TileType.VOLATILE_BLOCK;
        } else if (rand < 0.72) {
          this.grid[y][x] = TileType.SOFT_BLOCK;
        }
      }
    }
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

  public addPlayer(id: string, name: string, isBot: boolean = false): PlayerState {
    const slotIndex = this.players.size;
    const spawn = this.getSpawnPosition(slotIndex);
    const color = PLAYER_COLORS[slotIndex % PLAYER_COLORS.length];

    const player: PlayerState = {
      id,
      name: name || `Operador ${slotIndex + 1}`,
      color,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
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
    this.winner = null;
    this.hitstopTimer = 0;

    let index = 0;
    for (const player of this.players.values()) {
      const spawn = this.getSpawnPosition(index++);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.alive = true;
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

    let dx = input.dx;
    let dy = input.dy;

    if (player.powerUps.isCursed) {
      dx = -dx;
      dy = -dy;
    }

    const currentSpeed = player.powerUps.speed;
    const isCryo = this.normalizeArena(this.arena) === 'cryo';

    // In Cryogenic Lab, physics has slight low friction inertia (drift)
    if (isCryo) {
      if (dx !== 0) player.vx = player.vx * CRYO_ICE_FRICTION + dx * currentSpeed * (1 - CRYO_ICE_FRICTION);
      else player.vx *= CRYO_ICE_FRICTION;

      if (dy !== 0) player.vy = player.vy * CRYO_ICE_FRICTION + dy * currentSpeed * (1 - CRYO_ICE_FRICTION);
      else player.vy *= CRYO_ICE_FRICTION;

      if (Math.abs(player.vx) < 4) player.vx = 0;
      if (Math.abs(player.vy) < 4) player.vy = 0;
    } else {
      player.vx = dx * currentSpeed;
      player.vy = dy * currentSpeed;
    }

    if (dx < 0) player.facing = 'left';
    else if (dx > 0) player.facing = 'right';
    else if (dy < 0) player.facing = 'up';
    else if (dy > 0) player.facing = 'down';

    player.isMoving = Math.hypot(player.vx, player.vy) > 10;

    // Input buffering for bomb placement
    if (input.placeBomb) {
      player.bombInputBufferTimer = INPUT_BUFFER_WINDOW;
    }
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

    const bomb: Bomb = {
      id: `bomb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ownerId: player.id,
      gx,
      gy,
      fuseTimer: BOMB_FUSE_TIME,
      fireRange: player.powerUps.fireRange,
      slidingVx: 0,
      slidingVy: 0,
      overlapPlayers: [player.id] // One-way passability: creator passes through until leaving tile
    };

    this.bombs.push(bomb);
    player.activeBombs++;
    return true;
  }

  public update(dt: number = TICK_DELTA): void {
    if (this.phase !== 'playing') return;

    // Hitstop frame freeze handling (30ms - 40ms)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return; // Freeze simulation for visceral impact feel!
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
    this.timer -= dt;
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

      // One-Way Passability cleanup:
      // Once player completely exits the bomb's tile boundary, remove them from overlap list!
      if (bomb.overlapPlayers && bomb.overlapPlayers.length > 0) {
        const bombCenterX = bomb.gx * TILE_SIZE + TILE_SIZE / 2;
        const bombCenterY = bomb.gy * TILE_SIZE + TILE_SIZE / 2;

        bomb.overlapPlayers = bomb.overlapPlayers.filter(pid => {
          const p = this.players.get(pid);
          if (!p || !p.alive) return false;
          const distX = Math.abs(p.x - bombCenterX);
          const distY = Math.abs(p.y - bombCenterY);
          return distX < 26 && distY < 26;
        });
      }

      // Conveyor Belts in Foundry
      const tile = this.grid[bomb.gy][bomb.gx];
      if (bomb.slidingVx === 0 && bomb.slidingVy === 0) {
        if (tile === TileType.CONVEYOR_UP) bomb.slidingVy = -BOMB_SLIDE_SPEED;
        else if (tile === TileType.CONVEYOR_DOWN) bomb.slidingVy = BOMB_SLIDE_SPEED;
        else if (tile === TileType.CONVEYOR_LEFT) bomb.slidingVx = -BOMB_SLIDE_SPEED;
        else if (tile === TileType.CONVEYOR_RIGHT) bomb.slidingVx = BOMB_SLIDE_SPEED;
      }

      // Sliding Bomb physics
      if (bomb.slidingVx !== 0 || bomb.slidingVy !== 0) {
        const nextGx = bomb.gx + (bomb.slidingVx > 0 ? 1 : bomb.slidingVx < 0 ? -1 : 0);
        const nextGy = bomb.gy + (bomb.slidingVy > 0 ? 1 : bomb.slidingVy < 0 ? -1 : 0);

        if (this.isTileBlockedForBomb(nextGx, nextGy)) {
          bomb.slidingVx = 0;
          bomb.slidingVy = 0;
        } else {
          bomb.gx = nextGx;
          bomb.gy = nextGy;
        }
      }

      // Fuse Countdown
      bomb.fuseTimer -= dt;
      if (bomb.fuseTimer <= 0) {
        this.detonateBomb(bomb);
      }
    }
  }

  private isTileBlockedForBomb(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return true;
    const tile = this.grid[gy][gx];
    if (
      tile !== TileType.EMPTY &&
      tile !== TileType.ICE_FLOOR &&
      tile !== TileType.CONVEYOR_UP &&
      tile !== TileType.CONVEYOR_DOWN &&
      tile !== TileType.CONVEYOR_LEFT &&
      tile !== TileType.CONVEYOR_RIGHT
    ) {
      return true;
    }
    if (this.bombs.some(b => b.gx === gx && b.gy === gy)) {
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

        const isEnd = dist === bomb.fireRange;
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

        // Volatile Block (Foundry/TNT): triggers immediate burst and stops
        if (tile === TileType.VOLATILE_BLOCK) {
          this.grid[gy][gx] = TileType.EMPTY;
          this.breakingBlocks.push({ gx, gy, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
          this.triggerVolatileBurst(gx, gy);
          break;
        }
      }
    }

    this.explosions.push({
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      cells,
      duration: EXPLOSION_DURATION
    });
  }

  private triggerVolatileBurst(gx: number, gy: number): void {
    const burstCells: ExplosionCell[] = [{ gx, gy, direction: 'center' }];
    const offsets = [
      { dx: 0, dy: -1, dir: 'end_up' as const },
      { dx: 0, dy: 1, dir: 'end_down' as const },
      { dx: -1, dy: 0, dir: 'end_left' as const },
      { dx: 1, dy: 0, dir: 'end_right' as const }
    ];

    for (const o of offsets) {
      const nx = gx + o.dx;
      const ny = gy + o.dy;
      if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
        if (this.grid[ny][nx] === TileType.SOFT_BLOCK) {
          this.grid[ny][nx] = TileType.EMPTY;
          this.breakingBlocks.push({ gx: nx, gy: ny, timer: BLOCK_BREAK_DURATION, maxTime: BLOCK_BREAK_DURATION });
          this.rollPowerUpDrop(nx, ny);
        }
        burstCells.push({ gx: nx, gy: ny, direction: o.dir });
      }
    }

    this.explosions.push({
      id: `vol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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

  private updatePlayers(dt: number): void {
    const playerRadius = PLAYER_HITBOX_RADIUS;

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

      // Input buffer execution for bomb placement
      if (player.bombInputBufferTimer > 0) {
        player.bombInputBufferTimer -= dt;
        const placed = this.placeBomb(player);
        if (placed) {
          player.bombInputBufferTimer = 0;
        }
      }

      // Conveyor Belt transport in Foundry
      const curGx = Math.floor(player.x / TILE_SIZE);
      const curGy = Math.floor(player.y / TILE_SIZE);
      if (curGx >= 0 && curGx < GRID_COLS && curGy >= 0 && curGy < GRID_ROWS) {
        const tile = this.grid[curGy][curGx];
        const conveyorSpeed = 95 * dt;
        if (tile === TileType.CONVEYOR_UP) player.y -= conveyorSpeed;
        else if (tile === TileType.CONVEYOR_DOWN) player.y += conveyorSpeed;
        else if (tile === TileType.CONVEYOR_LEFT) player.x -= conveyorSpeed;
        else if (tile === TileType.CONVEYOR_RIGHT) player.x += conveyorSpeed;
      }

      // --- CORNER ROUNDING (DESLIZAMENTO DE QUINA - <40% NUDGE) ---

      // Horizontal Movement
      if (player.vx !== 0) {
        const nextX = player.x + player.vx * dt;
        const canMoveX = this.canPlayerMoveTo(nextX, player.y, playerRadius, player);
        if (canMoveX) {
          player.x = nextX;
        } else {
          // If blocked by corner (< 40% of tile = 19px), apply automatic perpendicular nudge
          const corridorCenterY = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
          const diffY = corridorCenterY - player.y;
          if (Math.abs(diffY) > 0.5 && Math.abs(diffY) <= CORNER_ROUNDING_THRESHOLD) {
            const nudgeStepY = Math.sign(diffY) * Math.min(Math.abs(diffY), player.powerUps.speed * dt * 0.95);
            if (this.canPlayerMoveTo(player.x, player.y + nudgeStepY, playerRadius, player)) {
              player.y += nudgeStepY;
            }
          }
        }
      }

      // Vertical Movement
      if (player.vy !== 0) {
        const nextY = player.y + player.vy * dt;
        const canMoveY = this.canPlayerMoveTo(player.x, nextY, playerRadius, player);
        if (canMoveY) {
          player.y = nextY;
        } else {
          // If blocked by corner (< 40% of tile = 19px), apply automatic perpendicular nudge
          const corridorCenterX = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
          const diffX = corridorCenterX - player.x;
          if (Math.abs(diffX) > 0.5 && Math.abs(diffX) <= CORNER_ROUNDING_THRESHOLD) {
            const nudgeStepX = Math.sign(diffX) * Math.min(Math.abs(diffX), player.powerUps.speed * dt * 0.95);
            if (this.canPlayerMoveTo(player.x + nudgeStepX, player.y, playerRadius, player)) {
              player.x += nudgeStepX;
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

      // Bomb Kick interaction
      if (player.powerUps.canKick) {
        for (const bomb of this.bombs) {
          if (bomb.slidingVx === 0 && bomb.slidingVy === 0) {
            const bCenterX = bomb.gx * TILE_SIZE + TILE_SIZE / 2;
            const bCenterY = bomb.gy * TILE_SIZE + TILE_SIZE / 2;
            const dist = Math.hypot(player.x - bCenterX, player.y - bCenterY);
            if (dist < 26) {
              if (player.facing === 'left') bomb.slidingVx = -BOMB_SLIDE_SPEED;
              else if (player.facing === 'right') bomb.slidingVx = BOMB_SLIDE_SPEED;
              else if (player.facing === 'up') bomb.slidingVy = -BOMB_SLIDE_SPEED;
              else if (player.facing === 'down') bomb.slidingVy = BOMB_SLIDE_SPEED;
            }
          }
        }
      }
    }
  }

  private canPlayerMoveTo(x: number, y: number, radius: number, player: PlayerState): boolean {
    const leftGx = Math.floor((x - radius) / TILE_SIZE);
    const rightGx = Math.floor((x + radius) / TILE_SIZE);
    const topGy = Math.floor((y - radius) / TILE_SIZE);
    const bottomGy = Math.floor((y + radius) / TILE_SIZE);

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

        // Bomb collision: one-way passability for player who spawned it until they exit
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
