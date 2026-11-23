// El anillo: zona segura circular que se va cerrando por fases.
import * as THREE from 'three';
import { lerp } from './util.js';

const PHASES = [
  { hold: 45, shrink: 35, r: 60, dps: 2 },
  { hold: 30, shrink: 30, r: 32, dps: 4 },
  { hold: 22, shrink: 25, r: 14, dps: 7 },
  { hold: 12, shrink: 20, r: 1, dps: 12 },
];

export class Zone {
  constructor(game, x, z) {
    this.game = game;
    this.x = x; this.z = z;
    this.radius = 150;
    this.from = 150;
    this.phase = 0;
    this.closing = false;
    this.timer = PHASES[0].hold;
    this.dps = 1;
    this.tick = 0;
    this.done = false;

    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 90, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.wall.position.set(x, 44, z);
    this.wall.renderOrder = 3;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.992, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(x, 0.06, z);
    game.scene.add(this.wall, this.ring);
    this.apply();
  }

  apply() {
    this.wall.scale.set(this.radius, 1, this.radius);
    this.ring.scale.set(this.radius, this.radius, 1);
  }

  outside(x, z) {
    return Math.hypot(x - this.x, z - this.z) > this.radius;
  }

  get nextRadius() { return this.done ? this.radius : PHASES[this.phase].r; }

  update(dt) {
    if (!this.done) {
      const ph = PHASES[this.phase];
      this.timer -= dt;
      if (this.closing) {
        const t = 1 - Math.max(0, this.timer) / ph.shrink;
        this.radius = lerp(this.from, ph.r, t);
        if (this.timer <= 0) {
          this.radius = ph.r;
          this.closing = false;
          this.phase++;
          if (this.phase >= PHASES.length) this.done = true;
          else this.timer = PHASES[this.phase].hold;
        }
      } else if (this.timer <= 0) {
        this.closing = true;
        this.from = this.radius;
        this.timer = ph.shrink;
        this.dps = ph.dps;
        this.game.sfx.zone();
        this.game.hud.toast('¡El anillo se cierra!');
      }
      this.apply();
    }
    this.wall.material.opacity = 0.17 + 0.05 * Math.sin(performance.now() * 0.003);

    this.tick += dt;
    if (this.tick >= 1) {
      this.tick -= 1;
      for (const a of this.game.actors) {
        if (a.alive && this.outside(a.body.x, a.body.z)) this.game.damageActor(a, this.dps, null, false, null);
      }
    }
  }
}
