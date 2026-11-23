// ANILLO CERO — arranque, bucle principal y reglas de la partida.
import * as THREE from 'three';
import { Input } from './input.js';
import { World, buildArena } from './world.js';
import { BuildSystem } from './build.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Items } from './items.js';
import { Zone } from './zone.js';
import { FX } from './fx.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const params = new URLSearchParams(location.search);
const NO_LOCK = params.has('nolock'); // para pruebas automáticas sin captura de puntero

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const input = new Input();
input.freeLook = NO_LOCK;
const hud = new Hud();
const sfx = new Sfx();
const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.35).normalize();

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sun;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 hor = vec3(1.0, 0.74, 0.52), mid = vec3(0.80, 0.36, 0.55), top = vec3(0.16, 0.10, 0.36);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, h));
        c = mix(c, top, smoothstep(0.2, 0.8, h));
        c = mix(c, hor * 0.92, smoothstep(0.0, -0.2, h));
        float s = max(dot(d, sun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * pow(s, 220.0) * 1.5 + vec3(1.0, 0.55, 0.35) * pow(s, 8.0) * 0.28;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), mat);
  m.frustumCulled = false;
  return m;
}

class Game {
  constructor(mode) {
    this.mode = mode;
    this.input = input;
    this.hud = hud;
    this.sfx = sfx;
    this.time = 0;
    this.over = false;
    this.overT = 0;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf0b890, 90, 420);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
    this.sky = makeSky();
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(0xb9a8ff, 0x8a5a48, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xffd9b0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    this.world = new World(scene);
    buildArena(this.world, scene, (Math.random() * 1e9) | 0, mode);
    this.fx = new FX(scene, this.camera, $('floaters'));
    this.actors = [];
    this.build = mode === 'build' ? new BuildSystem(this) : null;

    const spawns = this.world.spawns;
    this.player = new Player(this, spawns[0]);
    this.actors.push(this.player);
    this.bots = [];
    for (let i = 1; i < spawns.length; i++) {
      const bot = new Bot(this, i - 1, spawns[i]);
      this.bots.push(bot);
      this.actors.push(bot);
    }
    this.items = new Items(this);
    this.zone = new Zone(this, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
    hud.start(this);
    this.player.updateCamera(0.016);
  }

  get aliveCount() {
    let n = 0;
    for (const a of this.actors) if (a.alive) n++;
    return n;
  }

  update(dt) {
    this.time += dt;
    this.player.update(dt);
    for (const b of this.bots) b.update(dt);
    if (this.build) this.build.update(dt);
    this.items.update(dt);
    this.zone.update(dt);
    this.fx.update(dt);
    hud.update(dt);

    const p = this.player.body;
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.position.set(p.x + SUN_DIR.x * 120, SUN_DIR.y * 120, p.z + SUN_DIR.z * 120);
    this.sky.position.copy(this.camera.position);

    if (this.over) {
      this.overT += dt;
      if (this.overT > 1.4 && !this.shown) { this.shown = true; showEnd(this); }
    }
  }

  // --- Reglas ---
  damageActor(victim, amount, attacker, head, point) {
    if (!victim.alive || this.over && victim.isPlayer) return;
    const hadShield = victim.shield > 0;
    const s = Math.min(victim.shield, amount);
    victim.shield -= s;
    victim.health -= amount - s;
    const dead = victim.health <= 0;
    if (attacker && attacker.isPlayer) {
      hud.hitmarker(head, dead);
      if (point) this.fx.damageNumber(point, amount, head, hadShield);
      sfx.hit(head);
    }
    if (victim.isPlayer) {
      let angle = null;
      if (attacker) {
        const dx = attacker.body.x - victim.body.x, dz = attacker.body.z - victim.body.z, y = victim.yaw;
        angle = Math.atan2(dx * Math.cos(y) - dz * Math.sin(y), -dx * Math.sin(y) - dz * Math.cos(y));
      }
      hud.hurt(amount, angle);
      sfx.hurt();
    } else victim.onDamaged(attacker);
    if (dead) this.kill(victim, attacker);
  }

  kill(victim, attacker) {
    victim.alive = false;
    victim.health = 0;
    victim.die();
    const b = victim.body;
    if (attacker) {
      attacker.kills++;
      hud.feed(`<b>${attacker.name}</b> eliminó a <b>${victim.name}</b>`, attacker.isPlayer || victim.isPlayer);
    } else hud.feed(`<b>${victim.name}</b> cayó fuera del anillo`, victim.isPlayer);
    if (!victim.isPlayer) {
      this.items.dropLoot(b.x, b.y, b.z, false);
      if (attacker && attacker.isPlayer) sfx.kill();
    }
    const alive = this.aliveCount;
    if (victim.isPlayer) this.finish(false, alive + 1);
    else if (alive === 1 && this.player.alive) this.finish(true, 1);
  }

  finish(win, rank) {
    if (this.over) return;
    this.over = true;
    this.win = win;
    this.rank = rank;
    if (win) sfx.win(); else sfx.lose();
  }

  onBuilt(piece) {
    const p = this.player.body, m = piece.mesh.position;
    if (piece.owner === this.player || Math.hypot(m.x - p.x, m.z - p.z) < 40) sfx.build();
  }

  onBroken(piece) {
    const p = this.player.body, m = piece.mesh.position;
    sfx.breakPiece(Math.max(0, 1 - Math.hypot(m.x - p.x, m.z - p.z) / 60));
  }

  dispose() {
    this.fx.clear();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Estados: menú → jugando ⇄ pausa → fin
// ---------------------------------------------------------------------------
let game = null;
let state = 'menu';
let lastMode = 'build';

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function lockPointer() {
  if (NO_LOCK) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* sin captura: se queda en pausa */ }
}

function startMatch(mode) {
  lastMode = mode;
  sfx.init();
  if (game) game.dispose();
  game = new Game(mode);
  window.__game = game;
  show('menu', false); show('end', false); show('pause', false);
  input.clear();
  input.enabled = true;
  state = 'playing';
  lockPointer();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.enabled = false;
  input.clear();
  show('pause', true);
}

function resume() {
  if (state !== 'paused') return;
  show('pause', false);
  input.clear();
  input.enabled = true;
  state = 'playing';
  lockPointer();
}

function toMenu() {
  state = 'menu';
  input.enabled = false;
  hud.hide();
  show('pause', false); show('end', false); show('menu', true);
  if (document.pointerLockElement) document.exitPointerLock();
}

function showEnd(g) {
  state = 'ended';
  input.enabled = false;
  input.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  const t = $('endtitle');
  t.textContent = g.win ? 'VICTORIA' : 'ELIMINADO';
  t.className = g.win ? 'win' : 'lose';
  $('endsub').textContent = g.win
    ? `Último androide en pie · ${g.player.kills} bajas`
    : `Puesto n.º ${g.rank} de ${g.actors.length} · ${g.player.kills} bajas`;
  show('end', true);
}

document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.mode)));
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', toMenu);
$('again').addEventListener('click', () => startMatch(lastMode));
$('tomenu').addEventListener('click', toMenu);
canvas.addEventListener('click', () => { if (state === 'playing' && !input.locked) lockPointer(); });

document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === canvas;
  if (!input.locked && state === 'playing' && !NO_LOCK) pause();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && NO_LOCK) { if (state === 'playing') pause(); else if (state === 'paused') resume(); }
});
addEventListener('blur', () => { if (!NO_LOCK) pause(); });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (game) { game.camera.aspect = innerWidth / innerHeight; game.camera.updateProjectionMatrix(); }
}
addEventListener('resize', resize);

// Escena de fondo para el menú: una partida de exhibición en pausa visual.
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (game) {
    if (state === 'playing' || state === 'ended') game.update(dt);
    renderer.render(game.scene, game.camera);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
window.__state = () => state;
