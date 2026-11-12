import { io, Socket } from 'socket.io-client';
import { ArenaTheme, GameSnapshot, PlayerInput, RoomSummary } from '../shared/types.js';
import { Renderer } from './rendering/Renderer.js';
import { SoundFx } from './audio/SoundFx.js';
import { InputHandler } from './input/InputHandler.js';
import { GameState } from '../server/GameState.js';
import { BotAI } from '../server/BotAI.js';

class BombermanApp {
  private socket: Socket;
  private renderer: Renderer;
  private soundFx: SoundFx;
  private inputHandler: InputHandler;

  private isConnectedToServer: boolean = false;
  private isLocalMode: boolean = false;
  private localState: GameState | null = null;
  private localBots: Map<string, BotAI> = new Map();

  private currentRoomId: string | null = null;
  private myPlayerId: string | null = null;
  private isHost: boolean = false;
  private selectedArena: ArenaTheme = 'classic';

  private lastSnapshot: GameSnapshot | null = null;
  private prevBombCount: number = 0;
  private prevExplosionCount: number = 0;
  private prevSuddenDeath: boolean = false;
  private prevMyAlive: boolean = true;

  constructor() {
    this.socket = io({
      timeout: 3000,
      reconnectionAttempts: 3
    });

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.soundFx = new SoundFx();
    this.inputHandler = new InputHandler();

    this.bindDOM();
    this.bindSocket();
    this.startRenderLoop();
  }

