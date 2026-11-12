export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

export type ArenaTheme = 'ruins' | 'cryo' | 'foundry' | 'classic' | 'magma' | 'cyber';

export enum TileType {
  EMPTY = 0,
  HARD_WALL = 1,          // Indestructible pillar / border
  SOFT_BLOCK = 2,         // Standard breakable block (crate / ice brick / industrial container)
  VOLATILE_BLOCK = 3,     // Volatile explosive block
  CONVEYOR_UP = 4,        // Industrial conveyor lanes
  CONVEYOR_DOWN = 5,
  CONVEYOR_LEFT = 6,
  CONVEYOR_RIGHT = 7,
  ICE_FLOOR = 8,          // Cryogenic laboratory ice patch with inertia
  TELEPORT_A = 9,         // Quantum portal nodes
  TELEPORT_B = 10,
  SUDDEN_DEATH_BLOCK = 11 // Falling crushing block
}

export enum PowerUpType {
  BOMB_UP = 'bomb_up',       // +1 max bombs
  FIRE_UP = 'fire_up',       // +1 blast radius
  SPEED_UP = 'speed_up',     // +movement speed
  BOMB_KICK = 'bomb_kick',   // kick bombs to slide them
  SHIELD = 'shield',         // survives 1 blast
  SKULL = 'skull'            // temporary chaos effect
}

export interface PlayerPowerUps {
  bombLimit: number;
  fireRange: number;
  speed: number;
  canKick: boolean;
  hasShield: boolean;
  isCursed: boolean;
  curseTimer: number;
}

export interface PlayerInput {
  dx: number; // -1, 0, 1
  dy: number; // -1, 0, 1
  placeBomb: boolean;
}

export type BotPersonality = 'aggressive' | 'tactical';

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;          // world pixel coordinate
  y: number;
  vx: number;         // current velocity
  vy: number;
  desiredDx: number;  // normalized input axis X (-1, 0, 1)
  desiredDy: number;  // normalized input axis Y (-1, 0, 1)
  facing: Direction;
  isMoving: boolean;
  alive: boolean;
  isBot: boolean;
  botPersonality?: BotPersonality;
  kills: number;
  powerUps: PlayerPowerUps;
  activeBombs: number;
  invincibleTimer: number;
  bombInputBufferTimer: number; // Input buffering for bomb placement
}

export interface Bomb {
  id: string;
  ownerId: string;
  gx: number;         // grid coordinate X
  gy: number;         // grid coordinate Y
  x: number;          // world pixel X for smooth sliding
  y: number;          // world pixel Y for smooth sliding
  fuseTimer: number;  // seconds until blast
  fireRange: number;
  slidingVx: number;  // sliding speed when kicked
  slidingVy: number;
  isConveyorSliding?: boolean; // stops once off conveyor if not kicked
  overlapPlayers: string[]; // One-way passability: players inside can walk out
}

export interface ChainReactionEntry {
  bomb: Bomb;
  delayTimer: number; // 50ms cascade delay
}

export interface BlockBreakAnimation {
  gx: number;
  gy: number;
  timer: number;
  maxTime: number; // 150ms
}

export interface ExplosionCell {
  gx: number;
  gy: number;
  direction: 'center' | 'horizontal' | 'vertical' | 'end_up' | 'end_down' | 'end_left' | 'end_right';
}

export interface Explosion {
  id: string;
  ownerId?: string;
  cells: ExplosionCell[];
  duration: number; // seconds remaining
}

export interface PowerUpItem {
  id: string;
  gx: number;
  gy: number;
  type: PowerUpType;
}

export interface ArenaSettings {
  id: ArenaTheme;
  name: string;
  description: string;
  mechanic: string;
  backgroundColor: string;
}

export interface GameSettings {
  roundDurationSec: number;
  suddenDeathSec: number;
  maxPlayers: number;
  arena: ArenaTheme;
  fillWithBots: boolean;
}

export type GamePhase = 'waiting' | 'starting' | 'playing' | 'game_over';

export interface GameSnapshot {
  phase: GamePhase;
  timer: number;
  suddenDeathActive: boolean;
  arena: ArenaTheme;
  grid: number[][]; // grid[y][x] = TileType
  players: PlayerState[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUpItem[];
  breakingBlocks: BlockBreakAnimation[];
  winner: PlayerState | null;
  hitstopTimer: number; // frame freeze duration in seconds
}

export interface RoomSummary {
  id: string;
  name: string;
  arena: ArenaTheme;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}
