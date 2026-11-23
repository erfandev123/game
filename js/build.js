// Construcción con placas de luz sólida: muros, suelos y rampas sobre una rejilla.
import * as THREE from 'three';
import { G, H, ARENA, DIRS } from './util.js';
import { rampHeight, RAMP_THICK } from './physics.js';

export const COST = 10;
const HP = { wall: 150, floor: 140, ramp: 140 };
const T = 0.2;                         // grosor de las placas
const LEN = Math.hypot(G, H);          // largo de la rampa
const SLOPE = Math.atan2(H, G);
const MAX_LEVEL = 10;

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1136';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#8f5cff';
  g.lineWidth = 3;
  // Celosía triangular
  const n = 4, s = 256 / n;
  g.globalAlpha = 0.55;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke();
  }
  for (let i = -n; i <= n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s + 256 / 2 * 1.0, 256); g.stroke();
    g.beginPath(); g.moveTo(i * s + 256 / 2, 0); g.lineTo(i * s, 256); g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#e2ccff';
  g.lineWidth = 10;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    this.pieces = new Map();
    this.edges = new Map();
    this.anims = [];
    this.tex = panelTexture();
    this.baseMat = new THREE.MeshStandardMaterial({
      map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 0.75,
      color: 0xffffff, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.9,
    });
    this.geo = {
      wall: new THREE.BoxGeometry(G, H, T),
      floor: new THREE.BoxGeometry(G, T, G),
      ramp: new THREE.BoxGeometry(G, T, LEN),
    };
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = {};
    for (const k in this.geo) {
      const m = new THREE.Mesh(this.geo[k], this.ghostMat);
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      this.ghost[k] = m;
    }
  }

  // Coloca la malla de una pieza (o del fantasma) según su celda.
  poseMesh(mesh, pl) {
    mesh.rotation.set(0, 0, 0);
    if (pl.type === 'wall') {
      if (pl.orient === 'x') mesh.position.set((pl.i + 0.5) * G, (pl.l + 0.5) * H, pl.j * G);
      else { mesh.position.set(pl.i * G, (pl.l + 0.5) * H, (pl.j + 0.5) * G); mesh.rotation.y = Math.PI / 2; }
    } else if (pl.type === 'floor') {
      mesh.position.set((pl.i + 0.5) * G, pl.l * H - T / 2, (pl.j + 0.5) * G);
    } else {
      const u = DIRS[pl.d];
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(-SLOPE, Math.atan2(u.x, u.z), 0);
      mesh.position.set((pl.i + 0.5) * G, (pl.l + 0.5) * H - (T / 2) / Math.cos(SLOPE), (pl.j + 0.5) * G);
    }
  }

  edgeKeys(pl) {
    const { i, j, l } = pl;
    if (pl.type === 'wall') return pl.orient === 'x' ? [`x:${i},${j},${l}`, `x:${i},${j},${l + 1}`] : [`z:${i},${j},${l}`, `z:${i},${j},${l + 1}`];
    if (pl.type === 'floor') return [`x:${i},${j},${l}`, `x:${i},${j + 1},${l}`, `z:${i},${j},${l}`, `z:${i + 1},${j},${l}`];
    switch (pl.d) {
      case 0: return [`z:${i},${j},${l}`, `z:${i + 1},${j},${l + 1}`];
      case 2: return [`z:${i + 1},${j},${l}`, `z:${i},${j},${l + 1}`];
      case 1: return [`x:${i},${j},${l}`, `x:${i},${j + 1},${l + 1}`];
      default: return [`x:${i},${j + 1},${l}`, `x:${i},${j},${l + 1}`];
    }
  }

  // ¿El punto descansa sobre el suelo o sobre una estructura fija del mapa?
  restsAt(x, y, z) {
    if (y < 0.05) return true;
    for (const c of this.world.boxes) {
      if (c.piece) continue;
      if (Math.abs(c.max.y - y) < 0.3 && x > c.min.x - 0.2 && x < c.max.x + 0.2 && z > c.min.z - 0.2 && z < c.max.z + 0.2) return true;
    }
    return false;
  }

  isAnchored(pl) {
    const { i, j, l } = pl, y = l * H;
    if (pl.type === 'wall') {
      return pl.orient === 'x' ? this.restsAt((i + 0.5) * G, y, j * G) : this.restsAt(i * G, y, (j + 0.5) * G);
    }
    if (pl.type === 'floor') {
      return this.restsAt((i + 0.5) * G, y, j * G) || this.restsAt((i + 0.5) * G, y, (j + 1) * G) ||
        this.restsAt(i * G, y, (j + 0.5) * G) || this.restsAt((i + 1) * G, y, (j + 0.5) * G);
    }
    const u = DIRS[pl.d], cx = (i + 0.5) * G, cz = (j + 0.5) * G;
    return this.restsAt(cx - u.x * G / 2, y, cz - u.z * G / 2) || this.restsAt(cx + u.x * G / 2, y + H, cz + u.z * G / 2);
  }

  // ¿La pieza atraviesa una estructura fija del mapa?
  blocked(pl) {
    const pts = [];
    const { i, j, l } = pl;
    if (pl.type === 'wall') {
      for (const f of [0.25, 0.5, 0.75]) {
        if (pl.orient === 'x') pts.push([(i + f) * G, (l + 0.5) * H, j * G]);
        else pts.push([i * G, (l + 0.5) * H, (j + f) * G]);
      }
    } else if (pl.type === 'floor') {
      pts.push([(i + 0.5) * G, l * H - T / 2, (j + 0.5) * G], [(i + 0.25) * G, l * H - T / 2, (j + 0.25) * G], [(i + 0.75) * G, l * H - T / 2, (j + 0.75) * G]);
    } else {
      const u = DIRS[pl.d], cx = (i + 0.5) * G, cz = (j + 0.5) * G;
      for (const f of [-0.25, 0, 0.25]) pts.push([cx + u.x * G * f, (l + 0.5 + f) * H + 0.15, cz + u.z * G * f]);
    }
    for (const c of this.world.boxes) {
      if (c.piece) continue;
      for (const p of pts) {
        if (p[0] > c.min.x + 0.05 && p[0] < c.max.x - 0.05 && p[1] > c.min.y + 0.05 && p[1] < c.max.y - 0.05 && p[2] > c.min.z + 0.05 && p[2] < c.max.z - 0.05) return true;
      }
    }
    for (const rp of this.world.ramps) {
      if (!rp.solid) continue;
      for (const p of pts) {
        if (p[0] > rp.x0 && p[0] < rp.x1 && p[2] > rp.z0 && p[2] < rp.z1 && p[1] > rp.y0 && p[1] < rampHeight(rp, p[0], p[2]) - 0.2) return true;
      }
    }
    return false;
  }

  // Calcula dónde iría una pieza para alguien en (x, y, z) mirando con yaw/pitch.
  // `standRamp`: rampa sobre la que está apoyado, para encadenar subidas.
  computePlacement(type, x, y, z, yaw, pitch, standRamp) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ax = Math.abs(fx) > Math.abs(fz);
    const d = ax ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3);
    const pl = { type, i: 0, j: 0, l: 0, d, orient: 'x', key: '', valid: false };
    if (type === 'wall') {
      let l = Math.floor((y + 0.4) / H);
      if (pitch > 0.6) l += 1; else if (pitch < -0.8 && l > 0) l -= 1;
      pl.l = l;
      if (ax) {
        pl.orient = 'z';
        pl.i = fx > 0 ? Math.ceil((x + 0.5) / G) : Math.floor((x - 0.5) / G);
        pl.j = Math.floor((z + fz * 2) / G);
      } else {
        pl.orient = 'x';
        pl.j = fz > 0 ? Math.ceil((z + 0.5) / G) : Math.floor((z - 0.5) / G);
        pl.i = Math.floor((x + fx * 2) / G);
      }
      pl.key = `w:${pl.orient}:${pl.i},${pl.j},${pl.l}`;
    } else if (type === 'floor') {
      const lvl = Math.round(y / H);
      pl.l = lvl === 0 || pitch > 0.35 ? lvl + 1 : lvl;
      const reach = Math.abs(pitch) > 0.95 ? 0 : G * 0.6;
      pl.i = Math.floor((x + fx * reach) / G);
      pl.j = Math.floor((z + fz * reach) / G);
      pl.key = `f:${pl.i},${pl.j},${pl.l}`;
    } else {
      pl.l = Math.floor((y + 0.75) / H);
      pl.i = Math.floor((x + (ax ? Math.sign(fx) * 2 : 0)) / G);
      pl.j = Math.floor((z + (ax ? 0 : Math.sign(fz) * 2)) / G);
      // Subiendo por una rampa en la misma dirección: la siguiente empieza donde acaba esta.
      if (standRamp && standRamp.dir === d && (pl.i * G !== standRamp.x0 || pl.j * G !== standRamp.z0)) {
        pl.l = Math.round((standRamp.y0 + standRamp.rise) / H);
      }
      pl.key = `r:${pl.i},${pl.j},${pl.l}`;
    }
    const lim = ARENA / G;
    pl.valid = !this.pieces.has(pl.key) && pl.l >= 0 && pl.l <= MAX_LEVEL &&
      pl.i >= -lim && pl.i < lim && pl.j >= -lim && pl.j < lim &&
      !this.blocked(pl) && (this.isAnchored(pl) || this.edgeKeys(pl).some((k) => this.edges.get(k)?.size));
    return pl;
  }

  showGhost(pl, ok) {
    for (const k in this.ghost) this.ghost[k].visible = k === pl.type;
    this.poseMesh(this.ghost[pl.type], pl);
    this.ghostMat.color.setHex(ok ? 0xb48cff : 0xff4d4d);
    this.ghostMat.opacity = 0.3 + 0.08 * Math.sin(performance.now() * 0.008);
  }

  hideGhost() {
    for (const k in this.ghost) this.ghost[k].visible = false;
  }

  place(pl, owner) {
    if (this.pieces.has(pl.key)) return null;
    const { i, j, l } = pl;
    const mesh = new THREE.Mesh(this.geo[pl.type], this.baseMat.clone());
    this.poseMesh(mesh, pl);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    const piece = { ...pl, hp: HP[pl.type], maxHp: HP[pl.type], mesh, owner, collider: null, edgeList: this.edgeKeys(pl), anchored: this.isAnchored(pl), flash: 0, spawn: 0 };
    if (pl.type === 'wall') {
      piece.collider = pl.orient === 'x'
        ? this.world.addBox(i * G, l * H, j * G - T / 2, (i + 1) * G, (l + 1) * H, j * G + T / 2, { piece })
        : this.world.addBox(i * G - T / 2, l * H, j * G, i * G + T / 2, (l + 1) * H, (j + 1) * G, { piece });
    } else if (pl.type === 'floor') {
      piece.collider = this.world.addBox(i * G, l * H - T, j * G, (i + 1) * G, l * H, (j + 1) * G, { piece });
    } else {
      const rp = piece.collider = this.world.addRamp(i * G, j * G, (i + 1) * G, (j + 1) * G, l * H, H, pl.d, { piece });
      // Quien quede debajo de la superficie sube encima.
      for (const a of this.game.actors) {
        if (!a.alive) continue;
        const b = a.body;
        if (b.x < rp.x0 || b.x > rp.x1 || b.z < rp.z0 || b.z > rp.z1) continue;
        const hs = rampHeight(rp, b.x, b.z);
        if (b.y < hs && b.y + b.h > hs - RAMP_THICK) { b.y = hs; b.vy = 0; }
      }
    }
    this.pieces.set(pl.key, piece);
    for (const k of piece.edgeList) {
      let s = this.edges.get(k);
      if (!s) this.edges.set(k, (s = new Set()));
      s.add(piece);
    }
    mesh.scale.setScalar(0.6);
    this.anims.push(piece);
    this.game.onBuilt(piece);
    return piece;
  }

  damage(piece, amount) {
    if (piece.hp <= 0) return;
    piece.hp -= amount;
    piece.flash = 1;
    if (!this.anims.includes(piece)) this.anims.push(piece);
    if (piece.hp <= 0) { this.remove(piece); this.collapse(); }
    else piece.mesh.material.opacity = 0.45 + 0.45 * (piece.hp / piece.maxHp);
  }

  remove(piece) {
    piece.hp = 0;
    this.pieces.delete(piece.key);
    for (const k of piece.edgeList) this.edges.get(k)?.delete(piece);
    this.world.remove(piece.collider);
    this.scene.remove(piece.mesh);
    piece.mesh.material.dispose();
    const p = piece.mesh.position;
    for (let n = 0; n < 14; n++) {
      this.game.fx.spawn(p.x + (Math.random() - 0.5) * G * 0.8, p.y + (Math.random() - 0.5) * H * 0.7, p.z + (Math.random() - 0.5) * G * 0.8,
        (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, n % 2 ? 0xb48cff : 0x6a35ff, 0.1 + Math.random() * 0.14, 0.5 + Math.random() * 0.5);
    }
    this.game.onBroken(piece);
  }

  // Derriba las piezas que ya no están unidas a nada apoyado.
  collapse() {
    const seen = new Set(), stack = [];
    for (const p of this.pieces.values()) if (p.anchored) { seen.add(p); stack.push(p); }
    while (stack.length) {
      const p = stack.pop();
      for (const k of p.edgeList) {
        const s = this.edges.get(k);
        if (!s) continue;
        for (const q of s) if (!seen.has(q)) { seen.add(q); stack.push(q); }
      }
    }
    for (const p of [...this.pieces.values()]) if (!seen.has(p)) this.remove(p);
  }

  update(dt) {
    for (let n = this.anims.length - 1; n >= 0; n--) {
      const p = this.anims[n];
      if (p.hp <= 0) { this.anims.splice(n, 1); continue; }
      p.spawn = Math.min(1, p.spawn + dt * 9);
      p.flash = Math.max(0, p.flash - dt * 6);
      p.mesh.scale.setScalar(0.6 + 0.4 * p.spawn);
      p.mesh.material.emissiveIntensity = 0.75 + (1 - p.spawn) * 1.5 + p.flash * 1.2;
      if (p.spawn >= 1 && p.flash <= 0) this.anims.splice(n, 1);
    }
  }
}
