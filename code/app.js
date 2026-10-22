// Yaga Game: Pani Yaga living in the clearing. She hunts bugs, sleeps under the tree at night
// and complains about everything. World and brain come from the whybox.ai pet game; the black box
// creature is replaced by the rigged, dressed 3D Pani Yaga (assets/models/pani-yaga-dressed.glb).
import * as THREE from './lib/three.module.js';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';
import { BUGS, makeBug } from './bug-models.js';
import { loadWorld, terrainMeshes, groundY, walkable, nearest, waypoint, kindAt, blockCentre, tillCell } from './terrain.js';
import { rigAt, placeCamera, ZOOM } from './camera-rig.js';
import { BROOM_MATERIAL, SWING, makeShovel, attachInHand } from './tools.js';
import { FARM, CROPS, GROW, stageOf, makeCrop } from './farm.js';
import SET from '../settings.js';
import { makeChicken, makeEgg } from './chickens.js';

/* ───────────── helpers ───────────── */
const $ = (s) => document.querySelector(s);
const show = (el, on) => el.toggleAttribute('hidden', !on);   // works on SVG too
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (c, t, k, dt) => c + (t - c) * (1 - Math.exp(-k * dt));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

/* ───────────── words: everything said or labelled in the game lives in words/en.json ───────────── */
let LINES, HOUSE_LINES, BOX_LINES, DEFEND, ARGUMENTS, POKE_END, GLY, WORDS, TOKS, BUG, UI;
/** Takes the loaded words file into use. Boot calls this before anything is said. */
function useWords(w) {
  ({ yaga: LINES, house: HOUSE_LINES, box: BOX_LINES, defendBox: DEFEND, arguments: ARGUMENTS, pokeEnd: POKE_END, bugs: BUG, ui: UI } = w);
  ({ glyphs: GLY, words: WORDS, tokens: TOKS } = w.gibberish);
  document.documentElement.lang = w.lang;
}
/** Fills the {name} slots of a template; slots it is not given are left as they are. */
const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
/** The bug's plain name ('ant'), or its id if the words file does not know it. */
const bugName = (id) => (BUG[id] ? BUG[id].name : id);
/** Puts the words into the page's fixed labels: data-word is the text, data-word-aria the aria-label, data-word-alt the alt text. */
function labelPage() {
  const at = (path) => path.split('.').reduce((o, k) => o[k], UI);
  document.title = UI.title;
  for (const el of document.querySelectorAll('[data-word]')) el.textContent = at(el.dataset.word);
  for (const el of document.querySelectorAll('[data-word-aria]')) el.setAttribute('aria-label', at(el.dataset.wordAria));
  for (const el of document.querySelectorAll('[data-word-alt]')) el.setAttribute('alt', at(el.dataset.wordAlt));
}

/* ───────────── world constants (from the original clearing) ───────────── */
// the homepage palette: cream and terracotta by day; by night its dark brown (#1C1A17), lit by the tree lamp and stars
const DAY = {
  bg: '#e8dccb', ground: 0x5b4a3b, exposure: 1.08, fog: [6, 40],
  hemi: { sky: 0xfff1e0, ground: 0x5c4434, i: 1.5 },
  key: { c: 0xFFE2C2, i: 2.9 }, rim: { c: 0xF0B48A, i: 1.2 }, fill: { c: 0xD8A07C, i: 0.6 },
};
const NIGHT = {
  bg: '#1C1A17', ground: 0x35291f, exposure: 1.05, fog: [4, 30],
  hemi: { sky: 0x8c7b68, ground: 0x0e0c0a, i: 0.8 },
  key: { c: 0xFFD6AE, i: 2.1 }, rim: { c: 0xCF6E42, i: 1.5 }, fill: { c: 0x5c3a28, i: 0.4 },
};
// sky canvas: base colour plus three soft glows, each blended day → night as [r, g, b, a]
const SKY = {
  base: [[240, 234, 220, 1], [21, 20, 18, 1]],
  tree: [[[246, 200, 160, 1], [86, 44, 26, 1]], [[240, 214, 190, 0.75], [40, 26, 18, 0.75]], [[240, 234, 220, 0], [21, 20, 18, 0]]],
  right: [[[214, 206, 168, 0.7], [44, 48, 26, 0.7]], [[214, 206, 168, 0], [44, 48, 26, 0]]],
  left: [[[236, 176, 146, 0.6], [70, 22, 16, 0.55]], [[236, 176, 146, 0], [70, 22, 16, 0]]],
};
// the clearing's model, recoloured from purple to the homepage's browns, gold and red
const ENV_COLORS = { M_Env_Bark: 0x5a3a2a, M_Env_Rock: 0x9a7a60, M_Env_Peak: 0xD6A446, M_Env_Leaf: 0xDE8053, M_Env_Fruit: 0xB32A1F };
const GLOW_COLOR = 0xD6A446;                // the homepage gold
const TREE_PARTS = /^(Tree_|Branch_|Leaf_|Fruit_)/;
const GLOW = { bark: 0.3, leaf: 0.6, fruit: 2.6 };
const PROP_SCALE = 0.7;
const FRUITS = ['strawberry', 'orange', 'blueberry', 'mushroom'];   // hidden for now: she eats bugs
const FOODS = BUGS.map((b) => b.id);
const BUG_SIZE = 0.4;                     // bugs at 40% of the original game's size, so Pani Yaga towers over them
const BUG_S = 2.6 * BUG_SIZE;             // bug-models units → world
const BUG_TAP_R = 0.45;                   // world radius of a bug's invisible tap target, so small bugs stay easy to tap
const BOX_S = 0.2;                        // the black box sidekick: creature units → world (ankle-high to her)
const BODY_R = 0.86;                      // how close things may come to her (world units)
const SPAWN = { x: 0.2, z: 1.2 };         // where she starts; the terrain's walkable area grows from here
const TREE = { x: 3.25, z: -2.05 };
const TREE_SCALE = 0.8;                  // the middle tree, a little smaller than in the original clearing
const POO_SCALE = 0.6;                    // poo, smaller than the original
const OBSTACLES = [
  { x: 3.25, z: -2.05, r: 0.55 * TREE_SCALE + BODY_R },
  { x: 4.65, z: -2.15, r: 1.0 + BODY_R },
  { x: 5.45, z: -1.85, r: 0.8 + BODY_R },
];
const ROAM = { x0: -34, x1: 38, z0: -18, z1: 12 };   // the whole walkable field; the camera follows her around it
// extra trees and rock clusters across the field (world x, z, size), so there is somewhere to go
const SCENERY = {
  trees: [[-14, -6, 1.0], [18, -9, 0.9], [-25, 4, 0.8], [28, 3, 1.05], [7, -13, 0.75]],
  rocks: [[-8, 5], [15, 6], [-21, -11], [25, -5], [33, -13], [-29, -3]],
};
const CANOPY = new THREE.Vector3(3.25, 3.4 * TREE_SCALE, -2.05);
const SAVE_KEY = 'yaga-pet-v1';
const DOCK_H = 100;                       // px at the bottom of the screen taken by the hotbar
const FLOCK = SET.hens.flock;             // the hens she keeps
const DAY_LEN = SET.day.length;           // seconds per in-game day (24h)
const DAWN = SET.day.nightEnds / 24, DUSK = SET.day.nightStarts / 24;   // night runs 20:00 → 06:00
const dayRaw = () => ((Date.now() / 1000) % DAY_LEN + DAY_LEN) % DAY_LEN;
const dayFrac = () => (((dayRaw() + (S.dayOff || 0)) % DAY_LEN) + DAY_LEN) % DAY_LEN / DAY_LEN;
const isNightAt = (f) => f >= DUSK || f < DAWN;
function setDayFrac(f) { S.dayOff = ((f * DAY_LEN - dayRaw()) % DAY_LEN + DAY_LEN) % DAY_LEN; }
// the homepage's expressions: lids, brow tilt (upper lid angle), eye scale per mouth
const FACES = {
  grin:   { up: 0.5,  lo: -0.4,  tilt: 0,    es: 0.86 },
  smile:  { up: 0.36, lo: -0.5,  tilt: 0,    es: 0.86 },
  oh:     { up: 0.86, lo: -0.88, tilt: -0.1, es: 0.95 },
  grumpy: { up: 0.12, lo: -0.5,  tilt: 0.42, es: 0.86 },
  snarl:  { up: 0.06, lo: -0.42, tilt: 0.48, es: 0.86 },
};

/* ───────────── Pani Yaga: the rigged 3D model from the homepage, driven by the same brain ───────────── */
// The brain talks to the pet through a small interface (pos, heading, startHop, want, touch, poke).
// Hops become short walks; moods and moments pick one of her 31 animations.
const YAGA_H = 2.1;                       // her height in world units
const MODEL_H = 0.98;                     // model units, feet to hair
const WALK_PACE = SET.her.walkPace;         // she strolls 30% quicker than the walk clip
const WALK_SPEED = 0.562 * WALK_PACE * YAGA_H / MODEL_H;   // ground covered by the walk cycle, so feet don't slide
const RUN_PACE = SET.her.runPace;           // the run clip is a sprint; she jogs at 80% of it
const RUN_SPEED = 2.05 * RUN_PACE * YAGA_H / MODEL_H;
const BORED_AFTER = 20;                    // seconds without input before she gets visibly bored
const BORED_CLIPS = ['standing_relax', 'look_around', 'wait'];
const DOUBLE_TAP = { ms: 350, px: 48 };    // a second ground tap this soon and this close: run
const FADE = 0.25;                        // animation crossfade, seconds

class YagaPet {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.squash = new THREE.Group(); this.root.add(this.squash);
    this.squash.scale.setScalar(YAGA_H / 2.2);     // the game places her head at 2.2 × squash
    this.creature = new THREE.Group(); this.squash.add(this.creature);
    const model = gltf.scene; model.scale.setScalar(2.2 / MODEL_H); this.creature.add(model);
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      // a soft self-light from her own texture, so she reads in the dark violet clearing
      o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0xffffff);
      this.mats.push(o.material);
      if (o.material.name === BROOM_MATERIAL) this.broom = o;
    });
    const shovel = makeShovel(); this.shovel = shovel.group; this.mats.push(...shovel.mats);
    attachInHand(model, this.shovel);
    this.holds(S.tool);

    this.mixer = new THREE.AnimationMixer(model);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name.replace(/\.\d+$/, ''), c]));
    this.clips.swing = this.clips[SWING.clip];      // the broom swing's real name is a long text prompt
    this.action = null; this.clipName = null; this.oneShot = null; this.lastWalk = -9;
    this.gait = 'walk';                             // kept through the brain's tiny gaps between hops

    // tap and petting volume, slightly bigger than her
    const s = this.squash.scale.x;
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(0.9 / s, 2.25, 0.8 / s), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.position.y = 1.12; this.creature.add(this.proxy);
    this.mouthPoint = new THREE.Object3D(); this.mouthPoint.position.set(0, 2.2 * 0.8, 0.18 / s); this.creature.add(this.mouthPoint);

    this.heading = 0.3; this.faceTo = null; this.turnRate = 7;
    this.hop = null; this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3();
    this.st = { puffV: 0 };                         // the brain nudges this spring; she shrugs it off
    this.want = { up: 0.36, lo: -0.5, flap: 0, face: 'smile', droop: 0.35, puff: 0, look: null, asleep: false, squat: 0, stretch: 0, shake: 0 };
    this.pokeAt = -9; this.startleAt = -9; this.near = 0; this.hover = null;
    this.touch = { on: false, local: new THREE.Vector3(), vel: new THREE.Vector3() };
    this.inv = new THREE.Quaternion();
    this.setClip('idle');
  }

  get pos() { return this.root.position; }
  get airborne() { return !!this.hop; }

  /** Shows the tool in her hand: the broom is part of her model, the shovel is a prop. */
  holds(tool) { this.broom.visible = tool === 'broom'; this.shovel.visible = tool === 'shovel'; }

  /** The brain's "hop": a short walk to (x, z). A big hop on the spot is a little celebration. */
  startHop(x, z, o = {}) {
    const from = this.root.position.clone();
    const dist = Math.hypot(x - from.x, z - from.z);
    if (dist < 0.05) {
      if ((o.h ?? 0) >= 0.5) this.play(o.big ? 'dance_01' : 'greet_03', o.big ? 2.4 : 1.6);
      return;
    }
    // one gait for the whole trip, so she never flips between walk and run on the way
    this.gait = brain.urgent ? 'run' : 'walk';
    this.hop = { from, to: new THREE.Vector3(x, 0, z), t: 0, dur: dist / (this.gait === 'run' ? RUN_SPEED : WALK_SPEED) };
    this.faceTo = Math.atan2(x - from.x, z - from.z);
  }

  /** Plays one animation for `secs`, then she goes back to whatever her mood picks. `restart` replays it from the start. */
  play(name, secs, restart = false) { this.oneShot = { name, until: clock.t + secs }; this.setClip(name, restart); }
  /** One broom swing. */
  swing() { this.play('swing', SWING.dur, true); }

  setClip(name, restart = false) {
    if (name === this.clipName && !restart) return;
    const clip = this.clips[name] || this.clips.idle;
    const next = this.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(name === 'run' ? RUN_PACE : name === 'walk' ? WALK_PACE : 1).fadeIn(restart ? 0.08 : FADE).play();
    if (this.action && this.action !== next) this.action.fadeOut(FADE);
    this.action = next; this.clipName = name;
  }

  /** Her mood picks the animation when nothing else is happening. */
  moodClip(t, walking) {
    if (walking) return this.gait;
    const w = this.want;
    switch (brain.mode) {
      case 'eat': return 'football_catch';
      case 'clean': return 'cast_a_spell';
      case 'refuse': return 'angry_01';
      case 'poop': return 'frustrated_02';
      case 'sleep': case 'nap': return w.asleep ? 'depressed' : 'angry_02';
      case 'react': return t - this.startleAt < 1.2 ? 'hit_to_body_01' : 'greet_01';
    }
    if (this.touch.on || t < brain.contentUntil) return 'agree';
    if (w.face === 'snarl') return 'angry_03';
    if (talking()) return 'complain_01';
    if (S.hunger > 0.8 || S.health < 0.3) return 'frustrated_01';
    if (S.joy < 0.18) return 'sob';
    if (w.face === 'oh' && w.look) return 'look_around';
    if (t - Talk.inputAt > BORED_AFTER) return BORED_CLIPS[Math.floor((t - Talk.inputAt - BORED_AFTER) / 9) % BORED_CLIPS.length];
    return 'idle';
  }

  /** n: 0 day … 1 night. Bright days light her well; the dark violet night needs her soft self-light. */
  setLight(n) { for (const m of this.mats) m.emissiveIntensity = lerp(0.04, 0.22, n); }

  update(dt, t, camera) {
    const pos = this.root.position;
    this.prev.copy(pos);
    const h = this.hop;
    if (h) {
      h.t += dt;
      const k = Math.min(h.t / h.dur, 1);
      pos.x = lerp(h.from.x, h.to.x, k); pos.z = lerp(h.from.z, h.to.z, k);
      if (k >= 1) { this.hop = null; this.lastWalk = t; }
    }
    pos.y = ease(pos.y, groundY(pos.x, pos.z), 14, dt);   // a block edge reads as a quick step up or down
    this.vel.subVectors(pos, this.prev).divideScalar(Math.max(dt, 1e-3));

    if (this.faceTo != null) this.heading += wrap(this.faceTo - this.heading) * (1 - Math.exp(-this.turnRate * 1.6 * dt));
    this.root.rotation.y = this.heading;

    // keep walking through the brain's short pauses between hops
    const walking = !!this.hop || (brain.mode === 'travel' && t - this.lastWalk < 0.35);
    if (this.oneShot && (t >= this.oneShot.until || walking)) this.oneShot = null;
    if (!this.oneShot) this.setClip(this.moodClip(t, walking));
    this.mixer.update(dt);

    this.root.updateMatrixWorld(true);
    this.inv.copy(this.creature.getWorldQuaternion(new THREE.Quaternion())).invert();
  }
}

/* ───────────── the fur shader (from the website, plus the tree lamp) ───────────── */
// mouth SDF (homepage "crater" style): the pelt is cut along the current mouth and the fur slopes into a dish.
// uMouthSY stretches it vertically for talking and chewing.
const MOUTH_GLSL = `
uniform float uMouthMode, uMouthHW, uMouthN, uMouthAmt, uMouthSY;
uniform vec2 uMouthC; uniform vec4 uCres; uniform vec2 uMouthPts[24];
uniform float uMRamp0, uMRamp1, uMFloor, uMCut, uMAO;
float mouthLocal(vec2 q){
  if (uMouthMode > 1.5) {
    float u = clamp(q.x / uCres.x, -1.0, 1.0);
    float top = uCres.w + uCres.y * uCres.z * u * u, bot = uCres.w + uCres.y * (-1.0 + (1.0 + uCres.z) * u * u);
    return max(abs(q.x) - uCres.x, max(q.y - top, bot - q.y));
  }
  float d = 9.0;
  for (int i = 0; i < 23; i++) {
    if (float(i) >= uMouthN - 1.0) break;
    vec2 a = uMouthPts[i], ba = uMouthPts[i + 1] - a, pa = q - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
  }
  return d - uMouthHW;
}
float mouthD(vec3 P){
  if (uMouthMode < 0.5 || P.z < 0.5) return 9.0;
  float s = max(uMouthAmt, 0.02);
  vec2 q = (P.xy - uMouthC) / vec2(s, s * uMouthSY);
  if (abs(q.x) > 1.0 || abs(q.y) > 0.5) return 9.0;
  return mouthLocal(q) * s * min(1.0, uMouthSY);
}`;

