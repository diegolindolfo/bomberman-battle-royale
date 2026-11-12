import { Server, Socket } from 'socket.io';
import { GameState } from './GameState.js';
import { BotAI } from './BotAI.js';
import { ArenaTheme, PlayerInput, RoomSummary } from '../shared/types.js';
import { TICK_DELTA, TICK_RATE } from '../shared/constants.js';

export interface Room {
  id: string;
  name: string;
  hostSocketId: string;
  arena: ArenaTheme;
  maxPlayers: number;
  fillWithBots: boolean;
  state: GameState;
  bots: Map<string, BotAI>;
  socketToPlayer: Map<string, string>; // socketId -> playerId
  intervalId: NodeJS.Timeout | null;
}

export class RoomManager {
  private io: Server;
  private rooms: Map<string, Room> = new Map();
  private socketRoomMap: Map<string, string> = new Map(); // socketId -> roomId

  constructor(io: Server) {
    this.io = io;
  }

  public getPublicRooms(): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      list.push({
        id: room.id,
        name: room.name,
        arena: room.arena,
        playerCount: room.state.players.size,
        maxPlayers: room.maxPlayers,
        phase: room.state.phase
      });
    }
    return list;
  }

  public createRoom(
    socket: Socket,
    playerName: string,
    arena: ArenaTheme = 'classic',
    maxPlayers: number = 4,
    fillWithBots: boolean = true
  ): Room {
    this.leaveRoom(socket);

    const roomId = 'BOMB-' + Math.floor(1000 + Math.random() * 9000);
    const state = new GameState(arena);
    const player = state.addPlayer(socket.id, playerName || 'Player 1', false);

    const room: Room = {
      id: roomId,
      name: `Sala de ${playerName || 'Jogador'}`,
      hostSocketId: socket.id,
      arena,
      maxPlayers,
      fillWithBots,
      state,
      bots: new Map(),
      socketToPlayer: new Map([[socket.id, player.id]]),
      intervalId: null
    };

    this.rooms.set(roomId, room);
    this.socketRoomMap.set(socket.id, roomId);
    socket.join(roomId);

    this.startRoomLoop(room);

    socket.emit('room_joined', {
      roomId,
      playerId: player.id,
      isHost: true,
      arena
    });

    this.broadcastRoomsList();
    return room;
  }

  public joinRoom(socket: Socket, roomId: string, playerName: string): boolean {
    this.leaveRoom(socket);

    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit('error_message', 'Sala não encontrada.');
      return false;
    }

    if (room.state.phase === 'playing') {
      socket.emit('error_message', 'Partida já está em andamento nesta sala.');
      return false;
    }

    if (room.state.players.size >= room.maxPlayers) {
      socket.emit('error_message', 'Sala cheia.');
      return false;
    }

    const player = room.state.addPlayer(socket.id, playerName || `Player ${room.state.players.size + 1}`, false);
    room.socketToPlayer.set(socket.id, player.id);
    this.socketRoomMap.set(socket.id, roomId);
    socket.join(roomId);

    socket.emit('room_joined', {
      roomId,
      playerId: player.id,
      isHost: room.hostSocketId === socket.id,
      arena: room.arena
    });

    this.broadcastRoomsList();
    return true;
  }

  public leaveRoom(socket: Socket): void {
    const roomId = this.socketRoomMap.get(socket.id);
    if (!roomId) return;

    this.socketRoomMap.delete(socket.id);
    socket.leave(roomId);

    const room = this.rooms.get(roomId);
    if (!room) return;

    const playerId = room.socketToPlayer.get(socket.id);
    if (playerId) {
      room.state.removePlayer(playerId);
      room.socketToPlayer.delete(socket.id);
    }

    // If host left, assign new host or destroy room if empty of humans
    if (room.hostSocketId === socket.id) {
      const remainingSocketId = Array.from(room.socketToPlayer.keys())[0];
      if (remainingSocketId) {
        room.hostSocketId = remainingSocketId;
        this.io.to(remainingSocketId).emit('host_promoted');
      } else {
        this.destroyRoom(roomId);
        this.broadcastRoomsList();
        return;
      }
    }

    this.broadcastRoomsList();
  }

  public startGame(socket: Socket): void {
    const roomId = this.socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;

    // Fill with bots if enabled and under max players
    if (room.fillWithBots) {
      const botsNeeded = Math.max(0, room.maxPlayers - room.state.players.size);
      for (let i = 0; i < botsNeeded; i++) {
        const botId = `bot_${Date.now()}_${i + 1}`;
        const botNames = ['MechaBomber', 'CyberBot', 'DynamiteAI', 'BlastDroid', 'NitroX', 'Sparky', 'GigaBomb'];
        const name = botNames[i % botNames.length];
        room.state.addPlayer(botId, name, true);
        room.bots.set(botId, new BotAI(botId));
      }
    }

    room.state.startGame();
    this.io.to(roomId).emit('game_started');
    this.broadcastRoomsList();
  }

  public restartGame(socket: Socket, arena?: ArenaTheme): void {
    const roomId = this.socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.hostSocketId !== socket.id) return;

    if (arena) {
      room.arena = arena;
      room.state.arena = arena;
    }

    room.state.initGrid();
    room.state.startGame();
    this.io.to(roomId).emit('game_started');
    this.broadcastRoomsList();
  }

  public handleInput(socket: Socket, input: PlayerInput): void {
    const roomId = this.socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const playerId = room.socketToPlayer.get(socket.id);
    if (!playerId) return;

    room.state.handleInput(playerId, input);
  }

  private startRoomLoop(room: Room): void {
    if (room.intervalId) clearInterval(room.intervalId);

    room.intervalId = setInterval(() => {
      // 1. Process Bots
      if (room.state.phase === 'playing') {
        for (const [botId, ai] of room.bots.entries()) {
          const botInput = ai.computeInput(room.state, TICK_DELTA);
          room.state.handleInput(botId, botInput);
        }
      }

      // 2. Step Game State
      room.state.update(TICK_DELTA);

      // 3. Broadcast Snapshot to players in room
      const snapshot = room.state.getSnapshot();
      this.io.to(room.id).emit('game_state', snapshot);
    }, 1000 / TICK_RATE);
  }

  private destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.intervalId) clearInterval(room.intervalId);
    this.rooms.delete(roomId);
  }

  public broadcastRoomsList(): void {
    const rooms = this.getPublicRooms();
    this.io.emit('rooms_list', rooms);
  }
}
