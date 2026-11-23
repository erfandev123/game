// Teclado y ratón. `pressed` / `mousePressed` solo duran un fotograma.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyC', 'ControlLeft', 'KeyR', 'KeyE',
  'KeyQ', 'KeyF', 'KeyZ', 'Digit1', 'Digit2', 'Digit3', 'Tab',
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = [false, false, false];
    this.mousePressed = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.enabled = false; // solo durante la partida
    this.locked = false;  // puntero capturado
    this.freeLook = false; // modo de pruebas sin captura de puntero

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button > 2) return;
      this.mouse[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button <= 2) this.mouse[e.button] = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || !(this.locked || this.freeLook)) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });
    addEventListener('wheel', (e) => {
      if (this.enabled) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.clear());
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.fill(false);
    this.mousePressed.fill(false);
    this.dx = this.dy = this.wheel = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.fill(false);
    this.dx = this.dy = this.wheel = 0;
  }
}
