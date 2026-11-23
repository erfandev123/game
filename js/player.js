// Jugador: movimiento (correr, saltar, agacharse, deslizarse), cámara, armas y construcción.
import * as THREE from 'three';
import { Body, moveBody, canFit } from './physics.js';
import { Character } from './character.js';
import { WEAPONS, ORDER } from './weapons.js';
import { clamp, damp, DIRS } from './util.js';
import { shoot, spreadDir } from './combat.js';
import { COST } from './build.js';

const RUN = 5.6, SPRINT = 8.5, CROUCH = 2.9, ADS = 3.4;
const GRAV_UP = 24, GRAV_DOWN = 32, JUMP = 8.8;
const STAND_H = 1.8, CROUCH_H = 1.15;

const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _pivot = new THREE.Vector3();
const _shoulder = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _d = new THREE.Vector3();

export class Player {
  constructor(game, spawn) {
    this.game = game;
    this.isPlayer = true;
    this.name = 'TÚ';
    this.body = new Body(spawn.x, 0, spawn.z);
    this.yaw = Math.atan2(spawn.x, spawn.z); // mirando al centro del mapa
    this.pitch = 0;
    this.recoil = 0;
    this.health = 100;
    this.shield = 50;
    this.alive = true;
    this.kills = 0;
    this.mats = 150;

    this.weapons = ORDER.map((id) => ({ def: WEAPONS[id], mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve }));
    this.slot = 0;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.bloom = 0;
    this.kick = 0;
    this.ads = false;
    this.spread = 1;

    this.buildType = null;
    this.buildCd = 0;

    this.crouching = false;
    this.sliding = false;
    this.sprinting = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.slideBuf = 0;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.airT = 0;
    this.noSprint = 0;

    this.char = new Character({ body: 0xe9e4ee, accent: 0x2de2c8, visor: 0xa8fff2 });
    for (const id of ORDER) this.char.addGun(WEAPONS[id].kind);
    this.char.setGun(this.weapons[0].def.kind);
    game.scene.add(this.char.root);

    this.eyeH = 1.62;
    this.camDist = 3.5;
    this.camDir = new THREE.Vector3(0, 0, -1);
    this.aimOrigin = new THREE.Vector3();
    this.deadT = 0;
  }

  get weapon() { return this.weapons[this.slot]; }

