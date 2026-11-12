import { io, Socket } from 'socket.io-client';
import { ArenaTheme, GameSnapshot, PlayerPowerUps, RoomSummary } from '../shared/types.js';
import { Renderer } from './rendering/Renderer.js';
import { SoundFx } from './audio/SoundFx.js';
import { InputHandler } from './input/InputHandler.js';
import { GameState } from '../server/GameState.js';
import { BotAI } from '../server/BotAI.js';
import { TILE_SIZE } from '../shared/constants.js';

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
  private selectedArena: ArenaTheme = 'ruins';

  private lastSnapshot: GameSnapshot | null = null;

  // Per-match event trackers (reset every round so audio/particles never drift)
  private seenBombIds: Set<string> = new Set();
  private seenExplosionIds: Set<string> = new Set();
  private seenBreakingCoords: Set<string> = new Set();
  private prevSuddenDeath: boolean = false;
  private prevMyAlive: boolean = true;
  private prevPowerUps: PlayerPowerUps | null = null;
  private isTouchDevice: boolean = false;
  private hadNativeFullscreen: boolean = false;

  constructor() {
    this.socket = io({
      timeout: 3000,
      reconnectionAttempts: 2
    });

    this.isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (this.isTouchDevice) {
      document.body.classList.add('has-touch');
    }

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.soundFx = new SoundFx();
    this.inputHandler = new InputHandler(() => this.handleRestartShortcut());

    this.bindDOM();
    this.bindSocket();
    this.updateConnectionIndicator(false);
    this.startRenderLoop();
  }

  private isFullscreenActive(): boolean {
    return Boolean(document.fullscreenElement) || document.body.classList.contains('is-fullscreen');
  }

  private updateFullscreenButton(active: boolean): void {
    const btn = document.getElementById('btn-fullscreen');
    const label = document.getElementById('fullscreen-label');
    const iconEnter = document.getElementById('fullscreen-icon-enter');
    const iconExit = document.getElementById('fullscreen-icon-exit');
    btn?.classList.toggle('active', active);
    if (label) label.textContent = active ? 'Sair' : 'Tela Cheia';
    if (iconEnter) iconEnter.style.display = active ? 'none' : 'block';
    if (iconExit) iconExit.style.display = active ? 'block' : 'none';
  }

  private enterFullscreen(): void {
    document.body.classList.add('is-fullscreen');
    this.updateFullscreenButton(true);
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        try {
          docEl.webkitRequestFullscreen();
        } catch {
          // CSS .is-fullscreen fallback remains active cleanly
        }
      }
    }
  }

  private exitFullscreen(): void {
    this.hadNativeFullscreen = false;
    document.body.classList.remove('is-fullscreen');
    this.updateFullscreenButton(false);
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (document.fullscreenElement) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        try {
          doc.webkitExitFullscreen();
        } catch {}
      }
    }
  }

  private toggleFullscreen(): void {
    if (this.isFullscreenActive()) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  private syncSoundUI(): void {
    const soundBtn = document.getElementById('btn-sound-toggle');
    const hudSoundBtn = document.getElementById('btn-hud-sound');
    const hudSoundLabel = document.getElementById('hud-sound-label');
    if (soundBtn) {
      soundBtn.textContent = this.soundFx.enabled ? 'Áudio: Ativo' : 'Áudio: Desativado';
    }
    if (hudSoundLabel) {
      hudSoundLabel.textContent = this.soundFx.enabled ? 'Som' : 'Mudo';
    }
    hudSoundBtn?.classList.toggle('active', this.soundFx.enabled);
  }

  private returnToLobby(): void {
    this.exitFullscreen();
    if (this.isLocalMode) {
      this.localState = null;
      this.localBots.clear();
      this.lastSnapshot = null;
      this.resetMatchTrackers();
      this.showScreen('screen-lobby');
    } else {
      window.location.reload();
    }
  }

  private resetMatchTrackers(): void {
    this.seenBombIds.clear();
    this.seenExplosionIds.clear();
    this.seenBreakingCoords.clear();
    this.prevSuddenDeath = false;
    this.prevMyAlive = true;
    this.prevPowerUps = null;
    document.getElementById('spectator-bar')?.classList.remove('active');
    document.getElementById('modal-gameover')?.classList.remove('active');
  }

  private updateConnectionIndicator(connected: boolean): void {
    const dot = document.getElementById('connection-status-dot');
    const txt = document.getElementById('connection-status-text');
    if (dot) dot.style.backgroundColor = connected ? 'var(--accent)' : '#8E8E93';
    if (txt) txt.textContent = connected ? 'Servidor Online' : 'Modo Local';
  }

  private showNotice(message: string): void {
    const notice = document.getElementById('lobby-notice');
    const textEl = document.getElementById('lobby-notice-text');
    if (notice && textEl) {
      textEl.textContent = message;
      notice.classList.add('active');
    }
  }

  private hideNotice(): void {
    document.getElementById('lobby-notice')?.classList.remove('active');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getArenaShortLabel(arena: ArenaTheme): string {
    if (arena === 'cryo' || arena === 'cyber') return 'CRIO';
    if (arena === 'foundry' || arena === 'magma') return 'FUNDIÇÃO';
    return 'RUÍNAS';
  }

  private handleRestartShortcut(): void {
    const gameScreenActive = document.getElementById('screen-game')?.classList.contains('active');
    if (!gameScreenActive || !this.lastSnapshot) return;

    const me = this.lastSnapshot.players.find(p => p.id === this.myPlayerId);
    const canQuickRestart = this.isLocalMode || this.isHost;
    const isGameOverOrSpectating =
      this.lastSnapshot.phase === 'game_over' || (me && !me.alive);

    if (canQuickRestart && isGameOverOrSpectating) {
      this.restartCurrentMatch();
    }
  }

  private restartCurrentMatch(): void {
    this.resetMatchTrackers();
    if (this.isLocalMode) {
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';
      this.startLocalGame(name, this.selectedArena);
    } else {
      this.socket.emit('restart_game', { arena: this.selectedArena });
    }
  }

  private bindDOM(): void {
    document.getElementById('btn-dismiss-notice')?.addEventListener('click', () => {
      this.hideNotice();
    });

    // Sound toggles (header + compact HUD)
    const toggleSound = () => {
      this.soundFx.enabled = !this.soundFx.enabled;
      this.syncSoundUI();
    };
    document.getElementById('btn-sound-toggle')?.addEventListener('click', toggleSound);
    document.getElementById('btn-hud-sound')?.addEventListener('click', toggleSound);
    this.syncSoundUI();

    // Fullscreen toggle + native listener sync
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    document.getElementById('btn-hud-menu')?.addEventListener('click', () => {
      this.returnToLobby();
    });
    document.addEventListener('fullscreenchange', () => {
      const isNative = Boolean(document.fullscreenElement);
      if (isNative) {
        this.hadNativeFullscreen = true;
        document.body.classList.add('is-fullscreen');
        this.updateFullscreenButton(true);
      } else if (this.hadNativeFullscreen) {
        this.hadNativeFullscreen = false;
        document.body.classList.remove('is-fullscreen');
        this.updateFullscreenButton(false);
      }
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

    // Quick Play with Bots (atomic autoStart on server or instant local browser simulation)
    const quickPlayBtn = document.getElementById('btn-quick-play') as HTMLButtonElement;
    quickPlayBtn.addEventListener('click', () => {
      this.hideNotice();
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';

      if (this.isTouchDevice) {
        this.enterFullscreen();
      }

      if (this.isConnectedToServer) {
        this.isLocalMode = false;
        this.resetMatchTrackers();
        this.socket.emit('create_room', {
          name,
          arena: this.selectedArena,
          maxPlayers: 4,
          fillWithBots: true,
          autoStart: true
        });
      } else {
        this.startLocalGame(name, this.selectedArena);
      }
    });

    // Create Multiplayer Room
    const createRoomBtn = document.getElementById('btn-create-room') as HTMLButtonElement;
    createRoomBtn.addEventListener('click', () => {
      this.hideNotice();
      if (!this.isConnectedToServer) {
        this.showNotice('Servidor WebSocket indisponível nesta hospedagem estática. Iniciando partida local com bots.');
        const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';
        setTimeout(() => this.startLocalGame(name, this.selectedArena), 600);
        return;
      }

      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';
      this.isLocalMode = false;
      this.socket.emit('create_room', {
        name,
        arena: this.selectedArena,
        maxPlayers: 4,
        fillWithBots: true,
        autoStart: false
      });
    });

    // Join Room by Code
    const joinRoomBtn = document.getElementById('btn-join-room') as HTMLButtonElement;
    joinRoomBtn.addEventListener('click', () => {
      this.hideNotice();
      if (!this.isConnectedToServer) {
        this.showNotice('Salas multiplayer online requerem servidor Node.js conectado. Utilize "Iniciar Partida Rápida" para jogar com bots.');
        return;
      }
      const code = (document.getElementById('input-room-code') as HTMLInputElement).value.trim().toUpperCase();
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim() || 'Operador_01';
      if (!code) {
        this.showNotice('Informe o código identificador da sala para conectar.');
        return;
      }
      this.isLocalMode = false;
      this.socket.emit('join_room', { roomId: code, name });
    });

    // Start Game from Room
    const startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
    startBtn.addEventListener('click', () => {
      this.resetMatchTrackers();
      this.socket.emit('start_game');
    });

    // Copy Room Link
    const copyBtn = document.getElementById('btn-copy-link') as HTMLButtonElement;
    copyBtn.addEventListener('click', () => {
      if (this.currentRoomId) {
        navigator.clipboard.writeText(this.currentRoomId);
        copyBtn.textContent = 'Identificador copiado';
        setTimeout(() => { copyBtn.textContent = 'Copiar Identificador'; }, 2000);
      }
    });

    // Leave Room
    const leaveBtn = document.getElementById('btn-leave-room') as HTMLButtonElement;
    leaveBtn.addEventListener('click', () => {
      window.location.reload();
    });

    // Spectator Actions
    document.getElementById('btn-spectator-restart')?.addEventListener('click', () => {
      this.restartCurrentMatch();
    });
    document.getElementById('btn-spectator-lobby')?.addEventListener('click', () => {
      this.returnToLobby();
    });

    // Modal buttons
    const playAgainBtn = document.getElementById('btn-play-again') as HTMLButtonElement;
    playAgainBtn.addEventListener('click', () => {
      this.restartCurrentMatch();
    });

    const backLobbyBtn = document.getElementById('btn-back-lobby') as HTMLButtonElement;
    backLobbyBtn.addEventListener('click', () => {
      this.returnToLobby();
    });
  }

  private startLocalGame(playerName: string, arena: ArenaTheme): void {
    this.isLocalMode = true;
    this.isHost = true;
    this.resetMatchTrackers();

    this.localState = new GameState(arena);
    this.localBots.clear();

    const me = this.localState.addPlayer('player_local', playerName, false);
    this.myPlayerId = me.id;

    // Add 3 Tactical & Aggressive AI Bots
    const botNames = ['MechaBomber', 'CyberBot', 'DynamiteAI'];
    for (let i = 0; i < 3; i++) {
      const botId = `bot_local_${i + 1}`;
      const botPlayer = this.localState.addPlayer(botId, botNames[i], true);
      this.localBots.set(botId, new BotAI(botId, botPlayer.botPersonality));
    }

    this.localState.startGame();
    this.showScreen('screen-game');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private bindSocket(): void {
    this.socket.on('connect', () => {
      this.isConnectedToServer = true;
      this.updateConnectionIndicator(true);
    });

    this.socket.on('disconnect', () => {
      this.isConnectedToServer = false;
      this.updateConnectionIndicator(false);
    });

    this.socket.on('connect_error', () => {
      this.isConnectedToServer = false;
      this.updateConnectionIndicator(false);
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
      this.resetMatchTrackers();
      this.showScreen('screen-game');
      (document.activeElement as HTMLElement | null)?.blur();
    });

    this.socket.on('error_message', (msg: string) => {
      this.showNotice(msg);
    });

    this.socket.on('game_state', (snapshot: GameSnapshot) => {
      if (!this.isLocalMode) {
        this.processSnapshot(snapshot);
      }
    });
  }

  private processSnapshot(snapshot: GameSnapshot): void {
    this.handleSnapshotFeedback(snapshot);
    this.lastSnapshot = snapshot;
    this.updateHUD(snapshot);

    if (snapshot.phase === 'game_over') {
      document.getElementById('spectator-bar')?.classList.remove('active');
      this.showGameOverModal(snapshot);
    }
  }

  private handleSnapshotFeedback(snapshot: GameSnapshot): void {
    // 1. Detect newly placed bombs by ID
    let playedBombSound = false;
    const currentBombIds = new Set<string>();
    for (const bomb of snapshot.bombs) {
      currentBombIds.add(bomb.id);
      if (!this.seenBombIds.has(bomb.id) && !playedBombSound) {
        this.soundFx.playBombDrop();
        playedBombSound = true;
      }
    }
    this.seenBombIds = currentBombIds;

    // 2. Detect all newly triggered explosions (including simultaneous chains)
    let playedExplosionSound = false;
    const currentExpIds = new Set<string>();
    const theme = (snapshot.arena === 'foundry' || snapshot.arena === 'magma') ? 'volatile' : 'fire';
    for (const exp of snapshot.explosions) {
      currentExpIds.add(exp.id);
      if (!this.seenExplosionIds.has(exp.id)) {
        if (!playedExplosionSound) {
          this.soundFx.playExplosion();
          playedExplosionSound = true;
        }
        const center = exp.cells[0];
        if (center) {
          this.renderer.particles.emitExplosion(
            center.gx * TILE_SIZE + TILE_SIZE / 2,
            center.gy * TILE_SIZE + TILE_SIZE / 2,
            theme
          );
        }
      }
    }
    this.seenExplosionIds = currentExpIds;

    // 3. Emit debris particles on newly destroyed soft/volatile blocks
    const debrisColor = (snapshot.arena === 'foundry' || snapshot.arena === 'magma') ? '#9a3412'
                      : (snapshot.arena === 'cryo' || snapshot.arena === 'cyber') ? '#38bdf8'
                      : '#b45309';
    const currentBreakingCoords = new Set<string>();
    if (snapshot.breakingBlocks) {
      for (const bb of snapshot.breakingBlocks) {
        const key = `${bb.gx},${bb.gy}`;
        currentBreakingCoords.add(key);
        if (!this.seenBreakingCoords.has(key)) {
          this.renderer.particles.emitBlockDebris(
            bb.gx * TILE_SIZE + TILE_SIZE / 2,
            bb.gy * TILE_SIZE + TILE_SIZE / 2,
            debrisColor
          );
        }
      }
    }
    this.seenBreakingCoords = currentBreakingCoords;

    // 4. Sudden death activation siren
    if (snapshot.suddenDeathActive && !this.prevSuddenDeath) {
      this.soundFx.playSuddenDeathAlert();
    }
    this.prevSuddenDeath = snapshot.suddenDeathActive;

    // 5. Local player elimination + power-up pickup chime
    const myPlayer = snapshot.players.find(p => p.id === this.myPlayerId);
    if (myPlayer) {
      if (!myPlayer.alive && this.prevMyAlive) {
        this.soundFx.playPlayerDeath();
      }
      this.prevMyAlive = myPlayer.alive;

      const cur = myPlayer.powerUps;
      if (this.prevPowerUps) {
        const gotUpgrade =
          cur.bombLimit > this.prevPowerUps.bombLimit ||
          cur.fireRange > this.prevPowerUps.fireRange ||
          cur.speed > this.prevPowerUps.speed ||
          (cur.canKick && !this.prevPowerUps.canKick) ||
          (cur.hasShield && !this.prevPowerUps.hasShield) ||
          (cur.isCursed && !this.prevPowerUps.isCursed);
        if (gotUpgrade) {
          this.soundFx.playPowerUp();
        }
      }
      this.prevPowerUps = { ...cur };
    }
  }

  private updateHUD(snapshot: GameSnapshot): void {
    const alivePlayers = snapshot.players.filter(p => p.alive);
    const aliveEl = document.getElementById('hud-alive-count');
    if (aliveEl) aliveEl.textContent = `${alivePlayers.length} / ${snapshot.players.length}`;

    const arenaEl = document.getElementById('hud-arena');
    if (arenaEl) arenaEl.textContent = this.getArenaShortLabel(snapshot.arena);

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
      const killsEl = document.getElementById('hud-kills');
      const shieldEl = document.getElementById('hud-shield');
      const kickEl = document.getElementById('hud-kick');
      const curseEl = document.getElementById('hud-curse');

      if (bombsEl) bombsEl.textContent = `BOMBAS: ${me.powerUps.bombLimit}`;
      if (fireEl) fireEl.textContent = `RAIO: ${me.powerUps.fireRange}`;
      if (speedEl) speedEl.textContent = `VEL: ${me.powerUps.speed}`;
      if (killsEl) killsEl.textContent = `ABATES: ${me.kills}`;
      if (shieldEl) shieldEl.style.display = me.powerUps.hasShield ? 'inline' : 'none';
      if (kickEl) kickEl.style.display = me.powerUps.canKick ? 'inline' : 'none';
      if (curseEl) curseEl.style.display = me.powerUps.isCursed ? 'inline' : 'none';

      const spectatorBar = document.getElementById('spectator-bar');
      const restartSpecBtn = document.getElementById('btn-spectator-restart') as HTMLButtonElement | null;
      if (spectatorBar) {
        if (snapshot.phase === 'playing' && !me.alive) {
          spectatorBar.classList.add('active');
          if (restartSpecBtn) {
            restartSpecBtn.style.display = (this.isLocalMode || this.isHost) ? 'inline-flex' : 'none';
          }
        } else {
          spectatorBar.classList.remove('active');
        }
      }
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
                           <span style="font-weight:500; font-family:'JetBrains Mono', monospace; font-size:0.85rem;">${this.escapeHtml(p.name)}</span>
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
    const statsEl = document.getElementById('modal-stats');
    const playAgainBtn = document.getElementById('btn-play-again') as HTMLButtonElement | null;

    if (playAgainBtn) {
      playAgainBtn.style.display = (this.isLocalMode || this.isHost) ? 'inline-flex' : 'none';
    }

    const winner = snapshot.winner;
    const isMeWinner = winner && winner.id === this.myPlayerId;
    const me = snapshot.players.find(p => p.id === this.myPlayerId);

    if (isMeWinner) {
      this.soundFx.playVictory();
      if (titleEl) titleEl.textContent = 'Vitória Confirmada';
      if (winnerEl) winnerEl.textContent = 'Você prevaleceu como único sobrevivente da arena.';
    } else if (winner) {
      if (titleEl) titleEl.textContent = 'Partida Encerrada';
      if (winnerEl) winnerEl.textContent = `Vencedor: ${winner.name} (${winner.kills} abate${winner.kills === 1 ? '' : 's'}).`;
    } else {
      if (titleEl) titleEl.textContent = 'Empate Técnico';
      if (winnerEl) winnerEl.textContent = 'Nenhum operador sobreviveu à detonação final.';
    }

    if (statsEl) {
      const myKills = me ? me.kills : 0;
      const arenaLabel = this.getArenaShortLabel(snapshot.arena);
      const colapsoLabel = snapshot.suddenDeathActive ? 'COLAPSO ATIVO' : 'TEMPO REGULAR';
      statsEl.textContent = `SEUS ABATES: ${myKills} • ARENA: ${arenaLabel} • ${colapsoLabel}`;
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
      const safeId = this.escapeHtml(r.id);
      const statusLabel = r.phase === 'waiting' ? 'Aberta' : r.phase === 'playing' ? 'Em Curso' : 'Encerrada';
      const statusDotColor = r.phase === 'waiting' ? 'var(--accent)' : '#8E8E93';

      tr.innerHTML = `
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-main);">${safeId}</td>
        <td style="font-family: 'JetBrains Mono', monospace; color: var(--text-muted); font-size: 0.78rem;">${this.getArenaShortLabel(r.arena)}</td>
        <td style="font-family: 'JetBrains Mono', monospace;">${r.playerCount} / ${r.maxPlayers}</td>
        <td><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color: ${statusDotColor}; margin-right:6px;"></span>${statusLabel}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" data-join="${safeId}" ${r.phase !== 'waiting' ? 'disabled' : ''}>
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
    const inGame = screenId === 'screen-game';
    document.body.classList.toggle('in-game', inGame);
    if (!inGame && this.isFullscreenActive()) {
      this.exitFullscreen();
    }
  }

  private startRenderLoop(): void {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const input = this.inputHandler.getInput();

      // Local simulation in browser (100% Vercel / static hosting compatible)
      if (this.isLocalMode && this.localState) {
        if (this.localState.phase === 'playing') {
          for (const [botId, ai] of this.localBots.entries()) {
            const botInput = ai.computeInput(this.localState, dt);
            this.localState.handleInput(botId, botInput);
          }

          this.localState.handleInput(this.myPlayerId || 'player_local', input);
          this.localState.update(dt);
          this.processSnapshot(this.localState.getSnapshot());
        } else if (this.localState.phase === 'game_over') {
          // Keep winner celebration animation & hitstop timer visually responsive
          this.lastSnapshot = this.localState.getSnapshot();
        }
      } else if (!this.isLocalMode && this.lastSnapshot?.phase === 'playing') {
        this.socket.emit('player_input', input);
      }

      this.renderer.render(this.lastSnapshot, this.myPlayerId, dt);
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new BombermanApp();
});