const FUR_VERT = `
uniform float uShells, uLen, uTime, uPuff, uDroop, uEyeRad, uTouchAmt, uTouchRad;
uniform vec3 uWind, uGrav, uEyeL, uEyeR, uTouch, uTouchVel;
${MOUTH_GLSL}
varying vec2 vUv; varying float vLevel; varying vec3 vN; varying vec3 vW; varying float vMask; varying vec3 vObj;
void main(){
  float L = float(gl_InstanceID) / max(uShells - 1.0, 1.0);
  vec3 n = normalize(normal);
  float d = min(distance(position, uEyeL), distance(position, uEyeR));
  float m = smoothstep(uEyeRad * 0.9, uEyeRad * 1.65, d);
  float mm = smoothstep(uMRamp0, uMRamp1, mouthD(position));
  float len = uLen * mix(0.12, 1.0, m) * mix(uMFloor, 1.0, mm) * (1.0 + 0.9 * uPuff);
  float k = L * L;
  float flow = 0.5 * sin(uTime * 2.3 + position.x * 5.0 + position.y * 3.7) + 0.5 * sin(uTime * 3.7 + position.z * 6.0 - position.y * 4.0);
  vec3 disp = uGrav * uDroop * (1.0 - 0.8 * clamp(uPuff, 0.0, 1.0)) + uWind * (0.75 + 0.45 * flow);
  disp -= n * dot(disp, n) * 0.6;
  vec3 p = position + n * len * L + disp * len * k * 2.0;
  float td = distance(position, uTouch);
  float tf = uTouchAmt * (1.0 - smoothstep(0.0, uTouchRad, td));
  if (tf > 0.001) {
    vec3 away = position - uTouch; away -= n * dot(away, n);
    away = away / max(length(away), 1e-3);
    vec3 push = away * 0.9 + uTouchVel; push -= n * dot(push, n);
    p += push * len * L * tf * 1.7;
    p -= n * len * L * tf * 0.55;
  }
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv; vLevel = L; vMask = min(m, 1.0 - uMAO * (1.0 - mm)); vObj = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FUR_FRAG = `
uniform sampler2D uNoise;
uniform float uDensity, uRim, uShells;
uniform vec3 uRoot, uTip, uSky, uGround, uKeyDir, uKeyCol, uRimDir, uIriA, uIriB, uIriC, uLampPos, uLampCol;
${MOUTH_GLSL}
varying vec2 vUv; varying float vLevel; varying vec3 vN; varying vec3 vW; varying float vMask; varying vec3 vObj;
void main(){
  if (uMCut > 0.5 && mouthD(vObj) < 0.0) discard; // the mouth is a real hole in the pelt
  vec4 tx = texture2D(uNoise, vUv * uDensity);
  float L = vLevel;
  float a = 1.0;
  if (L > 0.0) {
    float w = 1.2 / uShells;
    a = smoothstep(L - w, L + w, tx.r);
    if (a < 0.05) discard;
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.6);
  float ao = mix(0.2, 1.0, pow(L, 0.7)) * mix(0.5, 1.0, vMask);
  float strand = 0.7 + 0.6 * tx.g;
  vec3 base = mix(uRoot, uRoot * 2.4 + uTip * 0.03, pow(L, 1.4)) * strand;
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float ndl = dot(N, uKeyDir);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  vec3 col = base * (hemi + uKeyCol * wrap) * ao;
  col += uKeyCol * pow(L, 3.0) * pow(max(ndl, 0.0), 1.5) * 0.05 * strand;
  vec3 Lp = uLampPos - vW; float ld = length(Lp);
  float lw = clamp((dot(N, Lp / ld) + 0.3) / 1.3, 0.0, 1.0) / (1.0 + ld * ld * 0.09);
  col += base * uLampCol * lw * ao * 3.0;
  float t = 0.5 + 0.5 * sin(dot(N, vec3(1.7, 2.3, 0.9)) * 2.2 + fres * 4.0);
  vec3 iri = mix(uIriA, uIriB, t);
  iri = mix(iri, uIriC, smoothstep(0.3, 0.9, 0.5 + 0.5 * sin(dot(N, vec3(-2.0, 0.6, 1.4)) * 1.8)));
  vec3 sheen = mix(iri, uTip, 0.35);
  float tipW = pow(L, 1.8);
  col += sheen * tipW * (fres * uRim * 0.9 + 0.012) * strand;
  float back = pow(clamp(dot(N, uRimDir), 0.0, 1.0), 1.5) * fres;
  col += sheen * back * uRim * tipW * 1.1;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const LID_VERT = `
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;

const LID_FRAG = `
uniform sampler2D uNoise; uniform float uRim;
uniform vec3 uRoot, uTip, uSky, uGround, uKeyDir, uKeyCol, uIriA, uLampPos, uLampCol;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float n = texture2D(uNoise, vUv * vec2(8.0, 3.0)).r;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float wrap = clamp((dot(N, uKeyDir) + 0.35) / 1.35, 0.0, 1.0);
  vec3 Lp = uLampPos - vW; float ld = length(Lp);
  float lw = clamp((dot(N, Lp / ld) + 0.3) / 1.3, 0.0, 1.0) / (1.0 + ld * ld * 0.09);
  vec3 col = uRoot * (1.5 + 0.9 * n) * (hemi + uKeyCol * wrap + uLampCol * lw * 3.0);
  col += mix(uIriA, uTip, 0.4) * fres * uRim * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeNoise() {
  const S = 256, hb = new Float32Array(S * S), gb = new Float32Array(S * S);
  for (let i = 0; i < 11000; i++) {
    const cx = Math.random() * S, cy = Math.random() * S, r = 1.2 + Math.random() * 1.6;
    const h = 0.4 + 0.6 * Math.sqrt(Math.random()), g = Math.random(), R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const px = Math.floor(cx) + dx, py = Math.floor(cy) + dy;
      const dd = Math.hypot(px + 0.5 - cx, py + 0.5 - cy); if (dd >= r) continue;
      const v = h * (1 - (dd / r) ** 2), idx = ((py + S) % S) * S + ((px + S) % S);
      if (v > hb[idx]) { hb[idx] = v; gb[idx] = g; }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = hb[i] * 255; data[i * 4 + 1] = gb[i] * 255; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

function roundedCube(r, seg) {
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal, inner = 1 - r;
  const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    c.set(clamp(p.x, -inner, inner), clamp(p.y, -inner, inner), clamp(p.z, -inner, inner));
    n.subVectors(p, c).normalize();
    p.copy(c).addScaledVector(n, r);
    pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.computeBoundingSphere();
  return g;
}

/* ───────────── the creature ───────────── */
const FURLIGHT = {
  day: { sky: new THREE.Color('#a08670'), ground: new THREE.Color('#2a2017'), key: new THREE.Color('#ffd8b0').multiplyScalar(1.5), root: new THREE.Color('#1a1714'), rim: 1.5 },
  night: { sky: new THREE.Color('#6a5444'), ground: new THREE.Color('#0e0c0a'), key: new THREE.Color('#ffd6ae').multiplyScalar(0.9), root: new THREE.Color('#151210'), rim: 1.3 },
};

/** The black box: the original whybox.ai creature, now Pani Yaga's furry sidekick. */
class BlackBox {
  constructor() {
    const shells = MOBILE ? 14 : 30;
    this.root = new THREE.Group();
    this.squash = new THREE.Group(); this.root.add(this.squash);
    const cr = this.creature = new THREE.Group(); cr.rotation.order = 'YXZ'; cr.position.y = 1.07; this.squash.add(cr);
    this.squash.scale.setScalar(BOX_S);

    const eyeR = this.eyeR = 0.3, eyeX = 0.41, eyeY = 0.2, eyeZ = 0.93;   // homepage layout: eyes up, mouth below
    const C = (h) => new THREE.Color(h);
    const U = this.U = {
      uShells: { value: shells }, uLen: { value: 0.13 }, uDensity: { value: 4 },
      uTime: { value: 0 }, uPuff: { value: 0 }, uDroop: { value: 0.35 }, uRim: { value: 1.6 },
      uWind: { value: new THREE.Vector3() }, uGrav: { value: new THREE.Vector3(0, -1, 0) },
      uEyeL: { value: new THREE.Vector3(-eyeX, eyeY, eyeZ) }, uEyeR: { value: new THREE.Vector3(eyeX, eyeY, eyeZ) }, uEyeRad: { value: eyeR },
      uMouthMode: { value: 0 }, uMouthHW: { value: 0 }, uMouthN: { value: 0 }, uMouthAmt: { value: 1 }, uMouthSY: { value: 1 },
      uMouthC: { value: new THREE.Vector2() }, uCres: { value: new THREE.Vector4() }, uMouthPts: { value: Array.from({ length: 24 }, () => new THREE.Vector2()) },
      uMRamp0: { value: 0 }, uMRamp1: { value: 0.11 }, uMFloor: { value: 0.2 }, uMCut: { value: 1 }, uMAO: { value: 0.7 },
      uTouch: { value: new THREE.Vector3(0, 0, 9) }, uTouchVel: { value: new THREE.Vector3() }, uTouchAmt: { value: 0 }, uTouchRad: { value: 0.38 },
      uNoise: { value: makeNoise() },
      uRoot: { value: FURLIGHT.day.root.clone() }, uTip: { value: C('#e2bf98') },
      uSky: { value: FURLIGHT.day.sky.clone() }, uGround: { value: FURLIGHT.day.ground.clone() },
      uKeyDir: { value: new THREE.Vector3(-0.55, 0.7, 0.55).normalize() }, uKeyCol: { value: FURLIGHT.day.key.clone() },
      uRimDir: { value: new THREE.Vector3(0.6, 0.5, -0.6).normalize() },
      uIriA: { value: C('#CF6E42') }, uIriB: { value: C('#D6A446') }, uIriC: { value: C('#DE8053') },
      uLampPos: { value: CANOPY.clone() }, uLampCol: { value: new THREE.Color(0, 0, 0) },
    };
    const furMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FUR_VERT, fragmentShader: FUR_FRAG,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const fur = new THREE.InstancedMesh(roundedCube(0.38, MOBILE ? 26 : 34), furMat, 64);
    const I = new THREE.Matrix4(); for (let i = 0; i < 64; i++) fur.setMatrixAt(i, I);
    fur.count = shells; fur.frustumCulled = false; cr.add(fur);
    // shadow stand-in (the fur itself does not write shadow depth)
    const caster = new THREE.Mesh(roundedCube(0.38, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    caster.castShadow = true; caster.scale.setScalar(1.05); cr.add(caster);
    // hit volume for taps and petting, a little bigger than the fur
    this.proxy = new THREE.Mesh(roundedCube(0.38, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.scale.setScalar(1.14); cr.add(this.proxy);

    const lidU = {}; ['uNoise', 'uRim', 'uRoot', 'uTip', 'uSky', 'uGround', 'uKeyDir', 'uKeyCol', 'uIriA', 'uLampPos', 'uLampCol'].forEach((k) => (lidU[k] = U[k]));
    const lidMat = new THREE.ShaderMaterial({ uniforms: lidU, vertexShader: LID_VERT, fragmentShader: LID_FRAG, side: THREE.DoubleSide });
    const scleraGeo = new THREE.SphereGeometry(eyeR, 40, 28);
    const irisGeo = new THREE.SphereGeometry(eyeR * 1.003, 40, 8, 0, Math.PI * 2, 0, 0.74); irisGeo.rotateX(Math.PI / 2);
    const pupilGeo = new THREE.SphereGeometry(eyeR * 1.006, 40, 8, 0, Math.PI * 2, 0, 0.6); pupilGeo.rotateX(Math.PI / 2);
    const upGeo = new THREE.SphereGeometry(eyeR * 1.07, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const loGeo = new THREE.SphereGeometry(eyeR * 1.07, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const scleraMat = new THREE.MeshPhongMaterial({ color: 0xeeedf3, specular: 0xffffff, shininess: 110, emissive: 0x2a2838 });
    const irisMat = new THREE.MeshPhongMaterial({ color: 0x24203a, specular: 0x888888, shininess: 90 });
    const pupilMat = new THREE.MeshPhongMaterial({ color: 0x030305, specular: 0xaaaaaa, shininess: 160 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const glintGeo = new THREE.SphereGeometry(0.032, 14, 10);
    this.eyes = [-1, 1].map((side) => {
      const socket = new THREE.Group(); socket.position.set(side * eyeX, eyeY, eyeZ); cr.add(socket);
      const ball = new THREE.Group(); ball.rotation.order = 'YXZ'; socket.add(ball);
      ball.add(new THREE.Mesh(scleraGeo, scleraMat), new THREE.Mesh(irisGeo, irisMat), new THREE.Mesh(pupilGeo, pupilMat));
      const glint = new THREE.Mesh(glintGeo, glintMat); glint.position.set(-0.35, 0.18, 0.92).normalize().multiplyScalar(eyeR * 1.01); socket.add(glint);
      const tilt = new THREE.Group(); socket.add(tilt);   // tilts the upper lid: the brow angle
      const upper = new THREE.Mesh(upGeo, lidMat), lower = new THREE.Mesh(loGeo, lidMat); tilt.add(upper); socket.add(lower);
      return { side, socket, ball, tilt, upper, lower, yaw: 0, pitch: 0 };
    });

    cr.traverse((o) => { if (o.isMesh && o !== caster && o !== fur && o !== this.proxy) o.castShadow = true; });

    // ── the homepage face: crater mouths cut into the pelt, pink lips, teeth; one per expression ──
    const faceG = new THREE.Group(); cr.add(faceG);
    const LS = 0.75, LR = 0.045 * LS, LZ = 0.15 * LR, DEEP = -0.13;
    const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xE7A1B4, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x2a1219, sheen: 1, sheenColor: new THREE.Color(0xffd6e0), sheenRoughness: 0.4 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x030205, side: THREE.DoubleSide });
    const toothMat = new THREE.MeshPhysicalMaterial({ color: 0xC4BECB, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const V2 = (x, y) => new THREE.Vector2(x, y);
    const plate = (g, cx, cy, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), holeMat); m.position.set(cx, cy, DEEP); g.add(m); };
    const addTube = (g, curve, r, z, closed) => {
      const tb = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, r, 14, !!closed), lipMat); tb.position.z = z; g.add(tb);
      if (!closed) { const capG = new THREE.SphereGeometry(r, 16, 12); [curve.getPoint(0), curve.getPoint(1)].forEach((p) => { const c = new THREE.Mesh(capG, lipMat); c.position.set(p.x, p.y, p.z + z); g.add(c); }); }
    };
    const mkPoly = (ctrl, r) => {
      const g = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.3);
      const pts = curve.getPoints(23).map((v) => V2(v.x, v.y));
      const xs = ctrl.map((p) => p[0]), ys = ctrl.map((p) => p[1]);
      const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2, y0 = Math.min(...ys) - 0.2, y1 = Math.max(...ys) + 0.2;
      const tr = r * 1.45 * LS;
      addTube(g, curve, tr, 0.15 * tr);
      plate(g, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0);
      return { g, pts, hw: tr + 0.01 };
    };
    const mkDot = (r) => {
      const g = new THREE.Group();
      plate(g, 0, 0, 0.6, 0.6);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(r, LR, 16, 56), lipMat); tor.position.z = LZ; g.add(tor);
      return { g, pts: [V2(0, 0), V2(0, 0)], hw: r + 0.012 };
    };
    // crescent mouths: top(u) = T0 + H·k·u², bottom(u) = T0 + H·(−1 + (1+k)·u²); k>0 grin, k<0 grimace
    const mkCres = (P, rows, clench) => {
      const cTop = (u) => P.T0 + P.H * P.k * u * u, cBot = (u) => P.T0 + P.H * (-1 + (1 + P.k) * u * u);
      const g = new THREE.Group(), N = 48;
      const yHi = Math.max(P.T0, P.T0 + P.H * P.k), yLo = Math.min(P.T0 - P.H, P.T0 + P.H * P.k);
      const rim = [];
      for (let i = 0; i < N; i++) { const u = -1 + 2 * i / N; rim.push(new THREE.Vector3(u * P.w, cTop(u), 0)); }
      for (let i = N; i > 0; i--) { const u = -1 + 2 * i / N; rim.push(new THREE.Vector3(u * P.w, cBot(u), 0)); }
      plate(g, 0, (yHi + yLo) / 2, 2 * P.w + 0.4, yHi - yLo + 0.4);
      addTube(g, new THREE.CatmullRomCurve3(rim, true, 'catmullrom', 0.2), LR, LZ, true);
      const capsule = new THREE.CapsuleGeometry(0.5, 0.5, 6, 16);
      const tooth = (u, upper, n, spread, maxH, fill) => {
        const x = u * P.w, yE = upper ? cTop(u) : cBot(u), gap = cTop(u) - cBot(u);
        const th = Math.min(maxH, clench ? gap * 0.5 - 0.004 : gap * fill), tw = (2 * P.w * spread / n) * 0.97 * (0.84 + 0.16 * (1 - u * u));
        const slope = (upper ? 2 * P.H * P.k * u : 2 * P.H * (1 + P.k) * u) / P.w;
        const ang = Math.atan(slope) * (upper ? 1 : 0.55), off = (th / 2 + 0.006) * (upper ? -1 : 1);
        const m = new THREE.Mesh(capsule, toothMat);
        m.scale.set(tw, th / 1.5, 0.05); m.rotation.z = clench ? ang * 0.4 : ang;
        m.position.set(x - Math.sin(ang) * off, yE + Math.cos(ang) * off, upper ? -0.045 : -0.057);
        g.add(m);
      };
      rows.forEach(([upper, n, spread, maxH, fill]) => { for (let i = 0; i < n; i++) tooth((-1 + (i + 0.5) * 2 / n) * spread, upper, n, spread, maxH, fill); });
      return g;
    };
    const MO = this.mouths = {};
    const addMouth = (name, C, g, mode, pts, hw, cres) => { g.position.set(C[0], C[1], 1.0); g.visible = false; faceG.add(g); MO[name] = { g, C, mode, pts, hw, cres }; };
    const GRIN = { w: 0.54, H: 0.42, k: 0.18, T0: 0.18 }, SNARL = { w: 0.5, H: 0.36, k: -0.6, T0: 0.22 };
    addMouth('grin', [0, -0.38], mkCres(GRIN, [[true, 7, 0.93, 0.2, 0.54], [false, 6, 0.86, 0.18, 0.5]]), 2, null, 0, GRIN);
    addMouth('snarl', [0, -0.4], mkCres(SNARL, [[true, 7, 0.92, 0.22, 0.5], [false, 6, 0.86, 0.22, 0.5]], true), 2, null, 0, SNARL);
    { const d = mkDot(0.13); addMouth('oh', [0, -0.4], d.g, 1, d.pts, d.hw); }
    { const ctrl = []; for (let i = 0; i <= 8; i++) { const x = -0.44 + i * 0.11; ctrl.push([x, -0.045 + 0.09 * (x / 0.44) ** 2]); }
      const d = mkPoly(ctrl, 0.03); addMouth('smile', [0, -0.38], d.g, 1, d.pts, d.hw); }
    { const d = mkPoly([[-0.48, 0.0], [-0.30, -0.08], [-0.12, 0.005], [0.07, -0.1], [0.26, 0.012], [0.43, 0.1]], 0.032); addMouth('grumpy', [0, -0.38], d.g, 1, d.pts, d.hw); }
    this.mouthPoint = new THREE.Object3D(); this.mouthPoint.position.set(0, -0.4, 1.05); cr.add(this.mouthPoint);

    // live state
    this.heading = 0.3; this.faceTo = null; this.turnRate = 7;
    this.hop = null; this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3();
    this.st = { puff: 0, puffV: 0, land: 0, landV: 0, lean: 0, stretch: 0, squat: 0, up: 0.36, lo: -0.5, blinkAt: -9, nextBlink: 2,
      flap: 0, tilt: 0, wind: new THREE.Vector2(), windV: new THREE.Vector2(), shake: 0, breath: 0, eyeScale: 0.86 };
    // inputs the brain writes every frame
    this.want = { up: 0.36, lo: -0.5, flap: 0, face: 'smile', droop: 0.35, puff: 0, look: null, asleep: false, squat: 0, stretch: 0, shake: 0 };
    this.pokeAt = -9; this.startleAt = -9; this.near = 0; this.hover = null;
    this.ex = { want: 'smile', cur: 'smile', amt: 1, v: 0 }; this.applyMouth('smile');
    this.touch = { on: false, local: new THREE.Vector3(), vel: new THREE.Vector3() };
    this.tmp = new THREE.Vector3(); this.inv = new THREE.Quaternion(); this.eyeW = new THREE.Vector3();
  }

  get pos() { return this.root.position; }
  get airborne() { return !!this.hop; }

  applyMouth(name) {
    const U = this.U, M = this.mouths[name];
    Object.values(this.mouths).forEach((m) => { m.g.visible = false; });
    M.g.visible = true;
    U.uMouthMode.value = M.mode; U.uMouthC.value.set(M.C[0], M.C[1]); U.uMouthHW.value = M.hw;
    if (M.pts) { U.uMouthN.value = M.pts.length; M.pts.forEach((p, i) => U.uMouthPts.value[i].copy(p)); }
    else U.uCres.value.set(M.cres.w, M.cres.H, M.cres.k, M.cres.T0);
  }

  startHop(x, z, o = {}) {
    const from = this.root.position.clone(); from.y = groundY(from.x, from.z);
    const dist = Math.hypot(x - from.x, z - from.z);
    this.hop = { from, to: new THREE.Vector3(x, groundY(x, z), z), t: 0, ant: o.ant ?? 0.16, dur: 0.36 + dist * 0.085,
      h: (o.h ?? 0.45) + dist * 0.1, launched: false, big: !!o.big };
    if (dist > 0.05) this.faceTo = Math.atan2(x - from.x, z - from.z);
  }

  setLight(n, lampK) {
    const U = this.U, D = FURLIGHT.day, N = FURLIGHT.night;
    U.uSky.value.copy(D.sky).lerp(N.sky, n);
    U.uGround.value.copy(D.ground).lerp(N.ground, n);
    U.uKeyCol.value.copy(D.key).lerp(N.key, n);
    U.uRoot.value.copy(D.root).lerp(N.root, n);
    U.uRim.value = lerp(D.rim, N.rim, n);
    U.uLampCol.value.set(GLOW_COLOR).multiplyScalar(lampK);
  }

  update(dt, t, camera) {
    const st = this.st, w = this.want, U = this.U, pos = this.root.position;
    this.prev.copy(pos);

    // ── hop: crouch, spring, arc, stretch in the air, squash on landing ──
    let hopSq = 0, airU = -1;
    const h = this.hop;
    if (h) {
      h.t += dt;
      if (h.t < h.ant) { hopSq = -0.2 * Math.sin(h.t / h.ant * Math.PI); }
      else if (h.t < h.ant + h.dur) {
        if (!h.launched) { h.launched = true; this.onLaunch && this.onLaunch(h); }
        const u = airU = (h.t - h.ant) / h.dur;
        const k = 0.7 * u + 0.3 * u * u * (3 - 2 * u);
        pos.x = lerp(h.from.x, h.to.x, k); pos.z = lerp(h.from.z, h.to.z, k);
        pos.y = lerp(h.from.y, h.to.y, k) + 4 * h.h * u * (1 - u);
        hopSq = 0.13 * Math.sin(Math.min(u * 2.2, 1) * Math.PI / 2) * (1 - smooth(0.55, 1, u));
      } else {
        pos.copy(h.to);
        this.hop = null;
        st.landV = h.big ? -4.2 : -3.2; st.puffV += h.big ? 5 : 3.2;
        this.onLand && this.onLand(h);
      }
    }
    st.landV += (-st.land * 150 - st.landV * 10) * dt;
    st.land += st.landV * dt;
    if (!Number.isFinite(st.land)) { st.land = 0; st.landV = 0; }
    this.vel.subVectors(pos, this.prev).divideScalar(Math.max(dt, 1e-3));

    // ── heading ──
    if (this.faceTo != null) this.heading += wrap(this.faceTo - this.heading) * (1 - Math.exp(-this.turnRate * 1.6 * dt));
    st.shake = ease(st.shake, w.shake, 12, dt);
    this.root.rotation.y = this.heading + Math.sin(t * 24) * 0.32 * st.shake;

    // ── puff (spring), breathing, squat and stretch ──
    st.puffV += (-(st.puff - w.puff) * 55 - st.puffV * 6.5) * dt; st.puff += st.puffV * dt;
    if (!Number.isFinite(st.puff)) { st.puff = 0; st.puffV = 0; }
    st.squat = ease(st.squat, w.squat, 10, dt);
    st.stretch = ease(st.stretch, w.stretch, 8, dt);
    const brRate = w.asleep ? 0.9 : 1.35, brAmp = w.asleep ? 0.03 : 0.012;
    const br = Math.sin(t * brRate) * brAmp;
    const q = hopSq + st.land + st.squat;
    let sx = (1 - br * 0.5 + st.puff * 0.03) * (1 - q * 0.55) * (1 - st.stretch * 0.3);
    let sy = (1 + br + st.puff * 0.035) * (1 + q) * (1 + st.stretch);
    const pk = (t - this.pokeAt) / 0.25;    // poke: squash then stretch, ~250ms
    if (pk >= 0 && pk < 1) { const qq = Math.sin(pk * Math.PI * 2) * (1 - pk) * 0.24; sy *= 1 - qq; sx *= 1 + qq * 0.55; }
    this.squash.scale.set(BOX_S * sx, BOX_S * sy, BOX_S * sx);
    // lean forward in flight, back while crouching
    st.lean = ease(st.lean, airU >= 0 ? 0.12 * Math.sin(airU * Math.PI) : (h ? -0.06 : 0), 14, dt);
    this.creature.rotation.x = st.lean;
    this.creature.rotation.z = Math.sin(t * 0.8) * 0.01;
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.creature.getWorldQuaternion(new THREE.Quaternion())).invert();

    // ── fur: wind from motion, droop, touch ──
    const wt = new THREE.Vector2(-this.vel.x * 0.05, this.vel.y * 0.04 - this.vel.z * 0.02);
    if (wt.length() > 0.5) wt.setLength(0.5);
    st.windV.x += ((wt.x - st.wind.x) * 60 - st.windV.x * 7) * dt; st.windV.y += ((wt.y - st.wind.y) * 60 - st.windV.y * 7) * dt;
    st.wind.addScaledVector(st.windV, dt);
    U.uWind.value.set(st.wind.x + Math.sin(t * 0.6) * 0.03, st.wind.y + Math.cos(t * 0.45) * 0.015, -this.vel.z * 0.03 + Math.sin(t * 0.37) * 0.02).applyQuaternion(this.inv);
    U.uGrav.value.set(0, -1, 0).applyQuaternion(this.inv);
    U.uDroop.value = ease(U.uDroop.value, w.droop, 2, dt);
    U.uPuff.value = clamp(st.puff, -0.15, 1.2);
    U.uTime.value = t;
    if (this.touch.on) U.uTouch.value.copy(this.touch.local);
    U.uTouchAmt.value = ease(U.uTouchAmt.value, this.touch.on ? 1 : 0, this.touch.on ? 10 : 3.5, dt);
    U.uTouchVel.value.lerp(this.touch.vel, 1 - Math.exp(-8 * dt));

    // ── eyes: look, lids, brow tilt, blink ──
    const target = w.look || this.hover || camera.position;
    const F = FACES[w.face] || FACES.smile, since = t - this.startleAt, startled = since >= 0 && since < 0.75;
    const pop = startled ? 1 + 0.12 * Math.sin(since / 0.75 * Math.PI) : 1;
    st.up = ease(st.up, w.up + (w.asleep ? 0 : this.near * 0.25), 12, dt); st.lo = ease(st.lo, w.lo, 12, dt);
    st.tilt = ease(st.tilt, w.asleep ? 0 : startled ? F.tilt * 0.3 : F.tilt, 10, dt);
    st.eyeScale = ease(st.eyeScale, F.es * (1 + this.near * 0.05 + (startled ? 0.07 : 0)), 10, dt);
    U.uEyeRad.value = this.eyeR * st.eyeScale;
    if (t > st.nextBlink) { st.blinkAt = t; st.nextBlink = Math.random() < 0.18 ? t + 0.32 : t + rand(2.6, 6.5); }
    const tb = (t - st.blinkAt) / 0.18;
    let b = tb >= 0 && tb < 1 ? (tb < 0.4 ? tb / 0.4 : 1 - (tb - 0.4) / 0.6) : 0; b = b * b * (3 - 2 * b);
    if (w.asleep) b = 1;
    for (const eye of this.eyes) {
      eye.socket.getWorldPosition(this.eyeW);
      this.tmp.subVectors(target, this.eyeW).applyQuaternion(this.inv);
      const yaw = clamp(Math.atan2(this.tmp.x, this.tmp.z), -0.62, 0.62), pitch = clamp(Math.atan2(this.tmp.y, Math.hypot(this.tmp.x, this.tmp.z)), -0.45, 0.45);
      eye.yaw = ease(eye.yaw, yaw, 12, dt); eye.pitch = ease(eye.pitch, pitch, 12, dt);
      eye.ball.rotation.set(-eye.pitch, eye.yaw, 0);
      eye.tilt.rotation.z = eye.side * st.tilt;
      const uh = st.up + (eye.side < 0 ? 0 : -0.04) + eye.pitch * 0.35, lh = st.lo + eye.pitch * 0.1;
      const fu = uh + (lh - 0.04 - uh) * b;
      eye.upper.rotation.x = -Math.asin(clamp(fu, -0.98, 0.98));
      eye.lower.rotation.x = -Math.asin(clamp(lh, -0.98, 0.98));
      eye.socket.scale.setScalar(st.eyeScale);
    }

    // ── mouth: springs shut, swaps expression, springs back open; flaps to talk and chew ──
    const ex = this.ex;
    if (w.face !== ex.want) { ex.want = w.face; st.puffV += 2.5; }
    const exT = ex.cur === ex.want ? 1 : 0, nS = Math.ceil(dt / 0.008), hS = dt / nS;
    for (let k = 0; k < nS; k++) { ex.v += ((exT - ex.amt) * 260 - ex.v * (exT ? 14 : 30)) * hS; ex.amt = Math.max(0, ex.amt + ex.v * hS); }
    if (!Number.isFinite(ex.amt)) { ex.amt = 1; ex.v = 0; }
    if (!exT && ex.amt < 0.06) { ex.cur = ex.want; this.applyMouth(ex.cur); ex.amt = 0; ex.v = 0; }
    st.flap = ease(st.flap, w.flap, w.flap > st.flap ? 30 : 22, dt);
    const fl = st.flap, msy = clamp(1 + (fl > 0 ? 0.55 : 0.45) * fl, 0.4, 1.9), ma = Math.max(ex.amt * pop, 0.001);
    U.uMouthAmt.value = ma; U.uMouthSY.value = msy;
    this.mouths[ex.cur].g.scale.set(ma * (1 - 0.08 * Math.max(0, fl)), ma * msy, 1);
  }
}

/* ───────────── sound: tiny synthesized blips, no files ───────────── */
const Sound = {
  ctx: null, out: null, on: true,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.55; this.out.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  ok() { return this.on && this.ctx && this.ctx.state === 'running'; },
  tone(f0, f1, dur, vol = 0.18, type = 'sine', delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.12, freq = 1200, q = 1, delay = 0, sweep = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay, n = Math.max(1, (c.sampleRate * dur) | 0);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur); f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.02);
  },
  hop() { this.tone(260, 520, 0.14, 0.07, 'sine'); },
  land() { this.tone(140, 60, 0.12, 0.08, 'sine'); this.noise(0.06, 0.02, 400, 0.8); },
  chomp(d = 0) { this.noise(0.07, 0.16, 900, 1.4, d); this.tone(180, 110, 0.06, 0.06, 'triangle', d); },
  squeak() { this.tone(620, 1250, 0.12, 0.12, 'sine'); this.tone(1250, 900, 0.08, 0.07, 'sine', 0.11); },
  grumble() { this.tone(210, 150, 0.16, 0.1, 'triangle'); this.tone(190, 130, 0.2, 0.1, 'triangle', 0.18); },
  chime() { [784, 988, 1319].forEach((f, i) => this.tone(f, f, 0.34, 0.07, 'sine', i * 0.08)); },
  yum() { this.tone(520, 700, 0.12, 0.08, 'sine'); this.tone(700, 1050, 0.16, 0.08, 'sine', 0.12); },
  poof() { this.noise(0.32, 0.12, 2400, 0.7, 0, 500); [1568, 2093].forEach((f, i) => this.tone(f, f, 0.2, 0.04, 'sine', 0.06 + i * 0.07)); },
  plop() { this.tone(300, 90, 0.18, 0.13, 'sine'); this.noise(0.08, 0.05, 300, 1); },
  drop() { this.tone(900, 320, 0.2, 0.06, 'sine'); },
  thud() { this.tone(200, 90, 0.08, 0.08, 'triangle'); },
  sniff() { this.noise(0.09, 0.07, 3200, 1.2, 0, 1800); this.noise(0.08, 0.06, 3000, 1.2, 0.13, 1700); },
  gag() { this.tone(340, 120, 0.42, 0.11, 'sawtooth'); this.tone(180, 90, 0.3, 0.08, 'triangle', 0.18); this.noise(0.3, 0.06, 500, 1.6, 0.08, 200); },
  scuff(d = 0) { this.noise(0.13, 0.1, 700, 0.9, d, 300); },
  purr() { this.noise(0.28, 0.05, 140, 3); this.tone(70, 60, 0.28, 0.05, 'sawtooth'); },
  snore() { this.noise(1.2, 0.035, 220, 2.5, 0, 160); },
  yawn() { this.tone(330, 190, 0.7, 0.06, 'triangle'); },
  wake() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.26, 0.06, 'sine', i * 0.07)); },
  night() { [659, 523, 392].forEach((f, i) => this.tone(f, f, 0.4, 0.05, 'sine', i * 0.12)); },
  babble() { const f = rand(330, 640); this.tone(f, f * rand(0.8, 1.3), 0.06, 0.035, 'triangle'); },
  equip() { this.tone(520, 760, 0.06, 0.06, 'square'); this.noise(0.05, 0.05, 2400, 2); },
  hurt() { this.tone(230, 90, 0.2, 0.12, 'sawtooth'); this.noise(0.1, 0.07, 500, 1); },
  swing() { this.noise(0.2, 0.1, 1300, 1, 0, 1800); },
  cluck() { const f = rand(380, 520); this.tone(f, f * 1.25, 0.05, 0.08, 'square'); this.tone(f * 0.9, f * 1.1, 0.05, 0.07, 'square', 0.09); },
  squawk() { this.tone(900, 500, 0.22, 0.1, 'sawtooth'); this.noise(0.12, 0.06, 2200, 1); },
  hit() { this.tone(190, 60, 0.12, 0.16, 'square'); this.noise(0.06, 0.1, 900, 1); },
};

