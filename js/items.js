// Cápsulas de suministro y objetos que se recogen al pasar.
import * as THREE from 'three';

const KIND = {
  ammo: { color: 0xffb347, label: 'Munición' },
  shield: { color: 0x5ab8ff, label: 'Escudo' },
  med: { color: 0x3ddc84, label: 'Reparación' },
  mats: { color: 0x9b6bff, label: 'Placas' },
};

export class Items {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.pickups = [];
    this.pods = [];
    this.geo = new THREE.OctahedronGeometry(0.26, 0);
    this.mats = {};
    for (const k in KIND) this.mats[k] = new THREE.MeshStandardMaterial({ color: KIND[k].color, emissive: KIND[k].color, emissiveIntensity: 1.4, roughness: 0.3, flatShading: true });

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2738, roughness: 0.5, metalness: 0.5, flatShading: true });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 2.2 });
    const off = new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.8 });
    for (const p of game.world.pods) {
      const y = p.y || 0;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.95), bodyMat);
      base.position.y = 0.375;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 0.99), glow);
      band.position.y = 0.5;
      const lid = new THREE.Group();
      lid.position.set(0, 0.75, -0.475);
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.95), bodyMat);
      lidMesh.position.set(0, 0.07, 0.475);
      lid.add(lidMesh);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 14, 6), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 7.8;
      g.add(base, band, lid, beam);
      g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
      g.position.set(p.x, y, p.z);
      this.scene.add(g);
      game.world.addBox(p.x - 0.75, y, p.z - 0.475, p.x + 0.75, y + 0.8, p.z + 0.475);
      this.pods.push({ x: p.x, y, z: p.z, open: false, lid, band, beam, off, t: 0 });
    }
  }

  drop(kind, x, y, z) {
    const m = new THREE.Mesh(this.geo, this.mats[kind]);
    m.position.set(x, y + 0.6, z);
    this.scene.add(m);
    this.pickups.push({ kind, mesh: m, x, y, z, t: Math.random() * 6, age: 0 });
  }

  dropLoot(x, y, z, rich) {
    const build = this.game.mode === 'build';
    const spots = [[0.9, 0], [-0.6, 0.8], [-0.5, -0.8], [0.4, 1.1]];
    const kinds = ['ammo', Math.random() < 0.5 ? 'shield' : 'med'];
    if (build) kinds.push('mats');
    else if (rich) kinds.push('ammo');
    if (rich) kinds.push(Math.random() < 0.5 ? 'shield' : 'med');
    kinds.forEach((k, n) => this.drop(k, x + spots[n][0], y, z + spots[n][1]));
  }

  nearestPod(b) {
    let best = null, bd = 2.6;
    for (const p of this.pods) {
      if (p.open) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bd && Math.abs(p.y - b.y) < 2) { bd = d; best = p; }
    }
    return best;
  }

  openPod(p) {
    if (p.open) return;
    p.open = true;
    p.band.material = p.off;
    p.beam.visible = false;
    const b = this.game.player.body;
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
    this.dropLoot(p.x + (dx / d) * 1.5, p.y, p.z + (dz / d) * 1.5, true);
    this.game.sfx.pod();
  }

  collect(pk) {
    const pl = this.game.player;
    if (pk.kind === 'ammo') {
      for (const w of pl.weapons) w.reserve += w.def.ammoGain;
      this.game.hud.toast('+ Munición');
    } else if (pk.kind === 'shield') {
      if (pl.shield >= 100) return false;
      pl.shield = Math.min(100, pl.shield + 25);
      this.game.hud.toast('+25 Escudo');
    } else if (pk.kind === 'med') {
      if (pl.health >= 100) return false;
      pl.health = Math.min(100, pl.health + 30);
      this.game.hud.toast('+30 Integridad');
    } else {
      pl.mats = Math.min(999, pl.mats + 50);
      this.game.hud.toast('+50 Placas');
    }
    this.game.sfx.pickup();
    return true;
  }

  update(dt) {
    const pl = this.game.player, b = pl.body;
    for (const p of this.pods) {
      if (p.open && p.t < 1) { p.t = Math.min(1, p.t + dt * 4); p.lid.rotation.x = -1.9 * p.t; }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt; pk.age += dt;
      pk.mesh.position.y = pk.y + 0.6 + Math.sin(pk.t * 2.4) * 0.1;
      pk.mesh.rotation.y = pk.t * 1.8;
      if (pl.alive && pk.age > 0.35 && Math.abs(pk.x - b.x) < 1.3 && Math.abs(pk.z - b.z) < 1.3 && Math.abs(pk.y - b.y) < 2.2) {
        if (this.collect(pk)) {
          this.scene.remove(pk.mesh);
          this.pickups.splice(i, 1);
        }
      }
    }
  }
}
