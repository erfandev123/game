// Rivales controlados por la máquina.
import * as THREE from 'three';
import { Body, moveBody, canFit } from './physics.js';
import { Character } from './character.js';
import { WEAPONS } from './weapons.js';
import { clamp, damp, wrapAngle, ARENA } from './util.js';
import { shoot, spreadDir } from './combat.js';
import { COST } from './build.js';

const NAMES = ['KRONO-7', 'VEGA', 'ÁTOMO', 'LINCE', 'NÉBULA', 'TALOS', 'ORCA', 'FARO', 'ZINC', 'DELTA', 'RAYO', 'ÓNIX', 'COBRE', 'MIRLO', 'BRISA', 'QUASAR'];
const ACCENTS = [0xff5a4d, 0xffb347, 0xf4e04d, 0xff7ac8, 0xa6e22e, 0xf2ede4, 0xff8f3c, 0xc084fc, 0xff4d8d, 0xe9c46a];
const KINDS = ['rifle', 'smg', 'shotgun', 'rifle', 'smg'];

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3();

export class Bot {
  constructor(game, i, spawn) {
    this.game = game;
    this.isPlayer = false;
    this.name = NAMES[i % NAMES.length];
    this.body = new Body(spawn.x, 0, spawn.z);
    this.yaw = Math.random() * 6.28;
    this.pitch = 0;
    this.health = 100;
    this.shield = [0, 25, 50][i % 3];
    this.alive = true;
    this.kills = 0;
    this.mats = 120;
    this.def = WEAPONS[KINDS[i % KINDS.length]];
    this.mag = this.def.mag;
    this.reloadT = -1;
    this.cooldown = 0;
    this.burst = 3;
    this.burstPause = 0;
    this.kick = 0;
    this.skill = 0.8 + Math.random() * 0.5; // multiplicador de error (menos = mejor)

    this.char = new Character({ body: 0x6a6272, accent: ACCENTS[i % ACCENTS.length], visor: 0xffd9a8 });
    this.char.addGun(this.def.kind);
    this.char.setGun(this.def.kind);
    game.scene.add(this.char.root);

    this.target = null;
    this.visible = false;       // línea de visión despejada con el objetivo
    this.blockPiece = false;    // tapado solo por una placa ajena
    this.seenT = 0;
    this.react = 0;
    this.dest = null;
    this.destT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.thinkT = Math.random() * 0.3;
    this.stuckT = 0;
    this.avoidT = 0;
    this.avoidDir = 1;
    this.jumpNext = false;
    this.crouch = false;
    this.crouchT = 2 + Math.random() * 4;
    this.wallCd = 0;
    this.rampCd = 0;
    this.climb = 0;
    this.lastHitBy = null;
  }

  los(a) {
    const b = this.body, t = a.body;
    const ox = b.x, oy = b.y + (this.crouch ? 1.0 : 1.5), oz = b.z;
    const dx = t.x - ox, dy = t.y + t.h * 0.65 - oy, dz = t.z - oz;
    const dist = Math.hypot(dx, dy, dz) || 0.001;
    const hit = this.game.world.raycast(ox, oy, oz, dx / dist, dy / dist, dz / dist, dist - 0.2);
    if (!hit) return 1;
    const piece = hit.collider && hit.collider.piece;
    return piece && piece.owner !== this ? 2 : 0;
  }

  think() {
    const g = this.game, b = this.body;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best = null, bs = 1e9;
    for (const a of g.actors) {
      if (a === this || !a.alive) continue;
      const dx = a.body.x - b.x, dz = a.body.z - b.z, d = Math.hypot(dx, dz);
      if (d > (a.isPlayer ? 46 : 24)) continue;
      const facing = (dx * fx + dz * fz) / (d || 1) > -0.2;
      if (!facing && d > 10 && a !== this.lastHitBy) continue;
      if (this.los(a) !== 1) continue;
      const score = d * (a.isPlayer ? 0.8 : 1) * (a === this.target ? 0.7 : 1);
      if (score < bs) { bs = score; best = a; }
    }
    if (best) {
      if (best !== this.target) this.react = 0.55 + Math.random() * 0.6;
      this.target = best;
      this.visible = true;
      this.blockPiece = false;
      this.seenT = 0;
    } else if (this.target) {
      this.visible = false;
      this.blockPiece = this.target.alive && this.los(this.target) === 2;
      if (!this.target.alive || this.seenT > 3) {
        if (this.target.alive) { this.dest = { x: this.target.body.x, z: this.target.body.z }; this.destT = 6; }
        this.target = null;
      }
    }
  }

