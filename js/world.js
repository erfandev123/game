// Mundo: colisionadores, trazado de rayos y generación del mapa.
import * as THREE from 'three';
import { ARENA, rng32 } from './util.js';
import { rayAABB, hitN, rampHeight } from './physics.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.boxes = [];
    this.ramps = [];
    this.pods = [];      // posiciones para cápsulas de suministro
    this.spawns = [];
  }

  addBox(x0, y0, z0, x1, y1, z1, extra) {
    const c = { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, piece: null, ...extra };
    this.boxes.push(c);
    return c;
  }

  addRamp(x0, z0, x1, z1, y0, rise, dir, extra) {
    const rp = { x0, z0, x1, z1, y0, rise, dir, solid: false, piece: null, ...extra };
    this.ramps.push(rp);
    return rp;
  }

  remove(c) {
    let i = this.boxes.indexOf(c);
    if (i >= 0) { this.boxes.splice(i, 1); return; }
    i = this.ramps.indexOf(c);
    if (i >= 0) this.ramps.splice(i, 1);
  }

  // Devuelve { t, kind, collider, nx, ny, nz } del impacto más cercano o null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, res = null;
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t > 0 && t < best) { best = t; res = { t, kind: 'ground', collider: null, nx: 0, ny: 1, nz: 0 }; }
    }
    for (const c of this.boxes) {
      const t = rayAABB(ox, oy, oz, dx, dy, dz, c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z);
      if (t > 0 && t < best) { best = t; res = { t, kind: 'box', collider: c, nx: hitN[0], ny: hitN[1], nz: hitN[2] }; }
    }
    for (const rp of this.ramps) {
      const alongX = rp.dir % 2 === 0;
      const L = alongX ? rp.x1 - rp.x0 : rp.z1 - rp.z0;
      const ux = rp.dir === 0 ? 1 : rp.dir === 2 ? -1 : 0;
      const uz = rp.dir === 1 ? 1 : rp.dir === 3 ? -1 : 0;
      const px = rp.dir === 2 ? rp.x1 : rp.x0, pz = rp.dir === 3 ? rp.z1 : rp.z0;
      const k = rp.rise / L;
      const f0 = rp.y0 + k * ((ox - px) * ux + (oz - pz) * uz) - oy; // > 0: origen bajo la superficie
      const den = k * (dx * ux + dz * uz) - dy;
      if (Math.abs(den) > 1e-7) {
        const t = -f0 / den;
        if (t > 0 && t < best) {
          const hx = ox + dx * t, hz = oz + dz * t;
          if (hx >= rp.x0 && hx <= rp.x1 && hz >= rp.z0 && hz <= rp.z1) {
            const s = (f0 > 0 ? -1 : 1) / Math.hypot(k, 1);
            best = t;
            res = { t, kind: 'ramp', collider: rp, nx: -k * ux * s, ny: s, nz: -k * uz * s };
          }
        }
      }
      if (rp.solid) {
        const t = rayAABB(ox, oy, oz, dx, dy, dz, rp.x0, rp.y0, rp.z0, rp.x1, rp.y0 + rp.rise, rp.z1);
        if (t > 0 && t < best) {
          const ex = ox + dx * t, ey = oy + dy * t, ez = oz + dz * t;
          if (ey <= rampHeight(rp, ex, ez) + 0.01) {
            best = t;
            res = { t, kind: 'box', collider: rp, nx: hitN[0], ny: hitN[1], nz: hitN[2] };
          }
        }
      }
    }
    return res;
  }

  // ¿Hay sitio libre para un personaje alrededor de (x, z)?
  isFree(x, z, margin = 1) {
    if (Math.abs(x) > ARENA - 4 || Math.abs(z) > ARENA - 4) return false;
    for (const c of this.boxes) {
      if (x + margin > c.min.x && x - margin < c.max.x && z + margin > c.min.z && z - margin < c.max.z) return false;
    }
    for (const rp of this.ramps) {
      if (x + margin > rp.x0 && x - margin < rp.x1 && z + margin > rp.z0 && z - margin < rp.z1) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Generación del mapa
// ---------------------------------------------------------------------------

function std(color, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const r = rng32(7);
  for (let i = 0; i < 900; i++) {
    const v = 200 + Math.floor(r() * 55);
    g.fillStyle = `rgba(${v},${v - 12},${v - 24},${0.25 + r() * 0.5})`;
    const s = 1 + r() * 4;
    g.fillRect(r() * 256, r() * 256, s, s);
  }
  g.strokeStyle = 'rgba(120,80,80,0.22)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    let x = r() * 256, y = r() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(48, 48);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wedgeGeometry() {
  // Prisma triangular unitario: sube de x=-0.5 (y=0) a x=+0.5 (y=1), z en [-0.5, 0.5].
  const a = [-0.5, 0, -0.5], b = [0.5, 0, -0.5], c = [0.5, 1, -0.5];
  const d = [-0.5, 0, 0.5], e = [0.5, 0, 0.5], f = [0.5, 1, 0.5];
  const tris = [
    a, c, b, d, e, f,       // laterales
    a, d, f, a, f, c,       // pendiente
    b, c, f, b, f, e,       // trasera
    a, b, e, a, e, d,       // base
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildArena(world, scene, seed, mode) {
  const rng = rng32(seed);
  const M = {
    rock: [std(0x6b3f4a), std(0x7a4a50), std(0x5c3542)],
    concrete: std(0xd9d2c5),
    concreteDark: std(0xa39c94),
    metal: std(0x3a3550, { metalness: 0.5, roughness: 0.5 }),
    crate: std(0xd9a441),
    crateDark: std(0x8a6226),
    containers: [std(0x2a9d8f), std(0xe76f51), std(0xe9c46a), std(0x5b5f97), std(0xf2ede4)],
    glow: new THREE.MeshStandardMaterial({ color: 0x2de2c8, emissive: 0x2de2c8, emissiveIntensity: 2 }),
    glowAmber: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 2 }),
  };
  const wedgeGeo = wedgeGeometry();
  const occupied = [];
  const mark = (x0, z0, x1, z1) => occupied.push({ x0, z0, x1, z1 });
  const isClear = (x0, z0, x1, z1, m = 3) => {
    if (x0 < -ARENA + 5 || x1 > ARENA - 5 || z0 < -ARENA + 5 || z1 > ARENA - 5) return false;
    for (const o of occupied) if (x1 + m > o.x0 && x0 - m < o.x1 && z1 + m > o.z0 && z0 - m < o.z1) return false;
    return true;
  };

  const block = (x0, y0, z0, x1, y1, z1, material, collide = true) => {
    const m = new THREE.Mesh(unitBox, material);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (collide) world.addBox(x0, y0, z0, x1, y1, z1);
    return m;
  };
  const wedge = (x0, z0, x1, z1, y0, rise, dir, material) => {
    const m = new THREE.Mesh(wedgeGeo, material);
    const along = dir % 2 === 0 ? x1 - x0 : z1 - z0;
    const across = dir % 2 === 0 ? z1 - z0 : x1 - x0;
    m.scale.set(along, rise, across);
    m.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
    m.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    world.addRamp(x0, z0, x1, z1, y0, rise, dir, { solid: true });
  };

  // --- Suelo ---
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xb08468, map: groundTexture(), roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 240, ARENA * 2 + 240), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Manchas de terreno para dar referencia de movimiento.
  const patchGeo = new THREE.CircleGeometry(1, 7);
  patchGeo.rotateX(-Math.PI / 2);
  const patches = new THREE.InstancedMesh(patchGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), 420);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < 420; i++) {
    dummy.position.set((rng() - 0.5) * ARENA * 2.2, 0.012 + i * 0.00002, (rng() - 0.5) * ARENA * 2.2);
    dummy.rotation.y = rng() * 6.28;
    dummy.scale.set(1.5 + rng() * 4.5, 1, 1 + rng() * 3);
    dummy.updateMatrix();
    patches.setMatrixAt(i, dummy.matrix);
    patches.setColorAt(i, col.setHex(rng() < 0.5 ? 0x9c6f5a : 0xc19672).multiplyScalar(0.9 + rng() * 0.2));
  }
  patches.receiveShadow = true;
  scene.add(patches);

  // --- Borde: acantilados ---
  const A = ARENA;
  for (let i = 0; i < 4; i++) {
    const horiz = i < 2, s = i % 2 ? 1 : -1;
    let off = -A - 4;
    while (off < A + 4) {
      const len = 10 + rng() * 14, hgt = 9 + rng() * 9, deep = 8 + rng() * 6;
      const m = M.rock[Math.floor(rng() * 3)];
      if (horiz) block(off, 0, s > 0 ? A : -A - deep, off + len, hgt, s > 0 ? A + deep : -A, m, false);
      else block(s > 0 ? A : -A - deep, 0, off, s > 0 ? A + deep : -A, hgt, off + len, m, false);
      off += len;
    }
  }
  world.addBox(-A - 20, 0, -A - 20, A + 20, 40, -A);
  world.addBox(-A - 20, 0, A, A + 20, 40, A + 20);
  world.addBox(-A - 20, 0, -A, -A, 40, A);
  world.addBox(A, 0, -A, A + 20, 40, A);

  // Horizonte lejano
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rng() * 0.2, d = 170 + rng() * 80;
    const w = 26 + rng() * 40, hgt = 22 + rng() * 44;
    const m = new THREE.Mesh(unitBox, M.rock[i % 3]);
    m.scale.set(w, hgt, w * (0.6 + rng() * 0.6));
    m.position.set(Math.cos(a) * d, hgt / 2, Math.sin(a) * d);
    m.rotation.y = rng() * 3;
    scene.add(m);
  }

  // --- Relé central ---
  block(-8, 0, -8, 8, 3, 8, M.concrete);
  wedge(8, -2, 12, 2, 0, 3, 2, M.concreteDark);
  wedge(-12, -2, -8, 2, 0, 3, 0, M.concreteDark);
  wedge(-2, 8, 2, 12, 0, 3, 3, M.concreteDark);
  block(-0.6, 3, -0.6, 0.6, 12, 0.6, M.metal);
  block(-2, 9.5, -0.15, 2, 9.8, 0.15, M.metal, false);
  block(-0.3, 12, -0.3, 0.3, 12.5, 0.3, M.glowAmber, false);
  block(-8, 3, -8, -3, 4.1, -7.5, M.concreteDark);
  block(3, 3, -8, 8, 4.1, -7.5, M.concreteDark);
  block(-8, 3, 7.5, -4, 4.1, 8, M.concreteDark);
  block(4, 3, 7.5, 8, 4.1, 8, M.concreteDark);
  block(-8, 3, -7.5, -7.5, 4.1, -4, M.concreteDark);
  block(7.5, 3, 4, 8, 4.1, 7.5, M.concreteDark);
  mark(-13, -9, 13, 13);

  // --- Puestos avanzados (reflejados hacia el centro) ---
  const outpost = (cx, cz) => {
    const sx = cx > 0 ? -1 : 1, sz = cz > 0 ? -1 : 1;
    const R = (x0, z0, x1, z1) => {
      const ax = cx + sx * x0, bx = cx + sx * x1, az = cz + sz * z0, bz = cz + sz * z1;
      return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    };
    const B = (x0, y0, z0, x1, y1, z1, mat) => { const r = R(x0, z0, x1, z1); return block(r[0], y0, r[1], r[2], y1, r[3], mat); };
    B(-8, 0, -6, 8, 3, -5.6, M.concrete);          // muro trasero
    B(-8, 0, -5.6, -7.6, 3, 2, M.concrete);        // lateral
    B(7.6, 0, -5.6, 8, 3, -1.5, M.concrete);       // lateral corto
    B(-8, 2.8, -5.6, 0, 3, 0, M.concreteDark);     // techo parcial
    B(-0.4, 0, -0.4, 0, 2.8, 0, M.metal);          // pilar
    B(-5, 0, -4.2, -3.7, 1.3, -2.9, M.crate);
    B(-3.4, 0, 5, 0.2, 1.1, 5.5, M.concreteDark);  // barrera
    B(3.5, 0, 3, 4.8, 1.3, 4.3, M.crate);
    const r = R(0, -5.6, 4, -1.6);
    wedge(r[0], r[1], r[2], r[3], 0, 3, sx > 0 ? 2 : 0, M.concreteDark);
    const o = R(-9, -7, 9, 6.5);
    mark(o[0], o[1], o[2], o[3]);
    world.pods.push({ x: cx + sx * -5.5, z: cz + sz * 0.5 });
  };
  outpost(52, 48); outpost(-52, 48); outpost(52, -48); outpost(-52, -48);

  // --- Mesetas con dos alturas ---
  const mesa = (cx, cz, sx) => {
    const X = (a, b) => [Math.min(cx + sx * a, cx + sx * b), Math.max(cx + sx * a, cx + sx * b)];
    let x = X(-8, 8);
    block(x[0], 0, cz - 6, x[1], 3, cz + 6, M.rock[0]);
    x = X(-8, 0);
    block(x[0], 3, cz - 6, x[1], 6, cz + 2, M.rock[1]);
    x = X(8, 12);
    wedge(x[0], cz - 2, x[1], cz + 2, 0, 3, sx > 0 ? 2 : 0, M.rock[2]);
    x = X(0, 4);
    wedge(x[0], cz - 6, x[1], cz - 2, 3, 3, sx > 0 ? 2 : 0, M.rock[2]);
    x = X(-9, 13);
    mark(x[0], cz - 7, x[1], cz + 7);
    world.pods.push({ x: cx + sx * -4, z: cz - 2, y: 6 });
  };
  mesa(-56, 4, 1); mesa(20, -62, -1); mesa(22, 62, 1); mesa(64, 2, -1);

  // --- Objetos dispersos ---
  const dense = mode === 'nobuild';
  const scatter = (count, tries, fn) => {
    let placed = 0;
    for (let i = 0; i < tries && placed < count; i++) {
      const x = (rng() - 0.5) * (ARENA * 2 - 16), z = (rng() - 0.5) * (ARENA * 2 - 16);
      if (fn(x, z)) placed++;
    }
  };

  // Contenedores
  scatter(dense ? 15 : 10, 400, (x, z) => {
    const rot = rng() < 0.5, w = rot ? 6.2 : 2.5, d = rot ? 2.5 : 6.2;
    if (!isClear(x - w / 2, z - d / 2, x + w / 2, z + d / 2)) return false;
    const mat = M.containers[Math.floor(rng() * M.containers.length)];
    block(x - w / 2, 0, z - d / 2, x + w / 2, 2.6, z + d / 2, mat);
    if (rot) { block(x - w / 2 - 0.04, 0.1, z - 1, x - w / 2, 2.5, z + 1, M.metal, false); block(x + w / 2, 0.1, z - 1, x + w / 2 + 0.04, 2.5, z + 1, M.metal, false); }
    else { block(x - 1, 0.1, z - d / 2 - 0.04, x + 1, 2.5, z - d / 2, M.metal, false); block(x - 1, 0.1, z + d / 2, x + 1, 2.5, z + d / 2 + 0.04, M.metal, false); }
    if (rng() < 0.3) {
      const mat2 = M.containers[Math.floor(rng() * M.containers.length)];
      block(x - w / 2, 2.6, z - d / 2, x + w / 2, 5.2, z + d / 2, mat2);
    }
    mark(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    return true;
  });

  // Grupos de cajas
  scatter(dense ? 28 : 16, 600, (x, z) => {
    if (!isClear(x - 1.6, z - 1.6, x + 2.4, z + 2.4, 2.2)) return false;
    const s = 1.3, n = 1 + Math.floor(rng() * 3);
    const offs = [[0, 0], [1.5, 0.25], [0.3, 1.55]];
    for (let k = 0; k < n; k++) {
      const ox = x + offs[k][0], oz = z + offs[k][1];
      block(ox - s / 2, 0, oz - s / 2, ox + s / 2, s, oz + s / 2, k % 2 ? M.crateDark : M.crate);
    }
    if (n > 1 && rng() < 0.5) block(x - s / 2 + 0.1, s, z - s / 2 + 0.1, x + s / 2 - 0.1, s * 2 - 0.2, z + s / 2 - 0.1, M.crateDark);
    mark(x - 0.7, z - 0.7, x + 2.2, z + 2.2);
    return true;
  });

  // Barreras bajas
  scatter(dense ? 28 : 14, 600, (x, z) => {
    const rot = rng() < 0.5, w = rot ? 0.5 : 3.4, d = rot ? 3.4 : 0.5;
    if (!isClear(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2.4)) return false;
    block(x - w / 2, 0, z - d / 2, x + w / 2, 1.1, z + d / 2, M.concreteDark);
    mark(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    return true;
  });

  // Rocas
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  scatter(dense ? 28 : 18, 600, (x, z) => {
    const sx = 2.2 + rng() * 2.6, sy = 1.5 + rng() * 2.2, sz = 2.2 + rng() * 2.6;
    if (!isClear(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 2.4)) return false;
    const m = new THREE.Mesh(rockGeo, M.rock[Math.floor(rng() * 3)]);
    m.scale.set(sx * 0.6, sy * 0.72, sz * 0.6);
    m.position.set(x, sy * 0.38, z);
    m.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    world.addBox(x - sx * 0.42, 0, z - sz * 0.42, x + sx * 0.42, sy * 0.86, z + sz * 0.42);
    mark(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2);
    return true;
  });

  // Balizas
  scatter(dense ? 10 : 8, 300, (x, z) => {
    if (!isClear(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 4)) return false;
    block(x - 0.35, 0, z - 0.35, x + 0.35, 5, z + 0.35, M.metal);
    block(x - 0.45, 5, z - 0.45, x + 0.45, 5.35, z + 0.45, M.glow, false);
    mark(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    return true;
  });

  // Más cápsulas de suministro en sitios libres
  scatter(8, 400, (x, z) => {
    if (!isClear(x - 1, z - 1, x + 1, z + 1, 3)) return false;
    world.pods.push({ x, z });
    mark(x - 1, z - 1, x + 1, z + 1);
    return true;
  });

  // Puntos de aparición, separados entre sí
  for (let i = 0; i < 4000 && world.spawns.length < 16; i++) {
    const x = (rng() - 0.5) * (ARENA * 2 - 24), z = (rng() - 0.5) * (ARENA * 2 - 24);
    if (!world.isFree(x, z, 1.4)) continue;
    let ok = true;
    for (const s of world.spawns) if (Math.hypot(s.x - x, s.z - z) < 30) { ok = false; break; }
    if (ok) world.spawns.push({ x, z });
  }
  for (let i = 0; world.spawns.length < 16; i++) world.spawns.push({ x: -80 + i * 10, z: -86 });
}
