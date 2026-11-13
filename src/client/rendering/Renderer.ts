import { GameSnapshot } from '../../shared/types.js';
import { GRID_COLS, GRID_ROWS, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../../shared/constants.js';
import { Sprites } from './Sprites.js';
import { ParticleSystem } from './Particles.js';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public particles: ParticleSystem;
  private animTime: number = 0;
  private zoomFactor: number = 1.0;
  private cameraX: number = MAP_WIDTH / 2;
  private cameraY: number = MAP_HEIGHT / 2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;
    this.particles = new ParticleSystem();
    Sprites.init();

    // Set internal resolution
    this.canvas.width = MAP_WIDTH;
    this.canvas.height = MAP_HEIGHT;
  }

  public render(snapshot: GameSnapshot | null, myPlayerId: string | null, dt: number): void {
    const isHitstop = snapshot && snapshot.hitstopTimer > 0;

    // During hitstop (elimination frame freeze), hold animations to intensify impact
    if (!isHitstop) {
      this.animTime += dt;
      this.particles.update(dt);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!snapshot) {
      // Waiting screen
      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#8e8e93';
      ctx.font = '500 16px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando início da partida...', MAP_WIDTH / 2, MAP_HEIGHT / 2);
      return;
    }

    // Dynamic Camera Zoom: smoothly frame and spotlight winner during game over
    const isGameOver = snapshot.phase === 'game_over';
    const winner = snapshot.winner;
    let targetZoom = 1.0;
    let targetX = MAP_WIDTH / 2;
    let targetY = MAP_HEIGHT / 2;

    if (isGameOver && winner) {
      targetZoom = 2.35;
      const halfViewW = MAP_WIDTH / (2 * targetZoom);
      const halfViewH = MAP_HEIGHT / (2 * targetZoom);
      targetX = Math.max(halfViewW, Math.min(MAP_WIDTH - halfViewW, winner.x));
      targetY = Math.max(halfViewH, Math.min(MAP_HEIGHT - halfViewH, winner.y));
    }

    const lerpSpeed = isGameOver ? 2.8 : 4.5;
    this.zoomFactor += (targetZoom - this.zoomFactor) * Math.min(1, dt * lerpSpeed);
    this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * lerpSpeed);
    this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * lerpSpeed);

    // Trigger proportional screen shake based on number of active explosions
    if (snapshot.explosions.length > 0) {
      this.particles.triggerScreenShake(Math.min(18, 4 * snapshot.explosions.length));
    }

    ctx.save();

    // Apply Camera Zoom & Centering
    if (this.zoomFactor > 1.002) {
      ctx.translate(MAP_WIDTH / 2, MAP_HEIGHT / 2);
      ctx.scale(this.zoomFactor, this.zoomFactor);
      ctx.translate(-this.cameraX, -this.cameraY);
    }

    // Screen Shake effect
    if (this.particles.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.particles.screenShake;
      const shakeY = (Math.random() - 0.5) * this.particles.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Winner spotlight halo on ground
    if (isGameOver && winner && this.zoomFactor > 1.25) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.beginPath();
      ctx.ellipse(winner.x, winner.y + 13, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 1. Draw Grid Tiles & Arena Grounds
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const tile = snapshot.grid[gy]?.[gx] ?? 0;
        Sprites.drawTile(ctx, gx, gy, tile, snapshot.arena, this.animTime);
      }
    }

    // 1.5 Draw Rapid Crumbling Animations for Destroyed Blocks
    if (snapshot.breakingBlocks && snapshot.breakingBlocks.length > 0) {
      for (const bb of snapshot.breakingBlocks) {
        Sprites.drawBreakingBlock(ctx, bb.gx, bb.gy, bb.timer, bb.maxTime, snapshot.arena);
      }
    }

    // 2. Draw Power-Ups
    for (const pup of snapshot.powerUps) {
      Sprites.drawPowerUp(ctx, pup.gx, pup.gy, pup.type, this.animTime);
    }

    // 3. Draw Bombs at smooth world coordinates
    for (const bomb of snapshot.bombs) {
      const bx = typeof bomb.x === 'number' ? bomb.x : bomb.gx * TILE_SIZE + TILE_SIZE / 2;
      const by = typeof bomb.y === 'number' ? bomb.y : bomb.gy * TILE_SIZE + TILE_SIZE / 2;
      const isSliding = bomb.slidingVx !== 0 || bomb.slidingVy !== 0;
      Sprites.drawBomb(ctx, bx, by, bomb.fuseTimer, this.animTime, isSliding);
    }

    // 4. Draw Explosions
    for (const exp of snapshot.explosions) {
      for (const cell of exp.cells) {
        Sprites.drawExplosionSegment(ctx, cell.gx, cell.gy, cell.direction, this.animTime);
      }
    }

    // 5. Draw Players sorted by alive status and vertical Y for clean 2.5D overlap
    const sortedPlayers = [...snapshot.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? 1 : -1;
      return a.y - b.y;
    });

    for (const player of sortedPlayers) {
      const isWinner = snapshot.phase === 'game_over' && snapshot.winner?.id === player.id;
      Sprites.drawPlayer(
        ctx,
        player.x,
        player.y,
        player.color,
        player.name,
        player.facing,
        player.isMoving,
        player.alive,
        player.powerUps.hasShield,
        player.invincibleTimer > 0,
        this.animTime,
        player.powerUps.isCursed,
        isWinner
      );

      // Marker arrow for "YOU" cleanly above raised nametag
      if (player.id === myPlayerId && player.alive) {
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#0A0A0B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y - 54);
        ctx.lineTo(player.x - 5, player.y - 60);
        ctx.lineTo(player.x + 5, player.y - 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 6. Draw Particle System
    this.particles.render(ctx);

    // 7. Hitstop Freeze Impact Flash
    if (isHitstop) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    // 8. Sudden Death Alert Overlay
    if (snapshot.suddenDeathActive && snapshot.phase === 'playing') {
      const bannerPulse = Math.sin(this.animTime * 6);
      if (bannerPulse > 0) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      }
    }

    ctx.restore();
  }
}
