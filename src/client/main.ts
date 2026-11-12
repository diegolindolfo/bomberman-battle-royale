import { io, Socket } from 'socket.io-client';
import { ArenaTheme, GameSnapshot, PlayerState, RoomSummary } from '../shared/types.js';
import { Renderer } from './rendering/Renderer.js';
import { SoundFx } from './audio/SoundFx.js';
import { InputHandler } from './input/InputHandler.js';

class BombermanApp {
  private socket: Socket;
  private renderer: Renderer;
  private soundFx: SoundFx;
  private inputHandler: InputHandler;

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
    this.socket = io();
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
      soundBtn.textContent = this.soundFx.enabled ? '🔊 Som: Ligado' : '🔇 Som: Mudo';
    });

    // Arena Selection Cards
    const cards = document.querySelectorAll('.arena-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedArena = card.getAttribute('data-arena') as ArenaTheme;
      });
    });

    // Quick Play with Bots
    const quickPlayBtn = document.getElementById('btn-quick-play') as HTMLButtonElement;
    quickPlayBtn.addEventListener('click', () => {
      const name = (document.getElementById('input-name') as HTMLInputElement).value || 'Bomber';
      this.socket.emit('create_room', {
        name,
        arena: this.selectedArena,
        maxPlayers: 4,
        fillWithBots: true
      });
      // Immediately request start for quick play
      setTimeout(() => {
        this.socket.emit('start_game');
      }, 150);
    });

    // Create Multiplayer Room
    const createRoomBtn = document.getElementById('btn-create-room') as HTMLButtonElement;
    createRoomBtn.addEventListener('click', () => {
      const name = (document.getElementById('input-name') as HTMLInputElement).value || 'Bomber';
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
      const code = (document.getElementById('input-room-code') as HTMLInputElement).value.trim().toUpperCase();
      const name = (document.getElementById('input-name') as HTMLInputElement).value || 'Bomber';
      if (!code) return alert('Por favor, informe o código da sala.');
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
        copyBtn.textContent = '✅ Código Copiado!';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar Link da Sala'; }, 2000);
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
      this.socket.emit('restart_game', { arena: this.selectedArena });
    });

    const backLobbyBtn = document.getElementById('btn-back-lobby') as HTMLButtonElement;
    backLobbyBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  private bindSocket(): void {
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
      this.handleSnapshotAudio(snapshot);
      this.lastSnapshot = snapshot;
      this.updateHUD(snapshot);

      if (snapshot.phase === 'game_over') {
        this.showGameOverModal(snapshot);
      }
    });
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
      // Particle shockwave
      const newestExp = snapshot.explosions[snapshot.explosions.length - 1];
      const center = newestExp.cells[0];
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
    // Alive counter
    const alivePlayers = snapshot.players.filter(p => p.alive);
    const aliveEl = document.getElementById('hud-alive-count');
    if (aliveEl) aliveEl.textContent = `${alivePlayers.length} / ${snapshot.players.length}`;

    // Timer display
    const timerEl = document.getElementById('hud-timer');
    if (timerEl) {
      const minutes = Math.floor(snapshot.timer / 60).toString().padStart(2, '0');
      const seconds = (snapshot.timer % 60).toString().padStart(2, '0');
      timerEl.textContent = `${minutes}:${seconds}`;

      if (snapshot.suddenDeathActive) {
        timerEl.classList.add('sudden-death');
        timerEl.textContent = `💀 SUDDEN DEATH: ${seconds}s`;
      } else {
        timerEl.classList.remove('sudden-death');
      }
    }

    // Local player power-ups
    const me = snapshot.players.find(p => p.id === this.myPlayerId);
    if (me) {
      const bombsEl = document.getElementById('hud-bombs');
      const fireEl = document.getElementById('hud-fire');
      const speedEl = document.getElementById('hud-speed');
      const shieldEl = document.getElementById('hud-shield');
      const kickEl = document.getElementById('hud-kick');

      if (bombsEl) bombsEl.textContent = `💣 ${me.powerUps.bombLimit}`;
      if (fireEl) fireEl.textContent = `🔥 ${me.powerUps.fireRange}`;
      if (speedEl) speedEl.textContent = `👟 ${me.powerUps.speed}`;
      if (shieldEl) shieldEl.style.display = me.powerUps.hasShield ? 'inline' : 'none';
      if (kickEl) kickEl.style.display = me.powerUps.canKick ? 'inline' : 'none';
    }

    // Room screen player list update if in room
    if (snapshot.phase === 'waiting') {
      const pList = document.getElementById('room-players-list');
      const countEl = document.getElementById('room-player-count');
      if (countEl) countEl.textContent = `${snapshot.players.length}/4`;

      if (pList) {
        pList.innerHTML = '';
        snapshot.players.forEach(p => {
          const item = document.createElement('div');
          item.style.background = 'rgba(255,255,255,0.08)';
          item.style.padding = '8px 16px';
          item.style.borderRadius = '9999px';
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '8px';
          item.style.border = `2px solid ${p.color}`;
          item.innerHTML = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${p.color};"></span>
                           <span style="font-weight:bold;">${p.name}</span>
                           ${p.isBot ? '<span style="font-size:0.75rem; background:#475569; padding:2px 6px; border-radius:4px;">BOT</span>' : ''}`;
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
    const iconEl = document.getElementById('modal-icon');

    const winner = snapshot.winner;
    const isMeWinner = winner && winner.id === this.myPlayerId;

    if (isMeWinner) {
      this.soundFx.playVictory();
      if (iconEl) iconEl.textContent = '👑';
      if (titleEl) titleEl.textContent = 'VITÓRIA ROYALE!';
      if (winnerEl) winnerEl.textContent = `Você é o último sobrevivente!`;
    } else if (winner) {
      if (iconEl) iconEl.textContent = '🏆';
      if (titleEl) titleEl.textContent = 'PARTIDA FINALIZADA';
      if (winnerEl) winnerEl.textContent = `Vencedor: ${winner.name}!`;
    } else {
      if (iconEl) iconEl.textContent = '💥';
      if (titleEl) titleEl.textContent = 'EMPATE TOTAL';
      if (winnerEl) winnerEl.textContent = `Nenhum sobrevivente restou!`;
    }
  }

  private updateRoomsListUI(rooms: RoomSummary[]): void {
    const container = document.getElementById('rooms-list-container');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = `<div style="color: #64748b; font-size: 0.9rem; font-style: italic;">Nenhuma outra sala criada no momento. Seja o primeiro!</div>`;
      return;
    }

    container.innerHTML = '';
    rooms.forEach(r => {
      const div = document.createElement('div');
      div.className = 'room-item';
      div.innerHTML = `
        <div>
          <div style="font-weight: bold; color: #f8fafc;">${r.name} (${r.id})</div>
          <div style="font-size: 0.8rem; color: #94a3b8;">Arena: ${r.arena.toUpperCase()} | Jogadores: ${r.playerCount}/${r.maxPlayers}</div>
        </div>
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" data-join="${r.id}">
          Entrar
        </button>
      `;

      div.querySelector('button')?.addEventListener('click', () => {
        const name = (document.getElementById('input-name') as HTMLInputElement).value || 'Bomber';
        this.socket.emit('join_room', { roomId: r.id, name });
      });

      container.appendChild(div);
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

      // Send Input to server if playing
      if (this.lastSnapshot?.phase === 'playing') {
        const input = this.inputHandler.getInput();
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
