// Disparos por trazado de rayos contra el mundo y los personajes.
import * as THREE from 'three';
import { rayAABB } from './physics.js';
import { falloff } from './weapons.js';

const _p = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

// Rayo contra un personaje: esfera para la cabeza y caja para el cuerpo.
export function rayActor(a, ox, oy, oz, dx, dy, dz) {
  const b = a.body;
  let t = -1, head = false;
  const hy = b.y + b.h - 0.17, hr = 0.21;
  const lx = b.x - ox, ly = hy - oy, lz = b.z - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca > 0) {
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 < hr * hr) { t = tca - Math.sqrt(hr * hr - d2); head = true; }
  }
  const tb = rayAABB(ox, oy, oz, dx, dy, dz, b.x - 0.34, b.y, b.z - 0.34, b.x + 0.34, b.y + b.h - 0.34, b.z + 0.34);
  if (tb > 0 && (t < 0 || tb < t - 0.05)) { t = tb; head = false; }
  return t > 0 ? { t, head } : null;
}

// Desvía una dirección dentro de un cono de `deg` grados.
export function spreadDir(dir, deg, out) {
  if (deg <= 0) return out.copy(dir);
  const ang = (deg * Math.PI / 180) * Math.sqrt(Math.random());
  const rot = Math.random() * Math.PI * 2;
  _u.crossVectors(dir, Math.abs(dir.y) > 0.95 ? RIGHT : UP).normalize();
  _w.crossVectors(dir, _u);
  const s = Math.sin(ang);
  return out.copy(dir).multiplyScalar(Math.cos(ang)).addScaledVector(_u, Math.cos(rot) * s).addScaledVector(_w, Math.sin(rot) * s).normalize();
}

// Un proyectil. `scale` ajusta el daño (los bots pegan menos).
export function shoot(game, shooter, o, d, def, muzzle, scale) {
  const wh = game.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, def.range);
  let t = wh ? wh.t : def.range, victim = null, head = false;
  for (const a of game.actors) {
    if (a === shooter || !a.alive) continue;
    const r = rayActor(a, o.x, o.y, o.z, d.x, d.y, d.z);
    if (r && r.t < t) { t = r.t; victim = a; head = r.head; }
  }
  _p.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  game.fx.tracer(muzzle, _p, shooter.isPlayer ? 0xffe2a8 : 0xff8a5c);
  if (victim) {
    const dmg = def.dmg * falloff(def, t) * (head ? def.head : 1) * scale;
    game.fx.impact(_p, -d.x, 0.4, -d.z, victim.shield > 0 ? 0x7fd4ff : 0xffd27a, 5);
    game.damageActor(victim, dmg, shooter, head, _p);
  } else if (wh) {
    const piece = wh.collider && wh.collider.piece;
    game.fx.impact(_p, wh.nx, wh.ny, wh.nz, piece ? 0xb48cff : 0xe8c9a8, 5);
    if (piece) game.build.damage(piece, def.dmg * def.struct * (shooter.isPlayer ? 1 : 0.7));
  }
}
