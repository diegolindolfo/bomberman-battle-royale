import { ArenaTheme, ArenaSettings } from './types.js';

export const GRID_COLS = 15;
export const GRID_ROWS = 13;
export const TILE_SIZE = 48; // pixels per tile
export const MAP_WIDTH = GRID_COLS * TILE_SIZE;  // 720 px
export const MAP_HEIGHT = GRID_ROWS * TILE_SIZE; // 624 px

export const TICK_RATE = 30; // 30 ticks per second on server
export const TICK_DELTA = 1 / TICK_RATE;

export const BOMB_FUSE_TIME = 2.8; // seconds
export const EXPLOSION_DURATION = 0.55; // seconds
export const BOMB_SLIDE_SPEED = 320; // pixels per second when kicked
export const INVINCIBLE_TIME_ON_START = 2.0;

export const BASE_PLAYER_SPEED = 160; // pixels per second
export const SPEED_UP_BOOST = 25;
export const MAX_PLAYER_SPEED = 280;

export const BASE_BOMB_LIMIT = 1;
export const MAX_BOMB_LIMIT = 8;

export const BASE_FIRE_RANGE = 2;
export const MAX_FIRE_RANGE = 9;

export const ROUND_TIME_TOTAL = 150; // 2.5 minutes
export const SUDDEN_DEATH_START_TIME = 60; // Sudden death begins at 60s remaining
export const SUDDEN_DEATH_DROP_INTERVAL = 0.85; // new block drops every 0.85s

export const PLAYER_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f97316'  // Orange
];

export const ARENAS: Record<ArenaTheme, ArenaSettings> = {
  classic: {
    id: 'classic',
    name: 'Green Meadow',
    description: 'Arena clássica de grama com pilares de pedra e caixas de madeira.',
    backgroundColor: '#2e7d32',
    floorPattern: '#388e3c',
    specialHazards: 'Padrão clássico com alta densidade de itens'
  },
  magma: {
    id: 'magma',
    name: 'Magma Cavern',
    description: 'Rochas vulcânicas ardentes com blocos voláteis que explodem em cadeia!',
    backgroundColor: '#26110f',
    floorPattern: '#3e1b17',
    specialHazards: 'Blocos de dinamite voláteis que explodem em 360° ao contato do fogo'
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Grid',
    description: 'Instalação neon com esteiras rolantes direcionais e portais quânticos.',
    backgroundColor: '#0a0d1a',
    floorPattern: '#12182d',
    specialHazards: 'Esteiras rolantes que aceleram bombas e portais de teletransporte'
  }
};