/* ───────────── saved state ───────────── */
const S = {
  hunger: 0.62, energy: 0.85, joy: 0.5, health: 0.9, mana: 0.5, tool: 'broom', night: false, dayOff: null,   // energy is the stamina bar
  eaten: Object.fromEntries(FOODS.map((f) => [f, 0])), meals: 0, crave: null, lastCrave: null,
  poops: [], farm: [], flock: FLOCK, sound: true, away: -1,   // farm: her dug plots, [{x, z, crop, at}]; flock: hens alive
};
function load() {
  try { loadSave(); } catch (e) { /* storage unavailable: start fresh */ }
  if (S.dayOff == null) setDayFrac(S.night ? 22 / 24 : 9 / 24);   // first visit: mid-morning
  S.night = isNightAt(dayFrac());
}
function loadSave() {
  {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    Object.assign(S, { hunger: d.hunger, energy: d.energy, joy: d.joy, health: d.health, mana: d.mana ?? S.mana, tool: d.tool === 'shovel' ? 'shovel' : 'broom', dayOff: d.dayOff ?? null, night: !!d.night, meals: d.meals | 0, crave: d.crave || null, sound: d.sound !== false });
    if (d.eaten) Object.assign(S.eaten, d.eaten);
    S.poops = Array.isArray(d.poops) ? d.poops.slice(0, 5) : [];
    S.farm = Array.isArray(d.farm) ? d.farm.slice(0, 300) : [];
    S.flock = clamp(d.flock ?? FLOCK, 0, FLOCK);
    const away = clamp((Date.now() - (d.t || Date.now())) / 1000, 0, 3 * 24 * 3600);
    S.away = away;
    S.hunger = clamp((S.hunger ?? 0.5) + away / SET.her.awayHunger, 0, 0.95);
    S.energy = clamp((S.energy ?? 0.8) + away / SET.her.awayStamina, 0, 1);   // she rests while you're away
    S.mana = clamp(S.mana + away / SET.her.awayMana, 0, 1);
    S.joy = clamp(S.joy ?? 0.5, 0, 1);
    S.health = clamp((S.health ?? 0.9) - S.poops.length * Math.min(away, 3600) / 36000, 0.15, 1);
    if (!FOODS.includes(S.crave)) S.crave = null;
  }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      hunger: S.hunger, energy: S.energy, joy: S.joy, health: S.health, mana: S.mana, tool: S.tool, night: S.night, dayOff: S.dayOff, meals: S.meals, crave: S.crave, sound: Sound.on,
      eaten: S.eaten, farm: world.plots.map((p) => ({ x: p.x, z: p.z, crop: p.crop, at: p.at })), flock: S.flock, poops: world.poops.map((p) => ({ x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2) })), t: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

/* ───────────── world ───────────── */
const world = { items: [], poops: [], vanishing: [], falling: [], clods: [], plots: [], hens: [], eggs: [], faintUntil: 0 };
let renderer, scene, camera, viewCam, pet, iconKit, area, view;
// Diablo-style isometric camera (45° around, ~35° down) following her across the field; scrolling zooms (camera-rig.js).
// Fog distances (DAY.fog, NIGHT.fog) count from her, not from the camera.
const aim = new THREE.Vector3(2.3, rigAt(0, 1).aimY, 0), look = new THREE.Vector3();
let zoom = 0, zoomTarget = 0;
const phase = { n: 0, cycleT: 0 };
const stage = $('#stage');

async function boot() {
  load();
  Sound.on = S.sound;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAY.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(DAY.bg), DAY.fog[0], DAY.fog[1]);   // applyPhase sets the distances every frame
  camera = new THREE.PerspectiveCamera(10, 1, 0.1, 500);
  viewCam = new THREE.PerspectiveCamera(10, 1, 0.1, 500);                      // always the default framing: where bugs may spawn

  const hemi = new THREE.HemisphereLight(DAY.hemi.sky, DAY.hemi.ground, DAY.hemi.i); scene.add(hemi);
  const key = new THREE.DirectionalLight(DAY.key.c, DAY.key.i);
  key.position.set(-6.5, 9.5, 8.5); key.castShadow = true;
  key.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -26, near: 0.5, far: 90 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(DAY.rim.c, DAY.rim.i); rim.position.set(4, 5.5, -9); scene.add(rim);
  const fill = new THREE.DirectionalLight(DAY.fill.c, DAY.fill.i); fill.position.set(9, 3, 4); scene.add(fill);
  world.lights = { hemi, key, rim, fill };

  const loader = new GLTFLoader();
  const files = ['environment', 'pupu'];
  const [yaga, worldJson, wordsJson, ...loaded] = await Promise.all([
    loader.loadAsync('./assets/models/pani-yaga-dressed.glb'),
    fetch('./assets/worlds/home.json').then((r) => r.json()),
    fetch('./words/en.json').then((r) => r.json()),
    ...files.map((f) => loader.loadAsync(`./assets/models/${f}.glb`)),
  ]);
  useWords(wordsJson); labelPage();
  const dress = (obj) => obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  loadWorld(worldJson, SPAWN);
  world.terrain = terrainMeshes(); scene.add(world.terrain.group);
  for (const f of S.farm) addPlot(f.x, f.z, f.crop, f.at);          // the plots she dug before

  const env = loaded[0].scene; dress(env);
  env.position.set(0.1, 0, -1.7);
  env.traverse((o) => { if (o.isMesh && ENV_COLORS[o.material.name] != null) o.material.color.set(ENV_COLORS[o.material.name]); });
  scene.add(env);
  const tree = shrinkTree(env);
  buildScenery(env, tree);
  buildHouse();
  buildDayNight(env);
  buildMountains(env);

  world.models = {};
  loaded.slice(1).forEach((g, i) => {
    dress(g.scene); g.scene.scale.setScalar(PROP_SCALE * (files[i + 1] === 'pupu' ? POO_SCALE : 1));
    world.models[files[i + 1]] = { scene: g.scene, clips: g.animations || [] };
  });
  for (const id of FOODS) world.models[id] = { make: () => makeBug(THREE, id), clips: [] };

  pet = new YagaPet(yaga);
  pet.root.position.set(SPAWN.x, groundY(SPAWN.x, SPAWN.z), SPAWN.z);
  scene.add(pet.root);
  Box.pet = new BlackBox();
  Box.pet.root.position.set(1.9, groundY(1.9, 1.9), 1.9);
  scene.add(Box.pet.root);

  marker(); makeCellMark();
  iconKit = makeIcons();
  bindUI();
  resize();
  new ResizeObserver(resize).observe(stage);
  addEventListener('resize', resize);

  for (const p of S.poops) spawnPoop(p.x, p.z, true);
  for (let i = 0; i < S.flock; i++) addHen(i);
  phase.n = S.night ? 1 : 0; applyPhase(phase.n);
  world.spawnAt = rand(4, 8); world.foeAt = rand(8, 14);
  for (let i = 0; i < 4; i++) spawnSprout(true);
  refreshUI();
  Talk.boot = S.away < 0 ? LINES.first[0] : S.away > 120 ? drawLine('away').replace('{n}', fmtAway(S.away)) : drawLine('hello');

  $('#loading').classList.add('gone');
  window.yaga = { S, brain, world, Box, get pet() { return pet; }, dropFood, poke, cleanPoop, spawnPoop, camera, advance, clock, say, Talk, go, groundY, walkable, resolveSpot, waypoint, kindAt, blockCentre, tillCell, tapShovel, canDig, get cellMark() { return cellMark; }, setTool, spawnHostile, hurtYaga, hostileBugs, tapFoe, setZoom: (v) => { zoom = zoomTarget = v; }, get zoom() { return zoom; } };
  start();
  setInterval(save, 4000);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); Talk.hiddenAt = Date.now(); return; }
    const s = Talk.hiddenAt ? (Date.now() - Talk.hiddenAt) / 1000 : 0; Talk.hiddenAt = 0;
    if (s > 8 && brain.mode !== 'sleep') say('tab', { force: true, map: (l) => l.replace('{n}', String(Math.round(s))) });
  });
}

function buildMountains(env) {
  // the clearing's two little gold-tipped rocks, grown into a range at the back of the fog
  const pickM = (n) => env.getObjectByName(n);
  const make = (bodyName, capName) => {
    const g = new THREE.Group();
    const body = pickM(bodyName), cap = pickM(capName);
    if (!body || !cap) return null;
    for (const src of [body, cap]) {
      const m = src.clone(); m.castShadow = false; m.receiveShadow = false;
      m.position.set(0, src.position.y, 0);
      g.add(m);
    }
    return g;
  };
  const kinds = [make('Rock_Main_Body', 'Rock_Main_Cap'), make('Rock_Side_Body', 'Rock_Side_Cap')].filter(Boolean);
  if (!kinds.length) return;
  const peaks = [
    [-30, -62, 6.5, 0], [-15, -70, 8, 1], [-2, -58, 5, 0], [12, -66, 7.5, 0], [25, -60, 5.5, 1], [38, -72, 8.5, 0],
    [-44, -74, 7.5, 1], [4, -82, 9.5, 0], [30, -86, 9, 1], [-22, -50, 3.2, 1], [20, -48, 2.8, 0], [-8, -44, 2.2, 1],
  ];
  for (const [x, z, s, k] of peaks.slice()) peaks.push([x - 82, z - rand(0, 8), s * rand(0.8, 1.1), 1 - k], [x + 82, z - rand(0, 8), s * rand(0.8, 1.1), 1 - k]);
  for (const [x, z, s, k] of peaks) {
    const m = kinds[k % kinds.length].clone();
    m.position.set(x, 0, z); m.scale.setScalar(s); m.rotation.y = rand(0, Math.PI * 2);
    scene.add(m);
  }
}

/** Gathers the tree's parts under a pivot at its base and scales it down to TREE_SCALE. */
function shrinkTree(env) {
  env.updateMatrixWorld(true);
  const parts = [];
  env.traverse((o) => { if (o.isMesh && TREE_PARTS.test(o.name)) parts.push(o); });
  const pivot = new THREE.Group(); pivot.position.set(TREE.x, 0, TREE.z); scene.add(pivot);
  parts.forEach((o) => pivot.attach(o));
  pivot.scale.setScalar(TREE_SCALE);
  return pivot;
}

/** Copies of the tree and the rock pair across the field; each one is an obstacle and a place to wander to. */
function buildScenery(env, tree) {
  world.landmarks = [{ x: TREE.x, z: TREE.z }, { x: 5.0, z: -2.0 }];
  for (const [x, z, k] of SCENERY.trees) {
    const t = tree.clone(); t.position.set(x, groundY(x, z), z); t.scale.setScalar(TREE_SCALE * k); t.rotation.y = rand(0, Math.PI * 2); scene.add(t);
    OBSTACLES.push({ x, z, r: 0.55 * TREE_SCALE * k + BODY_R });
    world.landmarks.push({ x, z });
  }
  // the rock pair sits at (4.65, -2.15) and (5.45, -1.85) in the original clearing
  for (const [x, z] of SCENERY.rocks) {
    const r = env.clone(); r.position.set(env.position.x + x - 4.65, groundY(x, z), env.position.z + z + 2.15); scene.add(r);
    OBSTACLES.push({ x, z, r: 1.0 + BODY_R }, { x: x + 0.8, z: z + 0.3, r: 0.8 + BODY_R });
    world.landmarks.push({ x, z });
  }
}

function buildDayNight(env) {
  const C = (v) => new THREE.Color(v);
  world.dayBg = C(DAY.bg); world.nightBg = C(NIGHT.bg);
  world.bgC = world.dayBg.clone(); scene.fog.color = world.bgC;
  world.sky = document.createElement('canvas');
  world.skyTex = new THREE.CanvasTexture(world.sky); world.skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = world.skyTex;
  // the terrain's vertex colours are day colours; at night they darken by the ratio the old flat ground did
  const gd = C(DAY.ground), gn = C(NIGHT.ground);
  world.pal = {
    hemiSky: [C(DAY.hemi.sky), C(NIGHT.hemi.sky)], hemiGnd: [C(DAY.hemi.ground), C(NIGHT.hemi.ground)],
    key: [C(DAY.key.c), C(NIGHT.key.c)], rim: [C(DAY.rim.c), C(NIGHT.rim.c)], fill: [C(DAY.fill.c), C(NIGHT.fill.c)],
    terrain: [C(0xffffff), new THREE.Color(gn.r / gd.r, gn.g / gd.g, gn.b / gd.b)],
  };
  world.glowMats = [];
  const glow = C(GLOW_COLOR), white = C(0xffffff);
  scene.traverse((o) => {                        // the tree's parts live under shrinkTree's pivot
    if (!o.isMesh || !TREE_PARTS.test(o.name)) return;
    const kind = o.name.startsWith('Fruit') ? 'fruit' : o.name.startsWith('Leaf') ? 'leaf' : 'bark';
    const m = o.material.clone(); m.emissive = kind === 'fruit' ? glow.clone().lerp(white, 0.4) : glow.clone(); m.emissiveIntensity = 0;
    o.material = m; world.glowMats.push({ m, kind, rough: m.roughness });
  });
  const lamp = new THREE.PointLight(glow.clone().lerp(white, 0.25), 0, 34, 1.6); lamp.position.copy(CANOPY); scene.add(lamp);
  const pool = new THREE.PointLight(glow.clone().lerp(white, 0.25), 0, 15, 1.9); pool.position.set(CANOPY.x, 1.05, CANOPY.z); scene.add(pool);
  world.lamps = [lamp, pool];
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.26, 'rgba(255,255,255,0.32)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: glow }));
  halo.position.copy(CANOPY); halo.scale.setScalar(11 * TREE_SCALE); scene.add(halo); world.halo = halo;
  const N = 280, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.1 + Math.random() * 0.86, r = Math.sqrt(Math.max(0, 1 - y * y)) * 110;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y * 110; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xF0EADC, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  world.stars.visible = false; scene.add(world.stars);
}

function paintSky(W = world.skyW, H = world.skyH, n = phase.n) {
  // three glows: behind the tree, low right, top left. Peach and lilac by day; the hero's violet, teal and plum by night
  const cv = world.sky; if (!cv || !W) return;
  world.skyW = W; world.skyH = H; world.skyN = n;
  const w = 512, h = Math.round(clamp(512 * H / W, 256, 1400));
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const mix = ([d, k]) => `rgba(${d.slice(0, 3).map((v, i) => Math.round(lerp(v, k[i], n))).join(',')},${lerp(d[3], k[3], n).toFixed(3)})`;
  g.fillStyle = mix(SKY.base); g.fillRect(0, 0, w, h);
  const glow = (cx, cy, rx, ry, stops) => {
    g.save(); g.translate(cx * w, cy * h); g.scale(rx * w, ry * h);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  };
  const tall = H > W;
  glow(tall ? 0.55 : 0.6, tall ? 0.26 : 0.32, 0.66, 0.6, [[0, mix(SKY.tree[0])], [0.42, mix(SKY.tree[1])], [0.75, mix(SKY.tree[2])]]);
  glow(0.98, tall ? 0.5 : 0.6, 0.5, 0.45, [[0, mix(SKY.right[0])], [0.7, mix(SKY.right[1])]]);
  glow(0, 0, 0.45, 0.55, [[0, mix(SKY.left[0])], [0.7, mix(SKY.left[1])]]);
  world.skyTex.needsUpdate = true;
}

function applyPhase(n) {
  const P = world.pal, L = world.lights, sun = Math.pow(n, 1.6);
  world.bgC.copy(world.dayBg).lerp(world.nightBg, n);
  if (Math.abs(n - (world.skyN ?? -1)) > 0.01) paintSky(world.skyW, world.skyH, n);
  scene.fog.near = world.camDist + lerp(DAY.fog[0], NIGHT.fog[0], n); scene.fog.far = world.camDist + lerp(DAY.fog[1], NIGHT.fog[1], n);
  L.hemi.color.copy(P.hemiSky[0]).lerp(P.hemiSky[1], n); L.hemi.groundColor.copy(P.hemiGnd[0]).lerp(P.hemiGnd[1], n);
  L.hemi.intensity = lerp(DAY.hemi.i, NIGHT.hemi.i, sun);
  L.key.color.copy(P.key[0]).lerp(P.key[1], n); L.key.intensity = lerp(DAY.key.i, NIGHT.key.i, sun);
  L.rim.color.copy(P.rim[0]).lerp(P.rim[1], n); L.rim.intensity = lerp(DAY.rim.i, NIGHT.rim.i, sun);
  L.fill.color.copy(P.fill[0]).lerp(P.fill[1], n); L.fill.intensity = lerp(DAY.fill.i, NIGHT.fill.i, sun);
  for (const m of world.terrain.mats) m.color.copy(P.terrain[0]).lerp(P.terrain[1], n);
  renderer.toneMappingExposure = lerp(DAY.exposure, NIGHT.exposure, n);
  const g = Math.max(0, (n - 0.12) / 0.88), lit = g * g * (3 - 2 * g);
  const breathe = 1 + 0.07 * Math.sin(phase.cycleT * 1.15) + 0.045 * Math.sin(phase.cycleT * 2.9);
  for (const m of world.glowMats) { m.m.emissiveIntensity = GLOW[m.kind] * lit * breathe; m.m.roughness = m.rough * (1 - 0.5 * lit); }
  world.lamps[0].intensity = 44 * lit * breathe; world.lamps[1].intensity = 11 * lit * breathe;
  world.halo.material.opacity = 0.6 * lit * breathe; world.halo.scale.setScalar(11 * TREE_SCALE * (1 + (breathe - 1) * 1.6));
  const tw = Math.max(0, (n - 0.1) / 0.9) * (0.74 + 0.26 * Math.sin(phase.cycleT * 0.9));
  world.stars.material.opacity = tw; world.stars.visible = tw > 0.01;
  if (pet) pet.setLight(n, 0.26 * lit * breathe);
  if (Box.pet) Box.pet.setLight(n, 0.26 * lit * breathe);
  setHouseLight(n, lit);
}

/* ───────────── her house: a log hut on chicken legs, like in the stories ───────────── */
const HOUSE = { x: -3.6, z: -5.2 };                 // near the middle of the field
const HOUSE_DOOR = { x: HOUSE.x, z: HOUSE.z + 2.9 };  // where she stands at the foot of the ladder