  update(dt) {
    if (!this.alive) { this.updateDeadCamera(dt); return; }
    const g = this.game, inp = g.input, b = this.body, world = g.world;

    // --- Mirar ---
    const sens = 0.0022 * (this.ads ? 0.65 : 1);
    this.yaw -= inp.dx * sens;
    this.pitch = clamp(this.pitch - inp.dy * sens, -1.35, 1.35);
    this.recoil = damp(this.recoil, 0, 9, dt);

    this.cooldown -= dt; this.buildCd -= dt; this.slideCd -= dt; this.noSprint -= dt;
    this.jumpBuf -= dt; this.slideBuf -= dt; this.coyote -= dt;
    this.kick = Math.max(0, this.kick - dt * 9);

    // --- Dirección deseada ---
    let ix = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    let iz = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wx = fx * iz + rx * ix, wz = fz * iz + rz * ix;
    const crouchHeld = inp.down('KeyC') || inp.down('ControlLeft');
    const crouchHit = inp.hit('KeyC') || inp.hit('ControlLeft');
    const wantSprint = inp.down('ShiftLeft') && iz > 0.1 && !this.ads && this.noSprint <= 0;
    let speedH = Math.hypot(b.vx, b.vz);

    if (inp.hit('Space')) this.jumpBuf = 0.13;
    if (crouchHit) this.slideBuf = 0.2;
    if (b.grounded) { this.coyote = 0.1; this.airT = 0; } else this.airT += dt;

    // --- Deslizamiento ---
    if (!this.sliding && this.slideBuf > 0 && b.grounded && this.slideCd <= 0 && speedH > 6.2) {
      this.sliding = true;
      this.slideT = 0;
      this.slideBuf = 0;
      const s = Math.min(speedH + 3.4, 12.5) / speedH;
      b.vx *= s; b.vz *= s;
      g.sfx.slide();
    }
    if (this.sliding) {
      this.slideT += dt;
      let sp = Math.hypot(b.vx, b.vz) || 0.001;
      let dx = b.vx / sp, dz = b.vz / sp;
      if (il > 0) { // un poco de control de dirección
        dx += wx * 1.6 * dt; dz += wz * 1.6 * dt;
        const n = Math.hypot(dx, dz); dx /= n; dz /= n;
      }
      let acc = -6.5;
      if (b.ramp) { // cuesta abajo acelera, cuesta arriba frena
        const u = DIRS[b.ramp.dir];
        const run = b.ramp.dir % 2 === 0 ? b.ramp.x1 - b.ramp.x0 : b.ramp.z1 - b.ramp.z0;
        acc -= (dx * u.x + dz * u.z) * (b.ramp.rise / run) * 18;
      }
      sp = clamp(sp + acc * dt, 0, 15);
      b.vx = dx * sp; b.vz = dz * sp;
      if (sp < 3 || (!crouchHeld && this.slideT > 0.3) || this.airT > 0.15 || b.hitWall) this.endSlide();
    }

    // --- Agacharse / correr ---
    if (!this.sliding) {
      this.crouching = crouchHeld;
      if (!this.crouching && b.h < STAND_H && !canFit(b, world, STAND_H)) this.crouching = true; // no cabe de pie
      this.sprinting = wantSprint && !this.crouching && il > 0;
      const target = this.crouching ? CROUCH : this.ads ? ADS : this.sprinting ? SPRINT : RUN;
      if (b.grounded) {
        const tx = wx * target, tz = wz * target;
        const ex = tx - b.vx, ez = tz - b.vz, e = Math.hypot(ex, ez), a = (il > 0 ? 55 : 45) * dt;
        if (e <= a) { b.vx = tx; b.vz = tz; } else { b.vx += (ex / e) * a; b.vz += (ez / e) * a; }
      } else if (il > 0) {
        const cap = Math.max(speedH, target);
        b.vx += wx * 20 * dt; b.vz += wz * 20 * dt;
        const n = Math.hypot(b.vx, b.vz);
        if (n > cap) { b.vx *= cap / n; b.vz *= cap / n; }
      }
    } else this.sprinting = false;

    // --- Salto ---
    if (this.jumpBuf > 0 && this.coyote > 0 && canFit(b, world, STAND_H)) {
      if (this.sliding) this.endSlide();
      this.crouching = false;
      b.vy = JUMP;
      b.grounded = false;
      this.jumpBuf = 0; this.coyote = 0;
      g.sfx.jump();
    }

    b.h = this.crouching || this.sliding ? CROUCH_H : STAND_H;
    b.vy = Math.max(-45, b.vy - (b.vy > 0 ? GRAV_UP : GRAV_DOWN) * dt);
    const wasGrounded = b.grounded, vyIn = b.vy;
    moveBody(b, world, dt);
    if (!wasGrounded && b.grounded && vyIn < -9) g.sfx.land();
    speedH = Math.hypot(b.vx, b.vz);

    this.updateCamera(dt);
    this.updateActions(dt, speedH);

    // --- Animación ---
    const ch = this.char, w = this.weapon;
    ch.root.position.set(b.x, b.y, b.z);
    ch.root.rotation.y = this.yaw;
    ch.root.visible = this.camDist > 0.75;
    const mvF = speedH > 0.1 ? (b.vx * fx + b.vz * fz) / speedH : 0;
    const mvS = speedH > 0.1 ? (b.vx * rx + b.vz * rz) / speedH : 0;
    ch.update(dt, {
      speed: speedH, fwd: mvF, strafe: mvS, grounded: b.grounded || this.airT < 0.08,
      crouch: this.crouching, slide: this.sliding, sprint: this.sprinting,
      pitch: this.pitch + this.recoil, kick: this.kick,
      reloadT: this.reloading ? this.reloadT / w.def.reload : -1, build: !!this.buildType,
    });
    if (ch.stepped) g.sfx.step(this.crouching ? 0.4 : 1);
  }

  endSlide() {
    this.sliding = false;
    this.slideCd = 0.45;
  }

  updateCamera(dt) {
    const g = this.game, b = this.body, cam = g.camera, world = g.world;
    this.eyeH = damp(this.eyeH, this.sliding ? 0.95 : this.crouching ? 1.15 : 1.62, 12, dt);
    const vp = clamp(this.pitch + this.recoil, -1.45, 1.45), cy = Math.cos(vp);
    _dir.set(-Math.sin(this.yaw) * cy, Math.sin(vp), -Math.cos(this.yaw) * cy);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const side = this.ads ? 0.85 : 0.72;
    const want = this.ads ? 2.3 : this.buildType ? 4.3 : this.sliding ? 3.9 : 3.5;
    _pivot.set(b.x, b.y + this.eyeH, b.z);

    // Hombro: no atravesar paredes hacia el lado.
    let s = side;
    const hs = world.raycast(_pivot.x, _pivot.y, _pivot.z, _right.x, 0, _right.z, side + 0.25);
    if (hs) s = Math.max(0, hs.t - 0.25);
    _shoulder.copy(_pivot).addScaledVector(_right, s);
    _shoulder.y += 0.22;

    // Hacia atrás: acercar la cámara si hay algo detrás.
    let maxD = want;
    const hb = world.raycast(_shoulder.x, _shoulder.y, _shoulder.z, -_dir.x, -_dir.y, -_dir.z, want + 0.3);
    if (hb) maxD = Math.max(0.3, hb.t - 0.3);
    this.camDist = maxD < this.camDist ? maxD : damp(this.camDist, maxD, 8, dt);
    cam.position.copy(_shoulder).addScaledVector(_dir, -this.camDist);
    cam.rotation.set(vp, this.yaw, 0, 'YXZ');

    const fov = this.ads ? 50 : this.sliding ? 80 : this.sprinting ? 77 : 72;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }

