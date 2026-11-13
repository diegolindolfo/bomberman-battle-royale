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

    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');

    const resetJoystickVisual = () => {
      joystickZone?.classList.remove('active');
      if (joystickKnob) {
        joystickKnob.style.transform = 'translate(0px, 0px)';
      }
    };

    const resetAll = () => {
      this.keys = {};
      this.bombPressed = false;
      this.touchDx = 0;
      this.touchDy = 0;
      this.touchBomb = false;
      resetJoystickVisual();
    };

    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetAll();
    });

    this.bindTouchControls(joystickZone, joystickKnob, resetJoystickVisual);
  }

  private bindTouchControls(
    joystickZone: HTMLElement | null,
    joystickKnob: HTMLElement | null,
    resetJoystickVisual: () => void
  ): void {
    const setJoystickFromPoint = (clientX: number, clientY: number) => {
      if (!joystickZone) return;
      const rect = joystickZone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dxPx = clientX - cx;
      const dyPx = clientY - cy;
      const dist = Math.hypot(dxPx, dyPx);
      const maxRadius = Math.max(26, rect.width * 0.28);

      // Move visual knob smoothly in 360 degrees clamped to outer ring
      if (joystickKnob) {
        const clamped = Math.min(dist, maxRadius);
        const angle = Math.atan2(dyPx, dxPx);
        const kx = dist > 0.5 ? Math.cos(angle) * clamped : 0;
        const ky = dist > 0.5 ? Math.sin(angle) * clamped : 0;
        joystickKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
      }

      joystickZone.classList.add('active');

      // Deadzone & responsive primary-axis grid mapping (pairs seamlessly with corner-rounding)
      if (dist < 10) {
        this.touchDx = 0;
        this.touchDy = 0;
      } else if (Math.abs(dxPx) >= Math.abs(dyPx)) {
        this.touchDx = dxPx > 0 ? 1 : -1;
        this.touchDy = 0;
      } else {
        this.touchDx = 0;
        this.touchDy = dyPx > 0 ? 1 : -1;
      }
    };

    const clearJoystick = () => {
      this.touchDx = 0;
      this.touchDy = 0;
      resetJoystickVisual();
    };

    if (joystickZone) {
      let activeTouchId: number | null = null;
      let mouseDragging = false;

      joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeTouchId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          activeTouchId = t.identifier;
          setJoystickFromPoint(t.clientX, t.clientY);
        }
      }, { passive: false });

      joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchId) {
            setJoystickFromPoint(t.clientX, t.clientY);
            break;
          }
        }
      }, { passive: false });

      const handleTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            e.preventDefault();
            activeTouchId = null;
            clearJoystick();
            break;
          }
        }
      };

      joystickZone.addEventListener('touchend', handleTouchEnd, { passive: false });
      joystickZone.addEventListener('touchcancel', handleTouchEnd, { passive: false });

      joystickZone.addEventListener('mousedown', (e) => {
        e.preventDefault();
        mouseDragging = true;
        setJoystickFromPoint(e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', (e) => {
        if (mouseDragging) setJoystickFromPoint(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', () => {
        if (mouseDragging) {
          mouseDragging = false;
          clearJoystick();
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