function buildHouse() {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const M = {
    logA: mat(0x6b4532), logB: mat(0x7a5038), dark: mat(0x3e2a1f), roof: mat(0x3a2a20, { roughness: 1 }),
    gable: mat(0x5a3a2a), moss: mat(0x56633A, { roughness: 1 }), stone: mat(0x9a7a60), red: mat(0xB32A1F),
    gold: mat(0xD6A446, { roughness: 0.5, metalness: 0.2 }), skin: mat(0xD6A446, { roughness: 0.6 }), feather: mat(0x8a5a3a, { roughness: 1 }),
    glass: mat(0x2a1d14, { emissive: new THREE.Color(0xE9B65A), emissiveIntensity: 0.15 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0xF0EADC, transparent: true, opacity: 0, roughness: 1, depthWrite: false }),
  };
  const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const root = new THREE.Group(); root.position.set(HOUSE.x, 0, HOUSE.z); scene.add(root);
  const body = new THREE.Group(); body.position.y = 1.75; root.add(body);   // everything the legs carry

  // chicken legs: thigh, knee, shin, toes
  const legs = [-0.75, 0.75].map((x) => {
    const hip = new THREE.Group(); hip.position.set(x, 1.8, -0.1); root.add(hip);
    add(hip, new THREE.SphereGeometry(0.34, 14, 10), M.feather, 0, -0.05, 0).scale.set(1, 0.8, 1);
    add(hip, new THREE.CylinderGeometry(0.17, 0.11, 0.85, 10), M.skin, 0, -0.42, 0.12, -0.28, 0, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.82, 0.24); hip.add(knee);
    add(knee, new THREE.SphereGeometry(0.12, 10, 8), M.skin, 0, 0, 0);
    add(knee, new THREE.CylinderGeometry(0.09, 0.07, 0.85, 10), M.skin, 0, -0.42, -0.1, 0.24, 0, 0);
    const foot = new THREE.Group(); foot.position.set(0, -0.82, -0.2); knee.add(foot);
    [-0.5, 0, 0.5].forEach((a) => add(foot, new THREE.ConeGeometry(0.06, 0.55, 8), M.skin, Math.sin(a) * 0.22, -0.05, Math.cos(a) * 0.22, Math.PI / 2, 0, -a));
    add(foot, new THREE.ConeGeometry(0.05, 0.35, 8), M.skin, 0, -0.05, -0.18, -Math.PI / 2, 0, 0);
    return { hip, knee, side: Math.sign(x) };
  });

  // floor and log walls (8 rows; corner ends stick out)
  add(body, new THREE.BoxGeometry(3.3, 0.16, 2.5), M.dark, 0, 0, 0);
  const R = 0.14, rows = 8, logX = new THREE.CylinderGeometry(R, R, 3.35, 10), logZ = new THREE.CylinderGeometry(R, R, 2.55, 10);
  for (let i = 0; i < rows; i++) {
    const y = 0.16 + R + i * R * 2, m = i % 2 ? M.logA : M.logB;
    add(body, logX, m, 0, y, 1.1, 0, 0, Math.PI / 2); add(body, logX, m, 0, y + R * 0.15, -1.1, 0, 0, Math.PI / 2);
    add(body, logZ, m, 1.5, y + R * 0.5, 0, Math.PI / 2, 0, 0); add(body, logZ, m, -1.5, y + R * 0.5, 0, Math.PI / 2, 0, 0);
  }
  const wallTop = 0.16 + rows * R * 2;

  // gabled roof with moss on the ridge
  const tri = new THREE.Shape(); tri.moveTo(-1.62, 0); tri.lineTo(1.62, 0); tri.lineTo(0, 1.25); tri.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false });
  add(body, gableGeo, M.gable, 0, wallTop, 1.0); add(body, gableGeo, M.gable, 0, wallTop, -1.1);
  const slope = Math.atan2(1.25, 1.62), half = Math.hypot(1.62, 1.25) + 0.3;
  add(body, new THREE.BoxGeometry(half, 0.12, 2.95), M.roof, -half / 2 * Math.cos(slope) + 0.06, wallTop + 0.62, 0, 0, 0, slope);
  add(body, new THREE.BoxGeometry(half, 0.12, 2.95), M.roof, half / 2 * Math.cos(slope) - 0.06, wallTop + 0.62, 0, 0, 0, -slope);
  for (let i = 0; i < 9; i++) add(body, new THREE.SphereGeometry(0.13 + Math.random() * 0.06, 8, 6), M.moss, 0, wallTop + 1.32, -1.3 + i * 0.32);

  // chimney and smoke
  add(body, new THREE.BoxGeometry(0.42, 1.0, 0.42), M.stone, 0.85, wallTop + 1.0, -0.55);
  const smoke = Array.from({ length: 4 }, (_, i) => ({ m: add(body, new THREE.SphereGeometry(0.2, 10, 8), M.smoke.clone(), 0.85, wallTop + 1.6, -0.55), t: i * 0.9 }));

  // door with red trim, two glowing windows, the homepage embroidery band
  add(body, new THREE.BoxGeometry(0.82, 1.38, 0.1), M.dark, 0, 0.16 + 0.69, 1.27);
  [[-0.46, 0.85, 0.1, 1.5], [0.46, 0.85, 0.1, 1.5], [0, 1.6, 1.02, 0.1]].forEach(([x, y, w, h]) => add(body, new THREE.BoxGeometry(w, h, 0.12), M.red, x, 0.16 + y - 0.05, 1.29));
  add(body, new THREE.SphereGeometry(0.06, 10, 8), M.gold, 0.26, 0.9, 1.34);
  const windows = [-0.95, 0.95].map((x) => {
    add(body, new THREE.BoxGeometry(0.62, 0.62, 0.08), M.dark, x, 1.25, 1.27);
    const w = add(body, new THREE.BoxGeometry(0.5, 0.5, 0.06), M.glass, x, 1.25, 1.3);
    add(body, new THREE.BoxGeometry(0.05, 0.5, 0.08), M.dark, x, 1.25, 1.33); add(body, new THREE.BoxGeometry(0.5, 0.05, 0.08), M.dark, x, 1.25, 1.33);
    return w;
  });
  const dia = new THREE.BoxGeometry(0.13, 0.13, 0.05);
  for (let i = 0; i < 13; i++) {
    const x = -1.45 + i * 0.242; if (Math.abs(x) < 0.5) continue;
    add(body, dia, [M.red, M.gold, M.moss][i % 3], x, 0.4, 1.27, 0, 0, Math.PI / 4);
  }

  // ladder from the door to the ground
  const ladder = new THREE.Group(); ladder.position.set(0, 0, 1.45); root.add(ladder);
  const tilt = Math.atan2(1.0, 1.75), len = Math.hypot(1.0, 1.75);
  [-0.3, 0.3].forEach((x) => add(ladder, new THREE.BoxGeometry(0.07, len, 0.07), M.dark, x, 0.875, 0.5, -tilt, 0, 0));   // leaning in: top at the door
  for (let i = 1; i < 6; i++) { const k = i / 6; add(ladder, new THREE.BoxGeometry(0.6, 0.05, 0.08), M.logB, 0, 1.75 * (1 - k), 1.0 * k); }

  const glow = new THREE.PointLight(0xE9B65A, 0, 9, 1.8); glow.position.set(0, 3.0, 2.2); root.add(glow);
  OBSTACLES.push({ x: HOUSE.x, z: HOUSE.z, r: 1.9 + BODY_R });
  world.landmarks.push({ x: HOUSE_DOOR.x, z: HOUSE_DOOR.z });
  world.house = { root, body, legs, windows, glass: M.glass, glow, smoke, stompAt: -9, wallTop };
}

/** The hut breathes and shifts its weight; it stomps when something happens. Smoke drifts from the chimney. */
function tickHouse(dt, t) {
  const H = world.house; if (!H) return;
  const st = (t - H.stompAt) / 0.9, stomp = st >= 0 && st < 1 ? Math.sin(st * Math.PI * 3) * (1 - st) : 0;
  H.body.position.y = 1.75 + Math.sin(t * 1.1) * 0.03 + stomp * 0.12;
  H.legs.forEach((L, i) => {
    const w = Math.sin(t * 0.55 + i * Math.PI) * 0.05 + stomp * (i ? 0.25 : -0.25);
    L.hip.rotation.x = w; L.knee.rotation.x = -w * 1.6; L.hip.position.y = 1.8 + Math.sin(t * 1.1) * 0.03 + stomp * 0.12;
  });
  H.root.rotation.z = Math.sin(t * 0.37) * 0.012;
  for (const p of H.smoke) {
    p.t += dt; const k = (p.t % 3.6) / 3.6;
    p.m.position.set(0.85 + k * 0.5, H.wallTop + 1.6 + k * 1.8, -0.55 - k * 0.2);
    p.m.scale.setScalar(0.6 + k * 1.6); p.m.material.opacity = 0.35 * Math.sin(k * Math.PI);
  }
}

/** n: 0 day … 1 night; lit: how far the tree lamp has come on. The windows glow warm at night. */
function setHouseLight(n, lit) {
  const H = world.house; if (!H) return;
  H.glass.emissiveIntensity = lerp(0.15, 2.2, lit);
  H.glow.intensity = 6 * lit;
}

function hitHouse() { return world.house ? ray.intersectObject(world.house.root, true).length > 0 : false; }
/** Sends her home: a visit, or (nap) to sleep it off at her door. */
function goHome(nap = false) { go(new THREE.Vector3(HOUSE_DOOR.x, 0, HOUSE_DOOR.z), nap ? 'homeNap' : 'home', false); }

/* ───────────── roaming area (what the camera shows) ───────────── */
/** The walkable field: a plain rectangle, independent of the camera. */
function computeArea() {
  area = { z0: ROAM.z0, z1: ROAM.z1, slices: [{ z: ROAM.z0, x0: ROAM.x0, x1: ROAM.x1 }, { z: ROAM.z1, x0: ROAM.x0, x1: ROAM.x1 }] };
  computeView();
}
/** The part of the field the camera shows right now. */
function computeView() {
  viewCam.aspect = camera.aspect; placeCamera(viewCam, rigAt(0, camera.aspect), aim, aim);
  const v = new THREE.Vector3(), W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  const yMin = -1 + 2 * DOCK_H / H;                      // feet stay clear of the hotbar at the bottom
  const fits = (x, z) => {
    for (const sx of [-BODY_R, BODY_R]) for (const sz of [-0.3, 0.3]) {
      v.set(x + sx, 0.04, z + sz).project(viewCam);
      if (Math.abs(v.x) > 0.96 || v.y < yMin || v.y > 0.8) return false;
    }
    v.set(x, YAGA_H, z).project(viewCam);             // head in frame too
    return v.y < 0.9;
  };
  const ax = aim.x;
  let z1 = ROAM.z1, z0 = ROAM.z0;
  while (z1 > ROAM.z0 + 1 && !fits(ax, z1)) z1 -= 0.2;
  while (z0 < z1 - 1 && !fits(ax, z0)) z0 += 0.3;
  const slices = [];
  for (let i = 0; i < 13; i++) {
    const z = z0 + ((z1 - z0) * i) / 12;
    let a = ROAM.x0, b = ROAM.x1;
    while (a < ax && !fits(a, z)) a += 0.3;
    while (b > ax && !fits(b, z)) b -= 0.3;
    slices.push({ z, x0: Math.min(a, ax), x1: Math.max(b, ax) });
  }
  view = { z0, z1, slices };
  world.viewAt = aim.clone();
}
function spanAt(z) { return spanIn(area, z); }
function spanIn(A, z) {
  if (!A) return { x0: ROAM.x0, x1: ROAM.x1 };
  const t = clamp((z - A.z0) / Math.max(A.z1 - A.z0, 1e-3), 0, 1) * (A.slices.length - 1);
  const i = Math.min(A.slices.length - 2, Math.floor(t)), k = t - i, a = A.slices[i], b = A.slices[i + 1];
  return { x0: lerp(a.x0, b.x0, k), x1: lerp(a.x1, b.x1, k) };
}
function clampXZ(x, z) {
  const A = area || ROAM; z = clamp(z, A.z0, A.z1);
  const sp = spanAt(z); return { x: clamp(x, sp.x0, sp.x1), z };
}
function blocked(x, z, pad = 0.05) { return OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) || !walkable(x, z); }
function resolveSpot(x, z) {
  for (let i = 0; i < 5; i++) {
    for (const o of OBSTACLES) {
      const ox = x - o.x, oz = z - o.z, d = Math.hypot(ox, oz) || 0.001;
      if (d < o.r + 0.12) { x = o.x + (ox / d) * (o.r + 0.12); z = o.z + (oz / d) * (o.r + 0.12); }
    }
    const c = clampXZ(x, z); x = c.x; z = c.z;
    if (!blocked(x, z)) break;
  }
  return blocked(x, z) ? nearest(x, z, (a, b) => !blocked(a, b)) : { x, z };   // water or a cliff: the nearest cell she can stand on
}
function segNear(ax, az, bx, bz, o) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((o.x - ax) * dx + (o.z - az) * dz) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - o.x, az + dz * t - o.z);
}
function faceCamAngle() { return Math.atan2(camera.position.x - pet.pos.x, camera.position.z - pet.pos.z); }

function resize() {
  const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  renderer.setSize(W, H);
  const aspect = W / H;
  camera.aspect = aspect;
  if (pet) followCamera(1);
  else { const rig = rigAt(zoom, aspect); world.camDist = rig.dist; placeCamera(camera, rig, aim, aim); }
  paintSky(W, H);
  computeArea();
  if (pet) { const c = resolveSpot(pet.pos.x, pet.pos.z); if (!pet.airborne) pet.pos.set(c.x, pet.pos.y, c.z); }
}

/** Eases the camera after her (k: 0…1 of the way this frame); the key light and its shadow box come along. */
function followCamera(k) {
  const rig = rigAt(zoom, camera.aspect), inset = 1 - Math.max(0, zoom);   // close up she may walk right to the edge
  const tx = clamp(pet.pos.x, ROAM.x0 + 7 * inset, ROAM.x1 - 7 * inset);
  const tz = clamp(pet.pos.z, ROAM.z0 + 4 * inset, ROAM.z1 - 4 * inset);
  aim.x = lerp(aim.x, tx, k); aim.z = lerp(aim.z, tz, k); aim.y = lerp(aim.y, rig.aimY + pet.pos.y, k);
  const toBox = 0.45 * rig.close * rig.close;                              // close up, look a little towards the Box so both are in frame
  look.set(aim.x + (Box.pet.pos.x - pet.pos.x) * toBox, aim.y, aim.z + (Box.pet.pos.z - pet.pos.z) * toBox);
  world.camDist = rig.dist;
  placeCamera(camera, rig, aim, look, (x, z) => groundY(x, z) + 0.6);
  const L = world.lights;
  L.key.position.set(aim.x - 6.5, 9.5, aim.z + 8.5); L.key.target.position.set(aim.x, 0, aim.z); L.key.target.updateMatrixWorld();
  if (!world.viewAt || world.viewAt.distanceTo(aim) > 0.6) computeView();
}

/* ───────────── props: food and poo ───────────── */
const TAP_GEO = new THREE.SphereGeometry(1, 12, 8), TAP_MAT = new THREE.MeshBasicMaterial({ visible: false });
function cloneProp(kind) {
  const src = world.models[kind];
  let root, bug = null;
  if (src.make) {
    bug = src.make(); root = new THREE.Group(); root.name = kind; root.add(bug.group); root.scale.setScalar(BUG_S);
    const tap = new THREE.Mesh(TAP_GEO, TAP_MAT); tap.scale.setScalar(BUG_TAP_R / BUG_S); tap.position.y = 0.1; root.add(tap);
  }
  else root = src.scene.clone(true);
  const it = { root, kind, s0: root.scale.x, grow: 0, state: 'rest', bug, seed: rand(0, 50) };
  if (src.clips.length) {
    const mx = new THREE.AnimationMixer(root);
    for (const c of src.clips) mx.clipAction(c).play();
    mx.setTime(Math.random() * src.clips[0].duration);
    it.mixer = mx;
  }
  root.traverse((o) => { o.userData.item = it; });
  return it;
}
function clearOfItems(x, z, gap = 1.3) {
  return ![...world.items, ...world.poops].some((it) => Math.hypot(x - it.root.position.x, z - it.root.position.z) < gap)
    && Math.hypot(x - pet.pos.x, z - pet.pos.z) > BODY_R + 0.5;
}
const BUG_MAX = SET.bugs.most;
/** The bugs she can hunt and eat: hostile ones are enemies, not food. */
function aliveBugs(kind) { return world.items.filter((i) => i.bug && !i.hostile && (!kind || i.kind === kind)); }
function spawnKind() {
  if (S.crave && !aliveBugs(S.crave).length && Math.random() < 0.6) return S.crave;
  const n = (k) => aliveBugs(k).length, min = Math.min(...FOODS.map(n));
  return Math.random() < 0.5 ? pick(FOODS.filter((k) => n(k) === min)) : pick(FOODS);   // keep the menu varied
}
function spawnSprout(instant = false, kind = null) {
  const A = view || area || ROAM;
  const cross = !instant && Math.random() < 0.35;     // some just pass through; the rest roam for a while
  for (let i = 0; i < 80; i++) {
    const z = rand(A.z0 + 0.4, A.z1), sp = spanIn(A, z);
    if (sp.x1 - sp.x0 < 2.4) continue;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = cross ? (side < 0 ? sp.x0 + 0.5 : sp.x1 - 0.5) : rand(sp.x0 + 0.9, sp.x1 - 0.9);
    if (blocked(x, z, 0.5) || !clearOfItems(x, z, 2.0) || Math.hypot(x - pet.pos.x, z - pet.pos.z) < 2.4) continue;
    const it = cloneProp(kind || spawnKind());
    it.given = false;
    it.root.position.set(x, groundY(x, z) + (instant ? 0 : -0.3), z); it.root.rotation.y = cross ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : rand(0, Math.PI * 2);
    if (it.bug) { startWalk(it, cross ? -side : null); it.life = rand(...SET.bugs.stayFor); }
    it.s0 *= rand(0.9, 1.15); it.grow = instant ? 1 : 0; it.root.scale.setScalar(instant ? it.s0 : 0.001);
    scene.add(it.root); world.items.push(it);
    return it;
  }
  return null;
}
function landingSpot() {
  // the fruit lands in front of the tree, leaning toward the side the box is on
  const toCam = Math.atan2(camera.position.z - TREE.z, camera.position.x - TREE.x);
  const toPet = Math.atan2(pet.pos.z - TREE.z, pet.pos.x - TREE.x);
  const a0 = toCam + clamp(wrap(toPet - toCam), -0.9, 0.9);
  for (let i = 0; i < 40; i++) {
    const a = a0 + rand(-0.5, 0.5) * (1 + i / 20), r = rand(2.3, 3.1);
    const s = resolveSpot(TREE.x + Math.cos(a) * r, TREE.z + Math.sin(a) * r);
    if (!blocked(s.x, s.z, 0.45) && clearOfItems(s.x, s.z, 1.3)) return s;
  }
  return resolveSpot(pet.pos.x + 1.6, pet.pos.z + 0.6);
}
function dropFood(kind) {
  if (world.items.filter((i) => i.given).length >= 6) {
    const old = world.items.find((i) => i.given && !i.claimed);
    if (old) vanish(old, 0);
  }
  const it = cloneProp(kind);
  it.given = true; it.state = 'fall';
  const land = landingSpot();
  const start = new THREE.Vector3(CANOPY.x + rand(-0.8, 0.8), CANOPY.y - 0.2, CANOPY.z + rand(-0.3, 0.5));
  const T = Math.sqrt((2 * (start.y - groundY(land.x, land.z))) / 16);
  it.fall = { vx: (land.x - start.x) / T, vz: (land.z - start.z) / T, vy: 0, bounces: 0, spin: rand(-8, 8) };
  it.root.position.copy(start); it.root.scale.setScalar(it.s0); it.grow = 1;
  scene.add(it.root); world.items.push(it);
  Sound.drop();
  brain.noticed = it; brain.noticeAt = clock.t;
  return it;
}
function foodLanded(it) {
  // full up: it looks at the fruit and shakes its head
  if (it.given && S.hunger < 0.08 && brain.mode === 'idle' && !pet.airborne) refuse(it);
}
function spawnPoop(x, z, instant = false) {
  const it = cloneProp('pupu');
  const s = resolveSpot(x, z);
  it.root.position.set(s.x, groundY(s.x, s.z) + (instant ? 0 : -0.25), s.z); it.root.rotation.y = rand(-0.6, 0.6);
  it.grow = instant ? 1 : 0; it.root.scale.setScalar(instant ? it.s0 : 0.001);
  scene.add(it.root); world.poops.push(it);
  refreshUI();
  return it;
}
/** A bug left far behind wanders off, so there are always some near her. */
function recycleFarBug() {
  const far = aliveBugs().filter((i) => !i.claimed && i.root.position.distanceTo(pet.pos) > 16)
    .sort((a, b) => b.root.position.distanceTo(pet.pos) - a.root.position.distanceTo(pet.pos))[0];
  if (far) vanish(far);
}
function vanish(it, delay = 0, lift = 1.1) {
  world.items = world.items.filter((o) => o !== it);
  world.poops = world.poops.filter((o) => o !== it);
  world.vanishing.push({ it, t: -delay, dur: 0.35, lift });
}
// bugs walk the clearing: each kind its own pace, each bug a bit faster or slower than its kind.
// All of them stay well under the box's full chase (~2.8 units/s), even when they bolt.
const BUG_SPEED = Object.fromEntries(Object.entries(SET.bugs.speed).map(([k, v]) => [k, v * BUG_SIZE]));   // smaller bugs, shorter strides
const BUG_BOLT = SET.bugs.boltSpeed, BUG_FEAR = SET.bugs.fearRange;
function bugTarget(it, exit = null) {
  const A = area || ROAM, p = it.root.position;
  for (let i = 0; i < 30; i++) {
    const z = clamp(p.z + rand(-3, 3), A.z0 + 0.3, A.z1 - 0.3), sp = spanAt(z), mid = (sp.x0 + sp.x1) / 2;
    // head for the far side: crossing the clearing, not pottering about
    const x = exit != null ? (exit > 0 ? sp.x1 + 1 : sp.x0 - 1) : p.x < mid ? rand(mid, sp.x1 - 0.4) : rand(sp.x0 + 0.4, mid);
    if (exit == null && blocked(x, z, 0.4)) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(p.x, 0, p.z);
}
/* ───────────── hostile bugs: the ones that bite ───────────── */
const HOSTILE = { ...SET.hostile, reach: BODY_R + 0.15 };
const hostileBugs = () => world.items.filter((i) => i.hostile);
const FOE_RED = new THREE.Color(0xB32A1F);
/** A bug that crawls out of the dirt, bigger and red-glowing, and goes straight for her. */
function spawnHostile(kind = pick(HOSTILE.kinds)) {
  const it = spawnSprout(false, kind);
  if (!it) return null;
  Object.assign(it, { hostile: true, hp: HOSTILE.hp, biteAt: 1, life: rand(...HOSTILE.stayFor), stun: 0, flash: 0, glow: [] });
  it.s0 *= HOSTILE.size; it.walk.base = HOSTILE.speed; it.walk.exit = null;
  it.root.traverse((o) => {                             // its own materials, so the red glow stays on this bug
    if (!o.isMesh || !o.material.emissive) return;
    o.material = o.material.clone(); o.material.emissive = FOE_RED.clone(); o.material.emissiveIntensity = 0.6;
    it.glow.push(o.material);
  });
  say('foe', { cool: 25 });
  return it;
}
/** What a hostile bug goes for: the nearest hen, unless she is right beside it; her once the flock is gone. */
function foeTarget(it) {
  const p = it.root.position;
  let hen = null, best = Infinity;
  for (const h of world.hens) { const d = Math.hypot(h.root.position.x - p.x, h.root.position.z - p.z); if (d < best) { best = d; hen = h; } }
  if (hen && Math.hypot(pet.pos.x - p.x, pet.pos.z - p.z) > HOSTILE.herRange) return { x: hen.root.position.x, z: hen.root.position.z, reach: HOSTILE.henReach, hen };
  return { x: pet.pos.x, z: pet.pos.z, reach: HOSTILE.reach };
}
/** A hostile bug gives up and crawls off the edge of the field. */
function sendOff(it) {
  const p = it.root.position, sp = spanAt(p.z);
  it.hostile = false; it.walk.exit = p.x < (sp.x0 + sp.x1) / 2 ? -1 : 1; it.walk.goal = bugTarget(it, it.walk.exit);
}
/** A hostile bug next to its target (a hen or her) bites, every so often. A fresh hit stuns it and flashes it white for a moment. */
function tickBite(it, dt) {
  it.stun = Math.max(0, it.stun - dt);
  if (it.flash > 0) { it.flash -= dt; for (const m of it.glow) m.emissiveIntensity = it.flash > 0 ? 2.2 : 0.6; }
  it.biteAt -= dt;
  if (it.biteAt > 0 || it.stun > 0 || it.state !== 'rest' || it.grow < 1) return;
  const p = it.root.position, tgt = foeTarget(it);
  if (Math.hypot(p.x - tgt.x, p.z - tgt.z) > tgt.reach + 0.1) return;
  if (!tgt.hen && clock.t < world.faintUntil) return;      // nobody bites her while she is down
  it.biteAt = HOSTILE.biteEvery;
  if (tgt.hen) hurtHen(tgt.hen, HOSTILE.biteHen, p); else hurtYaga(HOSTILE.bite);
}
const FEATHER_GEO = new THREE.BoxGeometry(0.08, 0.01, 0.04), FEATHER_MAT = new THREE.MeshStandardMaterial({ color: 0xF0EADC, roughness: 1 });
/** A bug bit a hen: it squawks and runs from it; at zero health it is lost in a puff of feathers. */
function hurtHen(h, dmg, from) {
  h.hp -= dmg; h.hurt = 0.3; h.flee = 1.1; h.away = { x: from.x, z: from.z }; Sound.squawk();
  if (h.hp <= 0) return loseHen(h);
  say('henHurt', { cool: 6 });
}
function loseHen(h) {
  const p = h.root.position;
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(FEATHER_GEO, FEATHER_MAT); m.position.set(p.x, p.y + 0.3, p.z); scene.add(m);
    world.clods.push({ m, v: new THREE.Vector3(rand(-1.2, 1.2), rand(1.5, 3), rand(-1.2, 1.2)), spin: rand(-14, 14), dead: 0, floor: p.y + 0.02 });
  }
  scene.remove(h.root); world.hens = world.hens.filter((o) => o !== h);
  S.flock = world.hens.length; say('henLost', { force: true }); save();
}
/** Hens that were lost come back with the morning. */
function restoreFlock() {
  if (world.hens.length >= FLOCK) return;
  while (world.hens.length < FLOCK) addHen(world.hens.length);
  S.flock = FLOCK; say('henBack', { force: true }); save();
}
const vignette = $('.vignette');
/** Something hurt her: health drops, the screen edge flashes red, and she flinches if she is just standing there. */
function hurtYaga(dmg) {
  S.health = clamp(S.health - dmg, 0, 1);
  Sound.hurt(); say('bitten', { cool: 6 });
  vignette.classList.remove('hurt'); void vignette.offsetWidth; vignette.classList.add('hurt');
  if (S.health <= 0.001) return faint();
  if (brain.mode === 'nap') { brain.mode = 'idle'; brain.until = 1; }          // a bite wakes her
  if (brain.mode === 'idle' && !pet.airborne) pet.play('hit_to_body_01', 0.9);
}
/** At zero health she collapses for a while; the biters give up and crawl off. */
function faint() {
  world.faintUntil = clock.t + HOSTILE.faintFor;
  hostileBugs().forEach(sendOff);
  if (brain.food) brain.food.claimed = false;
  brain.food = brain.foe = null; brain.cleanQ.length = 0;
  brain.mode = 'nap'; brain.napUntil = clock.t + HOSTILE.faintFor; S.health = HOSTILE.faintHealth;
  pet.play('fall', 3); say('faint', { force: true });
}