    this.camDir.copy(_dir);
    this.aimOrigin.copy(cam.position).addScaledVector(_dir, this.camDist);
  }

  updateDeadCamera(dt) {
    this.deadT += dt;
    const cam = this.game.camera, b = this.body, a = this.yaw + this.deadT * 0.25;
    cam.position.set(b.x + Math.sin(a) * 7, b.y + 4.5, b.z + Math.cos(a) * 7);
    cam.lookAt(b.x, b.y + 1, b.z);
  }

  selectSlot(i) {
    if (i === this.slot && !this.buildType) return;
    this.buildType = null;
    if (i !== this.slot) {
      this.slot = i;
      this.reloading = false;
      this.bloom = 0;
      this.cooldown = Math.max(this.cooldown, 0.22);
      this.char.setGun(this.weapon.def.kind);
    }
  }

  startReload() {
    const w = this.weapon;
    if (this.reloading || w.mag >= w.def.mag || w.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.game.sfx.reloadStart();
  }

  updateActions(dt, speedH) {
    const g = this.game, inp = g.input, b = this.body;

    // Cambio de arma / pieza
    if (inp.hit('Digit1')) this.selectSlot(0);
    if (inp.hit('Digit2')) this.selectSlot(1);
    if (inp.hit('Digit3')) this.selectSlot(2);
    if (inp.wheel) this.selectSlot((this.slot + (inp.wheel > 0 ? 1 : 2)) % 3);
    if (g.build) {
      if (inp.hit('KeyQ')) this.buildType = 'wall';
      if (inp.hit('KeyF')) this.buildType = 'ramp';
      if (inp.hit('KeyZ')) this.buildType = 'floor';
      if (this.buildType && inp.mousePressed[2]) this.buildType = null;
    }

    const w = this.weapon, def = w.def;
    this.ads = inp.mouse[2] && !this.buildType && !this.sliding;

    // Recarga (sigue aunque se construya)
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= def.reload) {
        const n = Math.min(def.mag - w.mag, w.reserve);
        w.mag += n; w.reserve -= n;
        this.reloading = false;
        g.sfx.reloadEnd();
      }
    }

    // Dispersión actual
    this.bloom = Math.max(0, this.bloom - def.recover * dt);
    let spread = def.spread + this.bloom;
    if (def.pellets === 1) {
      spread += !b.grounded ? 1.6 : this.sliding ? 0.9 : speedH > 6.5 ? 0.7 : speedH > 1 ? 0.25 : 0;
      if (this.ads) spread *= 0.5;
      if (this.crouching) spread *= 0.75;
    } else if (this.ads) spread *= 0.8;
    this.spread = spread;

    // Interacción
    const pod = g.items.nearestPod(b);
    g.hud.prompt(pod ? '<kbd>E</kbd> Abrir cápsula de suministro' : '');
    if (pod && inp.hit('KeyE')) g.items.openPod(pod);

    if (this.buildType) {
      const pl = g.build.computePlacement(this.buildType, b.x, b.y, b.z, this.yaw, this.pitch, b.ramp);
      const ok = pl.valid && this.mats >= COST;
      g.build.showGhost(pl, ok);
      if (inp.mouse[0] && ok && this.buildCd <= 0) {
        g.build.place(pl, this);
        this.mats -= COST;
        this.buildCd = 0.1;
      }
      return;
    }
    if (g.build) g.build.hideGhost();

    if (inp.hit('KeyR')) this.startReload();
    if (inp.mouse[0] && this.cooldown <= 0 && !this.reloading) {
      if (w.mag > 0) this.fire(w, def, spread);
      else if (w.reserve > 0) this.startReload();
      else if (inp.mousePressed[0]) g.sfx.dry();
    }
  }

  fire(w, def, spread) {
    const g = this.game;
    w.mag--;
    this.cooldown = def.interval;
    this.noSprint = 0.25;
    this.char.muzzleWorld(_muzzle);
    for (let i = 0; i < def.pellets; i++) {
      spreadDir(this.camDir, spread, _d);
      shoot(g, this, this.aimOrigin, _d, def, _muzzle, 1);
    }
    this.bloom = Math.min(def.bloomMax, this.bloom + def.bloom);
    this.recoil += def.kick * (this.ads ? 0.7 : 1);
    this.yaw += (Math.random() - 0.5) * def.kick * 0.5;
    this.kick = 1;
    this.char.flash();
    g.sfx.shot(def.kind, 1);
    if (w.mag === 0 && w.reserve > 0) this.startReload();
  }

  die() {
    this.char.root.visible = false;
    if (this.game.build) this.game.build.hideGhost();
  }
}
