import { ArenaTheme, Direction, PowerUpType, TileType } from '../../shared/types.js';
import { TILE_SIZE } from '../../shared/constants.js';

export class Sprites {
  private static charactersImg: HTMLImageElement | null = null;
  private static bombsImg: HTMLImageElement | null = null;
  private static arenasImg: HTMLImageElement | null = null;
  private static powerupsImg: HTMLImageElement | null = null;
  private static tileImages: Record<string, HTMLImageElement> = {};

  public static init(): void {
    if (typeof window === 'undefined') return;

    this.charactersImg = new Image();
    this.charactersImg.src = '/assets/robos-sem-fundo.png';

    this.bombsImg = new Image();
    this.bombsImg.src = '/assets/bombs_explosions.jpg';

    this.arenasImg = new Image();
    this.arenasImg.src = '/assets/arenas.jpg';

    this.powerupsImg = new Image();
    this.powerupsImg.src = '/assets/powerups.jpg';

    // Load individual pixel art tile assets for arenas
    const tileNames = [
      'classic_floor', 'classic_wall', 'classic_block',
      'magma_floor', 'magma_wall', 'magma_tnt',
      'cyber_floor', 'cyber_wall', 'cyber_conveyor', 'cyber_portal'
    ];
    for (const name of tileNames) {
      const img = new Image();
      img.src = `/assets/tiles/${name}.png`;
      this.tileImages[name] = img;
    }
  }

  // Draw Arena Floor & Static Tiles using high-res pixel art assets
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

    // 1. Draw Floor Tile from Pixel Art Asset
    const floorKey = (arena === 'ruins' || arena === 'classic') ? 'classic_floor'
                   : (arena === 'foundry' || arena === 'magma') ? 'magma_floor'
                   : 'cyber_floor';
    const floorImg = this.tileImages[floorKey];
    if (floorImg && floorImg.complete && floorImg.naturalWidth > 0) {
      ctx.drawImage(floorImg, x, y, TILE_SIZE, TILE_SIZE);
    } else {
      // Solid fallback
      if (arena === 'ruins' || arena === 'classic') {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#3da443' : '#339239';
      } else if (arena === 'foundry' || arena === 'magma') {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#24100e' : '#1a0b0a';
      } else {
        ctx.fillStyle = '#090d16';
      }
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }

    // 2. Draw Obstacle / Mechanism from Pixel Art Asset
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
      case TileType.ICE_FLOOR:
        this.drawIceFloor(ctx, x, y, animTime);
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
    const wallKey = (arena === 'ruins' || arena === 'classic') ? 'classic_wall'
                  : (arena === 'foundry' || arena === 'magma') ? 'magma_wall'
                  : 'cyber_wall';
    const wallImg = this.tileImages[wallKey];
    if (wallImg && wallImg.complete && wallImg.naturalWidth > 0) {
      ctx.drawImage(wallImg, x, y, TILE_SIZE, TILE_SIZE);
      return;
    }

    // Solid technical fallback (zero gradients)
    ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#1c1917'
                  : (arena === 'cryo' || arena === 'cyber') ? '#0284c7'
                  : '#64748b';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  private static drawSoftBlock(ctx: CanvasRenderingContext2D, x: number, y: number, arena: ArenaTheme): void {
    const key = (arena === 'foundry' || arena === 'magma') ? 'magma_wall'
              : (arena === 'cryo' || arena === 'cyber') ? 'cyber_wall'
              : 'classic_block';
    const blockImg = this.tileImages[key];
    if (blockImg && blockImg.complete && blockImg.naturalWidth > 0) {
      ctx.drawImage(blockImg, x, y, TILE_SIZE, TILE_SIZE);
      return;
    }

    // Solid technical fallback
    ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#7f1d1d'
                  : (arena === 'cryo' || arena === 'cyber') ? '#1e3a8a'
                  : '#b45309';
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  private static drawIceFloor(ctx: CanvasRenderingContext2D, x: number, y: number, animTime: number): void {
    // Crisp frozen ice patch with reduced friction
    ctx.save();
    ctx.fillStyle = '#0e7490';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Crystalline frost highlights
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + TILE_SIZE - 4);
    ctx.lineTo(x + TILE_SIZE - 4, y + 4);
    ctx.moveTo(x + 12, y + TILE_SIZE - 4);
    ctx.lineTo(x + TILE_SIZE - 4, y + 12);
    ctx.stroke();

    // Subtle edge border
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.restore();
  }