  pickDest() {
    const z = this.game.zone, r = Math.max(4, Math.min(z.radius, z.nextRadius + 20) * 0.85);
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r;
      const x = clamp(z.x + Math.cos(a) * d, -ARENA + 6, ARENA - 6), zz = clamp(z.z + Math.sin(a) * d, -ARENA + 6, ARENA - 6);
      if (this.game.world.isFree(x, zz, 1)) { this.dest = { x, z: zz }; break; }
    }
    if (!this.dest) this.dest = { x: z.x, z: z.z };
    this.destT = 14;
  }

  update(dt) {
    if (!this.alive) return;
    const g = this.game, b = this.body, world = g.world;
    this.cooldown -= dt; this.wallCd -= dt; this.rampCd -= dt; this.climb -= dt; this.destT -= dt;
    this.seenT += dt;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.2 + Math.random() * 0.1; this.think(); }

    let wx = 0, wz = 0, speed = 0, wantJump = this.jumpNext;
    this.jumpNext = false;
    const zone = g.zone;
    const zx = zone.x - b.x, zz = zone.z - b.z, zd = Math.hypot(zx, zz) || 0.001;
    const outside = zd > zone.radius - 4;
    const t = this.target;

    if (t && t.alive) {
      const dx = t.body.x - b.x, dz = t.body.z - b.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dy = t.body.y + t.body.h * 0.6 - (b.y + 1.45);
      const wantYaw = Math.atan2(-dx, -dz);
      this.yaw += clamp(wrapAngle(wantYaw - this.yaw), -7 * dt, 7 * dt);
      this.pitch = damp(this.pitch, Math.atan2(dy, dist), 10, dt);

      const nx = dx / dist, nz = dz / dist;
      let radial = dist > this.def.ideal + 3 ? 1 : dist < this.def.ideal - 3 ? -0.8 : 0;
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = 0.6 + Math.random() * 1.3;
        this.strafe = Math.random() < 0.15 ? 0 : Math.random() < 0.5 ? -1 : 1;
      }
      let strafe = this.strafe;

      // En modo construcción: rampa para alcanzar a quien está más alto.
      if (g.build && t.body.y - b.y > 2.2 && dist < 16 && b.grounded) {
        if (this.rampCd <= 0 && this.mats >= COST) {
          const pl = g.build.computePlacement('ramp', b.x, b.y, b.z, wantYaw, 0, b.ramp);
          if (pl.valid) { g.build.place(pl, this); this.mats -= COST; this.climb = 1.6; }
          this.rampCd = 0.8;
        }
      }
      if (this.climb > 0) { radial = 1; strafe = 0; }

      wx = nx * radial - nz * strafe * 0.9;
      wz = nz * radial + nx * strafe * 0.9;

      this.crouchT -= dt;
      if (this.crouchT <= 0) {
        this.crouch = !this.crouch && dist > 14 && Math.random() < 0.5;
        this.crouchT = this.crouch ? 1 + Math.random() * 1.5 : 2 + Math.random() * 4;
      }
      speed = this.crouch ? 2.6 : 5;
      if (b.grounded && !this.crouch && Math.random() < 0.22 * dt) wantJump = true;
      this.tryShoot(dt, t, dist, wantYaw);
    } else {
      this.crouch = false;
      if (!this.dest || this.destT <= 0 || Math.hypot(this.dest.x - b.x, this.dest.z - b.z) < 2.5) this.pickDest();
      wx = this.dest.x - b.x; wz = this.dest.z - b.z;
      speed = 5.4;
      this.pitch = damp(this.pitch, 0, 6, dt);
      if (this.reloadT >= 0) this.tickReload(dt);
      else if (this.mag < this.def.mag * 0.5) this.reloadT = 0;
      if (this.seenT > 6 && !outside) this.health = Math.min(100, this.health + 4 * dt); // se repara fuera de combate
    }

    if (outside) { wx = zx / zd; wz = zz / zd; speed = 7.5; this.crouch = false; }

    const wl = Math.hypot(wx, wz);
    if (wl > 0.01) { wx /= wl; wz /= wl; } else speed = 0;

    // Esquivar obstáculos
    if (this.avoidT > 0) {
      this.avoidT -= dt;
      const a = this.avoidDir * 1.25, c = Math.cos(a), s = Math.sin(a);
      const x = wx * c - wz * s; wz = wx * s + wz * c; wx = x;
    } else if (speed > 0 && b.grounded) {
      const hit = world.raycast(b.x, b.y + 0.5, b.z, wx, 0, wz, 1.5);
      if (hit && hit.kind === 'box') {
        const top = hit.collider.max ? hit.collider.max.y - b.y : 99;
        if (top < 1.4) wantJump = true;
        else { this.avoidT = 0.45 + Math.random() * 0.4; this.avoidDir = Math.random() < 0.5 ? -1 : 1; }
      }
    }
    if (!(t && t.alive) && speed > 0) {
      this.yaw += clamp(wrapAngle(Math.atan2(-wx, -wz) - this.yaw), -5 * dt, 5 * dt);
    }

    // Movimiento
    const stand = !this.crouch;
    if (stand && b.h < 1.8 && !canFit(b, world, 1.8)) this.crouch = true;
    b.h = this.crouch ? 1.15 : 1.8;
    if (b.grounded) {
      const tx = wx * speed, tz = wz * speed, ex = tx - b.vx, ez = tz - b.vz, e = Math.hypot(ex, ez), a = 40 * dt;
      if (e <= a) { b.vx = tx; b.vz = tz; } else { b.vx += (ex / e) * a; b.vz += (ez / e) * a; }
      if (wantJump && !this.crouch) b.vy = 8.6;
    }
    b.vy = Math.max(-45, b.vy - (b.vy > 0 ? 24 : 32) * dt);
    const px = b.x, pz = b.z;
    moveBody(b, world, dt);
    const moved = Math.hypot(b.x - px, b.z - pz);
    if (speed > 1 && moved < speed * dt * 0.25) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.35) this.jumpNext = true;
    if (this.stuckT > 0.8) { this.stuckT = 0; this.avoidT = 0.7; this.avoidDir = Math.random() < 0.5 ? -1 : 1; }

    // Animación
    const ch = this.char, sp = Math.hypot(b.vx, b.vz);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    ch.root.position.set(b.x, b.y, b.z);
    ch.root.rotation.y = this.yaw;
    ch.update(dt, {
      speed: sp, fwd: sp > 0.1 ? (b.vx * fx + b.vz * fz) / sp : 0, strafe: sp > 0.1 ? (b.vx * rx + b.vz * rz) / sp : 0,
      grounded: b.grounded, crouch: this.crouch, slide: false, sprint: !t && sp > 5, pitch: this.pitch, kick: this.kick,
      reloadT: this.reloadT >= 0 ? this.reloadT / (this.def.reload * 1.15) : -1, build: false,
    });
  }

  tickReload(dt) {
    this.reloadT += dt;
    if (this.reloadT >= this.def.reload * 1.15) { this.mag = this.def.mag; this.reloadT = -1; }
  }

  tryShoot(dt, t, dist, wantYaw) {
    const g = this.game, b = this.body, def = this.def;
    if (this.reloadT >= 0) { this.tickReload(dt); return; }
    if (this.react > 0) { this.react -= dt; return; }
    if (g.time < 6) return; // tregua inicial
    if (!this.visible && !this.blockPiece) return;
    if (dist > def.botRange) return;
    if (Math.abs(wrapAngle(wantYaw - this.yaw)) > 0.2) return;
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (this.cooldown > 0) return;
    if (this.mag <= 0) { this.reloadT = 0; return; }

    this.mag--;
    this.cooldown = def.interval * 1.25;
    _o.set(b.x, b.y + (this.crouch ? 1.0 : 1.5), b.z);
    const tb = t.body;
    _e.set(tb.x, tb.y + tb.h * (0.5 + Math.random() * 0.38), tb.z).sub(_o).normalize();
    const tSpeed = Math.hypot(tb.vx, tb.vz);
    const err = (2.3 + 1.6 * Math.min(1, tSpeed / 8) + (tb.grounded ? 0 : 1) + (t.sliding ? 1.2 : 0)) * this.skill * (this.crouch ? 0.75 : 1);
    spreadDir(_e, err, _e);
    this.char.muzzleWorld(_m);
    for (let i = 0; i < def.pellets; i++) {
      spreadDir(_e, def.spread, _d);
      shoot(g, this, _o, _d, def, _m, t.isPlayer ? 0.42 : 0.13);
    }
    this.kick = 1;
    this.char.flash();
    const pb = g.player.body, pd = Math.hypot(pb.x - b.x, pb.z - b.z);
    g.sfx.shot(def.kind, clamp(1 - pd / 90, 0, 1) * 0.55);
    if (--this.burst <= 0) {
      this.burst = def.burst[0] + Math.floor(Math.random() * (def.burst[1] - def.burst[0] + 1));
      this.burstPause = 0.45 + Math.random() * 0.8;
    }
  }

  onDamaged(attacker) {
    if (!attacker || !attacker.alive || attacker === this) return;
    this.lastHitBy = attacker;
    if (!this.target || Math.random() < 0.6) {
      if (this.target !== attacker) this.react = Math.min(Math.max(this.react, 0.2), 0.3);
      this.target = attacker;
      this.seenT = 0;
      this.visible = true;
    }
    // En modo construcción: muro de emergencia hacia quien dispara.
    const g = this.game, b = this.body;
    if (g.build && this.wallCd <= 0 && this.mats >= COST && Math.random() < 0.55) {
      const yaw = Math.atan2(-(attacker.body.x - b.x), -(attacker.body.z - b.z));
      const pl = g.build.computePlacement('wall', b.x, b.y, b.z, yaw, 0);
      if (pl.valid) { g.build.place(pl, this); this.mats -= COST; }
      this.wallCd = 4 + Math.random() * 3;
    }
  }

  die() {
    const b = this.body;
    this.char.root.visible = false;
    this.game.fx.burst(b.x, b.y + 1, b.z, this.char.accent, 30, 7, 0.14);
    this.game.fx.burst(b.x, b.y + 1, b.z, 0x35303f, 14, 5, 0.18);
  }
}
