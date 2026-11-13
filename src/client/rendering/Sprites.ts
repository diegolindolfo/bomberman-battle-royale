import { ArenaTheme, Direction, PowerUpType, TileType } from '../../shared/types.js';
import { TILE_SIZE } from '../../shared/constants.js';

export class Sprites {
  private static charactersImg: HTMLImageElement | null = null;
  private static powerupsSheetImg: HTMLImageElement | null = null;
  private static tileImages: Record<string, HTMLImageElement> = {};
  private static powerUpImages: Record<string, HTMLImageElement> = {};
  private static fxImages: Record<string, HTMLImageElement> = {};

  public static init(): void {
    if (typeof window === 'undefined') return;

    this.charactersImg = new Image();
    this.charactersImg.src = '/assets/robos-sem-fundo.png';

    this.powerupsSheetImg = new Image();
    this.powerupsSheetImg.src = '/assets/powerups.jpg';

    // Load individual pixel art tile assets for all 3 arenas & mechanisms
    const tileNames = [
      'classic_floor', 'classic_wall', 'classic_block',
      'magma_floor', 'magma_wall', 'magma_block', 'magma_tnt', 'foundry_conveyor',
      'cyber_floor', 'cyber_wall', 'cyber_block', 'cryo_ice', 'cyber_conveyor', 'cyber_portal',
      'sudden_death_block'
    ];
    for (const name of tileNames) {
      const img = new Image();
      img.src = `/assets/tiles/${name}.png`;
      this.tileImages[name] = img;
    }

    // Load dedicated crisp pixel-art bomb and explosion FX sprites
    const fxNames = [
      'bomb_idle', 'bomb_warm', 'bomb_flash',
      'exp_center', 'exp_horizontal', 'exp_vertical',
      'exp_end_up', 'exp_end_down', 'exp_end_left', 'exp_end_right',
      'smoke'
    ];
    for (const name of fxNames) {
      const img = new Image();
      img.src = `/assets/fx/${name}.png`;
      this.fxImages[name] = img;
    }

    // Load dedicated crisp standalone power-up icon PNGs
    const powerUpNames = ['bomb_up', 'fire_up', 'speed_up', 'bomb_kick', 'shield', 'skull'];
    for (const name of powerUpNames) {
      const img = new Image();
      img.src = `/assets/powerups/${name}.png`;
      this.powerUpImages[name] = img;
    }
  }

  private static getSoftBlockKey(arena: ArenaTheme): string {
    if (arena === 'foundry' || arena === 'magma') return 'magma_block';
    if (arena === 'cryo' || arena === 'cyber') return 'cyber_block';
    return 'classic_block';
  }

  // Draw Arena Floor & Static Tiles using crisp 16-bit pixel art assets
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
        this.drawConveyor(ctx, x, y, tile, arena, animTime);
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

    ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#1c1917'
                  : (arena === 'cryo' || arena === 'cyber') ? '#0284c7'
                  : '#64748b';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  private static drawSoftBlock(ctx: CanvasRenderingContext2D, x: number, y: number, arena: ArenaTheme): void {
    const pad = 3;
    const size = TILE_SIZE - pad * 2; // 42x42 crate nested inside 48x48 floor cell

    // Subtle ground drop shadow tucked cleanly under southeast crate base
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.fillRect(x + pad + 2, y + pad + 3, size - 2, size - 2);

    const key = this.getSoftBlockKey(arena);
    const blockImg = this.tileImages[key];
    if (blockImg && blockImg.complete && blockImg.naturalWidth > 0) {
      ctx.drawImage(blockImg, x + pad, y + pad, size, size);
      return;
    }

    ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#9a3412'
                  : (arena === 'cryo' || arena === 'cyber') ? '#38bdf8'
                  : '#b45309';
    ctx.fillRect(x + pad, y + pad, size, size);
  }

