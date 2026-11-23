// Efectos: trazadoras, partículas y números de daño.
import * as THREE from 'three';

const MAX_P = 360, MAX_T = 48;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _v = new THREE.Vector3();

export class FX {
  constructor(scene, camera, layer) {
    this.scene = scene;
    this.camera = camera;
    this.layer = layer;

    // Partículas instanciadas
    this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_P);
    this.pMesh.frustumCulled = false;
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) {
      this.parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.05, grav: 12 });
      this.pMesh.setColorAt(i, _c.setHex(0xffffff));
      this.pMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.pNext = 0;
    scene.add(this.pMesh);

    // Trazadoras
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracers = [];
    for (let i = 0; i < MAX_T; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tNext = 0;
    this.floaters = [];
  }

  tracer(from, to, color) {
    const t = this.tracers[this.tNext];
    this.tNext = (this.tNext + 1) % MAX_T;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from).lerp(to, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.035, 0.035, len);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.85;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, grav = 12) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAX_P;
    const p = this.parts[i];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size; p.life = p.max = life; p.grav = grav;
    this.pMesh.setColorAt(i, _c.setHex(color));
    this.pMesh.instanceColor.needsUpdate = true;
  }

  impact(p, nx, ny, nz, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 3.5;
      this.spawn(p.x, p.y, p.z,
        (nx + (Math.random() - 0.5) * 1.4) * s, (ny + (Math.random() - 0.3) * 1.4) * s, (nz + (Math.random() - 0.5) * 1.4) * s,
        color, 0.04 + Math.random() * 0.05, 0.25 + Math.random() * 0.3);
    }
  }

  burst(x, y, z, color, n = 26, speed = 6, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.4 - 0.3, s = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s,
        color, size * (0.5 + Math.random()), 0.5 + Math.random() * 0.6);
    }
  }

  damageNumber(pos, amount, head, shield) {
    const el = document.createElement('div');
    el.className = 'floater' + (head ? ' head' : shield ? ' shield' : '');
    el.textContent = Math.max(1, Math.round(amount));
    this.layer.appendChild(el);
    this.floaters.push({ el, x: pos.x + (Math.random() - 0.5) * 0.4, y: pos.y + 0.3, z: pos.z + (Math.random() - 0.5) * 0.4, life: 0.8 });
    if (this.floaters.length > 24) this.floaters.shift().el.remove();
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) { _m.makeScale(0, 0, 0); this.pMesh.setMatrixAt(i, _m); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      this.pMesh.setMatrixAt(i, _m);
    }
    if (any) this.pMesh.instanceMatrix.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) t.mesh.visible = false;
    }

    const w = innerWidth, h = innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      f.y += dt * 1.1;
      _v.set(f.x, f.y, f.z).project(this.camera);
      if (_v.z > 1) { f.el.style.opacity = 0; continue; }
      f.el.style.opacity = Math.min(1, f.life * 3);
      f.el.style.left = ((_v.x * 0.5 + 0.5) * w) + 'px';
      f.el.style.top = ((-_v.y * 0.5 + 0.5) * h) + 'px';
    }
  }

  clear() {
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
  }
}
