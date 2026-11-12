import { ArenaTheme, Direction, PowerUpType, TileType } from '../../shared/types.js';
import { TILE_SIZE } from '../../shared/constants.js';

export class Sprites {
  private static charactersImg: HTMLImageElement | null = null;
  private static bombsImg: HTMLImageElement | null = null;
  private static arenasImg: HTMLImageElement | null = null;
  private static powerupsImg: HTMLImageElement | null = null;

  public static init(): void {
    if (typeof window === 'undefined') return;

    this.charactersImg = new Image();
    this.charactersImg.src = '/assets/characters.jpg';

    this.bombsImg = new Image();
    this.bombsImg.src = '/assets/bombs_explosions.jpg';

    this.arenasImg = new Image();
    this.arenasImg.src = '/assets/arenas.jpg';

    this.powerupsImg = new Image();
    this.powerupsImg.src = '/assets/powerups.jpg';
  }

  // Draw Arena Floor & Static Tiles
  public static drawTile(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    tile: TileType,
    arena: ArenaTheme,
    animTime: number
  ): void {
    const x = gx * TILE_SIZE;
    const y = gy * TILE_SIZE;

    // 1. Draw Base Floor
    if (arena === 'classic') {
      const isEven = (gx + gy) % 2 === 0;
      ctx.fillStyle = isEven ? '#3da443' : '#339239';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#2d7c32';
      ctx.fillRect(x + 10, y + 8, 4, 4);
      ctx.fillRect(x + 32, y + 26, 4, 4);
    } else if (arena === 'magma') {
      const isEven = (gx + gy) % 2 === 0;
      ctx.fillStyle = isEven ? '#24100e' : '#1a0b0a';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(x + 14, y + 10, 5, 2);
      ctx.fillRect(x + 28, y + 32, 3, 4);
    } else if (arena === 'cyber') {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x + 23, y + 23, 2, 2);
    }

