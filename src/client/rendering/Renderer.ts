import { GameSnapshot } from '../../shared/types.js';
import { GRID_COLS, GRID_ROWS, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../../shared/constants.js';
import { Sprites } from './Sprites.js';
import { ParticleSystem } from './Particles.js';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public particles: ParticleSystem;
  private animTime: number = 0;

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
    this.animTime += dt;
    this.particles.update(dt);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!snapshot) {
      // Waiting screen
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando início da partida...', MAP_WIDTH / 2, MAP_HEIGHT / 2);
      return;
    }

    ctx.save();

    // Screen Shake effect
    if (this.particles.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.particles.screenShake;
      const shakeY = (Math.random() - 0.5) * this.particles.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // 1. Draw Grid Tiles & Arena Grounds
    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const tile = snapshot.grid[gy]?.[gx] ?? 0;
        Sprites.drawTile(ctx, gx, gy, tile, snapshot.arena, this.animTime);
      }
    }

    // 2. Draw Power-Ups
    for (const pup of snapshot.powerUps) {
      Sprites.drawPowerUp(ctx, pup.gx, pup.gy, pup.type, this.animTime);
    }

    // 3. Draw Bombs
    for (const bomb of snapshot.bombs) {
      Sprites.drawBomb(ctx, bomb.gx, bomb.gy, bomb.fuseTimer, this.animTime);
    }

    // 4. Draw Explosions
    for (const exp of snapshot.explosions) {
      for (const cell of exp.cells) {
        Sprites.drawExplosionSegment(ctx, cell.gx, cell.gy, cell.direction, this.animTime);
      }
    }

    // 5. Draw Players
    for (const player of snapshot.players) {
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
        this.animTime
      );

      // Marker arrow for "YOU"
      if (player.id === myPlayerId && player.alive) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(player.x, player.y - 42);
        ctx.lineTo(player.x - 6, player.y - 49);
        ctx.lineTo(player.x + 6, player.y - 49);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 6. Draw Particle System
    this.particles.render(ctx);

    // 7. Sudden Death Alert Banner
    if (snapshot.suddenDeathActive && snapshot.phase === 'playing') {
      const bannerPulse = Math.sin(this.animTime * 6);
      if (bannerPulse > 0) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      }
    }

    ctx.restore();
  }
}
