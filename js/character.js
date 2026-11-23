// Androide hecho con primitivas y animado por código (sin clips externos).
import * as THREE from 'three';
import { damp, clamp, lerp } from './util.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const L1 = 0.31, L2 = 0.31;           // brazo y antebrazo
const THIGH = 0.45, SHIN = 0.5, HIP_Y = 0.95;

function mat(color, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, flatShading: true, ...extra });
}
function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// --- Armas -----------------------------------------------------------------
export function makeGun(kind, accent) {
  const g = new THREE.Group();
  const dark = mat(0x3b3646, { metalness: 0.5, roughness: 0.4 });
  const mid = mat(0x7d7690, { metalness: 0.45, roughness: 0.45 });
  const acc = mat(accent, { emissive: accent, emissiveIntensity: 0.4 });
  const muzzle = new THREE.Object3D();
  let mag, fore;
  const barrel = (r, len, y, z) => {
    const b = part(new THREE.CylinderGeometry(r, r, len, 8), dark, 0, y, z);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  };
  if (kind === 'rifle') {
    g.add(part(box(0.06, 0.1, 0.44), mid, 0, 0.03, -0.12));
    g.add(part(box(0.05, 0.065, 0.26), dark, 0, 0.035, -0.45));
    barrel(0.014, 0.2, 0.04, -0.66);
    g.add(part(box(0.045, 0.09, 0.2), dark, 0, 0.0, 0.2));
    g.add(part(box(0.04, 0.12, 0.05), dark, 0, -0.07, 0.02));
    g.add(part(box(0.02, 0.03, 0.12), acc, 0, 0.1, -0.1));
    mag = part(box(0.035, 0.16, 0.07), acc, 0, -0.1, -0.15);
    mag.rotation.x = 0.2;
    muzzle.position.set(0, 0.04, -0.77);
    fore = -0.42;
  } else if (kind === 'shotgun') {
    g.add(part(box(0.065, 0.1, 0.36), mid, 0, 0.03, -0.08));
    barrel(0.022, 0.5, 0.055, -0.5);
    barrel(0.016, 0.4, 0.01, -0.45);
    g.add(part(box(0.07, 0.06, 0.16), acc, 0, 0.0, -0.42));
    g.add(part(box(0.045, 0.1, 0.24), dark, 0, -0.01, 0.2));
    g.add(part(box(0.04, 0.11, 0.05), dark, 0, -0.07, 0.04));
    mag = part(box(0.05, 0.03, 0.14), acc, 0, -0.03, -0.12);
    muzzle.position.set(0, 0.055, -0.77);
    fore = -0.42;
  } else {
    g.add(part(box(0.06, 0.12, 0.3), mid, 0, 0.03, -0.08));
    barrel(0.016, 0.14, 0.05, -0.3);
    g.add(part(box(0.05, 0.05, 0.1), dark, 0, 0.0, -0.27));
    g.add(part(box(0.04, 0.1, 0.05), dark, 0, -0.07, 0.04));
    g.add(part(box(0.03, 0.05, 0.14), dark, 0, 0.03, 0.14));
    g.add(part(box(0.02, 0.025, 0.1), acc, 0, 0.105, -0.06));
    mag = part(box(0.032, 0.2, 0.05), acc, 0, -0.12, -0.12);
    muzzle.position.set(0, 0.05, -0.38);
    fore = -0.25;
  }
  g.add(mag, muzzle);
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.3, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.rotation.x = Math.PI / 2;
  flash.position.copy(muzzle.position);
  flash.position.z -= 0.15;
  flash.visible = false;
  g.add(flash);
  g.userData = { muzzle, mag, flash, fore, flashT: 0 };
  return g;
}

// --- Personaje ---------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const SHOULDER_R = new THREE.Vector3(0.26, 0.5, 0), SHOULDER_L = new THREE.Vector3(-0.26, 0.5, 0);
const POLE_R = new THREE.Vector3(0.7, -1, 0.35), POLE_L = new THREE.Vector3(-0.7, -1, 0.35);
const BELT = new THREE.Vector3(-0.14, 0.02, -0.16), REST_L = new THREE.Vector3(-0.32, 0.0, -0.1);