  private static drawIceFloor(ctx: CanvasRenderingContext2D, x: number, y: number, animTime: number): void {
    const iceImg = this.tileImages['cryo_ice'];
    if (iceImg && iceImg.complete && iceImg.naturalWidth > 0) {
      ctx.save();
      ctx.drawImage(iceImg, x, y, TILE_SIZE, TILE_SIZE);
      // Subtle animated frost sparkle highlight on ice crystals
      const glint = 0.28 + 0.25 * Math.sin(animTime * 3.2 + x * 0.08 + y * 0.05);
      ctx.strokeStyle = `rgba(224, 242, 254, ${glint})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(14, 116, 144, 0.72)';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    ctx.restore();
  }

  private static drawVolatileBlock(ctx: CanvasRenderingContext2D, x: number, y: number, animTime: number): void {
    const tntImg = this.tileImages['magma_tnt'];
    const size = TILE_SIZE - 12; // 36x36 barrel prop grounded neatly inside tile

    // Ground shadow under TNT barrel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 7, size * 0.42, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (tntImg && tntImg.complete && tntImg.naturalWidth > 0) {
      const pulse = 1 + 0.04 * Math.sin(animTime * 7);
      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.scale(pulse, pulse);
      ctx.drawImage(tntImg, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 6, y + 6, size, size);
  }

  private static drawConveyor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileType,
    arena: ArenaTheme,
    animTime: number
  ): void {
    const conveyorKey = (arena === 'foundry' || arena === 'magma') ? 'foundry_conveyor' : 'cyber_conveyor';
    const conveyorImg = this.tileImages[conveyorKey] || this.tileImages['cyber_conveyor'];
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    let angle = 0;
    if (tile === TileType.CONVEYOR_UP) angle = -Math.PI / 2;
    else if (tile === TileType.CONVEYOR_DOWN) angle = Math.PI / 2;
    else if (tile === TileType.CONVEYOR_LEFT) angle = Math.PI;
    else if (tile === TileType.CONVEYOR_RIGHT) angle = 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Clip to cell bounds so seamless belt scrolling loops crisply along +X
    ctx.beginPath();
    ctx.rect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    ctx.clip();

    if (conveyorImg && conveyorImg.complete && conveyorImg.naturalWidth > 0) {
      const scrollOffset = (animTime * 36) % TILE_SIZE;
      ctx.drawImage(conveyorImg, -TILE_SIZE / 2 + scrollOffset, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(conveyorImg, -TILE_SIZE / 2 + scrollOffset - TILE_SIZE, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }

    ctx.restore();
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
    const isA = tile === TileType.TELEPORT_A;

    if (portalImg && portalImg.complete && portalImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((isA ? 1 : -1) * animTime * 1.6);
      const pulse = 1 + 0.06 * Math.sin(animTime * 6);
      ctx.scale(pulse, pulse);
      ctx.drawImage(portalImg, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();

      // Subtle core color cue differentiating portal pair endpoints
      ctx.save();
      ctx.fillStyle = isA ? '#22d3ee' : '#a855f7';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const color = isA ? '#22d3ee' : '#a855f7';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  private static drawSuddenDeathBlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const sdImg = this.tileImages['sudden_death_block'];
    if (sdImg && sdImg.complete && sdImg.naturalWidth > 0) {
      ctx.drawImage(sdImg, x, y, TILE_SIZE, TILE_SIZE);
      return;
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 11, y + 11, TILE_SIZE - 22, TILE_SIZE - 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 1);
  }

  // Draw 150ms crumbling animation for destroyed blocks using exact soft-block sprite
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
    const progress = Math.max(0, Math.min(1, 1 - timer / maxTime));
    const alpha = Math.max(0, 1 - progress);

    ctx.save();
    ctx.globalAlpha = alpha;

    const offset = progress * 9;
    const pad = 3;
    const half = (TILE_SIZE - pad * 2) / 2;
    const baseX = x + pad;
    const baseY = y + pad;

    const blockImg = this.tileImages[this.getSoftBlockKey(arena)];

    const quarters = [
      { sx: 0, sy: 0, dx: baseX - offset, dy: baseY - offset },
      { sx: 1, sy: 0, dx: baseX + half + offset, dy: baseY - offset },
      { sx: 0, sy: 1, dx: baseX - offset, dy: baseY + half + offset },
      { sx: 1, sy: 1, dx: baseX + half + offset, dy: baseY + half + offset }
    ];

    for (const q of quarters) {
      if (blockImg && blockImg.complete && blockImg.naturalWidth > 0) {
        const srcHalfW = blockImg.naturalWidth / 2;
        const srcHalfH = blockImg.naturalHeight / 2;
        const sx = q.sx > 0 ? srcHalfW : 0;
        const sy = q.sy > 0 ? srcHalfH : 0;
        ctx.drawImage(blockImg, sx, sy, srcHalfW, srcHalfH, q.dx, q.dy, half, half);
      } else {
        ctx.fillStyle = (arena === 'foundry' || arena === 'magma') ? '#9a3412'
                      : (arena === 'cryo' || arena === 'cyber') ? '#38bdf8'
                      : '#b45309';
        ctx.fillRect(q.dx, q.dy, half - 1, half - 1);
      }
    }

    ctx.restore();
  }

  // Draw Pixel Art Bomb at smooth world coordinates with <0.8s telegraph pulse & sliding cue
  public static drawBomb(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    fuseTimer: number,
    animTime: number,
    isSliding: boolean = false
  ): void {
    const cx = worldX;
    const cy = worldY + 2; // sit slightly grounded near tile floor center

    const isTelegraphing = fuseTimer <= 0.8;
    const pulseRate = isTelegraphing ? 28 : (fuseTimer < 1.5 ? 12 : 6);
    const scale = 1 + (isTelegraphing ? 0.13 : 0.05) * Math.sin(animTime * pulseRate);
    const radius = 11 * scale;

    ctx.save();

    // Sliding highlight ring if kicked or moving on belt
    if (isSliding) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy + 1, radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 11.5, radius, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Select pixel sprite frame for idle / warm / telegraph flash
    let frameKey = 'bomb_idle';
    if (isTelegraphing) {
      frameKey = Math.sin(animTime * 28) > 0 ? 'bomb_flash' : 'bomb_warm';
    } else if (fuseTimer < 1.5) {
      frameKey = Math.sin(animTime * 10) > 0 ? 'bomb_warm' : 'bomb_idle';
    }

    const bombImg = this.fxImages[frameKey] || this.fxImages['bomb_idle'];
    if (bombImg && bombImg.complete && bombImg.naturalWidth > 0) {
      const size = 28 * scale;
      ctx.drawImage(bombImg, cx - size / 2, cy - size / 2, size, size);
      ctx.restore();
      return;
    }

    // Vector fallback
    const isFlashing = isTelegraphing && Math.sin(animTime * 28) > 0;
    ctx.fillStyle = isFlashing ? '#ef4444' : '#0a0a0b';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isFlashing ? '#fca5a5' : '#242428';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Draw directional connected pixel-art explosion beam segments (center, horizontal, vertical, ends)
  public static drawExplosionSegment(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    direction: string,
    animTime: number
  ): void {
    const x = gx * TILE_SIZE;
    const y = gy * TILE_SIZE;
    const flicker = 0.90 + 0.10 * Math.sin(animTime * 36);

    ctx.save();
    ctx.globalAlpha = flicker;

    let fxKey = 'exp_center';
    if (direction === 'horizontal') fxKey = 'exp_horizontal';
    else if (direction === 'vertical') fxKey = 'exp_vertical';
    else if (direction === 'end_up') fxKey = 'exp_end_up';
    else if (direction === 'end_down') fxKey = 'exp_end_down';
    else if (direction === 'end_left') fxKey = 'exp_end_left';
    else if (direction === 'end_right') fxKey = 'exp_end_right';

    const expImg = this.fxImages[fxKey];
    if (expImg && expImg.complete && expImg.naturalWidth > 0) {
      ctx.drawImage(expImg, x, y, TILE_SIZE, TILE_SIZE);
      ctx.restore();
      return;
    }

    const outerColor = '#ea580c';
    const midColor = '#facc15';
    const coreColor = '#ffffff';

    if (direction === 'horizontal') {
      ctx.fillStyle = outerColor;
      ctx.fillRect(x, y + 4, TILE_SIZE, TILE_SIZE - 8);
      ctx.fillStyle = midColor;
      ctx.fillRect(x, y + 10, TILE_SIZE, TILE_SIZE - 20);
      ctx.fillStyle = coreColor;
      ctx.fillRect(x, y + 17, TILE_SIZE, TILE_SIZE - 34);
    } else if (direction === 'vertical') {
      ctx.fillStyle = outerColor;
      ctx.fillRect(x + 4, y, TILE_SIZE - 8, TILE_SIZE);
      ctx.fillStyle = midColor;
      ctx.fillRect(x + 10, y, TILE_SIZE - 20, TILE_SIZE);
      ctx.fillStyle = coreColor;
      ctx.fillRect(x + 17, y, TILE_SIZE - 34, TILE_SIZE);
    } else {
      ctx.fillStyle = outerColor;
      ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = midColor;
      ctx.fillRect(x + 10, y + 10, TILE_SIZE - 20, TILE_SIZE - 20);
      ctx.fillStyle = coreColor;
      ctx.fillRect(x + 16, y + 16, TILE_SIZE - 32, TILE_SIZE - 32);
    }

    ctx.restore();
  }

  // Draw crisp dedicated Power-Up icon (compact 28x28 pickup inside 48px cell)
  public static drawPowerUp(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    type: PowerUpType,
    animTime: number
  ): void {
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const bobY = gy * TILE_SIZE + TILE_SIZE / 2 + Math.sin(animTime * 5) * 2.5;
    const iconSize = 28;
    const halfIcon = iconSize / 2;

    const iconImg = this.powerUpImages[type];
    if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
      ctx.save();
      ctx.drawImage(iconImg, cx - halfIcon, bobY - halfIcon, iconSize, iconSize);
      ctx.restore();
      return;
    }

    if (this.powerupsSheetImg && this.powerupsSheetImg.complete && this.powerupsSheetImg.naturalWidth > 0) {
      const img = this.powerupsSheetImg;
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
      ctx.drawImage(img, col * w, row * h, w, h, cx - halfIcon, bobY - halfIcon, iconSize, iconSize);
      ctx.restore();
      return;
    }

    // Fallback badge
    ctx.save();
    ctx.fillStyle = '#121214';
    ctx.beginPath();
    ctx.arc(cx, bobY, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#242428';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
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

  // Draw Bomberman Character with authentic 2:3 sprite proportions (36x54) towering over tiles & bombs
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
    animTime: number,
    isCursed: boolean = false,
    isWinner: boolean = false
  ): void {
    if (!alive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#8E8E93';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (isInvincible && !isWinner && Math.floor(animTime * 15) % 2 === 0) {
      return;
    }

    ctx.save();

    const bounce = isWinner
      ? Math.abs(Math.sin(animTime * 10)) * 5
      : (isMoving ? Math.abs(Math.sin(animTime * 14)) * 1.2 : 0);
    const py = y - bounce;

    // Ground Shadow under boots
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y + 13, 16, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield ring (tall ellipse around hero silhouette, solid alpha)
    if (hasShield) {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.beginPath();
      ctx.ellipse(x, py - 18, 25, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Skull curse indicator ring
    if (isCursed) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, py - 18, 23, 31, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crop from animated 9x6 characters sprite sheet (heroic 44x66 proportions, zero collision impact)
    if (this.charactersImg && this.charactersImg.complete && this.charactersImg.naturalWidth > 0) {
      const img = this.charactersImg;
      const colWidth = img.naturalWidth / 9;
      const rowHeight = img.naturalHeight / 6;

      let row = 0;
      if (color.includes('ef4444') || color.includes('red')) row = 0;
      else if (color.includes('3b82f6') || color.includes('blue')) row = 1;
      else if (color.includes('10b981') || color.includes('green')) row = 2;
      else if (color.includes('f59e0b') || color.includes('yellow')) row = 3;
      else if (color.includes('8b5cf6') || color.includes('purple')) row = 4;
      else row = 5;

      // Cols: 0=front_idle, 1=front_w1, 2=front_w2, 3=side_idle, 4=side_w1, 5=back_idle, 6=back_w1, 7=back_w2, 8=victory
      let col = 0;
      const step = Math.floor(animTime * 9) % 4;
      if (isWinner) {
        col = 8;
      } else if (facing === 'down') {
        col = !isMoving ? 0 : (step === 0 ? 1 : step === 2 ? 2 : 0);
      } else if (facing === 'up') {
        col = !isMoving ? 5 : (step === 0 ? 6 : step === 2 ? 7 : 5);
      } else {
        col = !isMoving ? 3 : (Math.floor(animTime * 9) % 2 === 0 ? 4 : 3);
      }

      const flip = !isWinner && facing === 'left';

      ctx.save();
      ctx.translate(x, py);
      if (flip) ctx.scale(-1, 1);

      ctx.drawImage(
        img,
        col * colWidth,
        row * rowHeight,
        colWidth,
        rowHeight,
        -22,
        -51,
        44,
        66
      );
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, py, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 12, py + 5, 24, 5);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, py - 15, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      let visorX = x;
      let visorY = py - 16;
      if (facing === 'left') visorX -= 5;
      else if (facing === 'right') visorX += 5;
      else if (facing === 'up') visorY -= 4;
      else if (facing === 'down') visorY += 1;

      ctx.beginPath();
      ctx.ellipse(visorX, visorY, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, py - 32, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name tag cleanly above helmet in JetBrains Mono
    const label = isCursed ? `${name.substring(0, 8)} [INV]` : name.substring(0, 12);
    ctx.beginPath();
    ctx.fillStyle = '#121214';
    ctx.roundRect(x - 42, py - 63, 84, 13, 3);
    ctx.fill();
    ctx.strokeStyle = isCursed ? '#a855f7' : '#242428';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isCursed ? '#d8b4fe' : '#F4F4F5';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, py - 56.5);

    ctx.restore();
  }

  // Draw clean avatar preview for lobby selection
  public static drawAvatarPreview(canvas: HTMLCanvasElement, colorHex: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let row = 0;
    const c = colorHex.toLowerCase();
    if (c.includes('ef4444') || c.includes('red')) row = 0;
    else if (c.includes('3b82f6') || c.includes('blue')) row = 1;
    else if (c.includes('10b981') || c.includes('green')) row = 2;
    else if (c.includes('f59e0b') || c.includes('yellow')) row = 3;
    else if (c.includes('8b5cf6') || c.includes('purple')) row = 4;
    else row = 5;

    // Dark ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 7, w * 0.35, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.charactersImg && this.charactersImg.complete && this.charactersImg.naturalWidth > 0) {
      const img = this.charactersImg;
      const colWidth = img.naturalWidth / 9;
      const rowHeight = img.naturalHeight / 6;

      const targetH = Math.round(h - 12);
      const targetW = Math.round(targetH * (2 / 3));
      const dx = Math.round((w - targetW) / 2);
      const dy = Math.round((h - targetH) / 2 - 3);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, row * rowHeight, colWidth, rowHeight, dx, dy, targetW, targetH);
    } else {
      ctx.fillStyle = colorHex;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw celebratory victory avatar for end-of-game winner spotlight
  public static drawVictoryAvatar(canvas: HTMLCanvasElement, colorHex: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let row = 0;
    const c = colorHex.toLowerCase();
    if (c.includes('ef4444') || c.includes('red')) row = 0;
    else if (c.includes('3b82f6') || c.includes('blue')) row = 1;
    else if (c.includes('10b981') || c.includes('green')) row = 2;
    else if (c.includes('f59e0b') || c.includes('yellow')) row = 3;
    else if (c.includes('8b5cf6') || c.includes('purple')) row = 4;
    else row = 5;

    // Golden victory base halo
    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 8, w * 0.40, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 8, w * 0.32, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.charactersImg && this.charactersImg.complete && this.charactersImg.naturalWidth > 0) {
      const img = this.charactersImg;
      const colWidth = img.naturalWidth / 9;
      const rowHeight = img.naturalHeight / 6;

      // Col 8 is victory frame (hands raised in celebration)
      const targetH = Math.round(h - 10);
      const targetW = Math.round(targetH * (2 / 3));
      const dx = Math.round((w - targetW) / 2);
      const dy = Math.round((h - targetH) / 2 - 3);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 8 * colWidth, row * rowHeight, colWidth, rowHeight, dx, dy, targetW, targetH);
    } else {
      ctx.fillStyle = colorHex;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 4, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