    // 2. Draw Obstacle / Mechanism
    switch (tile) {
      case TileType.HARD_WALL:
        this.drawHardWall(ctx, x, y, arena);
        break;
      case TileType.SOFT_BLOCK:
        this.drawSoftBlock(ctx, x, y, arena);
        break;
      case TileType.VOLATILE_BLOCK:
        this.drawVolatileBlock(ctx, x, y, animTime);
        break;
      case TileType.CONVEYOR_UP:
      case TileType.CONVEYOR_DOWN:
      case TileType.CONVEYOR_LEFT:
      case TileType.CONVEYOR_RIGHT:
        this.drawConveyor(ctx, x, y, tile, animTime);
        break;
      case TileType.TELEPORT_A:
      case TileType.TELEPORT_B:
        this.drawTeleport(ctx, x, y, tile, animTime);
        break;
      case TileType.SUDDEN_DEATH_BLOCK:
        this.drawSuddenDeathBlock(ctx, x, y);
        break;
      default:
        break;
    }
  }

  private static drawHardWall(ctx: CanvasRenderingContext2D, x: number, y: number, arena: ArenaTheme): void {
    if (arena === 'classic') {
      // Ornate stone pillar
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(x + 6, y + 6, TILE_SIZE - 12, 6);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 6, y + TILE_SIZE - 10, TILE_SIZE - 12, 4);
    } else if (arena === 'magma') {
      // Magma Basalt Pillar
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#292524';
      ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 8, y + 8, 5, 32);
      ctx.fillRect(x + 22, y + 14, 5, 20);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 10, y + 12, 2, 20);
    } else {
      // Cyber Neon Column
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 14, y + 14, TILE_SIZE - 28, TILE_SIZE - 28);
    }
  }

  private static drawSoftBlock(ctx: CanvasRenderingContext2D, x: number, y: number, arena: ArenaTheme): void {
    if (arena === 'classic') {
      // Wooden Crate
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
      // Diagonal steel brace
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + TILE_SIZE - 6, y + TILE_SIZE - 6);
      ctx.stroke();
    } else if (arena === 'magma') {
      // Molten Crag Crate
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x + 12, y + 16, 24, 16);
    } else {
      // Cyber Data Node
      ctx.fillStyle = '#312e81';
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(x + 12, y + 12, 24, 24);
    }
  }

  private static drawVolatileBlock(ctx: CanvasRenderingContext2D, x: number, y: number, animTime: number): void {
    const pulse = 0.8 + 0.2 * Math.sin(animTime * 8);
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x + 6, y + 14, TILE_SIZE - 12, 20);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 1);

    // Glowing spark fuse on top
    ctx.fillStyle = `rgba(255, 87, 34, ${pulse})`;
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + 6, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawConveyor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileType,
    animTime: number
  ): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    const offset = (animTime * 36) % 18;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);

    let angle = 0;
    if (tile === TileType.CONVEYOR_UP) angle = -Math.PI / 2;
    else if (tile === TileType.CONVEYOR_DOWN) angle = Math.PI / 2;
    else if (tile === TileType.CONVEYOR_LEFT) angle = Math.PI;
    else if (tile === TileType.CONVEYOR_RIGHT) angle = 0;

    ctx.rotate(angle);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(offset - 9, -7);
    ctx.lineTo(offset + 6, 0);
    ctx.lineTo(offset - 9, 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private static drawTeleport(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileType,
    animTime: number
  ): void {
    const isA = tile === TileType.TELEPORT_A;
    const color = isA ? '#ec4899' : '#8b5cf6';
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;
    const radius = 16 + 3 * Math.sin(animTime * 6);

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isA ? 'Ω' : 'Ψ', cx, cy);

    ctx.restore();
  }

  private static drawSuddenDeathBlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 10, y + 10, TILE_SIZE - 20, TILE_SIZE - 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  }

  // Draw Bomb with fuse spark and pulse
  public static drawBomb(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    fuseTimer: number,
    animTime: number
  ): void {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = gy * TILE_SIZE + TILE_SIZE / 2;

    const pulseRate = fuseTimer < 1.0 ? 18 : 6;
    const scale = 1 + 0.12 * Math.sin(animTime * pulseRate);
    const radius = 17 * scale;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, radius, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bomb body
    const grad = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, radius);
    grad.addColorStop(0, '#64748b');
    grad.addColorStop(0.4, '#1e293b');
    grad.addColorStop(1, '#020617');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Metallic cap
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(cx - 5, cy - radius - 2, 10, 4);

    // Fuse wick
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.quadraticCurveTo(cx + 6, cy - radius - 8, cx + 3, cy - radius - 12);
    ctx.stroke();

    // Glowing spark
    const sparkX = cx + 3;
    const sparkY = cy - radius - 12;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 4 + 2 * Math.sin(animTime * 20), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw Explosion Segment
  public static drawExplosionSegment(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    direction: string,
    animTime: number
  ): void {
    const x = gx * TILE_SIZE;
    const y = gy * TILE_SIZE;

    const flicker = 0.85 + 0.15 * Math.sin(animTime * 30);

    ctx.save();
    ctx.globalAlpha = flicker;

    // Outer flame
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    // Inner bright yellow
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 7, y + 7, TILE_SIZE - 14, TILE_SIZE - 14);

    // Center white core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 13, y + 13, TILE_SIZE - 26, TILE_SIZE - 26);

    ctx.restore();
  }

  // Draw Power-Up Item
  public static drawPowerUp(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    type: PowerUpType,
    animTime: number
  ): void {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const bobY = gy * TILE_SIZE + TILE_SIZE / 2 + Math.sin(animTime * 5) * 3;

    // If powerups sheet is loaded, draw from sprite sheet!
    if (this.powerupsImg && this.powerupsImg.complete && this.powerupsImg.naturalWidth > 0) {
      const img = this.powerupsImg;
      const w = img.naturalWidth / 3;
      const h = img.naturalHeight / 3;

      let col = 0;
      let row = 0;

      switch (type) {
        case PowerUpType.BOMB_UP: col = 0; row = 0; break;
        case PowerUpType.FIRE_UP: col = 1; row = 0; break;
        case PowerUpType.SPEED_UP: col = 2; row = 0; break;
        case PowerUpType.BOMB_KICK: col = 1; row = 1; break;
        case PowerUpType.SHIELD: col = 2; row = 1; break;
        case PowerUpType.SKULL: col = 2; row = 2; break;
      }

      ctx.save();
      ctx.drawImage(img, col * w, row * h, w, h, cx - 18, bobY - 18, 36, 36);
      ctx.restore();
      return;
    }

    // Fallback badge
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cx, bobY, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let icon = '🔥';
    if (type === PowerUpType.FIRE_UP) icon = '🔥';
    else if (type === PowerUpType.BOMB_UP) icon = '💣';
    else if (type === PowerUpType.SPEED_UP) icon = '👟';
    else if (type === PowerUpType.BOMB_KICK) icon = '🥾';
    else if (type === PowerUpType.SHIELD) icon = '🛡️';
    else if (type === PowerUpType.SKULL) icon = '💀';

    ctx.fillText(icon, cx, bobY);
    ctx.restore();
  }

  // Draw Bomberman Character
  public static drawPlayer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    name: string,
    facing: Direction,
    isMoving: boolean,
    alive: boolean,
    hasShield: boolean,
    isInvincible: boolean,
    animTime: number
  ): void {
    if (!alive) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👻', x, y - 8);
      ctx.restore();
      return;
    }

    if (isInvincible && Math.floor(animTime * 15) % 2 === 0) {
      return; // invincibility flash
    }

    ctx.save();

    const bounce = isMoving ? Math.abs(Math.sin(animTime * 14)) * 3 : 0;
    const py = y - bounce;

    // Ground Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield Bubble
    if (hasShield) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(x, py, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // If characters sprite sheet is loaded, draw the cropped character sprite!
    if (this.charactersImg && this.charactersImg.complete && this.charactersImg.naturalWidth > 0) {
      const img = this.charactersImg;
      const colWidth = img.naturalWidth / 6;
      const rowHeight = img.naturalHeight / 4;

      // Map color to column
      // 0: Red, 1: Blue, 2: Green, 3: Yellow, 4: Purple, 5: Cyan
      let col = 0;
      if (color.includes('ef4444') || color.includes('red')) col = 0;
      else if (color.includes('3b82f6') || color.includes('blue')) col = 1;
      else if (color.includes('10b981') || color.includes('green')) col = 2;
      else if (color.includes('f59e0b') || color.includes('yellow')) col = 3;
      else if (color.includes('8b5cf6') || color.includes('purple')) col = 4;
      else col = 5; // Cyan / default

      // Map facing direction to row
      // Row 0: Front, Row 1: Side walk, Row 2: Back
      let row = 0;
      if (facing === 'down') row = 0;
      else if (facing === 'up') row = 2;
      else row = 1; // left or right

      const flip = facing === 'left';

      ctx.save();
      ctx.translate(x, py);
      if (flip) ctx.scale(-1, 1);

      ctx.drawImage(
        img,
        col * colWidth,
        row * rowHeight,
        colWidth,
        rowHeight,
        -18,
        -24,
        36,
        38
      );
      ctx.restore();
    } else {
      // Procedural vector character fallback
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, py + 4, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 9, py + 8, 18, 4);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, py - 6, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      let visorX = x;
      let visorY = py - 7;
      if (facing === 'left') visorX -= 4;
      else if (facing === 'right') visorX += 4;
      else if (facing === 'up') visorY -= 3;
      else if (facing === 'down') visorY += 1;

      ctx.beginPath();
      ctx.ellipse(visorX, visorY, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, py - 19, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player Name Tag & Health above head
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.roundRect(x - 32, py - 35, 64, 14, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 10), x, py - 28);

    ctx.restore();
  }
}
