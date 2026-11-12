import { PlayerInput } from '../../shared/types.js';

export class InputHandler {
  private keys: Record<string, boolean> = {};
  private bombPressed: boolean = false;
  private touchDx: number = 0;
  private touchDy: number = 0;
  private touchBomb: boolean = false;
  private onRestartShortcut?: () => void;

  constructor(onRestartShortcut?: () => void) {
    this.onRestartShortcut = onRestartShortcut;

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (isTextInput || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      this.keys[e.code] = true;
      if (e.code === 'Space' || e.key === ' ' || e.code === 'KeyJ') {
        this.bombPressed = true;
      }
      if (e.code === 'KeyR' && !e.repeat && this.onRestartShortcut) {
        this.onRestartShortcut();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    const resetAll = () => {
      this.keys = {};
      this.bombPressed = false;
      this.touchDx = 0;
      this.touchDy = 0;
      this.touchBomb = false;
    };

    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetAll();
    });

    this.bindTouchControls();
  }

  private bindTouchControls(): void {
    const dpad = document.querySelector('.dpad') as HTMLElement | null;
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    const updateDpadVisuals = (dx: number, dy: number) => {
      btnUp?.classList.toggle('active', dy < 0);
      btnDown?.classList.toggle('active', dy > 0);
      btnLeft?.classList.toggle('active', dx < 0);
      btnRight?.classList.toggle('active', dx > 0);
    };

    const setDpadFromPoint = (clientX: number, clientY: number) => {
      if (!dpad) return;
      const rect = dpad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dxPx = clientX - cx;
      const dyPx = clientY - cy;

      if (Math.hypot(dxPx, dyPx) < 10) {
        this.touchDx = 0;
        this.touchDy = 0;
      } else if (Math.abs(dxPx) >= Math.abs(dyPx)) {
        this.touchDx = dxPx > 0 ? 1 : -1;
        this.touchDy = 0;
      } else {
        this.touchDx = 0;
        this.touchDy = dyPx > 0 ? 1 : -1;
      }
      updateDpadVisuals(this.touchDx, this.touchDy);
    };

    const clearDpad = () => {
      this.touchDx = 0;
      this.touchDy = 0;
      updateDpadVisuals(0, 0);
    };

    if (dpad) {
      let activeTouchId: number | null = null;
      let mouseDragging = false;

      dpad.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeTouchId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          activeTouchId = t.identifier;
          setDpadFromPoint(t.clientX, t.clientY);
        }
      }, { passive: false });

      dpad.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchId) {
            setDpadFromPoint(t.clientX, t.clientY);
            break;
          }
        }
      }, { passive: false });

      const handleTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            e.preventDefault();
            activeTouchId = null;
            clearDpad();
            break;
          }
        }
      };

      dpad.addEventListener('touchend', handleTouchEnd, { passive: false });
      dpad.addEventListener('touchcancel', handleTouchEnd, { passive: false });

      dpad.addEventListener('mousedown', (e) => {
        e.preventDefault();
        mouseDragging = true;
        setDpadFromPoint(e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', (e) => {
        if (mouseDragging) setDpadFromPoint(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', () => {
        if (mouseDragging) {
          mouseDragging = false;
          clearDpad();
        }
      });
    }

    const bombEl = document.getElementById('btn-bomb');
    if (bombEl) {
      let bombTouchId: number | null = null;
      bombEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (bombTouchId === null && e.changedTouches.length > 0) {
          bombTouchId = e.changedTouches[0].identifier;
          this.touchBomb = true;
          bombEl.classList.add('active');
        }
      }, { passive: false });

      const endBombTouch = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === bombTouchId) {
            e.preventDefault();
            bombTouchId = null;
            this.touchBomb = false;
            bombEl.classList.remove('active');
            break;
          }
        }
      };

      bombEl.addEventListener('touchend', endBombTouch, { passive: false });
      bombEl.addEventListener('touchcancel', endBombTouch, { passive: false });

      bombEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.touchBomb = true;
        bombEl.classList.add('active');
      });
      bombEl.addEventListener('mouseup', () => {
        this.touchBomb = false;
        bombEl.classList.remove('active');
      });
      bombEl.addEventListener('mouseleave', () => {
        this.touchBomb = false;
        bombEl.classList.remove('active');
      });
    }
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