  private bindDOM(): void {
    // Sound toggle
    const soundBtn = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
    soundBtn.addEventListener('click', () => {
      this.soundFx.enabled = !this.soundFx.enabled;
      soundBtn.textContent = this.soundFx.enabled ? 'Áudio: Ativo' : 'Áudio: Desativado';
    });

    // Arena Selection Rows
    const rows = document.querySelectorAll('.arena-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        rows.forEach(r => {
          r.classList.remove('selected');
          const st = r.querySelector('.arena-status');
          if (st) st.textContent = 'Disponível';
        });
        row.classList.add('selected');
        const st = row.querySelector('.arena-status');
        if (st) st.textContent = 'Selecionada';
        this.selectedArena = row.getAttribute('data-arena') as ArenaTheme;
      });
    });

    // Quick Play with Bots
    const quickPlayBtn = document.getElementById('btn-quick-play') as HTMLButtonElement;
    quickPlayBtn.addEventListener('click', () => {
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Bomber';

      if (this.isConnectedToServer) {
        this.isLocalMode = false;
        this.socket.emit('create_room', {
          name,
          arena: this.selectedArena,
          maxPlayers: 4,
          fillWithBots: true
        });
        setTimeout(() => {
          this.socket.emit('start_game');
        }, 150);
      } else {
        // Run locally in browser (works 100% on Vercel without a WebSocket server)
        this.startLocalGame(name, this.selectedArena);
      }
    });

    // Create Multiplayer Room
    const createRoomBtn = document.getElementById('btn-create-room') as HTMLButtonElement;
    createRoomBtn.addEventListener('click', () => {
      if (!this.isConnectedToServer) {
        alert('Servidor multiplayer em tempo real não detectado nesta hospedagem. Iniciando modo com bots locais...');
        const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Bomber';
        this.startLocalGame(name, this.selectedArena);
        return;
      }

      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Bomber';
      this.isLocalMode = false;
      this.socket.emit('create_room', {
        name,
        arena: this.selectedArena,
        maxPlayers: 4,
        fillWithBots: true
      });
    });

    // Join Room by Code
    const joinRoomBtn = document.getElementById('btn-join-room') as HTMLButtonElement;
    joinRoomBtn.addEventListener('click', () => {
      if (!this.isConnectedToServer) {
        return alert('Multiplayer online requer conexão com servidor ativo.');
      }
      const code = (document.getElementById('input-room-code') as HTMLInputElement).value.trim().toUpperCase();
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Bomber';
      if (!code) return alert('Por favor, informe o código da sala.');
      this.isLocalMode = false;
      this.socket.emit('join_room', { roomId: code, name });
    });

    // Start Game from Room
    const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
    startBtn.addEventListener('click', () => {
      this.socket.emit('start_game');
    });

    // Copy Room Link
    const copyBtn = document.getElementById('btn-copy-link') as HTMLButtonElement;
    copyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        navigator.clipboard.writeText(this.currentRoomId);
        copyBtn.textContent = 'Código copiado';
        setTimeout(() => { copyBtn.textContent = 'Copiar identificador'; }, 2000);
      }
    });

    // Leave Room
    const leaveBtn = document.getElementById('btn-leave-room') as HTMLButtonElement;
    leaveBtn.addEventListener('click', () => {
      window.location.reload();
    });

    // Modal buttons
    const playAgainBtn = document.getElementById('btn-play-again') as HTMLButtonElement;
    playAgainBtn.addEventListener('click', () => {
      document.getElementById('modal-gameover')?.classList.remove('active');
      if (this.isLocalMode) {
        const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Bomber';
        this.startLocalGame(name, this.selectedArena);
      } else {
        this.socket.emit('restart_game', { arena: this.selectedArena });
      }
    });

    const backLobbyBtn = document.getElementById('btn-back-lobby') as HTMLButtonElement;
    backLobbyBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  private startLocalGame(playerName: string, arena: ArenaTheme): void {
    this.isLocalMode = true;
    this.localState = new GameState(arena);
    this.localBots.clear();

    const me = this.localState.addPlayer('player_local', playerName, false);
    this.myPlayerId = me.id;

    // Add 3 Intelligent AI Bots
    const botNames = ['MechaBomber', 'CyberBot', 'DynamiteAI'];
    for (let i = 0; i < 3; i++) {
      const botId = `bot_local_${i + 1}`;
      this.localState.addPlayer(botId, botNames[i], true);
      this.localBots.set(botId, new BotAI(botId));
    }

    this.localState.startGame();
    this.showScreen('screen-game');
    document.getElementById('modal-gameover')?.classList.remove('active');
  }

  private bindSocket(): void {
    this.socket.on('connect', () => {
      this.isConnectedToServer = true;
    });

    this.socket.on('disconnect', () => {
      this.isConnectedToServer = false;
    });

    this.socket.on('connect_error', () => {
      this.isConnectedToServer = false;
    });

    this.socket.on('rooms_list', (rooms: RoomSummary[]) => {
      this.updateRoomsListUI(rooms);
    });

    this.socket.on('room_joined', (data: { roomId: string; playerId: string; isHost: boolean; arena: ArenaTheme }) => {
      this.currentRoomId = data.roomId;
      this.myPlayerId = data.playerId;
      this.isHost = data.isHost;
      this.selectedArena = data.arena;

      (document.getElementById('room-code-display') as HTMLElement).textContent = data.roomId;
      this.showScreen('screen-room');

      const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
      startBtn.style.display = this.isHost ? 'inline-flex' : 'none';
    });

    this.socket.on('host_promoted', () => {
      this.isHost = true;
      const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
      startBtn.style.display = 'inline-flex';
    });

    this.socket.on('game_started', () => {
      this.showScreen('screen-game');
      document.getElementById('modal-gameover')?.classList.remove('active');
    });

    this.socket.on('error_message', (msg: string) => {
      alert(msg);
    });

    this.socket.on('game_state', (snapshot: GameSnapshot) => {
      if (!this.isLocalMode) {
        this.processSnapshot(snapshot);
      }
    });
  }

  private processSnapshot(snapshot: GameSnapshot): void {
    this.handleSnapshotAudio(snapshot);
    this.lastSnapshot = snapshot;
    this.updateHUD(snapshot);

    if (snapshot.phase === 'game_over') {
      this.showGameOverModal(snapshot);
    }
  }

  private handleSnapshotAudio(snapshot: GameSnapshot): void {
    // Bomb dropped
    if (snapshot.bombs.length > this.prevBombCount) {
      this.soundFx.playBombDrop();
    }
    this.prevBombCount = snapshot.bombs.length;

    // Explosions detonated
    if (snapshot.explosions.length > this.prevExplosionCount) {
      this.soundFx.playExplosion();
      const newestExp = snapshot.explosions[snapshot.explosions.length - 1];
      const center = newestExp?.cells[0];
      if (center) {
        this.renderer.particles.emitExplosion(
          center.gx * 48 + 24,
          center.gy * 48 + 24,
          snapshot.arena === 'magma' ? 'volatile' : 'fire'
        );
      }
    }
    this.prevExplosionCount = snapshot.explosions.length;

    // Sudden death warning
    if (snapshot.suddenDeathActive && !this.prevSuddenDeath) {
      this.soundFx.playSuddenDeathAlert();
    }
    this.prevSuddenDeath = snapshot.suddenDeathActive;

    // Player death check
    const myPlayer = snapshot.players.find(p => p.id === this.myPlayerId);
    if (myPlayer) {
      if (!myPlayer.alive && this.prevMyAlive) {
        this.soundFx.playPlayerDeath();
      }
      this.prevMyAlive = myPlayer.alive;
    }
  }

  private updateHUD(snapshot: GameSnapshot): void {
    const alivePlayers = snapshot.players.filter(p => p.alive);
    const aliveEl = document.getElementById('hud-alive-count');
    if (aliveEl) aliveEl.textContent = `${alivePlayers.length} / ${snapshot.players.length}`;

    const timerEl = document.getElementById('hud-timer');
    if (timerEl) {
      const minutes = Math.floor(snapshot.timer / 60).toString().padStart(2, '0');
      const seconds = (snapshot.timer % 60).toString().padStart(2, '0');

      if (snapshot.suddenDeathActive) {
        timerEl.classList.add('sudden-death');
        timerEl.textContent = `COLAPSO ATIVO: ${seconds}s`;
      } else {
        timerEl.classList.remove('sudden-death');
        timerEl.textContent = `${minutes}:${seconds}`;
      }
    }

    const me = snapshot.players.find(p => p.id === this.myPlayerId);
    if (me) {
      const bombsEl = document.getElementById('hud-bombs');
      const fireEl = document.getElementById('hud-fire');
      const speedEl = document.getElementById('hud-speed');
      const shieldEl = document.getElementById('hud-shield');
      const kickEl = document.getElementById('hud-kick');

      if (bombsEl) bombsEl.textContent = `BOMBAS: ${me.powerUps.bombLimit}`;
      if (fireEl) fireEl.textContent = `RAIO: ${me.powerUps.fireRange}`;
      if (speedEl) speedEl.textContent = `VEL: ${me.powerUps.speed}`;
      if (shieldEl) shieldEl.style.display = me.powerUps.hasShield ? 'inline' : 'none';
      if (kickEl) kickEl.style.display = me.powerUps.canKick ? 'inline' : 'none';
    }

    if (snapshot.phase === 'waiting') {
      const pList = document.getElementById('room-players-list');
      const countEl = document.getElementById('room-player-count');
      if (countEl) countEl.textContent = `${snapshot.players.length}/4`;

      if (pList) {
        pList.innerHTML = '';
        snapshot.players.forEach(p => {
          const item = document.createElement('div');
          item.style.background = '#121214';
          item.style.padding = '6px 12px';
          item.style.borderRadius = '6px';
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '8px';
          item.style.border = `1px solid ${p.color}`;
          item.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${p.color};"></span>
                           <span style="font-weight:500; font-family:'JetBrains Mono', monospace; font-size:0.85rem;">${p.name}</span>
                           ${p.isBot ? '<span style="font-size:0.7rem; color:#8E8E93; border:1px solid #242428; padding:1px 4px; border-radius:4px; font-family:\'JetBrains Mono\', monospace;">BOT</span>' : ''}`;
          pList.appendChild(item);
        });
      }
    }
  }

  private showGameOverModal(snapshot: GameSnapshot): void {
    const modal = document.getElementById('modal-gameover');
    if (!modal || modal.classList.contains('active')) return;

    modal.classList.add('active');
    const titleEl = document.getElementById('modal-title');
    const winnerEl = document.getElementById('modal-winner');

    const winner = snapshot.winner;
    const isMeWinner = winner && winner.id === this.myPlayerId;

    if (isMeWinner) {
      this.soundFx.playVictory();
      if (titleEl) titleEl.textContent = 'Partida Encerrada';
      if (winnerEl) winnerEl.textContent = 'Resultado: Você venceu como único sobrevivente.';
    } else if (winner) {
      if (titleEl) titleEl.textContent = 'Partida Encerrada';
      if (winnerEl) winnerEl.textContent = `Resultado: Vitória de ${winner.name}.`;
    } else {
      if (titleEl) titleEl.textContent = 'Partida Encerrada';
      if (winnerEl) winnerEl.textContent = 'Resultado: Empate técnico sem sobreviventes.';
    }
  }

  private updateRoomsListUI(rooms: RoomSummary[]): void {
    const container = document.getElementById('rooms-list-container');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="color: var(--text-muted); font-style: italic; padding: 14px 12px;">Nenhuma sessão pública ativa na rede no momento.</td></tr>`;
      return;
    }

    container.innerHTML = '';
    rooms.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-main);">${r.id}</td>
        <td style="font-family: 'JetBrains Mono', monospace; color: var(--text-muted); font-size: 0.78rem;">${r.arena.toUpperCase()}</td>
        <td style="font-family: 'JetBrains Mono', monospace;">${r.playerCount} / ${r.maxPlayers}</td>
        <td><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color: var(--accent); margin-right:6px;"></span>Aberta</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" data-join="${r.id}">
            Conectar
          </button>
        </td>
      `;

      tr.querySelector('button')?.addEventListener('click', () => {
        const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';
        this.socket.emit('join_room', { roomId: r.id, name });
      });

      container.appendChild(tr);
    });
  }

  private showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
  }

  private startRenderLoop(): void {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const input = this.inputHandler.getInput();

      // If playing locally in browser (Vercel / Offline mode)
      if (this.isLocalMode && this.localState && this.localState.phase === 'playing') {
        // Step bots
        for (const [botId, ai] of this.localBots.entries()) {
          const botInput = ai.computeInput(this.localState, dt);
          this.localState.handleInput(botId, botInput);
        }

        // Apply local player input
        this.localState.handleInput(this.myPlayerId || 'player_local', input);

        // Update local physics & explosions
        this.localState.update(dt);

        const snapshot = this.localState.getSnapshot();
        this.processSnapshot(snapshot);
      } else if (!this.isLocalMode && this.lastSnapshot?.phase === 'playing') {
        // Send input to online server
        this.socket.emit('player_input', input);
      }

      this.renderer.render(this.lastSnapshot, this.myPlayerId, dt);
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Start application when DOM loads
window.addEventListener('DOMContentLoaded', () => {
  new BombermanApp();
});
