export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

export type ArenaTheme = 'classic' | 'magma' | 'cyber';

export enum TileType {
  EMPTY = 0,
  HARD_WALL = 1,       // Indestructible pillar / border
  SOFT_BLOCK = 2,      // Standard breakable block
  VOLATILE_BLOCK = 3,  // Explodes instantly in 360 when triggered (Magma arena)
  CONVEYOR_UP = 4,     // Cyber arena
  CONVEYOR_DOWN = 5,
  CONVEYOR_LEFT = 6,
  CONVEYOR_RIGHT = 7,
  TELEPORT_A = 8,      // Cyber arena warp pad
  TELEPORT_B = 9,
  SUDDEN_DEATH_BLOCK = 10 // Falling crushing block
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

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;          // world pixel coordinate
  y: number;
  vx: number;
  vy: number;
  facing: Direction;
  isMoving: boolean;
  alive: boolean;
  isBot: boolean;
  kills: number;
  powerUps: PlayerPowerUps;
  activeBombs: number;
  invincibleTimer: number;
}

export interface Bomb {
  id: string;
  ownerId: string;
  gx: number;         // grid coordinate X
  gy: number;         // grid coordinate Y
  fuseTimer: number;  // seconds until blast
  fireRange: number;
  slidingVx: number;  // sliding speed when kicked
  slidingVy: number;
  overlapPlayers?: string[]; // players currently inside who can step out
}

export interface ExplosionCell {
  gx: number;
  gy: number;
  direction: 'center' | 'horizontal' | 'vertical' | 'end_up' | 'end_down' | 'end_left' | 'end_right';
}

export interface Explosion {
  id: string;
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
  backgroundColor: string;
  floorPattern: string;
  specialHazards: string;
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
  winner: PlayerState | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  arena: ArenaTheme;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
}
