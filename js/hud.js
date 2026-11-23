// Interfaz en pantalla.
import { ARENA } from './util.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.cross = $('crosshair');
    this.hitEl = $('hitmarker');
    this.reloadBar = $('reloadbar');
    this.vig = $('vignette');
    this.dmgDir = $('dmgdir');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.feedEl = $('feed');
    this.map = $('minimap').getContext('2d');
    this.mapBg = null;
    this.hitT = 0; this.vigT = 0; this.dirT = 0; this.toastT = 0; this.dirAngle = 0;
    this.promptText = '';
    this.last = {};
  }

  start(game) {
    this.game = game;
    this.el.classList.remove('hidden');
    $('buildbar').classList.toggle('hidden', game.mode !== 'build');
    this.feedEl.innerHTML = '';
    this.last = {};
    this.hitT = this.vigT = this.dirT = this.toastT = 0;
    const slots = $('slots');
    slots.innerHTML = '';
    game.player.weapons.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `${i + 1}<b>${w.def.short}</b>`;
      slots.appendChild(d);
    });
    this.slotEls = [...slots.children];
    this.pieceEls = [...document.querySelectorAll('#buildbar .piece')];
    $('keys').innerHTML = game.mode === 'build'
      ? 'C agacharse · Mayús+C deslizarse · R recargar · Q/F/Z construir · clic der. salir de construcción'
      : 'C agacharse · Mayús+C deslizarse · R recargar · clic der. apuntar';
    this.bakeMap(game.world);
  }

  hide() { this.el.classList.add('hidden'); }

  set(id, value) {
    if (this.last[id] === value) return;
    this.last[id] = value;
    $(id).textContent = value;
  }

  bakeMap(world) {
    const c = document.createElement('canvas');
    c.width = c.height = 170;
    const g = c.getContext('2d'), k = 170 / (ARENA * 2);
    g.fillStyle = '#6d4d42';
    g.fillRect(0, 0, 170, 170);
    for (const b of world.boxes) {
      if (b.piece || b.max.y > 30) continue;
      g.fillStyle = b.max.y >= 2.5 ? '#2a1d2c' : '#4a3438';
      g.fillRect((b.min.x + ARENA) * k, (b.min.z + ARENA) * k, Math.max(1.5, (b.max.x - b.min.x) * k), Math.max(1.5, (b.max.z - b.min.z) * k));
    }
    this.mapBg = c;
  }

  hitmarker(head, kill) {
    this.hitT = kill ? 0.4 : 0.18;
    this.hitEl.className = kill ? 'kill' : head ? 'head' : '';
  }

  hurt(amount, angle) {
    this.vigT = Math.min(1, this.vigT + 0.35 + amount * 0.02);
    if (angle !== null) { this.dirT = 1; this.dirAngle = angle; }
  }

  prompt(html) {
    if (html === this.promptText) return;
    this.promptText = html;
    if (html) this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('on', !!html);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastT = 1.6;
  }

  feed(html, mine) {
    const d = document.createElement('div');
    d.innerHTML = html;
    if (mine) d.className = 'me';
    this.feedEl.prepend(d);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  update(dt) {
    const g = this.game, p = g.player, w = p.weapon;
    this.set('healthnum', Math.ceil(Math.max(0, p.health)));
    this.set('shieldnum', Math.ceil(p.shield));
    $('healthfill').style.width = Math.max(0, p.health) + '%';
    $('shieldfill').style.width = p.shield + '%';
    $('healthfill').parentElement.classList.toggle('low', p.health <= 30);
    this.set('ammomag', w.mag);
    this.set('ammores', '/ ' + w.reserve);
    $('ammo').classList.toggle('empty', w.mag === 0);
    this.set('weaponname', p.buildType ? 'Emisor de placas' : w.def.name);
    this.slotEls.forEach((el, i) => el.classList.toggle('on', i === p.slot && !p.buildType));
    this.set('alive', g.aliveCount);
    this.set('kills', p.kills);
    if (g.mode === 'build') {
      this.set('matsnum', p.mats);
      $('mats').classList.toggle('low', p.mats < 10);
      this.pieceEls.forEach((el) => el.classList.toggle('on', el.dataset.type === p.buildType));
    }

    // Mira
    this.cross.classList.toggle('build', !!p.buildType);
    const pxPerDeg = innerHeight / g.camera.fov;
    this.cross.style.setProperty('--gap', (4 + p.spread * pxPerDeg).toFixed(1) + 'px');
    this.hitT = Math.max(0, this.hitT - dt);
    this.hitEl.style.opacity = Math.min(1, this.hitT * 8);
    if (p.reloading && !p.buildType) {
      this.reloadBar.style.opacity = 1;
      this.reloadBar.firstElementChild.style.width = (100 * p.reloadT / w.def.reload) + '%';
    } else this.reloadBar.style.opacity = 0;

    // Daño
    this.vigT = Math.max(0, this.vigT - dt * 1.4);
    const low = p.alive && p.health <= 30 ? 0.25 + 0.1 * Math.sin(performance.now() * 0.006) : 0;
    this.vig.style.opacity = Math.max(this.vigT, low);
    this.dirT = Math.max(0, this.dirT - dt * 1.2);
    this.dmgDir.style.opacity = this.dirT;
    if (this.dirT > 0) this.dmgDir.style.transform = `rotate(${this.dirAngle}rad)`;

    this.toastT = Math.max(0, this.toastT - dt);
    this.toastEl.style.opacity = Math.min(1, this.toastT * 2);

    // Anillo
    const z = g.zone, out = p.alive && z.outside(p.body.x, p.body.z);
    $('zonewarn').classList.toggle('on', out);
    $('zoneinfo').classList.toggle('closing', z.closing);
    this.set('zonelabel', z.done ? 'Anillo cerrado' : z.closing ? 'El anillo se cierra' : 'Se cierra en');
    const s = Math.max(0, Math.ceil(z.timer));
    this.set('zonetime', z.done ? '' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));

    this.drawMap();
  }

  drawMap() {
    const g = this.game, c = this.map, k = 170 / (ARENA * 2), p = g.player, z = g.zone;
    c.drawImage(this.mapBg, 0, 0);
    if (g.build) {
      c.fillStyle = '#b48cff';
      for (const pc of g.build.pieces.values()) c.fillRect((pc.mesh.position.x + ARENA) * k - 1.5, (pc.mesh.position.z + ARENA) * k - 1.5, 3, 3);
    }
    c.fillStyle = '#ffb347';
    for (const pod of g.items.pods) if (!pod.open) c.fillRect((pod.x + ARENA) * k - 1.5, (pod.z + ARENA) * k - 1.5, 3, 3);
    // Zona: oscurecer fuera
    c.save();
    c.beginPath();
    c.rect(0, 0, 170, 170);
    c.arc((z.x + ARENA) * k, (z.z + ARENA) * k, Math.max(0.5, z.radius * k), 0, Math.PI * 2, true);
    c.fillStyle = 'rgba(255,70,40,0.35)';
    c.fill('evenodd');
    c.restore();
    c.strokeStyle = '#ffb08a'; c.lineWidth = 1.5;
    c.beginPath(); c.arc((z.x + ARENA) * k, (z.z + ARENA) * k, Math.max(0.5, z.radius * k), 0, Math.PI * 2); c.stroke();
    if (!z.done) {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.arc((z.x + ARENA) * k, (z.z + ARENA) * k, Math.max(0.5, z.nextRadius * k), 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    // Jugador
    c.save();
    c.translate((p.body.x + ARENA) * k, (p.body.z + ARENA) * k);
    c.rotate(-p.yaw);
    c.fillStyle = '#2de2c8'; c.strokeStyle = '#06241f'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }
}