/* ── the broom ── */
/** Tap on a hostile bug: with the broom she walks up and swats it; with the shovel she says so. */
function tapFoe(f) {
  if (S.tool !== 'broom') { say('wrongTool', { cool: 6 }); return; }
  if (S.energy < SWING.cost) { say('tired', { cool: 5 }); return; }
  if (BUSY.includes(brain.mode) || brain.mode === 'nap') return;
  ring(f.root.position);
  brain.foe = f; go(f.root.position.clone(), 'attack', true);
}
/** One swing at a bug in reach: it costs stamina, and the hit lands a moment into the swing. */
function startAttack(f) {
  brain.mode = 'attack'; brain.foe = f; brain.atkT = 0; brain.atkHit = false;
  S.energy = clamp(S.energy - SWING.cost, 0, 1);
  pet.faceTo = Math.atan2(f.root.position.x - pet.pos.x, f.root.position.z - pet.pos.z);
  pet.swing(); Sound.swing();
}
/** The broom lands: damage, a shove away from her, a white flash, and a stun so it cannot bite straight back. */
function strike(f) {
  const p = f.root.position, dx = p.x - pet.pos.x, dz = p.z - pet.pos.z, d = Math.hypot(dx, dz) || 1e-3;
  if (d > SWING.reach + 0.3) return;                     // it got away
  f.hp -= SWING.dmg; f.stun = HOSTILE.stun; f.flash = 0.12; Sound.hit();
  const s = resolveSpot(p.x + (dx / d) * 0.45, p.z + (dz / d) * 0.45); p.x = s.x; p.z = s.z;
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  const s = screenOf(f.root.position.clone().setY(f.root.position.y + 0.3));
  vanish(f, 0, 0.5); sparkle(s.x, s.y); Sound.squeak(); Sound.poof();
  S.mana = clamp(S.mana + HOSTILE.killMana, 0, 1); say('foeDown', { cool: 5 });
}

/* ───────────── the hens: her flock, wandering in the yard in front of the hut ───────────── */
const YARD = SET.hens.yard;
const HEN = { speed: SET.hens.speed, run: SET.hens.runSpeed };
const EGG = { every: SET.hens.eggEvery, max: SET.hens.eggsMost };            // seconds between a hen's eggs; the most eggs lying about
/** A hen at a random spot in the yard. */
function addHen(variant) {
  const model = makeChicken(variant), a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * YARD.r;
  const s = resolveSpot(YARD.x + Math.cos(a) * r, YARD.z + Math.sin(a) * r);
  model.group.position.set(s.x, groundY(s.x, s.z), s.z);
  const hen = { model, root: model.group, hp: 1, heading: rand(0, Math.PI * 2), v: 0, goal: null, rest: rand(0.3, 2), t: rand(0, 20), hurt: 0, flee: 0, away: null, eggAt: rand(...EGG.every) };
  model.group.traverse((o) => { o.userData.hen = hen; });
  scene.add(model.group); world.hens.push(hen);
  return hen;
}
/** Somewhere for a hen to stroll to: a free spot in the yard. */
function henGoal() {
  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * YARD.r, x = YARD.x + Math.cos(a) * r, z = YARD.z + Math.sin(a) * r;
    if (!blocked(x, z, 0.3)) return { x, z };
  }
  return { x: YARD.x, z: YARD.z };
}
/** A hen stands about pecking, then strolls somewhere else; if something bit it, it runs from it. */
function tickHen(h, dt) {
  const p = h.root.position;
  h.t += dt; h.hurt = Math.max(0, h.hurt - dt); h.hp = Math.min(1, h.hp + dt / SET.hens.healIn);    // a bitten hen recovers in a couple of minutes
  let speed = 0, peck = 0;
  h.eggAt -= dt;
  if (h.flee > 0) {
    h.flee -= dt; speed = HEN.run;
    h.heading += wrap(Math.atan2(p.x - h.away.x, p.z - h.away.z) - h.heading) * (1 - Math.exp(-12 * dt));
  } else if (h.rest > 0) {
    h.rest -= dt; peck = 0.5 + 0.5 * Math.sin(h.t * 7);
    if (h.eggAt <= 0) layEgg(h);
    if (h.rest <= 0) h.goal = henGoal();
  } else {
    const dx = h.goal.x - p.x, dz = h.goal.z - p.z;
    if (Math.hypot(dx, dz) < 0.15) h.rest = rand(1.5, 5);
    else { h.heading += wrap(Math.atan2(dx, dz) - h.heading) * (1 - Math.exp(-6 * dt)); speed = HEN.speed; }
  }
  h.v = ease(h.v, speed, 6, dt);
  const nx = p.x + Math.sin(h.heading) * h.v * dt, nz = p.z + Math.cos(h.heading) * h.v * dt;
  if (!blocked(nx, nz, 0.15)) { p.x = nx; p.z = nz; }
  else { h.v = 0; h.goal = henGoal(); if (h.flee <= 0) h.rest = 0.5; }     // walked into something: think again
  p.y = ease(p.y, groundY(p.x, p.z), 12, dt); h.root.rotation.y = h.heading;
  h.model.tick(h.t, h.v / HEN.speed, peck, h.hurt > 0);
}
function tickHens(dt) { for (const h of world.hens) tickHen(h, dt); }
/** A hen that is standing about lays an egg behind it. */
function layEgg(h) {
  h.eggAt = rand(...EGG.every);
  if (world.eggs.length >= EGG.max) return;
  const p = h.root.position, x = p.x - Math.sin(h.heading) * 0.22, z = p.z - Math.cos(h.heading) * 0.22;
  const root = makeEgg(); root.position.set(x, groundY(x, z), z);
  const tap = new THREE.Mesh(TAP_GEO, TAP_MAT); tap.scale.setScalar(0.28); tap.position.y = 0.1; root.add(tap);   // a roomy tap target for a small egg
  const egg = { root, x, z };
  root.traverse((o) => { o.userData.egg = egg; });
  scene.add(root); world.eggs.push(egg); Sound.plop();
}
/** The hostile bug she should deal with: one in broom reach, or one at a hen near enough to run to. */
function foeToDefend() {
  let best = null, bestD = Infinity;
  for (const f of hostileBugs()) {
    const fp = f.root.position, d = Math.hypot(fp.x - pet.pos.x, fp.z - pet.pos.z);
    const atHen = world.hens.some((h) => Math.hypot(h.root.position.x - fp.x, h.root.position.z - fp.z) < 3);
    if (f.grow >= 1 && d < bestD && (d < SWING.reach || (atHen && d < 9))) { best = f; bestD = d; }
  }
  return best;
}
/** The hen under the tap ray, if any. */
function hitHen() {
  const hits = ray.intersectObjects(world.hens.map((h) => h.root), true);
  return hits.length ? hits[0].object.userData.hen : null;
}
/** Tap on a hen: it clucks and she gets a heart. */
function petHen(h) {
  Sound.cluck(); h.rest = Math.max(h.rest, 1.2);
  const s = screenOf(h.root.position.clone().setY(h.root.position.y + 0.5)); heart(s.x, s.y);
  say('henPet', { cool: 12 });
}
/** The egg under the tap ray, if any. */
function hitEgg() {
  const hits = ray.intersectObjects(world.eggs.map((e) => e.root), true);
  return hits.length ? hits[0].object.userData.egg : null;
}
/** Tap on an egg: she goes and picks it up. */
function tapEgg(egg) {
  if (BUSY.includes(brain.mode) || brain.mode === 'nap') return;
  ring(new THREE.Vector3(egg.x, groundY(egg.x, egg.z), egg.z));
  orderFarm('egg', egg, { egg });
}
/** A harvest feeds the flock: the hens heal and lay sooner. */
function feedFlock() {
  for (const h of world.hens) { h.hp = Math.min(1, h.hp + SET.hens.feedHeals); h.eggAt = Math.min(h.eggAt, SET.hens.feedLaysWithin); sparkleAt(h.root.position.x, h.root.position.z); }
}

/* ───────────── the farm: the shovel digs farmland ───────────── */
const FARMABLE = ['dirt', 'grass', 'field'];
/** Can this block become farmland? Plain dry ground, not hugging the hut, the tree or the rocks. */
function canDig(x, z) {
  return FARMABLE.includes(kindAt(x, z)) && walkable(x, z) && !OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r - BODY_R + 0.7);
}
const plotAt = (x, z) => { const c = blockCentre(x, z); return world.plots.find((p) => p.x === c.x && p.z === c.z); };
/** Turns a block into farmland and remembers it. */
function addPlot(x, z, crop = null, at = 0) {
  tillCell(x, z);
  const plot = { x, z, crop, at, stage: -1, root: null };
  world.plots.push(plot);
  showCrop(plot);
  return plot;
}
/** Draws a plot's crop at its current growth stage; a stage that just grew pops up from small. */
function showCrop(plot) {
  const stage = plot.crop ? stageOf(plot) : -1;
  if (plot.stage === stage) return;
  const grew = plot.stage >= 0 && stage > plot.stage;
  plot.stage = stage;
  if (plot.root) scene.remove(plot.root);
  plot.root = null;
  if (!plot.crop) return;
  const root = plot.root = makeCrop(plot.crop, stage);
  root.position.set(plot.x, groundY(plot.x, plot.z), plot.z);
  root.traverse((o) => { o.userData.plot = plot; });
  if (grew) root.scale.setScalar(0.4);
  scene.add(root);
}
/** Crops grow with the clock (also while the tab is closed): check them once a second, and ease new growth up to size. */
function tickFarm(dt) {
  world.farmT = (world.farmT || 0) - dt;
  if (world.farmT <= 0) { world.farmT = 1; world.plots.forEach(showCrop); }
  for (const p of world.plots) if (p.root && p.root.scale.x < 1) p.root.scale.setScalar(Math.min(1, ease(p.root.scale.x, 1.05, 9, dt)));
}
/** The plot whose crop the tap ray hits: crops stand above their block, so the ground under the tap is a block too far. */
function hitPlot() {
  const hits = ray.intersectObjects(world.plots.map((p) => p.root).filter(Boolean), true);
  return hits.length ? hits[0].object.userData.plot : null;
}
/** Plants whichever crop she has fewer of, so the field stays mixed. */
function nextCrop() {
  const n = (k) => world.plots.filter((p) => p.crop === k).length;
  return n(CROPS[0]) <= n(CROPS[1]) ? CROPS[0] : CROPS[1];
}
/** Tap with the shovel: dig plain ground into farmland, plant tilled soil, harvest a ripe crop, or hurry a growing one with mana. */
function tapShovel(hit) {
  if (BUSY.includes(brain.mode) || brain.mode === 'nap') return;
  const pl = hitPlot(), c = pl ? { x: pl.x, z: pl.z } : blockCentre(hit.x, hit.z), plot = pl || plotAt(c.x, c.z);
  ring(new THREE.Vector3(c.x, groundY(c.x, c.z), c.z));
  if (!plot) return canDig(c.x, c.z) ? orderFarm('dig', c) : say('cantDig', { cool: 4 });
  if (!plot.crop) return orderFarm('plant', c, { crop: nextCrop() });
  orderFarm(stageOf(plot) === 2 ? 'harvest' : 'grow', c);
}
/** Walks her to her own side of the block, then the action starts (see arrive). */
function orderFarm(act, c, extra = {}) {
  if (FARM[act].mana && S.mana < FARM[act].mana) return say('noMana', { cool: 5 });
  if (S.energy < FARM[act].cost) return say('tired', { cool: 5 });
  const dx = pet.pos.x - c.x, dz = pet.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
  const spot = resolveSpot(c.x + (dx / d) * 1.0, c.z + (dz / d) * 1.0);
  brain.farm = { act, x: c.x, z: c.z, t: 0, beat: 0, done: false, ...extra };
  go(new THREE.Vector3(spot.x, 0, spot.z), 'farm', false);
}
function startFarm() {
  const F = brain.farm, A = FARM[F.act];
  brain.mode = 'farm'; F.t = 0; F.beat = 0; F.done = false;
  S.energy = clamp(S.energy - A.cost, 0, 1); S.mana = clamp(S.mana - (A.mana || 0), 0, 1);
  pet.faceTo = Math.atan2(F.x - pet.pos.x, F.z - pet.pos.z);
  pet.play(A.clip, A.dur, true);
}
let cellMark;
function makeCellMark() {
  cellMark = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.4, depthWrite: false }));
  cellMark.rotation.x = -Math.PI / 2; cellMark.visible = false; scene.add(cellMark);
}
/** With the shovel, a flat square outlines the block under the cursor: gold when she can work it, red when she can't. */
function moveCellMark() {
  const h = S.tool === 'shovel' && !MOBILE ? hitGround() : null;             // the ray is already set by toNdc
  cellMark.visible = !!h;
  if (!h) return;
  const pl = hitPlot(), c = pl ? { x: pl.x, z: pl.z } : blockCentre(h.x, h.z), plot = pl || plotAt(c.x, c.z);
  const ok = plot ? !plot.crop || stageOf(plot) === 2 || S.mana >= FARM.grow.mana : canDig(c.x, c.z);
  cellMark.material.color.setHex(ok ? GLOW_COLOR : 0xC8442F);
  cellMark.position.set(c.x, groundY(c.x, c.z) + 0.03, c.z);
}
/** A sparkle over a block, where the crop is. */
function sparkleAt(x, z) {
  const s = screenOf(new THREE.Vector3(x, groundY(x, z) + 0.3, z)); sparkle(s.x, s.y);
}
/** A few clods fly up where the shovel hit. */
function dirtBurst(x, z, n) {
  const y = groundY(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(DIRT_GEO, DIRT_MAT); m.scale.setScalar(rand(0.04, 0.09)); m.castShadow = true;
    m.position.set(x + rand(-0.15, 0.15), y + 0.1, z + rand(-0.15, 0.15)); scene.add(m);
    world.clods.push({ m, v: new THREE.Vector3(rand(-1.1, 1.1), rand(2.2, 3.6), rand(-1.1, 1.1)), spin: rand(-12, 12), dead: 0, floor: y + 0.02 });
  }
}
/** The result of a farm action lands. */
function finishFarm(F) {
  if (F.act === 'dig') { addPlot(F.x, F.z); say('dug', { force: true }); }
  const plot = plotAt(F.x, F.z);
  if (F.act === 'plant') { plot.crop = F.crop; plot.at = Date.now(); showCrop(plot); say('planted', { force: true }); }
  if (F.act === 'harvest') {                              // the crop is food: she eats her harvest
    plot.crop = null; plot.at = 0; showCrop(plot); sparkleAt(F.x, F.z); Sound.yum();
    feed(SET.food.harvest);
    feedFlock(); say('harvest', { force: true });
  }
  if (F.act === 'egg') {                                  // an egg is food too
    scene.remove(F.egg.root); world.eggs = world.eggs.filter((e) => e !== F.egg);
    sparkleAt(F.x, F.z); Sound.yum();
    feed(SET.food.egg);
    say('egg', { force: true });
  }
  if (F.act === 'grow') { plot.at = Date.now() - GROW.ripe * 1000; showCrop(plot); sparkleAt(F.x, F.z); Sound.chime(); say('grown', { force: true }); }
  save();
}

function startWalk(it, exit = null) {
  it.walk = { base: (BUG_SPEED[it.kind] || 0.7) * rand(0.75, 1.3), v: 0, heading: it.root.rotation.y, rest: rand(0.2, 0.9), exit, bt: 0 };
  it.walk.goal = bugTarget(it, exit);
}
function tickBug(it, dt) {
  const w = it.walk, p = it.root.position, live = world.items.includes(it);
  const eating = brain.food === it && brain.mode === 'eat';
  let a = 0.3, adv = dt;
  if (it.state === 'fall' || eating) a = 1;
  else if (w && live && it.state === 'rest' && it.grow >= 1) {
    const dPet = Math.hypot(p.x - pet.pos.x, p.z - pet.pos.z) || 1e-3;
    const scared = !it.hostile && dPet < BUG_FEAR && !pet.want.asleep && brain.mode !== 'sleep';
    const tgt = it.hostile ? foeTarget(it) : null;
    if (tgt) {                                           // always after its target, round the pond and cliffs; it stops only to bite
      if ((it.pathT = (it.pathT || 0) - dt) <= 0) { w.goal = waypoint(p.x, p.z, tgt.x, tgt.z); it.pathT = 0.25; }
      w.rest = Math.hypot(p.x - tgt.x, p.z - tgt.z) < tgt.reach || it.stun > 0 ? 1 : 0;
    }
    if (w.rest > 0 && !scared) {
      w.rest -= dt; w.v = ease(w.v, 0, 8, dt);
      if (tgt) { w.heading += wrap(Math.atan2(tgt.x - p.x, tgt.z - p.z) - w.heading) * (1 - Math.exp(-10 * dt)); it.root.rotation.y = w.heading; }
    }
    else {
      w.rest = 0;
      // steer toward the goal, round the tree and rocks, and away from the box when it gets close
      let sx = w.goal.x - p.x, sz = w.goal.z - p.z; const gd = Math.hypot(sx, sz) || 1e-3; sx /= gd; sz /= gd;
      for (const o of OBSTACLES) {
        const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz) || 1e-3, r = o.r - BODY_R + 0.7;
        if (d < r + 0.9) { const k = ((r + 0.9 - d) / 0.9) * 1.8; sx += (ox / d) * k; sz += (oz / d) * k; }
      }
      if (scared) { const k = ((BUG_FEAR - dPet) / BUG_FEAR) * 2.4; sx += ((p.x - pet.pos.x) / dPet) * k; sz += ((p.z - pet.pos.z) / dPet) * k; }
      const want = Math.atan2(sx, sz) + Math.sin(clock.t * 1.7 + it.seed) * 0.25;
      w.heading += wrap(want - w.heading) * (1 - Math.exp(-(scared ? 9 : 5) * dt));
      w.v = ease(w.v, scared ? Math.min(w.base * 1.6, BUG_BOLT) : w.base, 4, dt);
      let nx = p.x + Math.sin(w.heading) * w.v * dt, nz = p.z + Math.cos(w.heading) * w.v * dt;
      if (w.exit == null) ({ x: nx, z: nz } = clampXZ(nx, nz));
      else { const A = area || ROAM; nz = clamp(nz, A.z0, A.z1); }
      if (w.exit == null && !walkable(nx, nz)) { w.goal = bugTarget(it); nx = p.x; nz = p.z; }   // not into the pond: stay and look elsewhere
      p.x = nx; p.z = nz; p.y = ease(p.y, groundY(nx, nz), 12, dt); it.root.rotation.y = w.heading;
      if (w.exit != null) {
        const sp = spanAt(p.z);
        if (p.x < sp.x0 - 0.5 || p.x > sp.x1 + 0.5) {        // made it across: off it goes
          if (brain.food === it) say('escaped', { force: true, cool: 6 });
          if (brain.food === it) { brain.food = null; }
          vanish(it, 0, 0); return;
        }
      } else if (it.life != null && (it.life -= dt) < 0 && !it.claimed) {
        it.hostile = false;                                  // a hostile bug that has had enough crawls off like the others
        w.exit = p.x < (spanAt(p.z).x0 + spanAt(p.z).x1) / 2 ? -1 : 1; w.goal = bugTarget(it, w.exit);
      } else if (!it.hostile && (gd < 0.4 || Math.random() < dt * 0.05)) { w.goal = bugTarget(it); if (Math.random() < 0.5) w.rest = rand(0.4, 2.2); }
      const k = clamp(w.v / Math.max(w.base, 0.2), 0, 1.8);
      a = 0.35 + 0.65 * Math.min(1, k); adv = dt * (0.5 + 0.7 * k);
    }
  }
  if (w) w.bt += adv;
  it.bug.tick((w ? w.bt : clock.t) + it.seed, a);
}
function tickProps(dt) {
  {
    world.spawnAt -= dt;
    if (world.spawnAt <= 0) {
      if (aliveBugs().length >= BUG_MAX) recycleFarBug();
      if (aliveBugs().length < BUG_MAX) spawnSprout();
      world.spawnAt = rand(...SET.bugs.appearEvery);
    }
    world.foeAt -= dt;
    if (world.foeAt <= 0) {                                   // the biting kind: one or two by day, up to three at night
      if (hostileBugs().length < (S.night ? HOSTILE.mostByNight : HOSTILE.mostByDay)) spawnHostile();
      world.foeAt = rand(...(S.night ? HOSTILE.nightEvery : HOSTILE.dayEvery));
    }
  }
  for (const it of [...world.items, ...world.poops]) {
    if (it.mixer) it.mixer.update(dt);
    if (it.bug) tickBug(it, dt);
    if (it.hostile) tickBite(it, dt);
    if (it.grow < 1) {
      it.grow = Math.min(1, it.grow + dt / 0.7);
      const e = 1 - Math.pow(1 - it.grow, 3);
      it.root.scale.setScalar(it.s0 * Math.max(0.001, e) * (1 + 0.14 * Math.sin(it.grow * Math.PI)));
      it.root.position.y = groundY(it.root.position.x, it.root.position.z) - 0.3 * (1 - e);
    }
    if (it.state === 'fall') {
      const f = it.fall, p = it.root.position;
      f.vy -= 16 * dt; p.x += f.vx * dt; p.z += f.vz * dt; p.y += f.vy * dt; it.root.rotation.y += f.spin * dt;
      const gy = groundY(p.x, p.z);
      if (p.y <= gy) {
        p.y = gy; f.bounces++;
        if (f.bounces === 1) Sound.thud();
        if (f.bounces >= 3 || Math.abs(f.vy) < 1.5) { it.state = 'rest'; if (it.bug) startWalk(it); foodLanded(it); }
        else { f.vy = -f.vy * 0.34; f.vx *= 0.25; f.vz *= 0.25; f.spin *= 0.5; }
      }
    }
  }
  for (const v of world.vanishing) {
    v.t += dt; if (v.t < 0) continue;
    const k = Math.min(1, v.t / v.dur), e = 1 - Math.pow(1 - k, 2);
    if (v.it.mixer) v.it.mixer.update(dt);
    if (v.it.bug) tickBug(v.it, dt);
    v.it.root.scale.setScalar(Math.max(0.001, (1 - e) * v.it.s0));
    v.it.root.position.y += dt * v.lift * 3;
    v.it.root.rotation.y += dt * 9;
    if (k >= 1) scene.remove(v.it.root);
  }
  world.vanishing = world.vanishing.filter((v) => v.t < v.dur);
  tickClods(dt);
}