export class Character {
  constructor({ body = 0x2f2b3c, accent = 0x2de2c8, visor = 0xa8fff2 } = {}) {
    const root = this.root = new THREE.Group();
    const mBody = mat(body), mAcc = mat(accent), mDark = mat(0x3a3548, { metalness: 0.4 });
    const mVisor = new THREE.MeshStandardMaterial({ color: visor, emissive: visor, emissiveIntensity: 1.6, roughness: 0.3 });
    this.accent = accent;

    this.pelvis = new THREE.Group();
    root.add(this.pelvis);
    this.lower = new THREE.Group();
    this.pelvis.add(this.lower);
    this.lower.add(part(box(0.34, 0.16, 0.22), mDark, 0, 0.02, 0));

    const mkLeg = (side) => {
      const leg = new THREE.Group();
      leg.position.set(0.11 * side, 0, 0);
      leg.add(part(box(0.15, THIGH, 0.17), mBody, 0, -THIGH / 2, 0));
      const shin = new THREE.Group();
      shin.position.y = -THIGH;
      shin.add(part(box(0.13, SHIN - 0.06, 0.15), mAcc, 0, -(SHIN - 0.06) / 2, 0));
      shin.add(part(box(0.15, 0.09, 0.28), mDark, 0, -SHIN + 0.045, -0.05));
      leg.add(shin);
      this.lower.add(leg);
      return { leg, shin };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    const spine = this.spine = new THREE.Group();
    spine.position.y = 0.1;
    this.pelvis.add(spine);
    spine.add(part(box(0.42, 0.5, 0.25), mBody, 0, 0.3, 0));
    spine.add(part(box(0.3, 0.2, 0.04), mAcc, 0, 0.38, -0.135));
    spine.add(part(box(0.28, 0.34, 0.12), mDark, 0, 0.32, 0.18));
    spine.add(part(box(0.06, 0.2, 0.04), mVisor, 0, 0.32, 0.245));

    const head = this.head = new THREE.Group();
    head.position.y = 0.66;
    head.add(part(box(0.24, 0.24, 0.26), mBody));
    head.add(part(box(0.2, 0.07, 0.03), mVisor, 0, 0.02, -0.135));
    head.add(part(box(0.26, 0.05, 0.2), mAcc, 0, 0.13, 0.02));
    head.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5), mDark, 0.09, 0.22, 0.06));
    spine.add(head);

    const mkArm = () => {
      const upper = new THREE.Group(), lower = new THREE.Group();
      upper.add(part(box(0.11, L1, 0.11), mBody, 0, -L1 / 2, 0));
      lower.add(part(box(0.095, L2, 0.095), mAcc, 0, -L2 / 2, 0));
      lower.add(part(box(0.09, 0.09, 0.11), mDark, 0, -L2, 0));
      spine.add(upper, lower);
      return { upper, lower };
    };
    this.armL = mkArm();
    this.armR = mkArm();

    this.gunHolder = new THREE.Group();
    spine.add(this.gunHolder);
    this.guns = {};
    this.gun = null;

    // Emisor de luz sólida para el modo construcción
    this.tool = new THREE.Group();
    this.tool.add(part(box(0.07, 0.07, 0.18), mDark, 0, 0, -0.05));
    this.tool.add(part(box(0.11, 0.11, 0.03), new THREE.MeshStandardMaterial({ color: 0x9b6bff, emissive: 0x9b6bff, emissiveIntensity: 2 }), 0, 0, -0.15));
    this.tool.visible = false;
    this.gunHolder.add(this.tool);

    this.phase = 0;
    this.cw = 0; this.sw = 0; this.aw = 0; this.run = 0; this.sprintW = 0; this.twist = 0; this.buildW = 0;
    this.stepped = false; // se activa el fotograma en que un pie toca el suelo
  }

  addGun(kind) {
    const g = makeGun(kind, this.accent);
    g.visible = false;
    this.guns[kind] = g;
    this.gunHolder.add(g);
    return g;
  }

  setGun(kind) {
    for (const k in this.guns) this.guns[k].visible = k === kind;
    this.gun = this.guns[kind];
  }

  flash() {
    if (!this.gun) return;
    const u = this.gun.userData;
    u.flash.visible = true;
    u.flash.rotation.y = Math.random() * 6.28;
    u.flashT = 0.045;
  }

  // s: { speed, fwd, strafe, grounded, crouch, slide, sprint, pitch, kick, reloadT, build }
  update(dt, s) {
    const cw = this.cw = damp(this.cw, s.crouch && !s.slide ? 1 : 0, 14, dt);
    const sw = this.sw = damp(this.sw, s.slide ? 1 : 0, 16, dt);
    const aw = this.aw = damp(this.aw, s.grounded ? 0 : 1, 12, dt);
    const moving = s.speed > 0.4;
    const run = this.run = damp(this.run, moving ? clamp(s.speed / 8.4, 0.25, 1.15) : 0, 12, dt);
    const back = s.fwd < -0.3;

    const prev = Math.sin(this.phase);
    if (moving && !s.slide) this.phase += dt * (3.5 + s.speed * 1.5) * (back ? -1 : 1);
    const p = this.phase;
    this.stepped = s.grounded && moving && !s.slide && (prev * Math.sin(p) < 0);

    // Las piernas giran hacia la dirección de avance.
    let tw = 0;
    if (moving) tw = back ? Math.atan2(s.strafe, -s.fwd) : Math.atan2(-s.strafe, Math.max(s.fwd, 0.001));
    this.twist = damp(this.twist, clamp(tw, -1.0, 1.0), 12, dt);
    this.lower.rotation.y = this.twist;

    const A = 0.85 * run * (1 - 0.45 * cw);
    let thL = Math.sin(p) * A, thR = -Math.sin(p) * A;
    let knL = 0.12 * run + 1.25 * A * Math.max(0, Math.cos(p));
    let knR = 0.12 * run + 1.25 * A * Math.max(0, -Math.cos(p));
    thL += cw; thR += cw; knL += 1.7 * cw; knR += 1.7 * cw;            // agachado
    thL = lerp(thL, 0.7, aw); knL = lerp(knL, 1.1, aw);                // en el aire
    thR = lerp(thR, -0.1, aw); knR = lerp(knR, 0.55, aw);
    thL = lerp(thL, 0.7, sw); knL = lerp(knL, 2.0, sw);                // deslizándose
    thR = lerp(thR, 0.95, sw); knR = lerp(knR, 0.15, sw);
    this.legL.leg.rotation.x = thL; this.legL.shin.rotation.x = -knL;
    this.legR.leg.rotation.x = thR; this.legR.shin.rotation.x = -knR;

    let hipY = HIP_Y - 0.33 * cw - Math.abs(Math.cos(p)) * 0.04 * run;
    hipY = lerp(hipY, 0.34, sw);
    this.pelvis.position.y = hipY;
    this.pelvis.rotation.x = lerp(-0.1 * run * (s.sprint ? 1.8 : 1), 0.55, sw);
    this.pelvis.rotation.z = Math.sin(p) * 0.04 * run;
    this.spine.rotation.x = s.pitch * 0.55 - 0.3 * cw - 0.2 * sw;
    this.spine.rotation.y = -this.twist * 0.25;
    this.head.rotation.x = s.pitch * 0.35;

    // Arma y brazos (cinemática inversa de dos huesos).
    const gh = this.gunHolder;
    const bw = this.buildW = damp(this.buildW, s.build ? 1 : 0, 16, dt);
    const sprintW = this.sprintW = damp(this.sprintW, s.sprint && s.kick < 0.05 && s.reloadT < 0 && !s.build ? 1 : 0, 10, dt);
    let gx = 0.15, gy = 0.36, gz = -0.3, rx = 0, ry = 0, rz = 0, hand = 0;
    ry += 0.75 * sprintW; rx -= 0.35 * sprintW; gx -= 0.05 * sprintW; gy -= 0.06 * sprintW;
    gz += 0.07 * s.kick; rx += 0.08 * s.kick;
    const gun = this.gun, ud = gun ? gun.userData : null;
    if (s.reloadT >= 0) {
      const t = clamp(s.reloadT, 0, 1), w = Math.sin(Math.PI * t);
      rz += 0.5 * w; rx += 0.35 * w; gy -= 0.04 * w;
      hand = clamp((t - 0.15) / 0.15, 0, 1) * clamp((0.75 - t) / 0.15, 0, 1);
      if (ud) ud.mag.visible = !(t > 0.25 && t < 0.62);
    } else if (ud) ud.mag.visible = true;
    gy += 0.02 * bw; gz -= 0.1 * bw;
    gh.position.set(gx, gy, gz);
    gh.rotation.set(rx, ry, rz);
    gh.updateMatrix();
    if (gun) gun.visible = !s.build;
    this.tool.visible = !!s.build;

    _a.set(0, -0.05, 0.03).applyMatrix4(gh.matrix);
    this.solveArm(this.armR, SHOULDER_R, _a, POLE_R);
    _b.set(0, 0.0, ud ? ud.fore : -0.3).applyMatrix4(gh.matrix);
    _b.lerp(BELT, hand).lerp(REST_L, Math.max(bw, sw * 0.8));
    this.solveArm(this.armL, SHOULDER_L, _b, POLE_L);

    if (ud && ud.flashT > 0) { ud.flashT -= dt; if (ud.flashT <= 0) ud.flash.visible = false; }
  }

  solveArm(arm, S, T, pole) {
    _c.subVectors(T, S);
    const dist = clamp(_c.length(), 0.08, L1 + L2 - 0.002);
    _c.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _d.copy(pole).addScaledVector(_c, -pole.dot(_c)).normalize();
    // codo
    const ex = S.x + _c.x * a + _d.x * h, ey = S.y + _c.y * a + _d.y * h, ez = S.z + _c.z * a + _d.z * h;
    const hx = S.x + _c.x * dist, hy = S.y + _c.y * dist, hz = S.z + _c.z * dist;
    arm.upper.position.copy(S);
    _d.set(ex - S.x, ey - S.y, ez - S.z).normalize();
    arm.upper.quaternion.setFromUnitVectors(DOWN, _d);
    arm.lower.position.set(ex, ey, ez);
    _d.set(hx - ex, hy - ey, hz - ez).normalize();
    arm.lower.quaternion.setFromUnitVectors(DOWN, _d);
  }

  muzzleWorld(out) {
    if (!this.gun) return out.copy(this.root.position).setY(this.root.position.y + 1.3);
    return this.gun.userData.muzzle.getWorldPosition(out);
  }
}
