// Física de personajes: cápsula aproximada por una caja alineada a los ejes,
// contra cajas estáticas, rampas y el suelo (y = 0).
import { clamp, ARENA } from './util.js';

export const STEP = 0.45;       // escalón que se sube andando
export const RAMP_STEP = 0.6;   // margen para engancharse a una rampa
export const RAMP_THICK = 0.25; // grosor de la rampa por debajo
const EPS = 0.001;

export class Body {
  constructor(x, y, z) {
    this.x = x; this.y = y; this.z = z; // y = pies
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.r = 0.38;
    this.h = 1.8;
    this.grounded = false;
    this.ramp = null;     // rampa sobre la que está apoyado
    this.hitWall = false;
  }
}

export function rampHeight(rp, x, z) {
  let t;
  switch (rp.dir) {
    case 0: t = (x - rp.x0) / (rp.x1 - rp.x0); break;
    case 2: t = (rp.x1 - x) / (rp.x1 - rp.x0); break;
    case 1: t = (z - rp.z0) / (rp.z1 - rp.z0); break;
    default: t = (rp.z1 - z) / (rp.z1 - rp.z0);
  }
  return rp.y0 + rp.rise * clamp(t, 0, 1);
}

function overlap(b, c, x, y, z, h) {
  return x + b.r > c.min.x && x - b.r < c.max.x &&
    z + b.r > c.min.z && z - b.r < c.max.z &&
    y + h > c.min.y && y < c.max.y;
}

// ¿Una rampa corta el cuerpo de lado o por debajo en (x, z)?
function rampBlocks(b, ramps, x, z, h) {
  const m = b.r * 0.5;
  for (const rp of ramps) {
    if (x < rp.x0 - m || x > rp.x1 + m || z < rp.z0 - m || z > rp.z1 + m) continue;
    const hs = rampHeight(rp, x, z);
    if (b.y < hs - RAMP_STEP && (rp.solid || b.y + h > hs - RAMP_THICK)) return true;
  }
  return false;
}

// ¿Cabe el cuerpo con altura h en su posición actual?
export function canFit(b, world, h) {
  for (const c of world.boxes) if (overlap(b, c, b.x, b.y + 0.01, b.z, h - 0.01)) return false;
  return !rampBlocks(b, world.ramps, b.x, b.z, h);
}

export function moveBody(b, world, dt) {
  const boxes = world.boxes, ramps = world.ramps, r = b.r;
  const wasGrounded = b.grounded;
  b.hitWall = false;

  // 1. Si algo apareció encima (una pieza recién construida), salir de ello.
  for (const c of boxes) {
    if (!overlap(b, c, b.x, b.y, b.z, b.h)) continue;
    const up = c.max.y - b.y;
    if (up <= 1.3) { b.y = c.max.y; if (b.vy < 0) b.vy = 0; continue; }
    const a = b.x + r - c.min.x, bb = c.max.x - (b.x - r);
    const cc = b.z + r - c.min.z, d = c.max.z - (b.z - r);
    const m = Math.min(a, bb, cc, d);
    if (m === a) b.x -= a + EPS;
    else if (m === bb) b.x += bb + EPS;
    else if (m === cc) b.z -= cc + EPS;
    else b.z += d + EPS;
  }

  const stuckInRamp = rampBlocks(b, ramps, b.x, b.z, b.h);

  // 2. Eje X
  if (b.vx !== 0) {
    const pos = b.vx > 0;
    let nx = b.x + b.vx * dt;
    for (const c of boxes) {
      if (!overlap(b, c, nx, b.y, b.z, b.h)) continue;
      if (wasGrounded && c.max.y - b.y <= STEP) { b.y = c.max.y; continue; }
      nx = pos ? c.min.x - r - EPS : c.max.x + r + EPS;
      b.vx = 0; b.hitWall = true;
    }
    if (!stuckInRamp && rampBlocks(b, ramps, nx, b.z, b.h)) { nx = b.x; b.vx = 0; b.hitWall = true; }
    b.x = nx;
  }

  // 3. Eje Z
  if (b.vz !== 0) {
    const pos = b.vz > 0;
    let nz = b.z + b.vz * dt;
    for (const c of boxes) {
      if (!overlap(b, c, b.x, b.y, nz, b.h)) continue;
      if (wasGrounded && c.max.y - b.y <= STEP) { b.y = c.max.y; continue; }
      nz = pos ? c.min.z - r - EPS : c.max.z + r + EPS;
      b.vz = 0; b.hitWall = true;
    }
    if (!stuckInRamp && rampBlocks(b, ramps, b.x, nz, b.h)) { nz = b.z; b.vz = 0; b.hitWall = true; }
    b.z = nz;
  }

  // 4. Eje Y
  const py = b.y;
  let ny = b.y + b.vy * dt;
  b.grounded = false;
  b.ramp = null;
  for (const c of boxes) {
    if (b.x + r <= c.min.x || b.x - r >= c.max.x || b.z + r <= c.min.z || b.z - r >= c.max.z) continue;
    if (ny >= c.max.y || ny + b.h <= c.min.y) continue;
    if (b.vy <= 0 && py >= c.max.y - 0.02) { ny = c.max.y; b.vy = 0; b.grounded = true; }
    else if (b.vy > 0 && py + b.h <= c.min.y + 0.02) { ny = c.min.y - b.h - EPS; b.vy = 0; }
  }
  for (const rp of ramps) {
    if (b.x < rp.x0 - 0.05 || b.x > rp.x1 + 0.05 || b.z < rp.z0 - 0.05 || b.z > rp.z1 + 0.05) continue;
    const hs = rampHeight(rp, b.x, b.z);
    if (b.vy <= 0 || ny < hs - 0.02) {
      const snap = wasGrounded && b.vy <= 0 ? 0.4 : 0;
      if (ny <= hs + snap && ny >= hs - RAMP_STEP - 0.15) {
        ny = hs; b.vy = 0; b.grounded = true; b.ramp = rp;
        continue;
      }
    }
    // Cabezazo contra la cara inferior.
    if (b.vy > 0 && !rp.solid && py + b.h <= hs - RAMP_THICK + 0.05 && ny + b.h > hs - RAMP_THICK) {
      ny = hs - RAMP_THICK - b.h; b.vy = 0;
    }
  }
  if (ny <= 0) { ny = 0; if (b.vy < 0) b.vy = 0; b.grounded = true; }
  b.y = ny;

  // 5. Límites del mapa
  const lim = ARENA - r - 0.5;
  b.x = clamp(b.x, -lim, lim);
  b.z = clamp(b.z, -lim, lim);
}

// Rayo contra caja. Devuelve la distancia de entrada o -1. Deja la normal en hitN.
export const hitN = [0, 0, 0];
export function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity, axis = -1, sign = 0;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else {
    const inv = 1 / dx; let t1 = (x0 - ox) * inv, t2 = (x1 - ox) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else {
    const inv = 1 / dy; let t1 = (y0 - oy) * inv, t2 = (y1 - oy) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else {
    const inv = 1 / dz; let t1 = (z0 - oz) * inv, t2 = (z1 - oz) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (axis < 0) return -1; // el origen está dentro
  hitN[0] = axis === 0 ? sign : 0;
  hitN[1] = axis === 1 ? sign : 0;
  hitN[2] = axis === 2 ? sign : 0;
  return tmin;
}