/* ───────────── the brain ───────────── */
const clock = { t: 0 };
const BUSY = ['eat', 'poop', 'clean', 'attack', 'farm'];     // modes she is not interrupted in
const brain = { mode: 'idle', until: 1.2, goal: null, purpose: null, food: null, hops: 0, pause: 0, poopAt: null, noticed: null, noticeAt: -9,
  reactUntil: 0, contentUntil: 0, yawnAt: 8, lookAt: null, eatT: 0, celebrate: 0, glanceUntil: 0, glance: new THREE.Vector3(), napUntil: 0,
  pokes: [], lastPoke: -99, grinUntil: 0, cleanQ: [], poo: null, cleanT: 0, cleaned: false };

function go(goal, purpose, urgent = false) {
  brain.mode = 'travel'; brain.goal = goal; brain.purpose = purpose; brain.urgent = urgent; brain.hops = 0; brain.pause = urgent ? 0.05 : 0.25;
}

function planHop() {
  const p = pet.pos, g = waypoint(p.x, p.z, brain.goal.x, brain.goal.z);   // round the pond and cliffs, not through them
  let dx = g.x - p.x, dz = g.z - p.z; const dist = Math.hypot(dx, dz) || 1e-3;
  let dirX = dx / dist, dirZ = dz / dist;
  const len = Math.min(dist, brain.urgent ? 1.7 : rand(1.0, 1.4));
  let lx = p.x + dirX * len, lz = p.z + dirZ * len;
  for (const o of OBSTACLES) {
    if (segNear(p.x, p.z, lx, lz, o) < o.r + 0.05) {
      const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz) || 1e-3;
      const t1x = -oz / d, t1z = ox / d;
      const s = (t1x * dirX + t1z * dirZ) >= 0 ? 1 : -1;
      dirX = t1x * s * 0.8 + (ox / d) * 0.35; dirZ = t1z * s * 0.8 + (oz / d) * 0.35;
      const n = Math.hypot(dirX, dirZ); dirX /= n; dirZ /= n;
      lx = p.x + dirX * len; lz = p.z + dirZ * len;
    }
  }
  const s = resolveSpot(lx, lz);
  const happy = S.joy > 0.7 ? 0.12 : 0, tired = S.energy < 0.3 || S.hunger > 0.85 ? -0.12 : 0;
  pet.startHop(s.x, s.z, { h: 0.42 + happy + tired + (brain.urgent ? 0.1 : 0) });
  brain.hops++;
}

function arrive() {
  const pur = brain.purpose;
  if (pur === 'food' && brain.food && world.items.includes(brain.food)) return startEat(brain.food);
  if (pur === 'attack' && brain.foe && world.items.includes(brain.foe)) return startAttack(brain.foe);
  if (pur === 'farm' && brain.farm) return startFarm();
  if (pur === 'clean') {
    brain.mode = 'clean'; brain.cleanT = 0; brain.cleaned = false; brain.cl = null;
    setTimeout(() => boxReact('spell', 0.6), 1200);
    if (brain.poo) pet.faceTo = Math.atan2(brain.poo.root.position.x - pet.pos.x, brain.poo.root.position.z - pet.pos.z);
    return;
  }
  if (pur === 'home' || pur === 'homeNap') {
    pet.faceTo = faceCamAngle(); world.house.stompAt = clock.t;
    if (pur === 'homeNap') { brain.mode = 'nap'; brain.napUntil = clock.t + 22; boxReact('nap', 0.8); return; }
    brain.mode = 'idle'; brain.until = rand(2.5, 4); say(null, { force: true, text: pick(HOUSE_LINES) });
    setTimeout(() => boxReact('home', 0.6), 2600); return;
  }
  if (pur === 'summon') { S.joy = clamp(S.joy + 0.03, 0, 1); brain.mode = 'idle'; brain.until = rand(1.5, 3.5); pet.faceTo = faceCamAngle(); return; }
  brain.mode = 'idle'; brain.until = rand(1.2, 3.2);
  if (Math.random() < 0.7) pet.faceTo = faceCamAngle() + pick([-0.32, 0.32, 0]);
}

function happyHop(big = false) {
  if (big) boxReact('dance', 0.35);
  if (pet.airborne || brain.mode === 'sleep') return;
  pet.startHop(pet.pos.x, pet.pos.z, { h: big ? 0.95 : 0.6, big, ant: 0.12 });
}

function startEat(it) {
  if (S.hunger < 0.08) return refuse(it);
  brain.mode = 'eat'; brain.eatT = 0; brain.food = it; it.claimed = true;
  pet.faceTo = Math.atan2(it.root.position.x - pet.pos.x, it.root.position.z - pet.pos.z);
  it.from = it.root.position.clone();
}

function refuse(it) {
  brain.mode = 'refuse'; brain.until = 1.1; brain.food = null;
  if (it) { it.claimed = false; brain.lookAt = it.root.position.clone(); }
  Sound.grumble();
  say('full', { force: true, cool: 3 });
}

function poke() {
  const t = clock.t;
  if (brain.mode === 'clean') { pet.st.puffV += 3; Sound.grumble(); say('busy', { force: true, cool: 3 }); return; }   // hands full. so to speak.
  pet.pokeAt = t; brain.lastPoke = t;
  brain.pokes = brain.pokes.filter((p) => t - p < 5); brain.pokes.push(t);
  if (brain.mode === 'sleep') {       // sleepy grumble, one eye open
    brain.reactUntil = t + 1.2; pet.st.puffV += 3; Sound.grumble(); say('sleep_poke', { force: true, cool: 2.5 }); return;
  }
  pet.startleAt = t;
  brain.mode = 'react'; brain.until = 1.5;
  brain.reactUntil = t + 0.8;
  pet.st.puffV += 9; pet.faceTo = faceCamAngle();
  const riled = brain.pokes.length >= 3;
  S.joy = clamp(S.joy + (riled ? -0.04 : 0.06), 0, 1);
  Sound.squeak();
  if (!riled && Math.random() < 0.5) setTimeout(() => happyHop(Math.random() < 0.4), 180);
  pokeTalk();
  setTimeout(() => boxReact('yagaPoked', 0.5), 1500);
}

function doPoop() {
  setTimeout(() => boxReact('poop', 0.8), 900);
  brain.mode = 'poop'; brain.until = 1.6; brain.poopT = 0; brain.poopDone = false;
}

function tickBrain(dt) {
  const t = clock.t, w = pet.want, it = brain.food, HER = SET.her;
  // ── needs drift ──
  const awake = brain.mode !== 'sleep' && brain.mode !== 'nap';
  S.hunger = clamp(S.hunger + dt / (awake ? HER.hungerAwake : HER.hungerAsleep), 0, 1);
  const resting = brain.mode === 'idle' && !pet.airborne;      // stamina comes back when she stands still, and fast in a nap
  if (brain.mode === 'sleep' || brain.mode === 'nap') S.energy = clamp(S.energy + dt / HER.staminaNap, 0, 1);
  else S.energy = clamp(S.energy - dt / HER.staminaDrain + (resting ? dt / HER.staminaRest : 0), 0, 1);
  S.mana = clamp(S.mana + dt / HER.manaRegain, 0, 1);
  S.joy = clamp(S.joy - dt / (awake ? HER.joyAwake : HER.joyAsleep) - (world.poops.length > 1 ? dt / HER.joyDirty : 0), 0, 1);   // full → empty in ~7 min if ignored
  const dirt = world.poops.length;
  S.health = clamp(S.health - dirt * dt / (awake ? HER.healthDirtAwake : HER.healthDirtAsleep) - (S.hunger > 0.85 ? dt / HER.healthStarving : 0) + (dirt === 0 && S.hunger < 0.7 ? dt / HER.healthRecover : 0), 0, 1);
  if (!S.crave && S.hunger > HER.cravesAbove) { S.crave = pick(FOODS.filter((f) => f !== S.lastCrave)); refreshUI(); say('crave_' + S.crave, { cool: 4 }); }
  if (S.crave && S.hunger < HER.cravingEndsBelow) { S.crave = null; refreshUI(); }

  if (brain.mode === 'nap' && t > brain.napUntil) { brain.mode = 'idle'; brain.until = 1; pet.st.puffV += 5; }

  // ── defaults for the face: the expression follows the mood ──
  const sleepy = S.energy < 0.28;   // night or day: she keeps going, she just gets tired
  let face = t < brain.grinUntil || S.joy > 0.7 ? 'grin' : 'smile';
  if (S.hunger > 0.8 || S.joy < 0.18 || S.health < 0.3 || world.poops.length >= 2 || sleepy) face = 'grumpy';
  let up = FACES[face].up, lo = FACES[face].lo, flap = 0, look = null, droop = 0.35 + S.hunger * 0.35, puff = (S.joy - 0.45) * 0.25, squat = 0, shake = 0;
  if (sleepy) { up = Math.min(up, 0.12); droop += 0.1; }
  if (S.health < 0.4) { up = Math.min(up, 0.25); droop += 0.15; }
  if (S.hunger > 0.8) up = Math.min(up, 0.2);
  if (brain.noticed && t - brain.noticeAt < 2.2 && world.items.includes(brain.noticed)) {
    look = brain.noticed.root.position; up = 0.78;
    if (t - brain.noticeAt < 1.2) { face = 'oh'; lo = -0.8; }
  }
  else if (t < brain.glanceUntil && !pet.hover) look = brain.glance;
  if (sleepy && t > brain.yawnAt && brain.mode === 'idle') { brain.yawnAt = t + rand(6, 10); brain.yawnUntil = t + 1.4; Sound.yawn(); }
  if (t < (brain.yawnUntil || 0)) { flap = 1.5 * Math.sin(clamp((brain.yawnUntil - t) / 1.4, 0, 1) * Math.PI); face = 'oh'; up = 0.02; lo = -0.3; }

  // hungry, and someone dropped food: drop the stroll and go get it
  if (!pet.airborne && !brain.cleanQ.length && S.hunger > 0.18 && (brain.mode === 'idle' || (brain.mode === 'travel' && brain.purpose === 'wander'))) {
    const given = world.items.filter((i) => i.given && i.state === 'rest' && !i.claimed && i.grow >= 1);
    if (given.length) {
      const cost = (i) => i.root.position.distanceTo(pet.pos) + (i.given ? 0 : 4);
      given.sort((a, b) => cost(a) - cost(b));
      return fetchFood(given[0], true);
    }
  }

  switch (brain.mode) {
    case 'idle': {
      if (pet.airborne) break;
      if (brain.cleanQ.length && nextClean()) break;
      if (brain.poopAt != null && t > brain.poopAt && world.poops.length < 5) { brain.poopAt = null; doPoop(); break; }
      if (S.energy < 0.04) { brain.mode = 'nap'; brain.napUntil = t + 22; boxReact('nap', 0.8); break; }
      const foe = S.tool === 'broom' && S.energy >= SWING.cost ? foeToDefend() : null;   // with the broom in hand she looks after the flock
      if (foe) {
        say('defend', { cool: 14 });
        if (Math.hypot(foe.root.position.x - pet.pos.x, foe.root.position.z - pet.pos.z) < SWING.reach) startAttack(foe);
        else { brain.foe = foe; go(foe.root.position.clone(), 'attack', true); }
        break;
      }
      brain.until -= dt;
      if (Math.random() < dt * 0.25 && t > brain.glanceUntil) {
        brain.glanceUntil = t + rand(1, 2.2);
        brain.glance.set(pick([TREE.x, -4, 6, camera.position.x]), rand(0.5, 3.2), pick([TREE.z, 2, -6, camera.position.z]));
      }
      if (brain.until <= 0) brain.until = rand(1.5, 3.5);   // she stays put; the player moves her
      break;
    }
    case 'travel': {
      if (brain.purpose === 'clean') {
        const p = brain.poo;
        if (!p || !world.poops.includes(p)) { if (!nextClean()) { brain.mode = 'idle'; brain.until = 0.5; } break; }
        look = p.root.position; up = 0.6;
        const fp = p.root.position, dx = fp.x - pet.pos.x, dz = fp.z - pet.pos.z, d = Math.hypot(dx, dz) || 1e-3;
        const r = resolveSpot(fp.x - (dx / d) * (BODY_R + 0.35), fp.z - (dz / d) * (BODY_R + 0.35)); brain.goal.set(r.x, 0, r.z);
      }
      if (brain.purpose === 'food') {
        if (!it || !world.items.includes(it)) { brain.mode = 'idle'; brain.until = 0.5; break; }
        look = it.root.position; up = 0.7;
        const fp = it.root.position;
        if (it.walk) {          // lead the target a little, land just short of it on our side
          const wv = it.walk, px = fp.x + Math.sin(wv.heading) * wv.v * 0.45, pz = fp.z + Math.cos(wv.heading) * wv.v * 0.45;
          const dx = px - pet.pos.x, dz = pz - pet.pos.z, d = Math.hypot(dx, dz) || 1e-3;
          const r = resolveSpot(px - (dx / d) * (BODY_R + 0.4), pz - (dz / d) * (BODY_R + 0.4)); brain.goal.set(r.x, 0, r.z);
        } else {
          const cx = fp.x - camera.position.x, cz = fp.z - camera.position.z, cd = Math.hypot(cx, cz) || 1e-3;
          const reach = BODY_R + 0.65;
          const r = resolveSpot(fp.x + (cx / cd) * reach, fp.z + (cz / cd) * reach); brain.goal.set(r.x, 0, r.z);
        }
      }
      if (brain.purpose === 'attack') {                  // keep after the bug until it is in broom reach
        const f = brain.foe;
        if (!f || !world.items.includes(f)) { brain.mode = 'idle'; brain.until = 0.5; break; }
        look = f.root.position; up = 0.6; brain.goal.set(f.root.position.x, 0, f.root.position.z);
      }
      if (pet.airborne) break;
      brain.pause -= dt;
      if (brain.pause > 0) break;
      const dist = Math.hypot(brain.goal.x - pet.pos.x, brain.goal.z - pet.pos.z);
      const foeD = brain.purpose === 'attack' && brain.foe ? Math.hypot(brain.foe.root.position.x - pet.pos.x, brain.foe.root.position.z - pet.pos.z) : 9;
      const foodD = brain.purpose === 'food' && it ? Math.hypot(it.root.position.x - pet.pos.x, it.root.position.z - pet.pos.z) : 9;
      const chasing = brain.purpose === 'food' && it && it.walk;
      const pooD = brain.purpose === 'clean' && brain.poo ? Math.hypot(brain.poo.root.position.x - pet.pos.x, brain.poo.root.position.z - pet.pos.z) : 9;
      const closeEnough = chasing ? foodD < BODY_R + 0.95
        : brain.purpose === 'attack' ? foeD < SWING.reach * 0.9
        : brain.purpose === 'clean' ? pooD < BODY_R + 0.75 || dist < 0.3
        : brain.purpose === 'food' ? (dist < 0.4 && foodD < BODY_R + 1.2) || (brain.hops > 10 && foodD < BODY_R + 1.0) : dist < 0.35;
      if (chasing && !closeEnough && brain.hops > 40) {   // lost it: let it go
        it.claimed = false; brain.food = null; brain.mode = 'idle'; brain.until = rand(1, 2); say('escaped', { force: true, cool: 6 }); break;
      }
      if (closeEnough || (!chasing && brain.hops > 30)) { arrive(); break; }
      planHop();
      brain.pause = 0;   // she walks; no stop-and-go between steps
      break;
    }
    case 'attack': {
      const f = brain.foe, alive = f && world.items.includes(f);
      brain.atkT += dt;
      if (alive) { look = f.root.position; pet.faceTo = Math.atan2(f.root.position.x - pet.pos.x, f.root.position.z - pet.pos.z); }
      up = 0.5;
      if (!brain.atkHit && brain.atkT >= SWING.hitAt) { brain.atkHit = true; if (alive) strike(f); }
      if (brain.atkT >= SWING.dur) {                     // the swing is over: keep at it until the bug is dead or she is spent
        const left = alive && world.items.includes(f);
        if (!left) { brain.mode = 'idle'; brain.until = 0.6; }
        else if (S.energy < SWING.cost) { brain.mode = 'idle'; brain.until = 0.6; say('tired', { cool: 5 }); }
        else if (Math.hypot(f.root.position.x - pet.pos.x, f.root.position.z - pet.pos.z) < SWING.reach) startAttack(f);
        else go(f.root.position.clone(), 'attack', true);   // the hit shoved it back: step in again
      }
      break;
    }
    case 'farm': {
      const F = brain.farm, A = FARM[F.act]; F.t += dt;
      up = 0.5;
      while (F.beat < A.beats.length && F.t >= A.beats[F.beat]) { if (A.dirt) dirtBurst(F.x, F.z, A.dirt); Sound.thud(); F.beat++; }
      if (!F.done && F.t >= A.doneAt) { F.done = true; finishFarm(F); }
      if (F.t >= A.dur) { brain.mode = 'idle'; brain.until = 0.6; brain.farm = null; }
      break;
    }
    case 'eat': {
      brain.eatT += dt;
      const e = brain.eatT;
      look = it && world.items.includes(it) ? it.root.position : null;
      up = 0.55; face = 'oh';
      if (e < 0.3) flap = 0.5;
      else if (e < 0.62) {
        flap = 1.1;
        if (it && world.items.includes(it)) {
          const m = pet.mouthPoint.getWorldPosition(new THREE.Vector3());
          const k = smooth(0.3, 0.62, e);
          it.root.position.lerpVectors(it.from, m, k);
          it.root.scale.setScalar(it.s0 * (1 - 0.8 * k));
        }
      } else {
        if (it && world.items.includes(it)) { vanish(it, 0, 0.1); eaten(it); }
        const c = (e - 0.62) / 0.3;
        flap = e < 1.52 ? -0.55 + 1.1 * (0.5 + 0.5 * Math.cos(c * Math.PI * 2)) : 0;
        if (e >= 1.52) face = 'grin';
        if (e < 1.52 && Math.floor(c) !== brain.lastChomp) { brain.lastChomp = Math.floor(c); Sound.chomp(); }
        up = 0.25; lo = -0.45;
      }
      if (e > 1.7) {
        brain.lastChomp = -1;
        brain.mode = 'idle'; brain.until = rand(0.8, 1.6);
        pet.st.puffV += 6;
        if (brain.celebrate > 0) { brain.celebrate = 0; brain.grinUntil = t + 2.6; Sound.chime(); happyHop(true); setTimeout(() => happyHop(), 700); say('yum_match', { force: true }); }
        else { Sound.yum(); brain.grinUntil = t + 1.2; if (Math.random() < 0.6) say('yum', { force: true }); }
      }
      break;
    }
    case 'clean': {
      // sniff… gag… turn its back on it and kick dirt over it like a dog, then shiver it off
      brain.cleanT += dt; const e = brain.cleanT, p = brain.poo, live = p && world.poops.includes(p), pp = live ? p.root.position : null;
      const C = brain.cl || (brain.cl = { kicks: 0, mk: 0, nextKick: 0 });
      if (C.mound && C.doneAt) {                       // the mound settles into the ground
        C.mound.scale.y *= Math.max(0, 1 - dt * 3.5); C.mound.scale.x *= 1 - dt * 0.6; C.mound.scale.z *= 1 - dt * 0.6;
        if (C.mound.scale.y < 0.01) { scene.remove(C.mound); C.mound = null; }
      } else if (C.mound) {
        C.mk = ease(C.mk, C.kicks / 4, 3.5, dt);
        C.mound.scale.set(0.5 * (0.45 + 0.55 * C.mk), 0.32 * C.mk + 0.001, 0.5 * (0.45 + 0.55 * C.mk));
        if (live) pp.y = groundY(pp.x, pp.z) - 0.42 * C.mk;
      }
      if (e < 0.8) {                                    // sniff, sniff
        look = pp; face = 'oh'; up = 0.66; lo = -0.72;
        squat = -0.08 * Math.max(0, Math.sin(e * 15));
        if (!C.s1 && e > 0.08) { C.s1 = 1; Sound.sniff(); }
        if (!C.s2 && e > 0.42) { C.s2 = 1; Sound.sniff(); }
      } else if (e < 1.6) {                             // the smell hits
        if (!C.gag) { C.gag = 1; pet.st.puffV += 14; Sound.gag(); say('gross', { force: true }); }
        look = pp; face = 'snarl'; up = 0.04; lo = -0.4; droop += 0.25;
        flap = 0.3 + 0.5 * Math.sin(e * 32); shake = e < 1.2 ? 1 : 0.3; squat = -0.05;
      } else if (!C.recoil) {                           // can't look at it: hop away, back to the mess
        C.recoil = 1;
        C.away = pp ? Math.atan2(pet.pos.x - pp.x, pet.pos.z - pp.z) : pet.heading + Math.PI;
        const s = resolveSpot(pet.pos.x + Math.sin(C.away) * 0.6, pet.pos.z + Math.cos(C.away) * 0.6);
        pet.startHop(s.x, s.z, { h: 0.32 }); C.nextKick = e + 0.55;
        face = 'grumpy';
      } else if (C.kicks < 4) {                         // kick, kick, kick, kick
        pet.faceTo = C.away; face = 'grumpy'; up = 0.12; lo = -0.5; squat = pet.airborne ? 0 : -0.07;
        if (!pet.airborne && e > C.nextKick) {
          C.kicks++; C.nextKick = e + 0.34;
          pet.startHop(pet.pos.x, pet.pos.z, { h: 0.16, ant: 0.05 });
          if (pp) kickDirt(pp, C);
          Sound.scuff(); Sound.scuff(0.08);
        }
      } else if (!C.doneAt) {
        if (!pet.airborne && e > C.nextKick) {          // buried. now make it vanish
          C.doneAt = e;
          if (live) cleanPoop(p, true);
          Sound.poof(); say('buried', { force: true });
        }
      } else {                                          // shiver it off, glance back
        face = 'grin'; up = 0.48; lo = -0.4; shake = e - C.doneAt < 0.4 ? 0.4 : 0; puff = 0.12;
        if (e - C.doneAt > 0.25) pet.faceTo = faceCamAngle();
        if (e - C.doneAt > 1.0) { if (C.mound) { scene.remove(C.mound); C.mound = null; } brain.cl = null; brain.poo = null; if (!nextClean()) { brain.mode = 'idle'; brain.until = rand(0.8, 1.6); } }
      }
      break;
    }
    case 'refuse': {
      brain.until -= dt; shake = brain.until > 0.3 ? 1 : 0; flap = 0; face = 'grumpy'; up = 0.12; lo = -0.5;
      look = brain.lookAt || null;
      if (brain.until <= 0) { brain.mode = 'idle'; brain.until = rand(1, 2); brain.lookAt = null; }
      break;
    }
    case 'react': {
      brain.until -= dt;
      if (t < brain.reactUntil) { up = 0.88; lo = -0.82; flap = 0.5; face = 'oh'; }
      if (brain.until <= 0) { brain.mode = 'idle'; brain.until = rand(1, 2.5); }
      break;
    }
    case 'poop': {
      brain.poopT += dt; squat = brain.poopT < 0.9 ? -0.16 * smooth(0, 0.3, brain.poopT) : 0;
      up = 0.1; lo = -0.4; face = 'grumpy';
      if (!brain.poopDone && brain.poopT > 0.55) {
        brain.poopDone = true;
        const back = pet.heading + Math.PI;
        spawnPoop(pet.pos.x + Math.sin(back) * (BODY_R + 0.35), pet.pos.z + Math.cos(back) * (BODY_R + 0.35));
        Sound.plop(); say('poop', { force: true });
      }
      if (brain.poopT > 1.1) {
        brain.mode = 'travel'; brain.purpose = 'wander'; brain.urgent = false; brain.hops = 29; brain.pause = 0;
        const fwd = pet.heading;
        const r = resolveSpot(pet.pos.x + Math.sin(fwd) * 1.4, pet.pos.z + Math.cos(fwd) * 1.4);
        brain.goal = new THREE.Vector3(r.x, 0, r.z);
      }
      break;
    }
    case 'sleep': case 'nap': {
      w.asleep = !(t < brain.reactUntil);
      up = 0.3; lo = -0.5; droop = 0.5; puff = -0.1; face = w.asleep ? 'smile' : 'grumpy'; flap = w.asleep ? -0.35 : 0;
      if (t > (brain.snoreAt || 0)) { brain.snoreAt = t + 3.2; if (w.asleep) { Sound.snore(); zz(); } }
      break;
    }
  }
  if (brain.mode !== 'sleep' && brain.mode !== 'nap') w.asleep = false;
  if (t < brain.contentUntil) { up = 0.06; lo = -0.28; puff += 0.15; look = null; face = 'grin'; }
  // poked again and again: grumpy at 3, snarling at 6; calms down 3.5s after the last one
  const pokeN = brain.pokes.filter((p) => t - p < 5).length;
  if (t - brain.lastPoke < 3.5 && pokeN >= 3 && brain.mode !== 'sleep' && brain.mode !== 'nap') {
    face = pokeN >= 6 ? 'snarl' : 'grumpy'; up = Math.min(up, FACES[face].up + 0.1); lo = FACES[face].lo;
  }
  if (brain.mode !== 'eat' && t >= (brain.yawnUntil || 0)) { const tf = talkFlap(t); if (tf !== null) flap = tf; }
  Object.assign(w, { up, lo, flap, face, look, droop, puff, squat, shake });
}

