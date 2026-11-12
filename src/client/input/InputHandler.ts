import { PlayerInput } from '../../shared/types.js';

export class InputHandler {
  private keys: Record<string, boolean> = {};
  private bombPressed: boolean = false;
  private touchDx: number = 0;
  private touchDy: number = 0;
  private touchBomb: boolean = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.key === ' ') {
        this.bombPressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.bindTouchControls();
  }

  private bindTouchControls(): void {
    const bindBtn = (id: string, onDown: () => void, onUp: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); onUp(); });
    };

    bindBtn('btn-up', () => { this.touchDy = -1; }, () => { this.touchDy = 0; });
    bindBtn('btn-down', () => { this.touchDy = 1; }, () => { this.touchDy = 0; });
    bindBtn('btn-left', () => { this.touchDx = -1; }, () => { this.touchDx = 0; });
    bindBtn('btn-right', () => { this.touchDx = 1; }, () => { this.touchDx = 0; });
    bindBtn('btn-bomb', () => { this.touchBomb = true; }, () => { this.touchBomb = false; });
  }

  public getInput(): PlayerInput {
    let dx = 0;
    let dy = 0;

    if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;

    // Apply touch input if present
    if (this.touchDx !== 0) dx = this.touchDx;
    if (this.touchDy !== 0) dy = this.touchDy;

    const placeBomb = this.bombPressed || this.touchBomb;
    this.bombPressed = false; // consume single press

    return { dx, dy, placeBomb };
  }
}
