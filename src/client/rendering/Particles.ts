export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  maxLife: number;
  life: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  public screenShake: number = 0;

  public triggerScreenShake(amount: number = 8): void {
    this.screenShake = Math.max(this.screenShake, amount);
  }

  public emitExplosion(x: number, y: number, colorTheme: 'fire' | 'volatile' = 'fire'): void {
    this.triggerScreenShake(7);

    // Blast fiery particles
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const colors = colorTheme === 'volatile'
        ? ['#f87171', '#ef4444', '#b91c1c', '#fbbf24']
        : ['#fbbf24', '#f97316', '#ef4444', '#ffffff'];

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        maxLife: 0.35 + Math.random() * 0.25,
        life: 0.35 + Math.random() * 0.25
      });
    }
  }

  public emitBlockDebris(x: number, y: number, color: string): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 90;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20, // gentle pop upward
        size: 3 + Math.random() * 4,
        color,
        alpha: 1,
        maxLife: 0.4 + Math.random() * 0.3,
        life: 0.4 + Math.random() * 0.3
      });
    }
  }

  public update(dt: number): void {
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