// tray: tap a bug kind → it hunts the nearest one of those
function orderHunt(kind) {
  const prey = aliveBugs(kind).filter((i) => i.state === 'rest' && i.grow >= 1);
  if (!prey.length) { pet.st.puffV += 2; say('nobug', { force: true, cool: 2, map: (l) => l.replace('{bug}', bugName(kind)) }); return; }
  if (brain.mode === 'sleep' || brain.mode === 'nap') return poke();
  if (BUSY.includes(brain.mode)) { say('busy', { force: true, cool: 3 }); return; }
  prey.sort((a, b) => a.root.position.distanceTo(pet.pos) - b.root.position.distanceTo(pet.pos));
  const it = prey[0];
  ring(it.root.position);
  if (S.hunger < 0.08) return refuse(it);
  if (brain.food && brain.food !== it) brain.food.claimed = false;
  if (S.crave && kind !== S.crave) say('wrong', { force: true, cool: 6, map: (l) => l.replace('{crave}', bugName(S.crave)) });
  else say('hunt', { cool: 5 });
  it.given = true;              // she treats it as "for me" from now on
  fetchFood(it, true);
}
function fetchFood(it, urgent = true) {
  brain.food = it; it.claimed = true;
  go(it.root.position.clone(), 'food', urgent);
}

/** A meal: takes the hunger off and adds the joy and health (the `food` numbers in settings.js). */
function feed(g) {
  S.hunger = clamp(S.hunger - g.hunger, 0, 1); S.joy = clamp(S.joy + g.joy, 0, 1); S.health = clamp(S.health + (g.health || 0), 0, 1);
}

function eaten(it) {
  S.eaten[it.kind] = (S.eaten[it.kind] || 0) + 1;
  const match = S.crave === it.kind;
  feed(match ? SET.food.craved : SET.food.other);   // food fixes hunger; happiness comes from attention
  if (match) { S.lastCrave = S.crave; S.crave = null; brain.celebrate = 1; }
  S.meals++;
  setTimeout(() => boxReact('eat', 0.5), 700);
  if (brain.poopAt == null && (S.hunger < 0.35 ? Math.random() < 0.7 : S.meals % 3 === 0)) brain.poopAt = clock.t + rand(6, 14);
  refreshUI(); save();
}

/* ───────────── talking: the homepage's typewriter cloud, in the pet's own voice ───────────── */
function gibber() {
  const n = 2 + ((Math.random() * 2) | 0), out = [];
  for (let i = 0; i < n; i++) { const r = Math.random(); out.push(r < 0.35 ? pick(WORDS) : r < 0.7 ? pick(TOKS) : Array.from({ length: 2 + ((Math.random() * 3) | 0) }, () => pick(GLY)).join('')); }
  return out.join(' ') + (Math.random() < 0.4 ? '…' : Math.random() < 0.5 ? '?' : '');
}
function fmtAway(s) {
  const [n, u] = s < 3600 ? [Math.max(2, Math.round(s / 60)), 'minute'] : s < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
  return `${n} ${UI.away[u][n === 1 ? 0 : 1]}`;
}
const Talk = { q: [], t0: -99, dur: 0, text: '', gib: false, shown: null, next: 7, lastMut: 0, side: 1, rot: 0, lift: 0, bags: {}, keyAt: {},
  lock: 0, clicks: 0, lastClick: -99, w: 0, h: 0, vis: false, lastK: 0, lastBlip: -9, inputAt: 0, idleN: 0, boot: null, hiddenAt: 0 };
