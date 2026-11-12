import { ArenaTheme, ArenaSettings } from './types.js';

export const GRID_COLS = 15;
export const GRID_ROWS = 13;
export const TILE_SIZE = 48; // pixels per tile
export const MAP_WIDTH = GRID_COLS * TILE_SIZE;  // 720 px
export const MAP_HEIGHT = GRID_ROWS * TILE_SIZE; // 624 px

export const TICK_RATE = 30; // 30 ticks per second on server
export const TICK_DELTA = 1 / TICK_RATE;

export const BOMB_FUSE_TIME = 2.8; // seconds
export const TELEGRAPH_PULSE_THRESHOLD = 0.8; // seconds remaining when bomb pulses rapidly
export const CHAIN_REACTION_DELAY = 0.05; // 50ms cascade delay between chained bombs
export const HITSTOP_DURATION = 0.035; // 35ms frame freeze on player/bot elimination
export const BLOCK_BREAK_DURATION = 0.15; // 150ms destructible block crumble animation
export const INPUT_BUFFER_WINDOW = 0.16; // 160ms input buffer for bomb placement

export const EXPLOSION_DURATION = 0.55; // seconds
export const BOMB_SLIDE_SPEED = 340; // pixels per second when kicked
export const INVINCIBLE_TIME_ON_START = 2.0;

export const BASE_PLAYER_SPEED = 165; // pixels per second
export const SPEED_UP_BOOST = 25;
export const MAX_PLAYER_SPEED = 280;

// Grid navigation & physics
export const PLAYER_HITBOX_RADIUS = 13; // 26px box in 48px corridor = 11px clearance on each side
export const CORNER_ROUNDING_THRESHOLD = 19; // 40% of 48px tile (19.2px)
export const CRYO_ICE_FRICTION = 0.88; // low friction for cryogenic lab inertia
export const NORMAL_FRICTION = 0.0;    // instant response on standard terrain

export const BASE_BOMB_LIMIT = 1;
export const MAX_BOMB_LIMIT = 8;

export const BASE_FIRE_RANGE = 2;
export const MAX_FIRE_RANGE = 9;

export const ROUND_TIME_TOTAL = 60; // 1 minute fast-paced match
export const SUDDEN_DEATH_START_TIME = 20; // Sudden death begins at 20s remaining
export const SUDDEN_DEATH_DROP_INTERVAL = 0.85; // new block drops every 0.85s

export interface CharacterSkin {
  id: string;
  name: string;
  hex: string;
  description: string;
}

export const CHARACTER_SKINS: CharacterSkin[] = [
  { id: 'blue', name: 'Cobalto', hex: '#3b82f6', description: 'Blindagem azul tática' },
  { id: 'red', name: 'Carmesim', hex: '#ef4444', description: 'Blindagem vermelha de assalto' },
  { id: 'green', name: 'Esmeralda', hex: '#10b981', description: 'Blindagem verde de suporte' },
  { id: 'yellow', name: 'Dourado', hex: '#f59e0b', description: 'Blindagem dourada cinética' },
  { id: 'purple', name: 'Ametista', hex: '#8b5cf6', description: 'Blindagem púrpura de pulso' },
  { id: 'cyan', name: 'Ciano', hex: '#06b6d4', description: 'Blindagem criogênica avançada' }
];

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

export const ARENAS: Record<string, ArenaSettings> = {
  ruins: {
    id: 'ruins',
    name: 'Ruínas da Arena',
    description: 'Ambiente clássico equilibrado com ritmo focado em controle espacial e destruição metódica.',
    mechanic: 'Densidade média de blocos (65%) e alta previsibilidade tática.',
    backgroundColor: '#0c0d10'
  },
  cryo: {
    id: 'cryo',
    name: 'Laboratório Criogênico',
    description: 'Instalação sub-zero com placas de gelo térmico e física de baixa inércia.',
    mechanic: 'Piso com derrapagem controlada e bombas chutadas com deslizamento estendido.',
    backgroundColor: '#080d14'
  },
  foundry: {
    id: 'foundry',
    name: 'Fundição Industrial',
    description: 'Complexo siderúrgico com esteiras mecânicas ativas e barreiras metálicas.',
    mechanic: 'Esteiras de transporte rápido que deslocam operadores e bombas armadas.',
    backgroundColor: '#140c0a'
  },
  // Aliases for backwards compatibility
  classic: {
    id: 'classic',
    name: 'Ruínas da Arena',
    description: 'Ambiente clássico equilibrado.',
    mechanic: 'Padrão clássico equilibrado',
    backgroundColor: '#0c0d10'
  },
  magma: {
    id: 'magma',
    name: 'Fundição Industrial',
    description: 'Complexo com perigos industriais.',
    mechanic: 'Blocos voláteis e perigos térmicos',
    backgroundColor: '#140c0a'
  },
  cyber: {
    id: 'cyber',
    name: 'Laboratório Criogênico',
    description: 'Ambiente criogênico de alta velocidade.',
    mechanic: 'Física criogênica e esteiras',
    backgroundColor: '#080d14'
  }
};