  private static drawVolatileBlock(ctx: CanvasRenderingContext2D, x: number, y: number, animTime: number): void {
    const tntImg = this.tileImages['magma_tnt'];
    if (tntImg && tntImg.complete && tntImg.naturalWidth > 0) {
      const pulse = 1 + 0.05 * Math.sin(animTime * 8);
      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.scale(pulse, pulse);
      ctx.drawImage(tntImg, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();
      return;
    }

    // Vector fallback
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  private static drawConveyor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileType,
    animTime: number
  ): void {
    const conveyorImg = this.tileImages['cyber_conveyor'];
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    let angle = 0;
    if (tile === TileType.CONVEYOR_UP) angle = -Math.PI / 2;
    else if (tile === TileType.CONVEYOR_DOWN) angle = Math.PI / 2;
    else if (tile === TileType.CONVEYOR_LEFT) angle = Math.PI;
    else if (tile === TileType.CONVEYOR_RIGHT) angle = 0;

    if (conveyorImg && conveyorImg.complete && conveyorImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.drawImage(conveyorImg, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();
      return;
    }

    // Vector fallback
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  private static drawTeleport(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileType,
    animTime: number
  ): void {
    const portalImg = this.tileImages['cyber_portal'];
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    if (portalImg && portalImg.complete && portalImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(animTime * 1.5);
      const pulse = 1 + 0.08 * Math.sin(animTime * 6);
      ctx.scale(pulse, pulse);
      ctx.drawImage(portalImg, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();
      return;
    }

    // Vector fallback
    const isA = tile === TileType.TELEPORT_A;
    const color = isA ? '#ec4899' : '#8b5cf6';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  private static drawSuddenDeathBlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 10, y + 10, TILE_SIZE - 20, TILE_SIZE - 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  }

  // Draw 150ms crumbling animation for destroyed blocks
  public static drawBreakingBlock(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    timer: number,
    maxTime: number,
    arena: ArenaTheme
  ): void {
    const x = gx * TILE_SIZE;
    const y = gy * TILE_SIZE;
    const progress = Math.max(0, Math.min(1, 1 - timer / maxTime)); // 0 to 1
    const alpha = Math.max(0, 1 - progress);

    ctx.save();
    ctx.globalAlpha = alpha;

    const offset = progress * 8;
    const half = TILE_SIZE / 2;

    const key = (arena === 'foundry' || arena === 'magma') ? 'magma_wall'
              : (arena === 'cryo' || arena === 'cyber') ? 'cyber_wall'
              : 'classic_block';
    const blockImg = this.tileImages[key];

    const quarters = [
      { sx: 0, sy: 0, dx: x - offset, dy: y - offset },
      { sx: half, sy: 0, dx: x + half + offset, dy: y - offset },
      { sx: 0, sy: half, dx: x - offset, dy: y + half + offset },
      { sx: half, sy: half, dx: x + half + offset, dy: y + half + offset }
    ];

    for (const q of quarters) {
      if (blockImg && blockImg.complete && blockImg.naturalWidth > 0) {
        ctx.drawImage(blockImg, q.sx, q.sy, half, half, q.dx, q.dy, half, half);
      } else {
        ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#7f1d1d'
                      : (arena === 'cryo' || arena === 'cyber') ? '#1e3a8a'
                      : '#b45309';
        ctx.fillRect(q.dx, q.dy, half - 1, half - 1);
      }
    }

    ctx.restore();
  }

  // Draw Bomb with fuse spark, solid pixel shading and accelerated telegraphing pulse (<0.8s)
  public static drawBomb(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    fuseTimer: number,
    animTime: number
  ): void {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = gy * TILE_SIZE + TILE_SIZE / 2;

    // Accelerated pulse in final 0.8s
    const isTelegraphing = fuseTimer <= 0.8;
    const pulseRate = isTelegraphing ? 28 : (fuseTimer < 1.5 ? 12 : 6);
    const scale = 1 + (isTelegraphing ? 0.16 : 0.08) * Math.sin(animTime * pulseRate);
    const radius = 17 * scale;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, radius, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bomb body - Solid colors, zero gradients
    const isFlashing = isTelegraphing && Math.sin(animTime * 28) > 0;
    ctx.fillStyle = isFlashing ? '#ef4444' : '#0a0a0b';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Outer border ring
    ctx.strokeStyle = isFlashing ? '#fca5a5' : '#242428';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pixel highlight dot
    ctx.fillStyle = isFlashing ? '#ffffff' : '#52525b';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Metallic cap
    ctx.fillStyle = '#71717a';
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
    ctx.fillStyle = '#121214';
    ctx.beginPath();
    ctx.arc(cx, bobY, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#242428';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#F4F4F5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let code = 'FIRE';
    if (type === PowerUpType.FIRE_UP) code = 'FIRE';
    else if (type === PowerUpType.BOMB_UP) code = 'BOMB';
    else if (type === PowerUpType.SPEED_UP) code = 'SPD';
    else if (type === PowerUpType.BOMB_KICK) code = 'KICK';
    else if (type === PowerUpType.SHIELD) code = 'SHLD';
    else if (type === PowerUpType.SKULL) code = 'CRSE';

    ctx.fillText(code, cx, bobY);
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
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#8E8E93';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (isInvincible && Math.floor(animTime * 15) % 2 === 0) {
      return;
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
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.beginPath();
      ctx.arc(x, py, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Crop from characters sprite sheet if loaded
    if (this.charactersImg && this.charactersImg.complete && this.charactersImg.naturalWidth > 0) {
      const img = this.charactersImg;
      const colWidth = img.naturalWidth / 6;
      const rowHeight = img.naturalHeight / 4;

      let col = 0;
      if (color.includes('ef4444') || color.includes('red')) col = 0;
      else if (color.includes('3b82f6') || color.includes('blue')) col = 1;
      else if (color.includes('10b981') || color.includes('green')) col = 2;
      else if (color.includes('f59e0b') || color.includes('yellow')) col = 3;
      else if (color.includes('8b5cf6') || color.includes('purple')) col = 4;
      else col = 5;

      let row = 0;
      if (facing === 'down') row = 0;
      else if (facing === 'up') row = 2;
      else row = 1;

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
      // Vector fallback
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

    // Name tag in JetBrains Mono
    ctx.fillStyle = '#121214';
    ctx.roundRect(x - 32, py - 35, 64, 14, 3);
    ctx.fill();
    ctx.strokeStyle = '#242428';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#F4F4F5';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 10), x, py - 28);

    ctx.restore();
  }
}