const sayEl = $('#say'), sayCl = sayEl.querySelector('.cl'), sayTx = sayEl.querySelector('.tx'), sayDots = sayEl.querySelectorAll('.d');
const SAY = { el: sayEl, cl: sayCl, tx: sayTx, dots: sayDots };
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtLine = (s) => s.split(/([#@%!&$]{2,})/).map((p, i) => (i % 2 ? `<span class="gl">${escHtml(p)}</span>` : escHtml(p))).join('');
function drawLine(key) {
  const p = LINES[key]; if (!p || !p.length) return null;
  let b = Talk.bags[key]; if (!b || !b.length) b = Talk.bags[key] = p.slice().sort(() => Math.random() - 0.5);
  return b.pop();
}
function talking() { const u = clock.t - Talk.t0; return u >= 0 && u < Talk.dur; }
function noteInput() { Talk.inputAt = clock.t; Talk.idleN = 0; }
// say(key) draws from LINES; force cuts whatever it is saying; cool = per-key cooldown in seconds
function say(key, o = {}) {
  const t = clock.t;
  if (!o.force && (talking() || t < Talk.lock)) return false;
  if (key && o.cool && t - (Talk.keyAt[key] ?? -99) < o.cool) return false;
  let text = o.text || drawLine(key); if (!text) return false;
  if (o.map) text = o.map(text);
  if (key) Talk.keyAt[key] = t;
  Talk.q = (o.then || []).slice();
  showLine(text, o.dur, o.gib);
  return true;
}
function showLine(text, dur, gib) {
  const t = clock.t;
  Object.assign(Talk, { t0: t, text, gib: !!gib, dur: dur || clamp(1.6 + text.length * 0.065, 2.2, 4.8), shown: null, lastK: 0, lastBlip: -9,
    side: Math.random() < 0.5 ? -1 : 1, rot: rand(-4, 4), lift: rand(0, 0.3) });
  Talk.next = t + Talk.dur + rand(8, 14);
}
function pokeTalk() {
  const t = clock.t;
  if (t < Talk.lock) return;
  if (t - Talk.lastClick > 5) Talk.clicks = 0;
  Talk.lastClick = t; Talk.clicks++;
  const line = LINES.poke[Talk.clicks - 1];
  if (Talk.clicks >= LINES.poke.length) {      // the silent treatment, then it caves
    say(null, { force: true, text: line, dur: 2.6, then: [{ text: POKE_END[0], dur: 8 }, { text: POKE_END[1], dur: 3 }] });
    Talk.lock = t + 13.6; Talk.clicks = 0;
  } else say(null, { force: true, text: line, dur: 2.2 });
}
// jaw flap while the text types out (−1 shut … 1 wide)
function talkFlap(t) {
  const u = t - Talk.t0, end = 0.32 + Talk.text.length / 26;
  if (u < 0.3 || u > end || u > Talk.dur) return null;
  return -0.35 + 0.95 * (0.5 - 0.5 * Math.cos((u - 0.3) * Math.PI * 2 * 6.5));
}
function tickTalk(t) {
  if (Talk.boot && t > 1.4) { const b = Talk.boot; Talk.boot = null; if (brain.mode !== 'sleep') say(null, { text: b, force: true }); }
  if (!talking() && Talk.q.length) { const q = Talk.q.shift(); showLine(q.text, q.dur, q.gib); }
  else if (!talking() && t > Talk.next && t > Talk.lock) {
    Talk.next = t + rand(9, 16);
    const m = brain.mode;
    if (m === 'sleep' || m === 'nap') { if (Math.random() < 0.3) say(null, { text: UI.napPrefix + gibber(), gib: true }); }
    else if (m === 'idle' || m === 'travel') {
      if (t - Talk.inputAt > 25 && Talk.idleN < 3) { if (say('idle')) Talk.idleN++; }
      else if (S.crave) say('crave_' + S.crave);
      else if (S.health < 0.35) say('sick');
      else if (world.poops.length >= 2) say('dirty');
      else if (S.joy < 0.25) say('lonely');
      else if (S.energy < 0.28) say('sleepy');
      else if (Math.random() < 0.45) say(null, { text: gibber(), gib: true });
    }
  }

  const head = pet.pos.clone(); head.y += 2.2 * pet.squash.scale.y;
  renderCloud(Talk, SAY, head, t);
}

/** Draws one speech cloud: typewriter, bob, and dots climbing from the speaker's head. T: its state, E: its elements. */
function renderCloud(T, E, head, t) {
  const u = t - T.t0;
  if (!(u >= 0 && u < T.dur)) { if (T.vis) { T.vis = false; E.el.style.opacity = '0'; } return; }
  T.vis = true;
  // typewriter reveal with a churning glyph at the cursor; gibberish keeps mutating once typed
  const k = clamp(Math.floor((u - 0.32) * 26), 0, T.text.length);
  if (k > T.lastK) { if (k - T.lastBlip >= 3 && T.text[k - 1] !== ' ') { T.lastBlip = k; Sound.babble(); } T.lastK = k; }
  const s = T.text.slice(0, k) + (k < T.text.length && u > 0.32 ? pick(GLY) : '');
  if (T.gib && k >= T.text.length && t - T.lastMut > 0.28) {
    T.lastMut = t; const arr = [...T.text], i = (Math.random() * arr.length) | 0;
    if (arr[i] !== ' ' && Math.random() < 0.5) arr[i] = pick(GLY); T.text = arr.join('');
  }
  if (s !== T.shown) { E.tx.innerHTML = s ? fmtLine(s) : '&nbsp;'; T.shown = s; T.w = E.cl.offsetWidth; T.h = E.cl.offsetHeight; }

  // each line picks its own side of the head; dots climb from the crown to the cloud
  const sp = screenOf(head), W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  const K = W < 760 ? 1 : 1.15, bw = T.w * K, bh = T.h * K;
  let side = T.side;
  if (side > 0 && sp.x + 18 + bw > W - 10) side = -1;
  if (side < 0 && sp.x - 18 - bw < 10) side = 1;
  const ax = sp.x + side * 18;
  const bx = clamp(side > 0 ? ax - 10 * K : ax - bw + 10 * K, 10, Math.max(10, W - bw - 10));
  const by = clamp(sp.y - 30 * K - bh - T.lift * 30 + Math.sin(t * 2.4) * 2, 66, Math.max(66, H - bh - DOCK_H));
  const hx = (sp.x - bx) / K, hy = (sp.y - 4 - by) / K, cx0 = clamp(hx, 18, T.w - 18), cy0 = T.h - 6;
  [[0.18, 7], [0.55, 12]].forEach(([f, sz], i) => {
    E.dots[i].style.left = (lerp(hx, cx0, f) - sz / 2).toFixed(1) + 'px';
    E.dots[i].style.top = (lerp(hy, cy0, f) - sz / 2).toFixed(1) + 'px';
  });
  const back = (x) => { x = clamp(x, 0, 1); const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const tail = hy > T.h - 10;
  E.dots[0].style.opacity = tail ? String(clamp(u / 0.08, 0, 1)) : '0';
  E.dots[1].style.opacity = tail ? String(clamp((u - 0.1) / 0.08, 0, 1)) : '0';
  E.cl.style.opacity = String(clamp((u - 0.2) / 0.06, 0, 1));
  E.cl.style.transformOrigin = `${cx0.toFixed(0)}px 100%`;
  E.cl.style.transform = `scale(${(0.2 + 0.8 * back((u - 0.2) / 0.32)).toFixed(3)}) rotate(${(T.rot + Math.sin(t * 2.1) * 1.5).toFixed(2)}deg)`;
  E.el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px) scale(${K})`;
  E.el.style.opacity = String(1 - smooth(T.dur - 0.3, T.dur, u));
}

/* ───────────── the black box: her sidekick. follows her, argues with her, comments on everything ───────────── */
const boxSayEl = $('#saybox');
const BOXSAY = { el: boxSayEl, cl: boxSayEl.querySelector('.cl'), tx: boxSayEl.querySelector('.tx'), dots: boxSayEl.querySelectorAll('.d') };
const BoxTalk = { t0: -99, dur: 0, text: '', gib: false, shown: null, lastMut: 0, side: 1, rot: 0, lift: 0, w: 0, h: 0, vis: false, lastK: 0, lastBlip: -9 };
const Box = { pet: null, pause: 0, face: 'smile', faceUntil: 0, shakeUntil: 0, nextHop: 6, nextArgue: 18, dialog: [], dialogAt: 0, pokes: [], look: new THREE.Vector3() };
const YAGA_ARGUE = ['complain_02', 'angry_02', 'complain_01'];

function boxTalking() { const u = clock.t - BoxTalk.t0; return u >= 0 && u < BoxTalk.dur; }
function boxSay(text, dur) {
  Object.assign(BoxTalk, { t0: clock.t, text, gib: false, dur: dur || clamp(1.6 + text.length * 0.065, 2.2, 4.8), shown: null, lastK: 0, lastBlip: -9,
    side: Box.pet.pos.x >= pet.pos.x ? 1 : -1, rot: rand(-4, 4), lift: rand(0, 0.3) });
  return BoxTalk.dur;
}
function boxFlap(t) {
  const u = t - BoxTalk.t0, end = 0.32 + BoxTalk.text.length / 26;
  if (u < 0.3 || u > end || u > BoxTalk.dur) return 0;
  return -0.35 + 0.95 * (0.5 - 0.5 * Math.cos((u - 0.3) * Math.PI * 2 * 6.5));
}
function boxMood(face, secs) { Box.face = face; Box.faceUntil = clock.t + secs; }

/** A one-liner about what she just did; skipped while they're mid-argument. */
function boxReact(kind, chance = 1) {
  if (!Box.pet || Box.dialog.length || boxTalking() || Math.random() > chance) return;
  boxSay(pick(BOX_LINES[kind]));
  const b = Box.pet;
  if (kind === 'eat' || kind === 'spell') boxMood('grumpy', 2.5);
  if (kind === 'poop') { boxMood('snarl', 2.2); b.st.puffV += 10; }
  if (kind === 'yagaPoked') { boxMood('grin', 2.5); b.startHop(b.pos.x, b.pos.z, { h: 0.5, ant: 0.1 }); }
  if (kind === 'dance') boxMood('oh', 1.5);
}

function argue() {
  Box.dialog = pick(ARGUMENTS).map(([who, text]) => ({ who, text }));
  Box.dialogAt = clock.t;
}
function tickDialog(t) {
  if (!Box.dialog.length || t < Box.dialogAt || talking() || boxTalking()) return;
  const { who, text } = Box.dialog.shift();
  let dur;
  if (who === 'y') {
    say(null, { force: true, text });
    Talk.side = pet.pos.x >= Box.pet.pos.x ? 1 : -1;
    dur = Talk.dur;
    if (brain.mode === 'idle' && !pet.airborne) {
      pet.faceTo = Math.atan2(Box.pet.pos.x - pet.pos.x, Box.pet.pos.z - pet.pos.z);
      pet.play(pick(YAGA_ARGUE), dur);
    }
  } else {
    dur = boxSay(text);
    boxMood(Math.random() < 0.3 ? 'snarl' : 'grumpy', dur + 0.6);
  }
  Box.dialogAt = t + dur + 0.35;
}

function pokeBox() {
  const b = Box.pet, t = clock.t;
  b.pokeAt = t; b.startleAt = t; b.st.puffV += 9; Sound.squeak();
  Box.pokes = Box.pokes.filter((p) => t - p < 5); Box.pokes.push(t);
  const riled = Box.pokes.length >= 3;
  boxMood(riled ? 'snarl' : 'oh', 1.4); Box.shakeUntil = riled ? t + 0.5 : 0;
  Box.dialog = [];
  boxSay(pick(BOX_LINES.poked), 2.2);
  if (Math.random() < 0.4 && brain.mode === 'idle') setTimeout(() => say(null, { force: true, text: pick(DEFEND) }), 1300);
}
function hitBoxPet() { return Box.pet ? ray.intersectObject(Box.pet.proxy, false)[0] || null : null; }

/** Where the box goes and what its face does, every frame. */
function tickBox(dt) {
  const b = Box.pet, t = clock.t, y = pet.pos, w = b.want;
  const dx = b.pos.x - y.x, dz = b.pos.z - y.z, d = Math.hypot(dx, dz);
  if (!b.airborne) {
    Box.pause -= dt;
    if (Box.pause <= 0 && (d > 2.3 || d < 0.8)) {      // keep to her side, a little towards us
      const side = dx >= 0 ? 1 : -1;
      const goal = resolveSpot(y.x + side * 1.3, y.z + 0.6), wp = waypoint(b.pos.x, b.pos.z, goal.x, goal.z);
      const gx = wp.x - b.pos.x, gz = wp.z - b.pos.z, gd = Math.hypot(gx, gz) || 1e-3;
      const len = Math.min(gd, d > 6 ? 1.6 : 1.15);
      const s = resolveSpot(b.pos.x + (gx / gd) * len, b.pos.z + (gz / gd) * len);
      b.startHop(s.x, s.z, { h: 0.34 + (d > 6 ? 0.1 : 0) });
      Box.pause = d > 5 ? 0.05 : rand(0.12, 0.3);
    } else {
      b.faceTo = Math.atan2(-dx, -dz);                 // watch her
      if (t > Box.nextHop) { Box.nextHop = t + rand(6, 12); if (Math.random() < 0.5) b.startHop(b.pos.x, b.pos.z, { h: 0.45, ant: 0.12 }); }
    }
  }
  if (t > Box.nextArgue && brain.mode === 'idle' && !pet.airborne && d < 4.5 && !talking() && !boxTalking() && t > Talk.lock) {
    argue(); Box.nextArgue = t + rand(28, 45);
  }
  tickDialog(t);
  if (Box.dialog.length || boxTalking()) Talk.lock = Math.max(Talk.lock, t + 0.5);   // her idle chatter waits

  const face = t < Box.faceUntil ? Box.face : 'smile', F = FACES[face];
  Box.look.set(y.x, y.y + YAGA_H * 0.85, y.z);
  Object.assign(w, { face, up: F.up, lo: F.lo, flap: boxFlap(t), look: Box.look, droop: 0.35, puff: face === 'grin' ? 0.15 : 0, squat: 0, shake: t < Box.shakeUntil ? 1 : 0 });
}

function tickBoxTalk(t) {
  if (!Box.pet) return;
  const head = Box.pet.pos.clone(); head.y += 2.2 * Box.pet.squash.scale.y;
  renderCloud(BoxTalk, BOXSAY, head, t);
}

/* ───────────── input ───────────── */
const ptr = { down: false, id: null, x0: 0, y0: 0, t0: 0, onPet: false, moved: 0, groundAt: -1e9, groundX: 0, groundY: 0, last: new THREE.Vector2(), lastT: 0, heartAt: 0, purrAt: 0, hx: 0, hy: 0, hoverAt: -99, nearT: 0 };
const hoverV = new THREE.Vector3();
// desktop: the eyes follow the cursor; it widens its eyes as you get close
function tickHover(dt) {
  let near = 0; pet.hover = null;
  if (!MOBILE && !ptr.down && clock.t - ptr.hoverAt < 3) {
    toNdc({ clientX: ptr.hx, clientY: ptr.hy });
    const c = pet.pos.clone(); c.y += 1.07 * pet.squash.scale.y;
    const d = camera.position.distanceTo(c);
    pet.hover = hoverV.copy(ray.ray.direction).multiplyScalar(d * 0.8).add(ray.ray.origin);
    const sc = screenOf(c), H = stage.clientHeight || innerHeight;
    const r = (BODY_R / (d * Math.tan((camera.fov * Math.PI) / 360))) * H / 2;
    near = 1 - smooth(r * 0.9, r * 2.2, Math.hypot(ptr.hx - sc.x, ptr.hy - sc.y));
  }
  pet.near = ease(pet.near, near, 5, dt);
  ptr.nearT = near > 0.85 ? ptr.nearT + dt : 0;
  if (ptr.nearT > 2.2 && brain.mode !== 'sleep') { ptr.nearT = 0; say('hover', { cool: 45 }); }
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function toNdc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function hitPet() { const h = ray.intersectObject(pet.proxy, false); return h[0] || null; }
/** Where the tap ray meets the terrain, nudged 5 cm into the face it hit so a tap on a cliff picks the column above. */
function hitGround() {
  const h = ray.intersectObject(world.terrain.solid, false)[0];
  return h ? h.point.addScaledVector(h.face.normal, -0.05) : null;
}
function hitItem(list) {
  const hits = ray.intersectObjects(list.map((i) => i.root), true);
  if (!hits.length) return null;
  let o = hits[0].object; while (o && !o.userData.item) o = o.parent;
  return o ? o.userData.item : null;
}
function onDown(e) {
  Sound.init(); noteInput();
  toNdc(e);
  Object.assign(ptr, { down: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, onPet: false });
  ptr.last.set(e.clientX, e.clientY); ptr.lastT = performance.now();
  if (hitBoxPet()) return pokeBox();
  if (hitHouse()) { world.house.stompAt = clock.t; ring(new THREE.Vector3(HOUSE_DOOR.x, 0, HOUSE_DOOR.z)); if (!BUSY.includes(brain.mode)) goHome(false); return; }
  const hp = hitPet();
  if (hp) { ptr.onPet = true; renderer.domElement.setPointerCapture?.(e.pointerId); touchAt(hp, 0, 0); return; }
  const poo = hitItem(world.poops);
  if (poo) { Sound.init(); noteInput(); return orderClean([poo]); }
  const food = hitItem(world.items.filter((i) => i.state === 'rest'));
  if (food && food.hostile) return tapFoe(food);         // an enemy, not a snack
  const egg = hitEgg();
  if (egg) return tapEgg(egg);
  const hen = hitHen();
  if (hen) return petHen(hen);
  if (food) {
    if (brain.mode === 'sleep') return poke();
    if (S.hunger < 0.08) return refuse(food);
    if (BUSY.includes(brain.mode)) return;
    if (brain.food && brain.food !== food) brain.food.claimed = false;
    ring(food.root.position); food.given = true;
    return fetchFood(food, true);
  }
  const hit = hitGround();
  if (!hit) return;
  if (brain.mode === 'sleep') return poke();
  if (S.tool === 'shovel') return tapShovel(hit);
  const s = resolveSpot(hit.x, hit.z);
  ring(new THREE.Vector3(s.x, groundY(s.x, s.z), s.z));
  if (BUSY.includes(brain.mode)) return;
  const now = performance.now(), run = now - ptr.groundAt < DOUBLE_TAP.ms && Math.hypot(e.clientX - ptr.groundX, e.clientY - ptr.groundY) < DOUBLE_TAP.px;
  Object.assign(ptr, { groundAt: run ? -1e9 : now, groundX: e.clientX, groundY: e.clientY });
  if (!run && Math.hypot(s.x - pet.pos.x, s.z - pet.pos.z) > 3 && Math.random() < 0.5) say('summon', { cool: 10 });
  go(new THREE.Vector3(s.x, 0, s.z), 'summon', run);
}
function touchAt(hit, vx, vy) {
  pet.creature.worldToLocal(pet.touch.local.copy(hit.point));
  pet.touch.on = true;
  pet.touch.vel.set(vx * 0.004, -vy * 0.004, 0).applyQuaternion(pet.inv);
  if (pet.touch.vel.length() > 1.4) pet.touch.vel.setLength(1.4);
}
function onMove(e) {
  ptr.hx = e.clientX; ptr.hy = e.clientY; ptr.hoverAt = clock.t;
  if (!ptr.down) {
    if (!MOBILE) { toNdc(e); renderer.domElement.style.cursor = hitPet() || hitItem([...world.poops, ...world.items.filter((i) => i.state === 'rest')]) ? 'pointer' : ''; moveCellMark(); }
    return;
  }
  if (e.pointerId !== ptr.id || !ptr.onPet) return;
  toNdc(e);
  const now = performance.now(), dtp = Math.max(1, now - ptr.lastT);
  const vx = (e.clientX - ptr.last.x) / dtp * 16, vy = (e.clientY - ptr.last.y) / dtp * 16;
  ptr.moved += Math.hypot(e.clientX - ptr.last.x, e.clientY - ptr.last.y);
  ptr.last.set(e.clientX, e.clientY); ptr.lastT = now;
  const hp = hitPet();
  if (!hp) { pet.touch.on = false; return; }
  touchAt(hp, vx, vy);
  if (ptr.moved > 14) {                    // stroking the fur
    brain.contentUntil = clock.t + 0.7;
    S.joy = clamp(S.joy + SET.her.strokeJoy, 0, 1);
    if (now - ptr.heartAt > 380) { ptr.heartAt = now; heart(e.clientX, e.clientY); }
    if (now - ptr.purrAt > 300) { ptr.purrAt = now; Sound.purr(); }
    say('pet', { cool: 10 });
  }
}
function onUp(e) {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false; pet.touch.on = false;
  if (ptr.onPet && ptr.moved < 14 && performance.now() - ptr.t0 < 450) poke();
  ptr.onPet = false;
}

const DIRT_GEO = new THREE.IcosahedronGeometry(1, 1), MOUND_GEO = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const DIRT_MAT = new THREE.MeshStandardMaterial({ name: 'M_Dirt', color: 0x5a4030, roughness: 1, flatShading: true });
const MOUND_MAT = new THREE.MeshStandardMaterial({ name: 'M_DirtMound', color: 0x4a3426, roughness: 1 });
function kickDirt(target, C) {
  const back = C.away + Math.PI;                    // out from under its back end, toward the poo
  const o = new THREE.Vector3(pet.pos.x + Math.sin(back) * BODY_R * 0.85, pet.pos.y + 0.12, pet.pos.z + Math.cos(back) * BODY_R * 0.85);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(DIRT_GEO, DIRT_MAT); m.scale.setScalar(rand(0.045, 0.1)); m.position.copy(o); m.castShadow = true;
    m.rotation.set(rand(0, 6), rand(0, 6), 0); scene.add(m);
    const T = rand(0.32, 0.5), tx = target.x + rand(-0.4, 0.4), tz = target.z + rand(-0.4, 0.4), gy = groundY(tx, tz);
    world.clods.push({ m, v: new THREE.Vector3((tx - o.x) / T, (0.5 * 16 * T * T + gy - o.y) / T, (tz - o.z) / T), spin: rand(-12, 12), dead: 0, floor: gy + 0.02 });
  }
  if (!C.mound) {
    C.mound = new THREE.Mesh(MOUND_GEO, MOUND_MAT); C.mound.position.set(target.x, groundY(target.x, target.z), target.z);
    C.mound.receiveShadow = true; C.mound.castShadow = true; C.mound.scale.set(0.2, 0.001, 0.2); scene.add(C.mound);
  }
}
function tickClods(dt) {
  for (const c of world.clods) {
    if (c.dead) { c.dead += dt; c.m.scale.multiplyScalar(Math.max(0, 1 - dt * 5)); continue; }
    c.v.y -= 16 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.spin * dt;
    if (c.m.position.y <= c.floor) { c.m.position.y = c.floor; c.dead = 1e-3; }
  }
  for (const c of world.clods) if (c.dead > 0.45) scene.remove(c.m);
  world.clods = world.clods.filter((c) => c.dead <= 0.45);
}
// tap a poo (or the clean button): the box hops over and cleans it up itself
function orderClean(list) {
  if (!list.length) return;
  if (brain.mode === 'sleep' || brain.mode === 'nap') { list.forEach((p, i) => setTimeout(() => cleanPoop(p, i > 0), i * 140)); return; }   // napping: it just goes
  for (const p of list) if (!brain.cleanQ.includes(p)) brain.cleanQ.push(p);
  ring(list[0].root.position);
  if (!BUSY.includes(brain.mode) && !(brain.mode === 'travel' && brain.purpose === 'clean')) nextClean();
}
function nextClean() {
  brain.cleanQ = brain.cleanQ.filter((p) => world.poops.includes(p));
  if (!brain.cleanQ.length) return false;
  brain.cleanQ.sort((a, b) => a.root.position.distanceTo(pet.pos) - b.root.position.distanceTo(pet.pos));
  if (brain.food && brain.mode === 'travel') { brain.food.claimed = false; brain.food = null; }
  brain.poo = brain.cleanQ.shift();
  go(brain.poo.root.position.clone(), 'clean', true);
  return true;
}
function cleanPoop(p, quiet = false) {
  if (!world.poops.includes(p)) return;
  const sp = screenOf(p.root.position.clone().setY(p.root.position.y + 0.4));
  vanish(p, 0, 0.8);
  sparkle(sp.x, sp.y);
  if (!quiet) { Sound.poof(); say('clean', { force: true, cool: 2 }); }
  S.joy = clamp(S.joy + SET.her.cleanJoy, 0, 1);
  S.health = clamp(S.health + SET.her.cleanHealth, 0, 1);
  pet.st.puffV += 3;
  brain.glance.copy(p.root.position); brain.glanceUntil = clock.t + 0.8;
  refreshUI(); save();
}

/* ───────────── marker ring on the ground ───────────── */
let markerMesh, markerLife = 0;
function marker() {
  markerMesh = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.36, 40), new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  markerMesh.rotation.x = -Math.PI / 2; markerMesh.position.y = 0.02; markerMesh.visible = false; scene.add(markerMesh);
}
function ring(p) { markerMesh.position.set(p.x, p.y + 0.02, p.z); markerMesh.visible = true; markerLife = 0.9; }
function tickMarker(dt) {
  if (markerLife <= 0) return;
  markerLife -= dt; const k = Math.max(0, markerLife / 0.9);
  markerMesh.material.opacity = k * 0.85; markerMesh.scale.setScalar(1 + (1 - k) * 0.8);
  if (markerLife <= 0) markerMesh.visible = false;
}

/* ───────────── icons: live 3D thumbnails of the props ───────────── */
function makeIcons() {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  r.setPixelRatio(1); r.setSize(104, 104, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  const make = (kind) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xFFF1E0, 0x7a4a2e, 1.5));
    const k = new THREE.DirectionalLight(0xFFF3DE, 2.4); k.position.set(-2, 3.5, 3); scene.add(k);
    const rm = new THREE.DirectionalLight(0xFFC98A, 0.9); rm.position.set(2.5, 1.5, -3); scene.add(rm);
    const src = world.models[kind], bug = src.make ? src.make() : null;
    const pivot = new THREE.Group(), obj = bug ? bug.group : src.scene.clone(true);
    obj.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const s = 1 / (Math.max(size.x, size.y, size.z) || 1);
    obj.position.sub(c).multiplyScalar(s); obj.scale.multiplyScalar(s);
    pivot.add(obj); scene.add(pivot);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, bug ? 1.2 : 0.5, bug ? 2.3 : 2.55); cam.lookAt(0, 0, 0);
    let mixer = null;
    if (world.models[kind].clips.length) { mixer = new THREE.AnimationMixer(obj); world.models[kind].clips.forEach((cl) => mixer.clipAction(cl).play()); }
    return { scene, cam, pivot, mixer, bug };
  };
  const scenes = {}; [...FOODS, 'pupu'].forEach((k) => (scenes[k] = make(k)));
  const targets = [];
  document.querySelectorAll('.care.food').forEach((b) => targets.push({ kind: b.dataset.food, canvas: b.querySelector('canvas') }));
  targets.push({ kind: 'pupu', canvas: $('#clean canvas') });
  targets.forEach((tg) => (tg.ctx = tg.canvas.getContext('2d')));
  const bubble = { canvas: $('#bubbleIcon'), kind: null }; bubble.ctx = bubble.canvas.getContext('2d');
  let acc = 0;
  const draw = (tg, spin) => {
    const sc = scenes[tg.kind];
    sc.pivot.rotation.y = spin;
    r.render(sc.scene, sc.cam);
    tg.ctx.clearRect(0, 0, tg.canvas.width, tg.canvas.height);
    tg.ctx.drawImage(r.domElement, 0, 0, tg.canvas.width, tg.canvas.height);
  };
  return {
    tick(dt, t) {
      acc += dt; if (acc < 1 / 24) return; const step = acc; acc = 0;
      Object.values(scenes).forEach((s, i) => { if (s.mixer) s.mixer.update(step); if (s.bug) s.bug.tick(t + i * 3, 0.55); });
      targets.forEach((tg, i) => draw(tg, t * 0.55 + i));
      if (bubble.kind) draw(bubble, Math.sin(t * 1.3) * 0.6);
    },
    bubble,
  };
}

/* ───────────── HUD: bubble, badges, effects ───────────── */
const fx = $('#fx'), bubbleEl = $('#bubble');
let need = null, needShown = null;
function screenOf(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * (stage.clientWidth || innerWidth), y: (-p.y * 0.5 + 0.5) * (stage.clientHeight || innerHeight), behind: p.z > 1 };
}
function currentNeed() {
  if (brain.mode === 'sleep' || brain.mode === 'nap') return null;
  if (brain.mode === 'eat') return null;
  if (S.energy < 0.28) return 'moon';
  if (S.crave) return S.crave;
  if (world.poops.length >= 2) return 'pupu';
  return null;
}
const statEls = { hunger: $('#statHunger'), joy: $('#statJoy') };
const vitalEls = { health: $('#vitalHealth'), mana: $('#vitalMana'), stamina: $('#vitalStamina') };
const toolEls = [...document.querySelectorAll('.tool')];
/** One bar of the bottom hotbar: the fill, the aria value, and a pulse when it runs low. */
function setVital(el, v) {
  const pct = Math.round(clamp(v, 0, 1) * 100);
  if (el._p === pct) return;
  el._p = pct;
  el.querySelector('i').style.width = pct + '%';
  el.classList.toggle('low', v < 0.25);
  el.setAttribute('aria-valuenow', String(pct));
}
/** Marks the tool in her hand on the hotbar. */
function showTool() { for (const b of toolEls) b.setAttribute('aria-checked', String(b.dataset.tool === S.tool)); }
/** Puts the broom or the shovel in her hand. */
function setTool(name) {
  if (S.tool === name) return;
  S.tool = name; showTool(); pet.holds(name); cellMark.visible = false; Sound.equip(); save();
}
function setStat(el, v, word) {
  const pct = Math.round(clamp(v, 0, 1) * 100);
  if (!el || (el._p === pct && el._w === word)) return;
  el._p = pct; el._w = word;
  el.querySelector('i').style.width = pct + '%';
  el.querySelector('.val').textContent = word;
  el.classList.toggle('low', v < 0.25);
  el.setAttribute('aria-valuenow', String(pct));
}
/** Which of the five words (best first) a 0…1 stat gets. */
const wordLevel = (v) => (v > 0.8 ? 0 : v > 0.55 ? 1 : v > 0.35 ? 2 : v > 0.15 ? 3 : 4);
function tickStats() {
  const full = 1 - S.hunger, j = S.joy;
  setStat(statEls.hunger, full, UI.hunger.words[wordLevel(full)]);
  setVital(vitalEls.health, S.health); setVital(vitalEls.mana, S.mana); setVital(vitalEls.stamina, S.energy);
  setStat(statEls.joy, j, UI.joy.words[wordLevel(j)]);
}
function tickHUD() {
  tickStats();
  tickTray();
  tickClock();
  const n = currentNeed();
  if (n !== need) {
    need = n;
    if (n) {
      show($('#bubbleMoon'), n === 'moon');
      show($('#bubbleIcon'), n !== 'moon');
      iconKit.bubble.kind = n === 'moon' ? null : n;
    } else iconKit.bubble.kind = null;
    needShown = undefined;
    refreshUI();
  }
  const want = Talk.vis ? null : need;      // the speech cloud gets the head while it talks
  if (want !== needShown) {
    needShown = want; bubbleEl.hidden = !want;
    if (want) { bubbleEl.classList.remove('pop'); void bubbleEl.offsetWidth; bubbleEl.classList.add('pop'); }
  }
  if (needShown) {
    const head = pet.pos.clone(); head.y += 2.2 * pet.squash.scale.y;
    const s = screenOf(head), W = stage.clientWidth || innerWidth;
    const bw = bubbleEl.offsetWidth || 80, bh = bubbleEl.offsetHeight || 72;
    let x = s.x + 16, y = s.y - bh - 18;
    if (x + bw > W - 12) x = s.x - bw - 16;
    x = clamp(x, 10, W - bw - 10); y = Math.max(y, 70);
    bubbleEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}
// the tray shows what's alive out there right now, and the poo waiting to be cleaned
let trayShown = '';
function tickTray() {
  const counts = FOODS.map((k) => aliveBugs(k).length), np = world.poops.length;
  const key = counts.join(',') + '|' + np + '|' + S.crave + S.night;
  if (key === trayShown) return;
  trayShown = key;
  document.querySelectorAll('.care.food').forEach((b) => {
    const n = counts[FOODS.indexOf(b.dataset.food)] || 0, bug = BUG[b.dataset.food];
    b.querySelector('.count').textContent = n;
    b.classList.toggle('dim', n === 0);
    b.classList.toggle('wanted', S.crave === b.dataset.food && n > 0);
    b.setAttribute('aria-label', n ? fill(UI.trayHunt, { a: bug.a, n }) : fill(UI.trayNone, { plural: bug.plural }));
  });
  const c = $('#clean'), cnt = c.querySelector('.count');
  cnt.hidden = false; cnt.textContent = np; cnt.classList.toggle('alert', np > 0);
  c.classList.toggle('wanted', np >= 2);
  c.classList.toggle('dim', np === 0);
  c.setAttribute('aria-label', np ? fill(UI.clean, { n: np }) : UI.cleanNone);
}
function refreshUI() {
  trayShown = '';
  tickTray(); showTool();
  show($('#iconSoundOn'), Sound.on); show($('#iconSoundOff'), !Sound.on);
  $('#sound').setAttribute('aria-label', Sound.on ? UI.soundOff : UI.soundOn);    // the label names what a tap does
}
function spawnFx(cls, x, y, html, vars = {}) {
  const el = document.createElement('div');
  el.className = 'fx ' + cls; el.style.left = x + 'px'; el.style.top = y + 'px';
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.innerHTML = html;
  el.addEventListener('animationend', () => el.remove());
  fx.appendChild(el);
}
const HEART = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z" fill="#DE8053" stroke="#1A1814" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const STAR = '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5L8 12 1.5 10 8 8Z" fill="#D6A446" stroke="#1A1814" stroke-width="1.2" stroke-linejoin="round"/></svg>';
function heart(x, y) { spawnFx('heart', x - 13, y - 30, HEART, { '--dx': `${rand(-24, 24).toFixed(0)}px` }); }
function sparkle(x, y) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2), d = rand(34, 60);
    spawnFx('spark', x - 9, y - 9, STAR, { '--dx': `${(Math.cos(a) * d).toFixed(0)}px`, '--dy': `${(Math.sin(a) * d).toFixed(0)}px` });
  }
}
function zz() {
  const head = pet.pos.clone(); head.y += YAGA_H;
  const s = screenOf(head);
  spawnFx('zz', s.x + 14, s.y - 20, UI.sleepZ);
}

/** Scrolling zooms: out for a little more of the field, in towards a human view of her and the Box. */
function onWheel(e) {
  e.preventDefault();
  zoomTarget = clamp(zoomTarget - e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015), ZOOM.min, ZOOM.max);
}
/** Keys 1 and 2 take the broom and the shovel. */
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const tool = { 1: 'broom', 2: 'shovel' }[e.key];
  if (tool) { Sound.init(); noteInput(); setTool(tool); }
}
function bindUI() {
  const el = renderer.domElement;
  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  toolEls.forEach((b) => b.addEventListener('click', () => { Sound.init(); noteInput(); setTool(b.dataset.tool); }));
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', () => { ptr.hoverAt = -99; el.style.cursor = ''; cellMark.visible = false; });
  document.querySelectorAll('.care.food').forEach((b) => b.addEventListener('click', () => {
    Sound.init(); noteInput();
    orderHunt(b.dataset.food);
  }));
  $('#clean').addEventListener('click', () => {
    Sound.init(); noteInput();
    const list = [...world.poops];
    if (!list.length) { pet.st.puffV += 2; say('spotless', { force: true, cool: 4 }); return; }
    orderClean(list);
  });
  $('#sound').addEventListener('click', () => { Sound.init(); Sound.on = !Sound.on; S.sound = Sound.on; refreshUI(); save(); say(Sound.on ? 'unmute' : 'mute', { force: true }); });
}

function setNight(on) {
  if (S.night === on) return;
  S.night = on;
  if (on) { Sound.night(); say('night', { force: true }); setTimeout(() => boxReact('night', 0.6), 4500); }
  else restoreFlock();
  refreshUI(); save();
}
// the clock in the top right: 24h dial (noon at the top), digital time, countdown to the next switch
const clockEl = { hand: $('#dialHand'), sun: $('#dialSun'), time: $('#clockTime'), next: $('#clockNext'), root: $('#clock') };
let clockShown = '';
function tickClock() {
  const f = dayFrac();
  if (isNightAt(f) !== S.night) setNight(isNightAt(f));
  const mins = Math.floor(f * 1440), hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(Math.floor(mins % 60 / 10) * 10).padStart(2, '0');
  clockEl.hand.setAttribute('transform', `rotate(${((f - 0.5) * 360).toFixed(1)} 20 20)`);
  const key = hh + mm + S.night;
  const to = ((S.night ? DAWN : DUSK) - f + 1) % 1, secs = Math.ceil(to * DAY_LEN);
  const nx = fill(UI.nextIn, { phase: S.night ? UI.day : UI.night, m: Math.floor(secs / 60), s: String(secs % 60).padStart(2, '0') });
  if (clockEl.next.textContent !== nx) clockEl.next.textContent = nx;
  if (key === clockShown) return;
  clockShown = key;
  clockEl.time.textContent = `${hh}:${mm}`;
  clockEl.sun.setAttribute('fill', S.night ? '#F0EADC' : '#D6A446');
  clockEl.root.classList.toggle('night', S.night);
  clockEl.root.setAttribute('aria-label', fill(UI.clockAria, { time: `${hh}:${mm}`, phase: S.night ? UI.night : UI.day, next: nx }));
}
/* ───────────── loop ───────────── */
let last = performance.now(), lastTick = 0;
function simulate(dt) {
  clock.t += dt; phase.cycleT += dt;
  phase.n = ease(phase.n, S.night ? 1 : 0, 1.4, dt);
  tickBrain(dt);
  pet.update(dt, clock.t, camera);
  if (!pet.airborne) { const c = clampXZ(pet.pos.x, pet.pos.z); pet.pos.x = c.x; pet.pos.z = c.z; }
  tickBox(dt); Box.pet.update(dt, clock.t, camera);
  if (!Box.pet.airborne) { const c = clampXZ(Box.pet.pos.x, Box.pet.pos.z); Box.pet.pos.x = c.x; Box.pet.pos.z = c.z; }
  tickProps(dt); tickFarm(dt); tickHens(dt);
  tickMarker(dt);
}
function advance(sec) { for (let i = 0; i < sec * 30; i++) simulate(1 / 30); applyPhase(phase.n); tickHUD(); tickTalk(clock.t); tickBoxTalk(clock.t); renderer.render(scene, camera); }
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(1 / 240, (now - last) / 1000)); last = now; lastTick = now;
  clock.t += dt; phase.cycleT += dt;
  phase.n = ease(phase.n, S.night ? 1 : 0, 1.4, dt);
  applyPhase(phase.n);
  zoom = ease(zoom, zoomTarget, 7, dt);
  followCamera(1 - Math.exp(-2.2 * dt));
  tickHover(dt);
  tickBrain(dt);
  pet.update(dt, clock.t, camera);
  // keep her inside the visible clearing between steps
  if (!pet.airborne) { const c = clampXZ(pet.pos.x, pet.pos.z); pet.pos.x = c.x; pet.pos.z = c.z; }
  tickBox(dt); Box.pet.update(dt, clock.t, camera);
  if (!Box.pet.airborne) { const c = clampXZ(Box.pet.pos.x, Box.pet.pos.z); Box.pet.pos.x = c.x; Box.pet.pos.z = c.z; }
  tickProps(dt); tickFarm(dt); tickHens(dt);
  tickMarker(dt);
  tickHouse(dt, clock.t);
  iconKit.tick(dt, clock.t);
  tickHUD();
  tickTalk(clock.t);
  tickBoxTalk(clock.t);
  renderer.render(scene, camera);
}
function start() {
  const loop = () => { requestAnimationFrame(loop); frame(); };
  requestAnimationFrame(loop);
  // rAF can stall in embedded or background frames; keep time moving
  setInterval(() => { if (!document.hidden && performance.now() - lastTick > 120) frame(); }, 60);
}

boot().catch((err) => {
  console.error(err);
  $('#loading').classList.add('gone');
  const m = document.createElement('p'); m.id = 'oops';
  // these two texts stay here, not in words/en.json: they must work when the words (or any game file) fail to load
  m.textContent = err.message === 'WebGL2 required'
    ? 'Pani Yaga needs WebGL 2 to wake up. Try opening this page in Chrome or Safari.'
    : 'Pani Yaga could not load her game files. Try reloading the page.';
  document.body.appendChild(m);
});
