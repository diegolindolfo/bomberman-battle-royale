import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';
import { ArenaTheme, PlayerInput } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

// Socket.io Handlers
io.on('connection', (socket) => {
  // Send current room list on connect
  socket.emit('rooms_list', roomManager.getPublicRooms());

  socket.on('create_room', (data: { name: string; arena: ArenaTheme; maxPlayers: number; fillWithBots: boolean }) => {
    roomManager.createRoom(socket, data.name, data.arena, data.maxPlayers, data.fillWithBots);
  });

  socket.on('join_room', (data: { roomId: string; name: string }) => {
    roomManager.joinRoom(socket, data.roomId, data.name);
  });

  socket.on('start_game', () => {
    roomManager.startGame(socket);
  });

  socket.on('restart_game', (data?: { arena?: ArenaTheme }) => {
    roomManager.restartGame(socket, data?.arena);
  });

  socket.on('player_input', (input: PlayerInput) => {
    roomManager.handleInput(socket, input);
  });

  socket.on('disconnect', () => {
    roomManager.leaveRoom(socket);
  });
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: path.resolve(projectRoot, 'src/client')
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(projectRoot, 'dist/client')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(projectRoot, 'dist/client/index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`💣 Bomberman Battle Royale Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
