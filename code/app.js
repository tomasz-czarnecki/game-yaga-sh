
// Yaga Game: a small farm game. Yaga, a witch whose hut stands on chicken legs, farms a clearing of 50 cm blocks:
// she digs, plants, waters and harvests pumpkins and cabbages, keeps hens, trades at her stall, and swats the pests
// that come for her crops at night. The player steers her (tap or click to walk or to use the tool in hand; WASD and
// E on a keyboard) and she only does what she is told. The farm's rules are in farm.js, day.js, inventory.js and
// goals.js, the panels in hud.js. The black box, her furry sidekick, follows her about and comments on everything.
import * as THREE from './lib/three.module.js';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';
import { loadBugLooks, makeBug } from './bug-models.js';
import { loadBlocks, loadWorld, terrainMeshes, groundY, walkable, nearest, waypoint, kindAt, blockCentre, tillCell, untillCell, wetCell, isWater } from './terrain.js';
import { rigAt, placeCamera, ZOOM } from './camera-rig.js';
import { SWING, makeShovel, makeCan, makeSeedBag, attachInHand } from './tools.js';
import { FARM, CROPS, CROP_KINDS, ripe, stageOf, daysLeft, atRisk, newPlot, makeCrop } from './farm.js';
import { HOUR, WAKE, PASS_OUT, isNight, clockText, pestsDue, endDay } from './day.js';
import { count, add, take, canHolds } from './inventory.js';
import { reached, nextGoal } from './goals.js';
import { initHud, panelOpen, closePanel, openStall, openBag, openGoals, openBed, openSummary, toast, hint, fill, plural } from './hud.js';
import SET from '../settings.js';
import { makeChicken, makeEgg } from './chickens.js';
import { loadBoxModels, buildBoxModel } from './box-model.js';
import { getJSON, loadGLB, building, hide } from './loading.js';

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
/** The bug's plain name ('ant'), or its id if the words file does not know it. */
const bugName = (id) => (BUG[id] ? BUG[id].name : id);
/** An item's name on screen: 'pumpkin' → "Pumpkin", 'bug:snail' → "Snail". */
const itemName = (k) => (k.startsWith('bug:') ? bugName(k.slice(4)).replace(/^./, (c) => c.toUpperCase()) : UI.items[k] || k);
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
const FRIENDLY = SET.bugs.kinds;            // bugs she can catch and sell
const PEST_KINDS = SET.pests.kinds;         // the same models, big and red: the night pests
const BUG_KINDS = [...new Set([...FRIENDLY, ...PEST_KINDS])];
const BUG_SIZE = 0.4;                     // bugs at 40% of the original game's size, so Yaga towers over them
const BUG_S = 2.6 * BUG_SIZE;             // bug-models units → world
const BUG_TAP_R = 0.45;                   // world radius of a bug's invisible tap target, so small bugs stay easy to tap
const BODY_R = 0.86;                      // how close things may come to her (world units)
const SPAWN = { x: 0.2, z: 1.2 };         // where she starts; the terrain's walkable area grows from here
const TREE = { x: 3.25, z: -2.05 };
const TREE_SCALE = 0.8;                  // the middle tree, a little smaller than in the original clearing
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
const SAVE_KEY = 'yaga-farm-v2';
const OLD_SAVE_KEY = 'yaga-pet-v1';        // the pet game's save: its dug plots are brought over once
const DOCK_H = 120;                       // px at the bottom of the screen taken by the hotbar and its hint line
// the homepage's expressions: lids, brow tilt (upper lid angle), eye scale per mouth
const FACES = {
  grin:   { up: 0.5,  lo: -0.4,  tilt: 0,    es: 0.86 },
  smile:  { up: 0.36, lo: -0.5,  tilt: 0,    es: 0.86 },
  oh:     { up: 0.86, lo: -0.88, tilt: -0.1, es: 0.95 },
  grumpy: { up: 0.12, lo: -0.5,  tilt: 0.42, es: 0.86 },
  snarl:  { up: 0.06, lo: -0.42, tilt: 0.48, es: 0.86 },
};
/* ───────────── Yaga: the rigged 3D model from the homepage, steered by the player ───────────── */
// Her control (`her`, further down) talks to the model through a small interface (pos, heading, startHop, play, touch).
// Hops become short walks; what she is doing, and her mood, pick one of her animations.
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
  constructor(gltf, broomGltf) {
    this.root = new THREE.Group();
    this.squash = new THREE.Group(); this.root.add(this.squash);
    this.squash.scale.setScalar(YAGA_H / 2.2);     // the game places her head at 2.2 × squash
    this.creature = new THREE.Group(); this.squash.add(this.creature);
    const model = gltf.scene; model.scale.setScalar(2.2 / MODEL_H); this.creature.add(model);
    this.mats = [];
    const glow = (root) => root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      // a soft self-light from her own texture, so she reads in the dark violet clearing
      o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0xffffff);
      this.mats.push(o.material);
    });
    glow(model);
    this.broom = broomGltf.scene; glow(this.broom); attachInHand(model, this.broom);
    // the box-built props: shovel, watering can and the two seed bags
    const prop = (built) => { this.mats.push(...built.mats); attachInHand(model, built.group); return built.group; };
    this.shovel = prop(makeShovel()); this.can = prop(makeCan());
    this.bags = { 'seed:pumpkin': prop(makeSeedBag(0)), 'seed:cabbage': prop(makeSeedBag(1)) };
    this.holds(S.tool);

    this.mixer = new THREE.AnimationMixer(model);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name.replace(/\.\d+$/, ''), c]));
    this.clips.swing = this.clips[SWING.clip];      // the broom swing's real name is a long text prompt
    this.action = null; this.clipName = null; this.oneShot = null; this.lastWalk = -9;
    this.gait = 'walk';                             // kept through the tiny gaps between hops
    this.steer = false;                             // walking under the arrow keys (no hop)

    // tap and petting volume, slightly bigger than her
    const s = this.squash.scale.x;
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(0.9 / s, 2.25, 0.8 / s), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.position.y = 1.12; this.creature.add(this.proxy);
    this.mouthPoint = new THREE.Object3D(); this.mouthPoint.position.set(0, 2.2 * 0.8, 0.18 / s); this.creature.add(this.mouthPoint);

    this.heading = 0.3; this.faceTo = null; this.turnRate = 7;
    this.hop = null; this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3();
    this.st = { puffV: 0 };                         // a poke nudges this spring; she shrugs it off
    this.pokeAt = -9; this.startleAt = -9; this.near = 0; this.hover = null;
    this.touch = { on: false, local: new THREE.Vector3(), vel: new THREE.Vector3() };
    this.inv = new THREE.Quaternion();
    this.setClip('idle');
  }

  get pos() { return this.root.position; }
  get airborne() { return !!this.hop; }

  /** Shows the tool in her hand (all props on her right hand); the hand and the spell leave it empty. */
  holds(tool) {
    this.broom.visible = tool === 'broom'; this.shovel.visible = tool === 'shovel'; this.can.visible = tool === 'can';
    for (const [k, bag] of Object.entries(this.bags)) bag.visible = tool === k;
  }

  /** A "hop": a short walk to (x, z). A big hop on the spot is a little celebration. */
  startHop(x, z, o = {}) {
    const from = this.root.position.clone();
    const dist = Math.hypot(x - from.x, z - from.z);
    if (dist < 0.05) {
      if ((o.h ?? 0) >= 0.5) this.play(o.big ? 'dance_01' : 'greet_03', o.big ? 2.4 : 1.6);
      return;
    }
    // one gait for the whole trip, so she never flips between walk and run on the way
    this.gait = her.run ? 'run' : 'walk';
    this.hop = { from, to: new THREE.Vector3(x, 0, z), t: 0, dur: dist / (this.gait === 'run' ? RUN_SPEED : WALK_SPEED) };
    this.faceTo = Math.atan2(x - from.x, z - from.z);
  }

  /** Plays one animation for `secs`, then she goes back to whatever her mood picks. `restart` replays it from the
   *  start, or from `from` seconds into it. */
  play(name, secs, restart = false, from = 0) { this.oneShot = { name, until: clock.t + secs }; this.setClip(name, restart, from); }
  /** One broom swing. */
  swing() { this.play('swing', SWING.dur, true); }

  setClip(name, restart = false, from = 0) {
    if (name === this.clipName && !restart) return;
    const clip = this.clips[name] || this.clips.idle;
    const next = this.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(name === 'run' ? RUN_PACE : name === 'walk' ? WALK_PACE : 1).fadeIn(restart ? 0.08 : FADE).play();
    next.time = from;
    if (this.action && this.action !== next) this.action.fadeOut(FADE);
    this.action = next; this.clipName = name;
  }

  /** What she is doing, then her mood, picks the animation when no one-off is playing. */
  moodClip(t, walking) {
    if (walking) return this.gait;
    switch (her.mode) {
      case 'rest': return 'sit';
      case 'faint': case 'sleep': return 'depressed';
    }
    if (this.touch.on || t < her.contentUntil) return 'agree';
    if (talking()) return 'complain_01';
    if (S.stamina < 0.2) return 'frustrated_01';
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

    // keep walking through the short pauses between hops
    const walking = !!this.hop || this.steer || (her.mode === 'walk' && t - this.lastWalk < 0.35);
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
  day: { sky: new THREE.Color('#a08670'), ground: new THREE.Color('#2a2017'), key: new THREE.Color('#ffd8b0').multiplyScalar(1.5), rim: 1.5 },
  night: { sky: new THREE.Color('#6a5444'), ground: new THREE.Color('#0e0c0a'), key: new THREE.Color('#ffd6ae').multiplyScalar(0.9), rim: 1.3 },
};

/** The black box: the original whybox.ai creature, now Yaga's furry sidekick. `look` is assets/models/box/box.json. */
class BlackBox {
  constructor(look) {
    this.scale = look.scale;
    const shells = MOBILE ? 14 : 30;
    this.root = new THREE.Group();
    this.squash = new THREE.Group(); this.root.add(this.squash);
    const cr = this.creature = new THREE.Group(); cr.rotation.order = 'YXZ'; cr.position.y = 1.07; this.squash.add(cr);
    this.squash.scale.setScalar(this.scale);

    const E = look.eyes, eyeR = this.eyeR = E.size, eyeX = E.side, eyeY = E.height, eyeZ = E.front;   // homepage layout: eyes up, mouth below
    const C = (h) => new THREE.Color(h);
    this.furRoot = [C(look.fur.root), C(look.fur.rootAtNight)];
    const U = this.U = {
      uShells: { value: shells }, uLen: { value: look.fur.length }, uDensity: { value: look.fur.density },
      uTime: { value: 0 }, uPuff: { value: 0 }, uDroop: { value: 0.35 }, uRim: { value: 1.6 },
      uWind: { value: new THREE.Vector3() }, uGrav: { value: new THREE.Vector3(0, -1, 0) },
      uEyeL: { value: new THREE.Vector3(-eyeX, eyeY, eyeZ) }, uEyeR: { value: new THREE.Vector3(eyeX, eyeY, eyeZ) }, uEyeRad: { value: eyeR },
      uMouthMode: { value: 0 }, uMouthHW: { value: 0 }, uMouthN: { value: 0 }, uMouthAmt: { value: 1 }, uMouthSY: { value: 1 },
      uMouthC: { value: new THREE.Vector2() }, uCres: { value: new THREE.Vector4() }, uMouthPts: { value: Array.from({ length: 24 }, () => new THREE.Vector2()) },
      uMRamp0: { value: 0 }, uMRamp1: { value: 0.11 }, uMFloor: { value: 0.2 }, uMCut: { value: 1 }, uMAO: { value: 0.7 },
      uTouch: { value: new THREE.Vector3(0, 0, 9) }, uTouchVel: { value: new THREE.Vector3() }, uTouchAmt: { value: 0 }, uTouchRad: { value: 0.38 },
      uNoise: { value: makeNoise() },
      uRoot: { value: this.furRoot[0].clone() }, uTip: { value: C(look.fur.tip) },
      uSky: { value: FURLIGHT.day.sky.clone() }, uGround: { value: FURLIGHT.day.ground.clone() },
      uKeyDir: { value: new THREE.Vector3(-0.55, 0.7, 0.55).normalize() }, uKeyCol: { value: FURLIGHT.day.key.clone() },
      uRimDir: { value: new THREE.Vector3(0.6, 0.5, -0.6).normalize() },
      uIriA: { value: C(look.fur.shimmer[0]) }, uIriB: { value: C(look.fur.shimmer[1]) }, uIriC: { value: C(look.fur.shimmer[2]) },
      uLampPos: { value: CANOPY.clone() }, uLampCol: { value: new THREE.Color(0, 0, 0) },
    };
    const furMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FUR_VERT, fragmentShader: FUR_FRAG,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const fur = new THREE.InstancedMesh(roundedCube(look.roundness, MOBILE ? 26 : 34), furMat, 64);
    const I = new THREE.Matrix4(); for (let i = 0; i < 64; i++) fur.setMatrixAt(i, I);
    fur.count = shells; fur.frustumCulled = false; cr.add(fur);
    // shadow stand-in (the fur itself does not write shadow depth)
    const caster = new THREE.Mesh(roundedCube(look.roundness, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    caster.castShadow = true; caster.scale.setScalar(1.05); cr.add(caster);
    // hit volume for taps and petting, a little bigger than the fur
    this.proxy = new THREE.Mesh(roundedCube(look.roundness, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.scale.setScalar(1.14); cr.add(this.proxy);

    const lidU = {}; ['uNoise', 'uRim', 'uRoot', 'uTip', 'uSky', 'uGround', 'uKeyDir', 'uKeyCol', 'uIriA', 'uLampPos', 'uLampCol'].forEach((k) => (lidU[k] = U[k]));
    const lidMat = new THREE.ShaderMaterial({ uniforms: lidU, vertexShader: LID_VERT, fragmentShader: LID_FRAG, side: THREE.DoubleSide });
    const scleraGeo = new THREE.SphereGeometry(eyeR, 40, 28);
    const irisGeo = new THREE.SphereGeometry(eyeR * 1.003, 40, 8, 0, Math.PI * 2, 0, 0.74); irisGeo.rotateX(Math.PI / 2);
    const pupilGeo = new THREE.SphereGeometry(eyeR * 1.006, 40, 8, 0, Math.PI * 2, 0, 0.6); pupilGeo.rotateX(Math.PI / 2);
    const upGeo = new THREE.SphereGeometry(eyeR * 1.07, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const loGeo = new THREE.SphereGeometry(eyeR * 1.07, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const scleraMat = new THREE.MeshPhongMaterial({ color: E.white, specular: 0xffffff, shininess: 110, emissive: 0x2a2838 });
    const irisMat = new THREE.MeshPhongMaterial({ color: E.iris, specular: 0x888888, shininess: 90 });
    const pupilMat = new THREE.MeshPhongMaterial({ color: E.pupil, specular: 0xaaaaaa, shininess: 160 });
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
    const lipMat = new THREE.MeshPhysicalMaterial({ color: look.mouth.lips, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x2a1219, sheen: 1, sheenColor: new THREE.Color(0xffd6e0), sheenRoughness: 0.4 });
    const holeMat = new THREE.MeshBasicMaterial({ color: look.mouth.inside, side: THREE.DoubleSide });
    const toothMat = new THREE.MeshPhysicalMaterial({ color: look.mouth.teeth, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
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
    U.uRoot.value.copy(this.furRoot[0]).lerp(this.furRoot[1], n);
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
    this.squash.scale.set(this.scale * sx, this.scale * sy, this.scale * sx);
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
  purr() { this.noise(0.28, 0.05, 140, 3); this.tone(70, 60, 0.28, 0.05, 'sawtooth'); },
  snore() { this.noise(1.2, 0.035, 220, 2.5, 0, 160); },
  yawn() { this.tone(330, 190, 0.7, 0.06, 'triangle'); },
  wake() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.26, 0.06, 'sine', i * 0.07)); },
  night() { [659, 523, 392].forEach((f, i) => this.tone(f, f, 0.4, 0.05, 'sine', i * 0.12)); },
  babble() { const f = rand(330, 640); this.tone(f, f * rand(0.8, 1.3), 0.06, 0.035, 'triangle'); },
  equip() { this.tone(520, 760, 0.06, 0.06, 'square'); this.noise(0.05, 0.05, 2400, 2); },
  swing() { this.noise(0.2, 0.1, 1300, 1, 0, 1800); },
  cluck() { const f = rand(380, 520); this.tone(f, f * 1.25, 0.05, 0.08, 'square'); this.tone(f * 0.9, f * 1.1, 0.05, 0.07, 'square', 0.09); },
  squawk() { this.tone(900, 500, 0.22, 0.1, 'sawtooth'); this.noise(0.12, 0.06, 2200, 1); },
  hit() { this.tone(190, 60, 0.12, 0.16, 'square'); this.noise(0.06, 0.1, 900, 1); },
  coin() { [1319, 1760].forEach((f, i) => this.tone(f, f, 0.12, 0.06, 'triangle', i * 0.07)); },
  pour() { this.noise(0.5, 0.07, 1400, 0.7, 0, 500); },
  nope() { this.tone(300, 220, 0.12, 0.07, 'triangle'); },
};

/* ───────────── saved state ───────────── */
// The tools on the hotbar, in order (keys 1–7). 'seed:<crop>' plants that crop.
const TOOLS = ['hand', 'shovel', 'can', 'seed:pumpkin', 'seed:cabbage', 'broom', 'spell'];
const freshStats = () => ({ dug: 0, planted: 0, watered: 0, harvested: 0, sold: 0, earned: 0, eggs: 0, swatted: 0, caught: [] });
const S = {
  day: 1, hour: WAKE, stamina: 1, mana: 1, coins: SET.start.coins, tool: 'hand', sound: true, night: false,
  inv: { ...SET.start.items },      // her bag: { kind: count } (see inventory.js)
  can: SET.can.holds,               // waterings left in the can
  up: { bigCan: false, steelShovel: false },
  plots: [],                        // dug blocks: see farm.js; each also gets a `view` (its drawing) at runtime
  hens: SET.hens.start, trough: 0,  // trough: scoops of feed in it (one per hen per day)
  eggs: [],                         // eggs lying in the yard, [{x, z}] (+ `root` at runtime)
  pests: { due: -1, came: 0 },      // tonight's pests: how many will come (-1: not worked out yet) and how many have
  goals: [], stats: freshStats(), today: { earned: 0, sold: 0 },
  away: -1,                         // seconds since the last visit (-1: the first visit)
};
const ITEM_OK = (k) => !!CROPS[k] || k === 'egg' || k === 'feed' || (k.startsWith('seed:') && !!CROPS[k.slice(5)]) || (k.startsWith('bug:') && FRIENDLY.includes(k.slice(4)));
const num = (v, def, lo = -Infinity, hi = Infinity) => (Number.isFinite(v) ? clamp(v, lo, hi) : def);
const int = (v, def, lo, hi) => Math.floor(num(v, def, lo, hi));

function load() {
  try { loadSave(); } catch (e) { /* storage unavailable or a broken save: start fresh */ }
  S.night = isNight(S.hour);
}
/** Reads the save field by field, so a missing or odd value falls back to its default instead of breaking the game.
 *  With no save of its own it brings over what it can from the pet game's save (her dug plots, the sound). */
function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return migrate();
  const d = JSON.parse(raw);
  S.day = int(d.day, 1, 1); S.hour = num(d.hour, WAKE, WAKE, PASS_OUT - 0.05);
  S.stamina = num(d.stamina, 1, 0, 1); S.mana = num(d.mana, 1, 0, 1);
  S.coins = int(d.coins, S.coins, 0); S.tool = TOOLS.includes(d.tool) ? d.tool : 'hand'; S.sound = d.sound !== false;
  S.inv = {};
  for (const [k, n] of Object.entries(d.inv || {})) if (ITEM_OK(k) && int(n, 0, 0) > 0) S.inv[k] = int(n, 0, 0);
  S.up = { bigCan: !!d.up?.bigCan, steelShovel: !!d.up?.steelShovel };
  S.can = int(d.can, canHolds(S), 0, canHolds(S));
  S.plots = cleanPlots(d.plots);
  S.hens = int(d.hens, SET.hens.start, 0, SET.hens.most); S.trough = int(d.trough, 0, 0, SET.hens.most);
  S.eggs = (Array.isArray(d.eggs) ? d.eggs : []).filter((e) => Number.isFinite(e?.x) && Number.isFinite(e?.z)).slice(0, SET.hens.eggsMost).map(({ x, z }) => ({ x, z }));
  S.pests = { due: int(d.pests?.due, -1, -1, 99), came: int(d.pests?.came, 0, 0, 99) };
  S.goals = (Array.isArray(d.goals) ? d.goals : []).filter((g) => typeof g === 'string');
  const st = d.stats || {};
  S.stats = freshStats();
  for (const k of Object.keys(S.stats)) if (k !== 'caught') S.stats[k] = int(st[k], 0, 0);
  S.stats.caught = (Array.isArray(st.caught) ? st.caught : []).filter((k) => FRIENDLY.includes(k));
  S.today = { earned: int(d.today?.earned, 0, 0), sold: int(d.today?.sold, 0, 0) };
  S.away = clamp((Date.now() - (d.t || Date.now())) / 1000, 0, 365 * 86400);
}
/** The pet game's save: keeps her dug plots (their crops start again from seed) and the sound setting. */
function migrate() {
  const raw = localStorage.getItem(OLD_SAVE_KEY);
  if (!raw) return;
  const d = JSON.parse(raw);
  S.sound = d.sound !== false;
  S.plots = cleanPlots((Array.isArray(d.farm) ? d.farm : []).map((f) => ({ x: f?.x, z: f?.z, crop: f?.crop })));
  S.away = clamp((Date.now() - (d.t || Date.now())) / 1000, 0, 365 * 86400);
}
function cleanPlots(list) {
  return (Array.isArray(list) ? list : []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z)).slice(0, 400).map((p) => {
    const crop = CROPS[p.crop] ? p.crop : null;
    return { ...newPlot(p.x, p.z, 'dirt'), crop, growth: crop ? int(p.growth, 0, 0, CROPS[crop].days) : 0, watered: !!p.watered, bare: int(p.bare, 0, 0, 99) };
  });
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2, t: Date.now(), day: S.day, hour: S.hour, stamina: S.stamina, mana: S.mana, coins: S.coins, tool: S.tool, sound: Sound.on,
      inv: S.inv, can: S.can, up: S.up, hens: S.hens, trough: S.trough, pests: S.pests, goals: S.goals, stats: S.stats, today: S.today,
      plots: S.plots.map(({ x, z, crop, growth, watered, bare }) => ({ x, z, crop, growth, watered, bare })),
      eggs: S.eggs.map(({ x, z }) => ({ x, z })),
    }));
  } catch (e) { /* ignore */ }
}

/* ───────────── world ───────────── */
const world = { items: [], vanishing: [], clods: [], hens: [], flying: [] };
let renderer, scene, camera, viewCam, pet, icons, area, view;
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
  const [yaga, broom, envGltf, worldJson, wordsJson, boxLook, houseLook] = await Promise.all([
    loadGLB(loader, './assets/models/yaga/yaga-dressed.glb', 9.5),   // also preloaded by index.html
    loadGLB(loader, './assets/models/tools/broom.glb', 0.25),   // a prop in her hand, like the shovel
    loadGLB(loader, './assets/models/environment/environment.glb', 0.3),
    getJSON('./assets/world/home.json'),
    getJSON('./words/en.json'),
    getJSON('./assets/models/box/box.json'),
    getJSON('./assets/models/environment/house.json'),
    loadBoxModels(['animals/hen', 'animals/egg', 'plants/pumpkin', 'plants/cabbage', 'tools/shovel', 'tools/watering-can', 'tools/seed-bag',
      'farm/stall', 'farm/well', 'farm/trough']),   // these three keep what they load in their own modules
    loadBlocks(),
    loadBugLooks(),
  ]);
  await building();
  useWords(wordsJson); labelPage();
  const dress = (obj) => obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  loadWorld(worldJson, SPAWN);
  world.terrain = terrainMeshes(); scene.add(world.terrain.group);

  const env = envGltf.scene; dress(env);
  env.position.set(0.1, 0, -1.7);
  env.traverse((o) => { if (o.isMesh && ENV_COLORS[o.material.name] != null) o.material.color.set(ENV_COLORS[o.material.name]); });
  scene.add(env);
  const tree = shrinkTree(env);
  buildScenery(env, tree);
  buildHouse(houseLook);
  buildFarmProps();
  buildDayNight(env);
  buildMountains(env);
  restorePlots();                                                     // the plots she dug before

  world.models = {};
  for (const id of BUG_KINDS) world.models[id] = { make: () => makeBug(THREE, id) };

  pet = new YagaPet(yaga, broom);
  pet.root.position.set(SPAWN.x, groundY(SPAWN.x, SPAWN.z), SPAWN.z);
  scene.add(pet.root);
  Box.pet = new BlackBox(boxLook);
  Box.pet.root.position.set(1.9, groundY(1.9, 1.9), 1.9);
  scene.add(Box.pet.root);

  marker(); makeCellMarks();
  icons = makeIcons(broom.scene);
  initHud(UI, (k) => icons[k], itemName);
  bindUI();
  resize();
  new ResizeObserver(resize).observe(stage);
  addEventListener('resize', resize);

  syncHens();
  for (const e of S.eggs) showEgg(e);
  phase.n = S.night ? 1 : 0; applyPhase(phase.n);
  world.spawnAt = rand(4, 8); world.pestAt = rand(3, 6);
  for (let i = 0; i < 4; i++) spawnSprout(true);
  refreshUI();
  Talk.boot = S.away < 0 ? LINES.first[0] : S.away > 120 ? drawLine('away').replace('{n}', fmtAway(S.away)) : drawLine('hello');

  window.yaga = { S, her, world, Box, get pet() { return pet; }, camera, advance, clock, say, Talk, go, groundY, walkable, resolveSpot, waypoint, kindAt, blockCentre,
    canDig, plotAt, planFor, command, setTool, spawnPest, pests, setHour, sleep: () => startSleep(false), wake: closePanel, panelOpen, stall: () => openStall(S, STALL_EVENTS),
    get cellMark() { return cellMark; }, setZoom: (v) => { zoom = zoomTarget = v; }, get zoom() { return zoom; } };
  start();
  setInterval(save, 4000);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); Talk.hiddenAt = Date.now(); return; }
    const s = Talk.hiddenAt ? (Date.now() - Talk.hiddenAt) / 1000 : 0; Talk.hiddenAt = 0;
    if (s > 8 && her.mode !== 'sleep') say('tab', { force: true, map: (l) => l.replace('{n}', String(Math.round(s))) });
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

/** Builds the hut. `look` is assets/models/environment/house.json: its colours, overall size and how many log rows high the walls are. */
function buildHouse(look) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }), C = look.colours;
  const M = {
    logA: mat(C.logs), logB: mat(C.logsAlternate), dark: mat(C.darkWood), roof: mat(C.roof, { roughness: 1 }),
    gable: mat(C.gables), moss: mat(C.moss, { roughness: 1 }), stone: mat(C.chimney), red: mat(C.trim),
    gold: mat(C.gold, { roughness: 0.5, metalness: 0.2 }), skin: mat(C.legs, { roughness: 0.6 }), feather: mat(C.feathers, { roughness: 1 }),
    glass: mat(C.windows, { emissive: new THREE.Color(C.windowGlow), emissiveIntensity: 0.15 }),
    smoke: new THREE.MeshStandardMaterial({ color: C.smoke, transparent: true, opacity: 0, roughness: 1, depthWrite: false }),
  };
  const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const root = new THREE.Group(); root.position.set(HOUSE.x, 0, HOUSE.z); root.scale.setScalar(look.size); scene.add(root);
  HOUSE_DOOR.z = HOUSE.z + 2.9 * look.size;                                  // the foot of the ladder moves with the hut's size
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
  const R = 0.14, rows = look.logRows, logX = new THREE.CylinderGeometry(R, R, 3.35, 10), logZ = new THREE.CylinderGeometry(R, R, 2.55, 10);
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

  const glow = new THREE.PointLight(C.windowGlow, 0, 9, 1.8); glow.position.set(0, 3.0, 2.2); root.add(glow);
  OBSTACLES.push({ x: HOUSE.x, z: HOUSE.z, r: 1.9 * look.size + BODY_R });
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

/* ───────────── her farm: the market stall, the well and the hens' trough ───────────── */
// Where each stands (its model faces +z, towards the camera side), how much room it takes (r), and where she
// stands to use it (`use`, worked out in buildFarmProps).
const STALL = { x: -0.6, z: -1.9, r: 0.95 };
const WELL = { x: -1.3, z: 2.9, r: 0.55 };
const TROUGH = { x: -6.6, z: 0.8, r: 0.6 };
function buildFarmProps() {
  const place = (name, at, kind) => {
    const m = buildBoxModel(name), g = m.group;
    g.position.set(at.x, groundY(at.x, at.z), at.z); scene.add(g);
    g.traverse((o) => { o.userData.pick = { kind }; });
    OBSTACLES.push({ x: at.x, z: at.z, r: at.r + BODY_R });
    at.use = resolveSpot(at.x, at.z + at.r + BODY_R + 0.15);
    return m;
  };
  world.stall = place('farm/stall', STALL, 'stall');
  world.well = place('farm/well', WELL, 'well');
  world.trough = place('farm/trough', TROUGH, 'trough');
  world.house.root.traverse((o) => { o.userData.pick = { kind: 'house' }; });
  showTrough();
}
/** The trough shows its grain, higher the more scoops are in it. */
function showTrough() {
  const g = world.trough.parts.grain, k = S.trough / Math.max(1, S.hens);
  g.visible = S.trough > 0; g.scale.y = 0.35 + 0.65 * Math.min(1, k);
}
const shopOpen = () => S.hour >= SET.shop.opens && S.hour < SET.shop.closes;

/* ───────────── friendly bugs: they wander the clearing; catch them with your hand and sell them ───────────── */
const TAP_GEO = new THREE.SphereGeometry(1, 12, 8), TAP_MAT = new THREE.MeshBasicMaterial({ visible: false });
function cloneProp(kind) {
  const bug = world.models[kind].make(), root = new THREE.Group(); root.name = kind; root.add(bug.group); root.scale.setScalar(BUG_S);
  const tap = new THREE.Mesh(TAP_GEO, TAP_MAT); tap.scale.setScalar(BUG_TAP_R / BUG_S); tap.position.y = 0.1; root.add(tap);
  const it = { root, kind, s0: root.scale.x, grow: 0, bug, seed: rand(0, 50) };
  root.traverse((o) => { o.userData.pick = { kind: 'bug', ref: it }; });
  return it;
}
function clearOfItems(x, z, gap = 1.3) {
  return !world.items.some((it) => Math.hypot(x - it.root.position.x, z - it.root.position.z) < gap)
    && Math.hypot(x - pet.pos.x, z - pet.pos.z) > BODY_R + 0.5;
}
const BUG_MAX = SET.bugs.most;
/** The friendly bugs out there (of one kind, if given). */
function aliveBugs(kind) { return world.items.filter((i) => !i.pest && (!kind || i.kind === kind)); }
/** Which bug comes next: fireflies only after dark, and the kinds there are fewest of more often. */
function spawnKind() {
  const kinds = FRIENDLY.filter((k) => k !== 'firefly' || S.night);
  const n = (k) => aliveBugs(k).length, min = Math.min(...kinds.map(n));
  return Math.random() < 0.5 ? pick(kinds.filter((k) => n(k) === min)) : pick(kinds);
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
    it.root.position.set(x, groundY(x, z) + (instant ? 0 : -0.3), z); it.root.rotation.y = cross ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : rand(0, Math.PI * 2);
    startWalk(it, cross ? -side : null); it.life = rand(...SET.bugs.stayFor);
    it.s0 *= rand(0.9, 1.15); it.grow = instant ? 1 : 0; it.root.scale.setScalar(instant ? it.s0 : 0.001);
    scene.add(it.root); world.items.push(it);
    return it;
  }
  return null;
}
/** A bug left far behind wanders off, so there are always some near her. */
function recycleFarBug() {
  const far = aliveBugs().filter((i) => i !== her.order?.ref && i.root.position.distanceTo(pet.pos) > 16)
    .sort((a, b) => b.root.position.distanceTo(pet.pos) - a.root.position.distanceTo(pet.pos))[0];
  if (far) vanish(far);
}
function vanish(it, delay = 0, lift = 1.1) {
  world.items = world.items.filter((o) => o !== it);
  world.vanishing.push({ it, t: -delay, dur: 0.35, lift });
}
// bugs walk the clearing: each kind its own pace, each bug a bit faster or slower than its kind.
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

/* ───────────── pests: big red beetles and ants that come out at night for crops that are dry or ripe ───────────── */
// Each night brings pestsDue() of them (day.js), one every few seconds while it is dark. A pest crawls to a crop at
// risk and eats it unless she swats it first with the broom; a watered, growing crop is safe. They never bite her.
const PEST = SET.pests;
const pests = () => world.items.filter((i) => i.pest && !i.leaving);
const PEST_RED = new THREE.Color(0xB32A1F);
/** A crop at risk for a pest at (x, z) to go for: the nearest one, or null. */
function preyFor(x, z) {
  let best = null, bestD = Infinity;
  for (const p of S.plots) { const d = Math.hypot(p.x - x, p.z - z); if (atRisk(p) && d < bestD) { best = p; bestD = d; } }
  return best;
}
/** A pest crawls in out of the dark, 6–9 m from a crop at risk. */
function spawnPest(kind = pick(PEST_KINDS)) {
  const prey = pick(S.plots.filter(atRisk));
  if (!prey) return null;
  let at = null;
  for (let i = 0; i < 40 && !at; i++) {
    const a = rand(0, Math.PI * 2), r = rand(6, 9), x = prey.x + Math.cos(a) * r, z = prey.z + Math.sin(a) * r;
    if (x > ROAM.x0 && x < ROAM.x1 && z > ROAM.z0 && z < ROAM.z1 && !blocked(x, z, 0.4)) at = { x, z };
  }
  if (!at) return null;
  const it = cloneProp(kind);
  Object.assign(it, { pest: true, prey, hp: PEST.hp, stun: 0, flash: 0, eatT: 0, glow: [] });
  it.root.traverse((o) => {                             // its own materials, so the red glow stays on this bug
    if (!o.isMesh || !o.material.emissive) return;
    o.material = o.material.clone(); o.material.emissive = PEST_RED.clone(); o.material.emissiveIntensity = 0.6;
    it.glow.push(o.material);
  });
  it.s0 *= PEST.size * rand(0.92, 1.08); it.grow = 0; it.root.scale.setScalar(0.001);
  it.root.position.set(at.x, groundY(at.x, at.z) - 0.3, at.z);
  startWalk(it); it.walk.base = PEST.speed;
  scene.add(it.root); world.items.push(it);
  S.pests.came++;
  say('pest', { cool: 18 }); boxReact('pest', 0.4);
  return it;
}
/** At night the pests come, one every few seconds, until tonight's number have. */
function tickPestSpawns(dt) {
  if (!S.night || paused()) return;
  if (S.pests.due < 0) S.pests.due = pestsDue(S);
  if ((world.pestAt -= dt) > 0) return;
  world.pestAt = rand(...PEST.every);
  if (S.pests.came < S.pests.due) spawnPest();
}
/** Where a pest is going: its crop, while that is still at risk (otherwise the nearest other one, or away). */
function pestGoal(it) {
  if (!S.plots.includes(it.prey) || !atRisk(it.prey)) {
    it.prey = preyFor(it.root.position.x, it.root.position.z); it.eatT = 0;
    if (!it.prey) { sendOff(it); return null; }
  }
  return it.prey;
}
/** A pest at its crop eats; after PEST.eatFor seconds the crop is gone and the pest crawls off, full. */
function tickPestEat(it, dt) {
  it.stun = Math.max(0, it.stun - dt);
  if (it.flash > 0) { it.flash -= dt; for (const m of it.glow) m.emissiveIntensity = it.flash > 0 ? 2.2 : 0.6; }
  const p = it.prey;
  if (it.leaving || !p || it.stun > 0 || paused()) return;
  if (Math.hypot(it.root.position.x - p.x, it.root.position.z - p.z) > 0.4) { it.eatT = 0; return; }
  it.eatT += dt;
  if (it.eatT < PEST.eatFor) return;
  const crop = p.crop;
  p.crop = null; p.growth = 0; drawPlot(p);
  dirtBurst(p.x, p.z, 5); Sound.grumble();
  say('pestAte', { force: true, map: (l) => l.replace('{crop}', itemName(crop)) });
  sendOff(it);
}
/** A pest gives up (or has eaten) and crawls off the edge of the field. */
function sendOff(it) {
  const p = it.root.position, sp = spanAt(p.z);
  it.leaving = true; it.prey = null; it.walk.base = PEST.speed * 1.3;
  it.walk.exit = p.x < (sp.x0 + sp.x1) / 2 ? -1 : 1; it.walk.goal = bugTarget(it, it.walk.exit);
}
/** The broom lands: damage, a shove away from her, a white flash, and a stun. Two hits and it is gone. */
function strike(f) {
  const p = f.root.position, dx = p.x - pet.pos.x, dz = p.z - pet.pos.z, d = Math.hypot(dx, dz) || 1e-3;
  if (d > SWING.reach + 0.3) return false;               // it got away
  f.hp -= SWING.dmg; f.stun = PEST.stun; f.flash = 0.12; f.eatT = 0; Sound.hit();
  const s = resolveSpot(p.x + (dx / d) * 0.45, p.z + (dz / d) * 0.45); p.x = s.x; p.z = s.z;
  if (f.hp <= 0) swatted(f);
  return true;
}
function swatted(f) {
  const s = screenOf(f.root.position.clone().setY(f.root.position.y + 0.3));
  vanish(f, 0, 0.5); sparkle(s.x, s.y); Sound.squeak(); Sound.poof();
  S.mana = clamp(S.mana + SET.mana.perSwat, 0, 1); S.stats.swatted++;
  say('swat', { cool: 5 });
  checkGoals();
}

/* ───────────── the hens: they wander the yard beside the hut; fed hens lay an egg each morning ───────────── */
const YARD = SET.hens.yard;
/** A hen at a random spot in the yard. */
function addHen(variant) {
  const model = makeChicken(variant), a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * YARD.r;
  const s = resolveSpot(YARD.x + Math.cos(a) * r, YARD.z + Math.sin(a) * r);
  model.group.position.set(s.x, groundY(s.x, s.z), s.z);
  const hen = { model, root: model.group, heading: rand(0, Math.PI * 2), v: 0, goal: null, rest: rand(0.3, 2), t: rand(0, 20) };
  model.group.traverse((o) => { o.userData.pick = { kind: 'hen', ref: hen }; });
  scene.add(model.group); world.hens.push(hen);
  return hen;
}
/** As many hens in the yard as she keeps. */
function syncHens() { while (world.hens.length < S.hens) addHen(world.hens.length); }
/** Somewhere for a hen to stroll to: a free spot in the yard. */
function henGoal() {
  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * YARD.r, x = YARD.x + Math.cos(a) * r, z = YARD.z + Math.sin(a) * r;
    if (!blocked(x, z, 0.3)) return { x, z };
  }
  return { x: YARD.x, z: YARD.z };
}
/** A hen stands about pecking, then strolls somewhere else. */
function tickHen(h, dt) {
  const p = h.root.position;
  h.t += dt;
  let speed = 0, peck = 0;
  if (h.rest > 0) {
    h.rest -= dt; peck = 0.5 + 0.5 * Math.sin(h.t * 7);
    if (h.rest <= 0) h.goal = henGoal();
  } else {
    const dx = h.goal.x - p.x, dz = h.goal.z - p.z;
    if (Math.hypot(dx, dz) < 0.15) h.rest = rand(1.5, 5);
    else { h.heading += wrap(Math.atan2(dx, dz) - h.heading) * (1 - Math.exp(-6 * dt)); speed = SET.hens.speed; }
  }
  h.v = ease(h.v, speed, 6, dt);
  const nx = p.x + Math.sin(h.heading) * h.v * dt, nz = p.z + Math.cos(h.heading) * h.v * dt;
  if (!blocked(nx, nz, 0.15)) { p.x = nx; p.z = nz; }
  else { h.v = 0; h.goal = henGoal(); h.rest = 0.5; }     // walked into something: think again
  p.y = ease(p.y, groundY(p.x, p.z), 12, dt); h.root.rotation.y = h.heading;
  h.model.tick(h.t, h.v / SET.hens.speed, peck, false);
}
function tickHens(dt) { for (const h of world.hens) tickHen(h, dt); }
/** Draws an egg lying in the yard; `e` is its saved {x, z}. */
function showEgg(e) {
  const root = e.root = makeEgg(); root.position.set(e.x, groundY(e.x, e.z), e.z);
  const tap = new THREE.Mesh(TAP_GEO, TAP_MAT); tap.scale.setScalar(0.28); tap.position.y = 0.1; root.add(tap);   // a roomy tap target for a small egg
  root.traverse((o) => { o.userData.pick = { kind: 'egg', ref: e }; });
  scene.add(root);
}
/** The morning's eggs: each beside a hen, or somewhere in the yard. */
function layEggs(n) {
  for (let i = 0; i < n && S.eggs.length < SET.hens.eggsMost; i++) {
    const h = world.hens[i % Math.max(1, world.hens.length)];
    const c = h ? h.root.position : henGoal(), a = rand(0, Math.PI * 2);
    const s = resolveSpot(c.x + Math.cos(a) * 0.35, c.z + Math.sin(a) * 0.35);
    const e = { x: s.x, z: s.z }; S.eggs.push(e); showEgg(e);
  }
}

/* ───────────── the field: plots she digs, plants, waters and harvests (the rules are in farm.js) ───────────── */
const FARMABLE = ['dirt', 'grass', 'field'];
/** Can this block become farmland? Plain dry ground, not hugging the hut, the stall, the tree or the rocks. */
function canDig(x, z) {
  return FARMABLE.includes(kindAt(x, z)) && walkable(x, z) && !OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r - BODY_R + 0.7);
}
const plotAt = (x, z) => { const c = blockCentre(x, z); return S.plots.find((p) => p.x === c.x && p.z === c.z); };
/** The saved plots, back on the map; one that no longer sits on diggable ground (the map or the farm moved) is dropped. */
function restorePlots() {
  const seen = new Set();
  S.plots = S.plots.filter((p) => {
    const c = blockCentre(p.x, p.z), key = `${c.x},${c.z}`;
    if (seen.has(key) || !canDig(c.x, c.z)) return false;
    seen.add(key); p.x = c.x; p.z = c.z; p.was = kindAt(c.x, c.z);
    return true;
  });
  S.plots.forEach(drawPlot);
}
/** Draws a plot: dug soil (dark while it is watered today) and its crop at its stage. A crop that just grew pops up from small. */
function drawPlot(p) {
  wetCell(p.x, p.z, p.watered);
  const v = p.view || (p.view = { root: null, stage: -1, crop: null, drawn: false, size: 1, growth: 0 });
  const stage = p.crop ? stageOf(p) : -1;
  v.size = p.crop ? cropSize(p) : 1;
  if (v.drawn && v.stage === stage && v.crop === p.crop) {
    if (v.root && p.growth > v.growth) v.root.scale.setScalar(v.size * 0.8);   // it grew within its stage: a small pop
    v.growth = p.growth;
    return;
  }
  const pop = v.drawn && !!p.crop;
  v.stage = stage; v.crop = p.crop; v.drawn = true; v.growth = p.growth;
  if (v.root) scene.remove(v.root);
  v.root = null;
  if (!p.crop) return;
  const root = v.root = makeCrop(p.crop, stage);
  root.position.set(p.x, groundY(p.x, p.z), p.z);
  root.traverse((o) => { o.userData.pick = { kind: 'plot', ref: p }; });
  root.scale.setScalar(pop ? 0.4 * v.size : v.size);
  scene.add(root);
}
/** How big a crop is drawn within its stage: a stage's model grows from 70% to full over its days. */
function cropSize(p) {
  if (ripe(p)) return 1;
  const days = CROPS[p.crop].days, half = Math.ceil(days / 2), stage = stageOf(p);
  const [a, b] = stage === 0 ? [0, half] : [half, days];
  return 0.7 + 0.3 * (p.growth - a) / Math.max(1, b - a);
}
/** Gives a plot's block back to the map. */
function removePlot(p) {
  if (p.view?.root) scene.remove(p.view.root);
  untillCell(p.x, p.z, p.was || 'dirt');
}
/** New growth eases up to size, a ripe crop breathes (harvest me), and a crop a pest is eating shakes. */
function tickFarm(dt) {
  const t = clock.t, eating = new Set(world.items.filter((i) => i.pest && i.eatT > 0).map((i) => i.prey));
  for (const p of S.plots) {
    const r = p.view?.root; if (!r) continue;
    const full = p.view.size, s = r.scale.x < full ? Math.min(full, ease(r.scale.x, full * 1.05, 9, dt)) : full;
    r.scale.set(s, s * (ripe(p) && s >= 1 ? 1 + 0.05 * Math.sin(t * 3 + p.x * 2) : 1), s);
    r.rotation.z = eating.has(p) ? Math.sin(t * 30) * 0.1 : 0;
  }
  for (const f of world.flying) {                         // a harvest, an egg or a bug flying into her arms
    f.t += dt; const k = Math.min(1, f.t / 0.45), p = pet.pos;
    f.root.position.set(lerp(f.from.x, p.x, k), lerp(f.from.y, p.y + 1.2, k) + Math.sin(k * Math.PI) * 0.5, lerp(f.from.z, p.z, k));
    f.root.scale.setScalar(f.s0 * (1 - 0.85 * k));
    if (k >= 1) scene.remove(f.root);
  }
  world.flying = world.flying.filter((f) => f.t < 0.45);
}
/** Sends a thing she has just picked up flying to her. */
function flyToHer(root) { world.flying.push({ root, from: root.position.clone(), s0: root.scale.x, t: 0 }); }

/* ───────────── bugs and pests on the move ───────────── */
function startWalk(it, exit = null) {
  it.walk = { base: (BUG_SPEED[it.kind] || 0.7) * rand(0.75, 1.3), v: 0, heading: it.root.rotation.y, rest: rand(0.2, 0.9), exit, bt: 0 };
  it.walk.goal = bugTarget(it, exit);
}
function tickBug(it, dt) {
  const w = it.walk, p = it.root.position, live = world.items.includes(it);
  let a = 0.3, adv = dt;
  if (w && live && it.grow >= 1) {
    const dPet = Math.hypot(p.x - pet.pos.x, p.z - pet.pos.z) || 1e-3;
    const scared = !it.pest && dPet < BUG_FEAR && her.mode !== 'sleep';
    const prey = it.pest && !it.leaving ? pestGoal(it) : null;
    if (prey) {                                          // a pest heads for its crop, round the pond and cliffs, and stops there to eat
      if ((it.pathT = (it.pathT || 0) - dt) <= 0) { w.goal = waypoint(p.x, p.z, prey.x, prey.z); it.pathT = 0.25; }
      w.rest = Math.hypot(p.x - prey.x, p.z - prey.z) < 0.35 || it.stun > 0 || paused() ? 1 : 0;
    }
    if (w.rest > 0 && !scared) {
      w.rest -= dt; w.v = ease(w.v, 0, 8, dt);
      if (prey) { w.heading += wrap(Math.atan2(prey.x - p.x, prey.z - p.z) - w.heading) * (1 - Math.exp(-10 * dt)); it.root.rotation.y = w.heading; if (it.eatT > 0) a = 1; }
    }
    else {
      w.rest = 0;
      // steer toward the goal, round the tree and rocks, and away from her when she gets close
      let sx = w.goal.x - p.x, sz = w.goal.z - p.z; const gd = Math.hypot(sx, sz) || 1e-3; sx /= gd; sz /= gd;
      for (const o of OBSTACLES) {
        const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz) || 1e-3, r = o.r - BODY_R + 0.7;
        if (d < r + 0.9) { const k = ((r + 0.9 - d) / 0.9) * 1.8; sx += (ox / d) * k; sz += (oz / d) * k; }
      }
      if (scared) { const k = ((BUG_FEAR - dPet) / BUG_FEAR) * 2.4; sx += ((p.x - pet.pos.x) / dPet) * k; sz += ((p.z - pet.pos.z) / dPet) * k; }
      const want = Math.atan2(sx, sz) + Math.sin(clock.t * 1.7 + it.seed) * (prey ? 0.1 : 0.25);
      w.heading += wrap(want - w.heading) * (1 - Math.exp(-(scared ? 9 : 5) * dt));
      w.v = ease(w.v, scared ? Math.min(w.base * 1.6, BUG_BOLT) : w.base, 4, dt);
      let nx = p.x + Math.sin(w.heading) * w.v * dt, nz = p.z + Math.cos(w.heading) * w.v * dt;
      if (w.exit == null) ({ x: nx, z: nz } = clampXZ(nx, nz));
      else { const A = area || ROAM; nz = clamp(nz, A.z0, A.z1); }
      if (w.exit == null && !walkable(nx, nz)) { w.goal = bugTarget(it); nx = p.x; nz = p.z; }   // not into the pond: stay and look elsewhere
      p.x = nx; p.z = nz; p.y = ease(p.y, groundY(nx, nz), 12, dt); it.root.rotation.y = w.heading;
      if (w.exit != null) {
        const sp = spanAt(p.z);
        if (p.x < sp.x0 - 0.5 || p.x > sp.x1 + 0.5) { vanish(it, 0, 0); return; }   // made it across: off it goes
      } else if (!it.pest && it.life != null && (it.life -= dt) < 0 && her.order?.ref !== it) {
        w.exit = p.x < (spanAt(p.z).x0 + spanAt(p.z).x1) / 2 ? -1 : 1; w.goal = bugTarget(it, w.exit);
      } else if (!prey && (gd < 0.4 || Math.random() < dt * 0.05)) { w.goal = bugTarget(it); if (Math.random() < 0.5) w.rest = rand(0.4, 2.2); }
      const k = clamp(w.v / Math.max(w.base, 0.2), 0, 1.8);
      a = 0.35 + 0.65 * Math.min(1, k); adv = dt * (0.5 + 0.7 * k);
    }
  }
  if (w) w.bt += adv;
  it.bug.tick((w ? w.bt : clock.t) + it.seed, a);
}
function tickProps(dt) {
  world.spawnAt -= dt;
  if (world.spawnAt <= 0) {
    if (aliveBugs().length >= BUG_MAX) recycleFarBug();
    if (aliveBugs().length < BUG_MAX) spawnSprout();
    world.spawnAt = rand(...SET.bugs.appearEvery);
  }
  tickPestSpawns(dt);
  for (const it of world.items) {
    tickBug(it, dt);
    if (it.pest) tickPestEat(it, dt);
    if (it.grow < 1) {
      it.grow = Math.min(1, it.grow + dt / 0.7);
      const e = 1 - Math.pow(1 - it.grow, 3);
      it.root.scale.setScalar(it.s0 * Math.max(0.001, e) * (1 + 0.14 * Math.sin(it.grow * Math.PI)));
      it.root.position.y = groundY(it.root.position.x, it.root.position.z) - 0.3 * (1 - e);
    }
  }
  for (const v of world.vanishing) {
    v.t += dt; if (v.t < 0) continue;
    const k = Math.min(1, v.t / v.dur), e = 1 - Math.pow(1 - k, 2);
    v.it.root.scale.setScalar(Math.max(0.001, (1 - e) * v.it.s0));
    v.it.root.position.y += dt * v.lift * 3;
    v.it.root.rotation.y += dt * 9;
    if (k >= 1) scene.remove(v.it.root);
  }
  world.vanishing = world.vanishing.filter((v) => v.t < v.dur);
  tickClods(dt);
}

/* ───────────── her: she does what the player tells her, nothing else ───────────── */
// Modes: 'idle'; 'walk' (to a spot, or to where an order is done); 'work' (doing an order: a farm action or a broom
// swing); 'rest' (out of stamina, she sits it out); 'faint' (2:00 came); 'sleep' (the night passing, screen dark).
// A mode is listed in tickHer() and in YagaPet.moodClip(). An order is a plan from planFor(); taps while she is busy
// queue up (QUEUE_MAX) and run in turn; a plain walk, the arrow keys or WASD clear the queue.
const clock = { t: 0 };
const QUEUE_MAX = 12;
const her = { mode: 'idle', goal: new THREE.Vector3(), run: false, hops: 0, pause: 0, order: null, queue: [], job: null,
  restUntil: 0, sleepT: 0, passedOut: false, slept: false, contentUntil: 0, pokes: [], lastPoke: -99, snoreAt: 0 };
const timers = [];
/** Runs fn after `secs` of game time (clock.t, so advance() steps it too). */
function later(secs, fn) { timers.push({ at: clock.t + secs, fn }); }
function tickTimers() {
  for (let i = timers.length - 1; i >= 0; i--) if (clock.t >= timers[i].at) timers.splice(i, 1)[0].fn();
}
/** The clock and the pests stand still while a panel is open or she sleeps. */
const paused = () => !!panelOpen() || her.mode === 'sleep';

function go(goal, run = false) {
  her.mode = 'walk'; her.goal.set(goal.x, 0, goal.z); her.run = run; her.hops = 0; her.pause = 0;
}
function planHop() {
  const p = pet.pos, g = waypoint(p.x, p.z, her.goal.x, her.goal.z);   // round the pond and cliffs, not through them
  let dx = g.x - p.x, dz = g.z - p.z; const dist = Math.hypot(dx, dz) || 1e-3;
  let dirX = dx / dist, dirZ = dz / dist;
  const len = Math.min(dist, her.run ? 1.7 : rand(1.0, 1.4));
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
  pet.startHop(s.x, s.z);
  her.hops++;
}

/* ── plans: what a tap on something would do with the tool in her hand ── */
// `no` says why it can't be done (a key of ui.no in the words, and of NO_SAY for her line); `info` marks the
// harmless ones (a crop still growing, one already watered) that only get a label.
const NO_SAY = { closed: 'stallClosed', trough: 'troughFull', feed: 'noFeed', full: 'canFull', broom: 'needBroom', water: 'canEmpty',
  undug: 'digFirst', seeds: 'noSeeds', dry: 'waterFirst', mana: 'noMana', growing: 'notRipe', watered: 'watered' };
const INFO = ['growing', 'watered'];
/** The plan for a tap on target `t` ({ kind, x, z, ref }: from pickTarget()) with `tool`:
 *  { act, tool, x, z, ref, target, no?, info?, chase?, spot?, ... }. act 'walk' means just go there. */
function planFor(t, tool = S.tool) {
  if (!t) return null;
  const P = (act, extra = {}) => {
    const o = { act, tool, x: t.x, z: t.z, ref: t.ref, target: t, ...extra };
    if (o.no && INFO.includes(o.no)) o.info = true;
    return o;
  };
  switch (t.kind) {                                     // the buildings: she stands at their front and faces them
    case 'house': return P('bed', { spot: HOUSE_DOOR, x: HOUSE.x, z: HOUSE.z });
    case 'stall': return P('shop', { spot: STALL.use, x: STALL.x, z: STALL.z, no: shopOpen() ? null : 'closed' });
    case 'trough': return P('feed', { spot: TROUGH.use, x: TROUGH.x, z: TROUGH.z, no: S.trough >= S.hens ? 'trough' : count(S, 'feed') ? null : 'feed' });
    case 'well': return tool === 'can' ? P('fill', { spot: WELL.use, x: WELL.x, z: WELL.z, no: S.can >= canHolds(S) ? 'full' : null }) : P('walk', { x: WELL.use.x, z: WELL.use.z });
    case 'egg': return P('pick', { x: t.ref.x, z: t.ref.z });
    case 'hen': return P('pet', { chase: true });
    case 'bug': return t.ref.pest ? P('swat', { chase: true, no: tool === 'broom' ? null : 'broom' }) : P('catch', { chase: true });
  }
  // a block of ground, or the crop standing on it
  const c = blockCentre(t.x, t.z), p = plotAt(c.x, c.z), at = (act, extra) => P(act, { x: c.x, z: c.z, ...extra });
  if (tool === 'can' && isWater(t.x, t.z)) return at('fill', { pond: true, no: S.can >= canHolds(S) ? 'full' : null });
  if (tool === 'shovel' && !p && canDig(c.x, c.z)) return at('dig');
  if (tool === 'can' && p && !ripe(p)) return at('water', { no: p.watered ? 'watered' : S.can ? null : 'water' });
  if (tool.startsWith('seed:') && !p?.crop) {
    if (p) return at('plant', { crop: tool.slice(5), no: count(S, tool) ? null : 'seeds' });
    if (canDig(c.x, c.z)) return at('plant', { crop: tool.slice(5), no: 'undug' });
  }
  if (tool === 'spell' && p?.crop && !ripe(p)) return at('grow', { no: !p.watered ? 'dry' : S.mana < SET.mana.grow ? 'mana' : null });
  if (p?.crop) return ripe(p) ? at('harvest') : at('harvest', { no: 'growing', n: daysLeft(p) });
  const s = resolveSpot(t.x, t.z);
  return P('walk', { x: s.x, z: s.z });
}
/** What a plan says on screen: "Dig", "Water (8 left)", "The can is empty: fill it at the well"… */
function planLabel(o) {
  const crop = o.crop || o.ref?.crop || (o.x != null ? plotAt(o.x, o.z)?.crop : null);
  const vars = { crop: crop ? itemName(crop) : '', item: itemName(o.tool), bug: o.ref?.kind ? bugName(o.ref.kind) : '',
    n: o.act === 'water' ? S.can : o.act === 'plant' ? count(S, o.tool) : o.n ?? 0 };
  if (o.no) return fill(o.no === 'growing' ? plural(UI.no.growing, o.n) : UI.no[o.no], vars);
  return fill(UI.act[o.act], vars);
}
const alive = (o) => (o.act === 'pick' ? S.eggs.includes(o.ref) : o.act === 'pet' ? world.hens.includes(o.ref) : !o.chase || world.items.includes(o.ref));
const targetPos = (o) => (o.chase ? o.ref.root.position : { x: o.x, z: o.z });
const REACH = { swat: SWING.reach * 0.85, catch: 1.15, pet: 1.0 };

/** Gives her an order. A plain walk goes at once; work waits its turn if she is busy. Returns whether she took it. */
function command(o, run = false) {
  if (!o) return false;
  if (her.mode === 'rest') { say('resting', { cool: 4 }); return false; }
  if (her.mode === 'faint' || her.mode === 'sleep') return false;
  if (o.no) { refuse(o); return false; }
  o.run = run;
  if (o.act === 'walk') {
    if (her.mode === 'work') her.queue = [o];
    else { her.queue = []; her.order = null; go(o, run); }
    return true;
  }
  const same = (q) => q.act === o.act && (o.spot ? true : o.chase || o.act === 'pick' ? q.ref === o.ref : q.x === o.x && q.z === o.z);
  if (her.order || her.mode === 'work') {
    const cur = her.job?.o || her.order;
    if ((cur && same(cur)) || her.queue.some(same) || her.queue.length >= QUEUE_MAX) return false;
    her.queue = her.queue.filter((q) => q.act !== 'walk');
    her.queue.push(o);
    return true;
  }
  startOrder(o);
  return true;
}
/** She can't: a short sound, her line, and the reason on screen (an `info` plan only shows its label). */
function refuse(o) {
  flashTip(o, 1.8);
  if (o.info) return;
  Sound.nope(); say(NO_SAY[o.no], { cool: 3, force: true });
}
function startOrder(o) {
  her.order = o;
  if (o.act === 'walk') { her.order = null; go(o, o.run); return; }
  const spot = standSpot(o);
  if (spot) go(spot, o.run); else beginWork(o);
}
/** Where she must stand for an order, or null if she can do it from where she is. */
function standSpot(o) {
  if (o.spot) return Math.hypot(pet.pos.x - o.spot.x, pet.pos.z - o.spot.z) < 0.4 ? null : o.spot;
  const tp = targetPos(o), reach = o.chase ? REACH[o.act] : FARM[o.act].reach;
  const dx = pet.pos.x - tp.x, dz = pet.pos.z - tp.z, d = Math.hypot(dx, dz) || 1;
  if (d <= reach + 0.3 && (d >= 0.45 || o.chase)) return null;
  if (o.chase) return tp;
  return resolveSpot(tp.x + (dx / d) * reach, tp.z + (dz / d) * reach);
}
function tickWalk(dt) {
  const o = her.order;
  if (o && o.chase) {
    if (!alive(o)) { her.order = null; her.mode = 'idle'; if (o.act === 'catch') say('escaped', { cool: 5 }); return; }
    const p = o.ref.root.position; her.goal.set(p.x, 0, p.z);
  }
  if (pet.airborne) return;
  her.pause -= dt;
  if (her.pause > 0) return;
  let arrived = Math.hypot(her.goal.x - pet.pos.x, her.goal.z - pet.pos.z) < 0.35;
  if (o && o.chase) {
    const p = o.ref.root.position;
    arrived = Math.hypot(p.x - pet.pos.x, p.z - pet.pos.z) < REACH[o.act];
    if (!arrived && her.hops > 40) { her.order = null; her.mode = 'idle'; say('escaped', { cool: 5 }); return; }   // it got away
  }
  if (arrived || (!o?.chase && her.hops > 30)) {
    her.mode = 'idle';
    if (o) beginWork(o);
    return;
  }
  planHop();
}
/** She has arrived: if the order still makes sense, she does it (the field may have changed while she walked). */
function beginWork(o) {
  her.order = null; her.mode = 'idle';
  const now = alive(o) ? planFor(o.target, o.tool) : null;
  if (!now || now.act !== o.act) return;
  if (now.no) { refuse(now); her.queue = her.queue.filter((q) => q.act !== o.act); return; }   // out of water, seeds…: the rest of those can't be done either
  if (o.act === 'shop') { pet.faceTo = Math.atan2(o.x - pet.pos.x, o.z - pet.pos.z); openStall(S, STALL_EVENTS); return; }
  if (o.act === 'bed') {
    pet.faceTo = faceCamAngle(); world.house.stompAt = clock.t;
    openBed(S.hour < SET.day.nightStarts, clockText(S.hour), () => startSleep(false));
    return;
  }
  her.order = o;
  const cost = SET.stamina[o.act] * (o.act === 'dig' && S.up.steelShovel ? SET.shovel.steelDig : 1);
  S.stamina = Math.max(0, S.stamina - (cost || 0));
  if (o.act === 'grow') S.mana = Math.max(0, S.mana - SET.mana.grow);
  const tp = targetPos(o);
  pet.faceTo = Math.atan2(tp.x - pet.pos.x, tp.z - pet.pos.z);
  her.mode = 'work'; her.job = { o, t: 0, beat: 0, done: false };
  if (o.act === 'swat') { pet.swing(); Sound.swing(); return; }
  const A = FARM[o.act];
  pet.play(A.clip, A.dur, true, A.from || 0);
}
function tickWork(dt) {
  const J = her.job, o = J.o; J.t += dt;
  if (o.chase && alive(o)) { const p = o.ref.root.position; pet.faceTo = Math.atan2(p.x - pet.pos.x, p.z - pet.pos.z); }
  if (o.act === 'swat') {
    if (!J.done && J.t >= SWING.hitAt) { J.done = true; if (alive(o)) strike(o.ref); }
    if (J.t < SWING.dur) return;
    her.mode = 'idle'; her.job = null; her.order = null;
    if (S.stamina <= 0) return startRest();
    if (alive(o) && !her.queue.length) startOrder(o);     // keep at it until it is gone, unless she has been told something else
    return;
  }
  const A = FARM[o.act], tp = targetPos(o);
  while (J.beat < A.beats.length && J.t >= A.beats[J.beat]) {
    if (A.dirt) { dirtBurst(tp.x, tp.z, A.dirt); Sound.thud(); }
    if (A.drops) { dropBurst(tp.x, tp.z, A.drops, o.act === 'fill'); if (!J.beat) Sound.pour(); }
    J.beat++;
  }
  if (!J.done && J.t >= A.doneAt) { J.done = true; finish(o); }
  if (J.t >= A.dur) {
    her.mode = 'idle'; her.job = null; her.order = null;
    if (S.stamina <= 0) startRest();
  }
}
/** The result of an order lands. */
function finish(o) {
  const st = S.stats, p = o.x != null ? plotAt(o.x, o.z) : null;
  switch (o.act) {
    case 'dig': {
      if (p || !canDig(o.x, o.z)) break;
      const np = newPlot(o.x, o.z, kindAt(o.x, o.z));
      S.plots.push(np); tillCell(o.x, o.z); drawPlot(np); st.dug++;
      say('dug', { cool: 25 });
      break;
    }
    case 'plant':
      if (!p || p.crop || !take(S, o.tool)) break;
      p.crop = o.crop; p.growth = 0; p.bare = 0; drawPlot(p); st.planted++;
      say('planted', { cool: 20 });
      break;
    case 'water':
      if (!p || p.watered || S.can <= 0) break;
      S.can--; p.watered = true; drawPlot(p); st.watered++;
      if (!S.can) say('canEmpty', { force: true }); else say('wateredOne', { cool: 40 });
      break;
    case 'harvest': {
      if (!p || !ripe(p)) break;
      const crop = p.crop, root = p.view.root;
      p.view.root = null; p.crop = null; p.growth = 0; drawPlot(p);
      if (root) flyToHer(root);
      add(S, crop); st.harvested++; plusFx(o.x, o.z, crop);
      Sound.yum(); say('harvest', { cool: 12 }); boxReact('harvest', 0.25);
      break;
    }
    case 'grow':
      if (!p || !p.crop || ripe(p)) break;
      p.growth++; drawPlot(p); sparkleAt(o.x, o.z); Sound.chime();
      say(ripe(p) ? 'grownRipe' : 'grown', { force: true });
      break;
    case 'fill':
      S.can = canHolds(S); say('filled', { cool: 30 });
      break;
    case 'pick': {
      const e = o.ref;
      if (!S.eggs.includes(e)) break;
      S.eggs = S.eggs.filter((x) => x !== e); flyToHer(e.root);
      add(S, 'egg'); st.eggs++; plusFx(e.x, e.z, 'egg'); Sound.plop(); say('egg', { cool: 15 });
      break;
    }
    case 'catch': {
      const b = o.ref, bp = b.root.position;
      if (!world.items.includes(b) || Math.hypot(bp.x - pet.pos.x, bp.z - pet.pos.z) > REACH.catch + 0.5) { say('escaped', { cool: 4 }); break; }
      world.items = world.items.filter((i) => i !== b); flyToHer(b.root);
      add(S, `bug:${b.kind}`); if (!st.caught.includes(b.kind)) st.caught.push(b.kind);
      plusFx(bp.x, bp.z, `bug:${b.kind}`); Sound.squeak();
      say('caught', { force: true, map: (l) => l.replace('{bug}', bugName(b.kind)) });
      break;
    }
    case 'feed': {
      const n = Math.min(S.hens - S.trough, count(S, 'feed'));
      if (n <= 0) break;
      take(S, 'feed', n); S.trough += n; showTrough(); Sound.plop(); say('fed', { cool: 10 });
      break;
    }
    case 'pet': {
      const h = o.ref; h.rest = Math.max(h.rest, 1.2); Sound.cluck();
      const s = screenOf(h.root.position.clone().setY(h.root.position.y + 0.5)); heart(s.x, s.y);
      say('henPet', { cool: 12 });
      break;
    }
  }
  checkGoals(); save();
}
/** Out of stamina: she sits down for a while and gets a little back. */
function startRest() {
  her.mode = 'rest'; her.restUntil = clock.t + SET.her.restFor; her.queue = []; her.order = null; pet.hop = null;
  say('exhausted', { force: true }); later(2, () => boxReact('rest', 0.7));
}
/** The arrow keys or WASD walk her directly (screen up is away from the camera); Shift runs. Any order is dropped. */
const keys = new Set();
function steerByKeys(dt) {
  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f++;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r++;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r--;
  pet.steer = false;
  if ((!f && !r) || !['idle', 'walk'].includes(her.mode) || panelOpen()) return;
  const yaw = rigAt(zoom, camera.aspect).yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let x = fx * f + -fz * r, z = fz * f + fx * r; const l = Math.hypot(x, z); x /= l; z /= l;
  her.queue = []; her.order = null; her.mode = 'idle'; pet.hop = null;
  const run = keys.has('Shift'), sp = run ? RUN_SPEED : WALK_SPEED, p = pet.pos;
  pet.gait = run ? 'run' : 'walk'; pet.steer = true; pet.faceTo = Math.atan2(x, z);
  const ok = (a, b) => !blocked(a, b) && Math.abs(groundY(a, b) - groundY(p.x, p.z)) < 0.55;
  const nx = p.x + x * sp * dt, nz = p.z + z * sp * dt;
  if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) p.x = nx; else if (ok(p.x, nz)) p.z = nz;   // slide along walls
}
/** E or Space: the tool in her hand on whatever is right in front of her. */
function useFacing() {
  if (!['idle', 'walk', 'work'].includes(her.mode)) return;
  const hx = Math.sin(pet.heading), hz = Math.cos(pet.heading), fx = pet.pos.x + hx * 0.8, fz = pet.pos.z + hz * 0.8;
  const near = (x, z, r) => Math.hypot(x - fx, z - fz) < r;
  let t = null;
  const it = world.items.filter((i) => i.grow >= 1 && near(i.root.position.x, i.root.position.z, 1.0))
    .sort((a, b) => (b.pest ? 1 : 0) - (a.pest ? 1 : 0))[0];
  if (it) t = { kind: 'bug', ref: it, x: it.root.position.x, z: it.root.position.z };
  const egg = !t && S.eggs.find((e) => near(e.x, e.z, 0.7));
  if (egg) t = { kind: 'egg', ref: egg, x: egg.x, z: egg.z };
  for (const [kind, use] of [['stall', STALL.use], ['well', WELL.use], ['trough', TROUGH.use], ['house', HOUSE_DOOR]]) {   // standing at one of these
    if (!t && Math.hypot(use.x - pet.pos.x, use.z - pet.pos.z) < 0.9) t = { kind, x: use.x, z: use.z };
  }
  if (!t) { const c = blockCentre(pet.pos.x + hx * 0.75, pet.pos.z + hz * 0.75); t = { kind: 'ground', x: c.x, z: c.z }; }
  const o = planFor(t);
  if (o.act === 'walk') { flashTip({ ...o, act: 'nothing' }, 1.2); return; }
  if (command(o)) flashTip(o, 1.0);
}

function tickHer(dt) {
  const t = clock.t;
  steerByKeys(dt);
  switch (her.mode) {
    case 'idle':
      if (her.queue.length && !pet.steer) startOrder(her.queue.shift());
      break;
    case 'walk': tickWalk(dt); break;
    case 'work': tickWork(dt); break;
    case 'rest':
      if (t > her.snoreAt) { her.snoreAt = t + 3.2; Sound.snore(); zz(); }
      if (t >= her.restUntil) { her.mode = 'idle'; S.stamina = Math.max(S.stamina, SET.her.restGain); say('rested', { force: true }); }
      break;
    case 'faint':
      her.sleepT += dt;
      if (her.sleepT > 2.4) startSleep(true);
      break;
    case 'sleep':
      her.sleepT += dt;
      if (!her.slept && her.sleepT > 1.0) { her.slept = true; nightPasses(); }
      break;
  }
}

/* ───────────── the day's end: bed, or passing out at 2:00 ───────────── */
function passOut() {
  her.mode = 'faint'; her.sleepT = 0; her.queue = []; her.order = null; her.job = null; pet.hop = null;
  closePanel(); pet.play('fall', 3, true); say('passOut', { force: true });
}
/** The screen goes dark; once it is, the night passes (nightPasses) and the morning summary opens. */
function startSleep(passedOut) {
  closePanel();
  Object.assign(her, { mode: 'sleep', sleepT: 0, passedOut, slept: false, queue: [], order: null, job: null });
  pet.hop = null; keys.clear();
  $('#fade').classList.add('on');
  if (!passedOut) Sound.night();
}
function nightPasses() {
  const due = S.pests.due < 0 ? pestsDue(S) : S.pests.due;
  const r = endDay(S, { passedOut: her.passedOut, pending: pests().length + Math.max(0, due - S.pests.came) });
  // by morning the night's creatures are gone, the field shows the night's work, and the fed hens have laid
  for (const it of world.items) scene.remove(it.root);
  for (const v of world.vanishing) scene.remove(v.it.root);
  world.items = []; world.vanishing = [];
  for (const p of r.reverted) removePlot(p);
  S.plots.forEach(drawPlot);
  layEggs(r.eggs); showTrough();
  S.night = isNight(S.hour); phase.n = S.night ? 1 : 0; applyPhase(phase.n);
  pet.pos.set(HOUSE_DOOR.x, groundY(HOUSE_DOOR.x, HOUSE_DOOR.z), HOUSE_DOOR.z); pet.heading = faceCamAngle(); pet.faceTo = pet.heading;
  Box.pet.hop = null; Box.pet.pos.set(HOUSE_DOOR.x + 1.4, groundY(HOUSE_DOOR.x + 1.4, HOUSE_DOOR.z + 0.6), HOUSE_DOOR.z + 0.6);
  world.spawnAt = 1; world.pestAt = rand(3, 6);
  for (let i = 0; i < 3; i++) spawnSprout(true);
  save();
  $('#fade').classList.remove('on');                    // the morning shows behind the summary
  openSummary(r, S, () => {
    her.mode = 'idle'; Sound.wake(); say(r.passedOut ? 'wokeSore' : 'morning', { force: true });
    later(3, () => boxReact('morning', 0.6));
    checkGoals();
  });
}
/** Goals just reached: a toast, a cheer, and their coins. */
function checkGoals() {
  for (const g of reached(S)) {
    toast(fill(UI.goal.reached, { goal: UI.goals[g.id] }) + (g.reward ? ` ${fill(UI.goal.reward, { n: g.reward })}` : ''), 'goal');
    Sound.wake();
    if (her.mode === 'idle' && !pet.airborne && !panelOpen()) pet.play('cheer', 2.4, true);
    say('goal', { cool: 6 });
  }
}
/** What the stall panel tells the game when she trades. */
const STALL_EVENTS = {
  sold(coins) {
    if (!coins) return;
    Sound.coin(); toast(fill(UI.plusCoins, { n: coins }), 'coins'); say('sold', { cool: 8 }); boxReact('sold', 0.3);
    checkGoals(); save();
  },
  bought(o) {
    Sound.coin();
    if (o.id === 'hen') { syncHens(); showTrough(); say('newHen', { force: true }); }
    else if (o.id === 'bigCan' || o.id === 'steelShovel') say('upgrade', { force: true });
    else say('bought', { cool: 8 });
    checkGoals(); save();
  },
};

/** Sets the time of day (for testing: yaga.setHour(21) for night). */
function setHour(h) { S.hour = clamp(h, WAKE, PASS_OUT - 0.01); }

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
function tickTalk(t) {
  if (Talk.boot && t > 1.4) { const b = Talk.boot; Talk.boot = null; say(null, { text: b, force: true }); }
  if (!talking() && Talk.q.length) { const q = Talk.q.shift(); showLine(q.text, q.dur, q.gib); }
  else if (!talking() && t > Talk.next && t > Talk.lock) {
    Talk.next = t + rand(9, 16);
    const m = her.mode;
    if (m === 'rest') { if (Math.random() < 0.3) say(null, { text: UI.napPrefix + gibber(), gib: true }); }
    else if (m === 'idle' || m === 'walk') {
      if (t - Talk.inputAt > 25 && Talk.idleN < 3) { if (say('idle')) Talk.idleN++; }
      else if (S.stamina < 0.2) say('sleepy');
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
  if (kind === 'pest' || kind === 'rest') boxMood('grumpy', 2.5);
  if (kind === 'sold' || kind === 'harvest') boxMood('grin', 2);
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
    if (her.mode === 'idle' && !pet.airborne) {
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
  if (Math.random() < 0.4 && her.mode === 'idle') later(1.3, () => say(null, { force: true, text: pick(DEFEND) }));
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
  if (t > Box.nextArgue && her.mode === 'idle' && !pet.airborne && d < 4.5 && !talking() && !boxTalking() && t > Talk.lock) {
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

/* ───────────── poking and stroking her (just for fun: it never gives her orders) ───────────── */
function poke() {
  const t = clock.t;
  pet.pokeAt = t; her.lastPoke = t;
  her.pokes = her.pokes.filter((p) => t - p < 5); her.pokes.push(t);
  if (her.mode === 'rest' || her.mode === 'sleep' || her.mode === 'faint') { Sound.grumble(); say('sleep_poke', { force: true, cool: 2.5 }); return; }
  pet.startleAt = t; pet.st.puffV += 9;
  Sound.squeak();
  if (her.mode === 'idle' && !pet.airborne) {
    pet.faceTo = faceCamAngle();
    if (her.pokes.length < 3 && Math.random() < 0.5) later(0.18, () => happyHop(Math.random() < 0.4));
    else pet.play('hit_to_body_01', 1.0, true);
  }
  pokeTalk();
  later(1.5, () => boxReact('yagaPoked', 0.5));
}
function happyHop(big = false) {
  if (big) boxReact('dance', 0.35);
  if (pet.airborne || her.mode !== 'idle') return;
  pet.startHop(pet.pos.x, pet.pos.z, { h: big ? 0.95 : 0.6, big, ant: 0.12 });
}

/* ───────────── input ───────────── */
const ptr = { down: false, id: null, x0: 0, y0: 0, t0: 0, onPet: false, moved: 0, groundAt: -1e9, groundX: 0, groundY: 0, last: new THREE.Vector2(), lastT: 0, heartAt: 0, purrAt: 0, hx: 0, hy: 0, hoverAt: -99, nearT: 0, planAt: 0, hoverPlan: null };
const hoverV = new THREE.Vector3();
// desktop: her eyes follow the cursor; and what a click would do under it, worked out ten times a second
function tickHover(dt) {
  let near = 0; pet.hover = null;
  const hovering = !MOBILE && !ptr.down && clock.t - ptr.hoverAt < 3;
  if (hovering) {
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
  if (ptr.nearT > 2.2 && her.mode !== 'sleep') { ptr.nearT = 0; say('hover', { cool: 45 }); }
  if (!hovering || panelOpen() || her.mode === 'sleep') { ptr.hoverPlan = null; return; }
  if (performance.now() < ptr.planAt) return;            // real time, so a slow frame rate doesn't leave it stale
  ptr.planAt = performance.now() + 100;
  const o = planFor(pickTarget()), onUs = (!o || o.act === 'walk') && (hitPet() || hitBoxPet());
  ptr.hoverPlan = onUs ? null : o;
  renderer.domElement.style.cursor = onUs || (o && o.act !== 'walk') ? 'pointer' : '';
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
/** What the ray points at: a thing (a bug or pest, an egg, a hen, a crop, the stall, the well, the trough, the hut)
 *  or else a block of ground. Everything pickable carries userData.pick = { kind, ref }. */
function pickTarget() {
  const roots = [...world.items.filter((i) => i.grow >= 1).map((i) => i.root), ...S.eggs.map((e) => e.root), ...world.hens.map((h) => h.root),
    ...S.plots.map((p) => p.view?.root).filter(Boolean), world.stall.group, world.well.group, world.trough.group, world.house.root];
  const h = ray.intersectObjects(roots, true)[0];
  const pk = h?.object.userData.pick;
  if (pk) {
    const r = pk.ref, at = r?.root ? r.root.position : r && Number.isFinite(r.x) ? r : h.point;
    return { kind: pk.kind, ref: r, x: at.x, z: at.z };
  }
  const g = hitGround();
  return g ? { kind: 'ground', x: g.x, z: g.z } : null;
}
function onDown(e) {
  Sound.init(); noteInput();
  toNdc(e);
  Object.assign(ptr, { down: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, onPet: false });
  ptr.last.set(e.clientX, e.clientY); ptr.lastT = performance.now();
  // she (or the Box) often stands in front of the block a tap means: the tool's work there comes first, a poke second
  const o = planFor(pickTarget()), work = o && o.act !== 'walk';
  if (!work && hitBoxPet()) return pokeBox();
  const hp = !work && hitPet();
  if (hp) { ptr.onPet = true; renderer.domElement.setPointerCapture?.(e.pointerId); touchAt(hp, 0, 0); return; }
  if (!o) return;
  let run = false;
  if (o.act === 'walk') {                          // a second tap on the ground, quick and close: run
    const now = performance.now();
    run = now - ptr.groundAt < DOUBLE_TAP.ms && Math.hypot(e.clientX - ptr.groundX, e.clientY - ptr.groundY) < DOUBLE_TAP.px;
    Object.assign(ptr, { groundAt: run ? -1e9 : now, groundX: e.clientX, groundY: e.clientY });
  }
  if (o.act === 'bed') world.house.stompAt = clock.t;
  if (!command(o, run)) return;
  if (o.act === 'walk') {
    ring(new THREE.Vector3(o.x, groundY(o.x, o.z), o.z));
    if (!run && Math.hypot(o.x - pet.pos.x, o.z - pet.pos.z) > 3 && Math.random() < 0.3) say('summon', { cool: 12 });
  } else flashTip(o, 1.0);
}
function touchAt(hit, vx, vy) {
  pet.creature.worldToLocal(pet.touch.local.copy(hit.point));
  pet.touch.on = true;
  pet.touch.vel.set(vx * 0.004, -vy * 0.004, 0).applyQuaternion(pet.inv);
  if (pet.touch.vel.length() > 1.4) pet.touch.vel.setLength(1.4);
}
function onMove(e) {
  ptr.hx = e.clientX; ptr.hy = e.clientY; ptr.hoverAt = clock.t;
  if (!ptr.down || e.pointerId !== ptr.id || !ptr.onPet) return;
  toNdc(e);
  const now = performance.now(), dtp = Math.max(1, now - ptr.lastT);
  const vx = (e.clientX - ptr.last.x) / dtp * 16, vy = (e.clientY - ptr.last.y) / dtp * 16;
  ptr.moved += Math.hypot(e.clientX - ptr.last.x, e.clientY - ptr.last.y);
  ptr.last.set(e.clientX, e.clientY); ptr.lastT = now;
  const hp = hitPet();
  if (!hp) { pet.touch.on = false; return; }
  touchAt(hp, vx, vy);
  if (ptr.moved > 14) {                    // stroking her hair
    her.contentUntil = clock.t + 0.7;
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

/* ───────────── the tile highlight: what a tap does, and where ───────────── */
// Desktop: a square on the block under the cursor (gold: her tool works there, red: it can't, faint: she just walks)
// with a label beside it. Phones: the same square on what she is on her way to do, and the label for a moment after a tap.
// Orders waiting in her queue get a square outline each.
let cellMark;
const queueMarks = [], MARK_COL = { act: 0xD6A446, walk: 0xF0EADC, no: 0xC8442F, info: 0xF0EADC };
function makeCellMarks() {
  cellMark = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.45, depthWrite: false }));
  cellMark.rotation.x = -Math.PI / 2; cellMark.visible = false; scene.add(cellMark);
  const outline = new THREE.RingGeometry(0.21, 0.27, 4, 1, Math.PI / 4); outline.rotateX(-Math.PI / 2);
  for (let i = 0; i <= QUEUE_MAX; i++) {
    const m = new THREE.Mesh(outline, new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.75, depthWrite: false }));
    m.visible = false; scene.add(m); queueMarks.push(m);
  }
}
const planKind = (o) => (o.no ? (o.info ? 'info' : 'no') : o.act === 'walk' ? 'walk' : 'act');
const markPos = (o) => (o.chase && o.ref?.root ? o.ref.root.position : { x: o.x, z: o.z });
function markAt(m, o, kind) {
  const p = markPos(o);
  m.position.set(p.x, groundY(p.x, p.z) + 0.03, p.z); m.material.color.setHex(MARK_COL[kind]); m.visible = true;
}
const tipEl = $('#tileTip');
let tipPlan = null, tipUntil = 0;
/** Shows a plan's label beside its target for a moment. */
function flashTip(o, secs) { tipPlan = o; tipUntil = clock.t + secs; if (o.no && !o.info) note(planLabel(o)); }
function tickMarks() {
  const cur = her.job?.o || her.order, hov = ptr.hoverPlan;
  const main = hov || (MOBILE ? cur : null);
  cellMark.visible = false;
  if (main && !main.spot && main.act !== 'nothing') {
    markAt(cellMark, main, planKind(main));
    cellMark.material.opacity = planKind(main) === 'walk' ? 0.14 : 0.45;
  }
  const waiting = [...(cur && !MOBILE ? [cur] : []), ...her.queue].filter((o) => o.act !== 'walk' && !o.spot);
  queueMarks.forEach((m, i) => { if (waiting[i]) markAt(m, waiting[i], 'act'); else m.visible = false; });
  const o = hov && hov.act !== 'walk' ? hov : clock.t < tipUntil ? tipPlan : null;
  tipEl.hidden = !o;
  if (!o) return;
  const p = markPos(o), s = screenOf(new THREE.Vector3(p.x, groundY(p.x, p.z) + (o.spot ? 1.6 : 0.4), p.z));
  const text = o.act === 'nothing' ? UI.act.nothing : planLabel(o);
  if (tipEl.textContent !== text) tipEl.textContent = text;
  tipEl.className = planKind(o);
  tipEl.style.transform = `translate(${Math.round(clamp(s.x + 14, 8, innerWidth - tipEl.offsetWidth - 8))}px, ${Math.round(s.y - 30)}px)`;
}

/* ───────────── dirt clods and water drops ───────────── */
const DIRT_GEO = new THREE.IcosahedronGeometry(1, 1);
const DIRT_MAT = new THREE.MeshStandardMaterial({ name: 'M_Dirt', color: 0x5a4030, roughness: 1, flatShading: true });
const DROP_MAT = new THREE.MeshStandardMaterial({ name: 'M_Drop', color: 0x8fc3d8, roughness: 0.2, transparent: true, opacity: 0.85, emissive: 0x2c4f55, emissiveIntensity: 0.4 });
/** A sparkle over a block, where the crop is. */
function sparkleAt(x, z) {
  const s = screenOf(new THREE.Vector3(x, groundY(x, z) + 0.3, z)); sparkle(s.x, s.y);
}
/** A few clods fly up where a tool hit. */
function dirtBurst(x, z, n) {
  const y = groundY(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(DIRT_GEO, DIRT_MAT); m.scale.setScalar(rand(0.04, 0.09)); m.castShadow = true;
    m.position.set(x + rand(-0.15, 0.15), y + 0.1, z + rand(-0.15, 0.15)); scene.add(m);
    world.clods.push({ m, v: new THREE.Vector3(rand(-1.1, 1.1), rand(2.2, 3.6), rand(-1.1, 1.1)), spin: rand(-12, 12), dead: 0, floor: y + 0.02 });
  }
}
/** Water drops rain on a block from the can (or splash up from the well as she fills it). */
function dropBurst(x, z, n, up = false) {
  const y = groundY(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(DIRT_GEO, DROP_MAT); m.scale.setScalar(rand(0.025, 0.045));
    m.position.set(x + rand(-0.18, 0.18), y + (up ? 0.5 : 0.75), z + rand(-0.18, 0.18)); scene.add(m);
    world.clods.push({ m, v: new THREE.Vector3(rand(-0.4, 0.4), up ? rand(1.5, 2.5) : rand(-0.5, 0.4), rand(-0.4, 0.4)), spin: 0, dead: 0, floor: y + 0.02 });
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

/* ───────────── icons: small pictures of the items and tools, drawn once at boot from their own models ───────────── */
function makeIcons(broomScene) {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(96, 96, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xFFF1E0, 0x7a4a2e, 1.5));
  const k = new THREE.DirectionalLight(0xFFF3DE, 2.4); k.position.set(-2, 3.5, 3); sc.add(k);
  const rm = new THREE.DirectionalLight(0xFFC98A, 0.9); rm.position.set(2.5, 1.5, -3); sc.add(rm);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 1.0, 2.6); cam.lookAt(0, 0, 0);
  /** One picture: the model turned a little, fitted to the frame. */
  const snap = (obj, tilt = 0, spin = 0.5) => {
    const pivot = new THREE.Group(), inner = new THREE.Group();
    obj.visible = true; inner.add(obj); inner.rotation.set(0, spin, tilt); pivot.add(inner); pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const s = 1.15 / (Math.max(size.x, size.y, size.z) || 1);
    pivot.scale.setScalar(s); pivot.position.copy(c).multiplyScalar(-s);
    sc.add(pivot); r.render(sc, cam); sc.remove(pivot);
    return r.domElement.toDataURL();
  };
  const out = {}, bagOf = { pumpkin: 0, cabbage: 1 };
  for (const c of CROP_KINDS) { out[c] = snap(makeCrop(c, 2)); out[`seed:${c}`] = snap(makeSeedBag(bagOf[c] ?? 0).group); }
  out.egg = snap(makeEgg(), 0.3);
  out.feed = snap(makeSeedBag(2).group);
  out.hen = snap(makeChicken(0).group, 0, 0.9);
  for (const b of FRIENDLY) out[`bug:${b}`] = snap(makeBug(THREE, b).group, 0, 0.9);
  out.shovel = out.steelShovel = snap(makeShovel().group, -Math.PI / 4, 0.3);
  out.can = out.bigCan = snap(makeCan().group, 0, -1.2);
  out.broom = snap(broomScene.clone(), -Math.PI / 4, 0.3);
  r.dispose(); r.forceContextLoss();
  return out;
}

/* ───────────── HUD: coins and bars, the bag and goal pills, the hotbar, the hint line ───────────── */
const fx = $('#fx');
function screenOf(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * (stage.clientWidth || innerWidth), y: (-p.y * 0.5 + 0.5) * (stage.clientHeight || innerHeight), behind: p.z > 1 };
}
const vitalEls = { mana: $('#vitalMana'), stamina: $('#vitalStamina') };
const slotEls = [...document.querySelectorAll('.slot')];
const hud = { coins: -1, bag: -1, goal: null, slots: '', msg: '', msgUntil: 0 };
/** One bar: the fill, the aria value, and a pulse when it runs low. */
function setVital(el, v) {
  const pct = Math.round(clamp(v, 0, 1) * 100);
  if (el._p === pct) return;
  el._p = pct;
  el.querySelector('i').style.width = pct + '%';
  el.classList.toggle('low', v < 0.25);
  el.setAttribute('aria-valuenow', String(pct));
}
/** Marks the tool in her hand on the hotbar. */
function showTool() { for (const b of slotEls) b.setAttribute('aria-checked', String(b.dataset.tool === S.tool)); }
/** Puts a tool in her hand (one of TOOLS). */
function setTool(name) {
  if (!TOOLS.includes(name) || S.tool === name) return;
  S.tool = name; showTool(); pet.holds(name); Sound.equip(); ptr.planAt = 0; save();
}
/** A message on the hint line for a few seconds (why she can't do something). */
function note(text, secs = 3) { hud.msg = text; hud.msgUntil = clock.t + secs; }
function tickHUD() {
  setVital(vitalEls.stamina, S.stamina); setVital(vitalEls.mana, S.mana);
  if (hud.coins !== S.coins) {
    const el = $('#coins');
    if (hud.coins >= 0) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    hud.coins = S.coins; $('#coinsN').textContent = S.coins;
  }
  const bag = Object.values(S.inv).reduce((a, b) => a + b, 0);
  if (hud.bag !== bag) { hud.bag = bag; $('#bagN').textContent = bag; }
  const g = nextGoal(S), gt = g ? fill(UI.goal.next, { goal: UI.goals[g.id] }) : UI.goal.allDone;
  if (hud.goal !== gt) { hud.goal = gt; $('#goalText').textContent = gt; }
  const slots = `${S.can}/${count(S, 'seed:pumpkin')}/${count(S, 'seed:cabbage')}`;
  if (hud.slots !== slots) {
    hud.slots = slots;
    for (const b of slotEls) {
      const c = b.querySelector('.count'); if (!c) continue;
      const n = b.dataset.tool === 'can' ? S.can : count(S, b.dataset.tool);
      c.textContent = n; c.classList.toggle('empty', !n);
    }
  }
  tickClock();
  // the hint line: a refusal just now, a pest at the crops, she is resting, or what the tool in her hand does
  const p = pests();
  hint(clock.t < hud.msgUntil ? hud.msg
    : her.mode === 'rest' ? fill(UI.resting, { n: Math.ceil(Math.max(0, her.restUntil - clock.t)) })
    : p.length && S.tool !== 'broom' ? UI.pestHint
    : UI.toolHint[S.tool]);
}
function refreshUI() {
  showTool();
  for (const b of slotEls) { const img = b.querySelector('img'); if (img && icons[b.dataset.tool]) img.src = icons[b.dataset.tool]; }
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
/** "+1 Pumpkin" rising from where she picked it up. */
function plusFx(x, z, kind) {
  const s = screenOf(new THREE.Vector3(x, groundY(x, z) + 0.6, z));
  spawnFx('plus', s.x - 20, s.y - 20, escHtml(fill(UI.plusItem, { item: itemName(kind) })), { '--dx': '0px' });
}
function zz() {
  const head = pet.pos.clone(); head.y += YAGA_H;
  const s = screenOf(head);
  spawnFx('zz', s.x + 14, s.y - 20, UI.sleepZ);
}

/** Scrolling zooms: out for a little more of the field, in towards a human view of her and the Box. */
function onWheel(e) {
  if (panelOpen()) return;
  e.preventDefault();
  zoomTarget = clamp(zoomTarget - e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015), ZOOM.min, ZOOM.max);
}
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
/** Keys: WASD or the arrows walk (Shift runs), 1–7 pick a tool, E or Space uses it on what is in front of her. */
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || panelOpen()) return;
  if (e.key === 'Shift') { keys.add('Shift'); return; }
  if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); Sound.init(); noteInput(); return; }
  if (e.repeat) return;
  const n = Number(e.key);
  if (n >= 1 && n <= TOOLS.length) { Sound.init(); noteInput(); setTool(TOOLS[n - 1]); return; }
  if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); Sound.init(); noteInput(); useFacing(); }
}
function onKeyUp(e) { keys.delete(e.code); if (e.key === 'Shift') keys.delete('Shift'); }
function bindUI() {
  const el = renderer.domElement;
  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => keys.clear());
  slotEls.forEach((b) => b.addEventListener('click', () => { Sound.init(); noteInput(); setTool(b.dataset.tool); b.blur(); }));
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', () => { ptr.hoverAt = -99; el.style.cursor = ''; });
  $('#sound').addEventListener('click', () => { Sound.init(); Sound.on = !Sound.on; S.sound = Sound.on; refreshUI(); save(); say(Sound.on ? 'unmute' : 'mute', { force: true }); });
  $('#bagPill').addEventListener('click', () => { Sound.init(); openBag(S); });
  $('#goalPill').addEventListener('click', () => { Sound.init(); openGoals(S); });
}

/* ───────────── the day: the clock runs while she is up and no panel is open ───────────── */
function tickDay(dt) {
  if (paused()) return;
  S.hour = Math.min(PASS_OUT, S.hour + dt / HOUR);
  const night = isNight(S.hour);
  if (night !== S.night) setNight(night);
  if (S.hour >= PASS_OUT && her.mode !== 'faint' && her.mode !== 'sleep') passOut();
}
function setNight(on) {
  S.night = on;
  if (on) {
    Sound.night(); say('night', { force: true }); later(4.5, () => boxReact('night', 0.6));
    if (S.pests.due < 0) S.pests.due = pestsDue(S);
    toast(S.pests.due ? UI.nightPests : UI.nightQuiet);
  }
  save();
}
// the clock in the top right: 24h dial (noon at the top), the time, and the day's number
const clockEl = { hand: $('#dialHand'), sun: $('#dialSun'), time: $('#clockTime'), day: $('#clockDay'), root: $('#clock') };
let clockShown = '';
function tickClock() {
  const f = (S.hour % 24) / 24, time = clockText(S.hour);
  clockEl.hand.setAttribute('transform', `rotate(${((f - 0.5) * 360).toFixed(1)} 20 20)`);
  const key = time + S.day + S.night;
  if (key === clockShown) return;
  clockShown = key;
  clockEl.time.textContent = time;
  clockEl.day.textContent = fill(UI.dayN, { n: S.day });
  clockEl.sun.setAttribute('fill', S.night ? '#F0EADC' : '#D6A446');
  clockEl.root.classList.toggle('night', S.night);
  clockEl.root.setAttribute('aria-label', fill(UI.clockAria, { time, day: S.day, phase: S.night ? UI.night : UI.day }));
}

/* ───────────── loop ───────────── */
let last = performance.now(), lastTick = 0, drawnOnce = false;
/** One step of the game: everything that plays, nothing that only draws. advance() runs just this; frame() runs it and draws. */
function simulate(dt) {
  clock.t += dt; phase.cycleT += dt;
  phase.n = ease(phase.n, S.night ? 1 : 0, 1.4, dt);
  tickTimers(); tickDay(dt);
  tickHer(dt);
  pet.update(dt, clock.t, camera);
  if (!pet.airborne) { const c = clampXZ(pet.pos.x, pet.pos.z); pet.pos.x = c.x; pet.pos.z = c.z; }
  tickBox(dt); Box.pet.update(dt, clock.t, camera);
  if (!Box.pet.airborne) { const c = clampXZ(Box.pet.pos.x, Box.pet.pos.z); Box.pet.pos.x = c.x; Box.pet.pos.z = c.z; }
  tickProps(dt); tickFarm(dt); tickHens(dt);
  tickMarker(dt);
}
function advance(sec) { for (let i = 0; i < sec * 30; i++) simulate(1 / 30); applyPhase(phase.n); tickHUD(); tickMarks(); tickTalk(clock.t); tickBoxTalk(clock.t); renderer.render(scene, camera); }
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(1 / 240, (now - last) / 1000)); last = now; lastTick = now;
  simulate(dt);
  applyPhase(phase.n);
  zoom = ease(zoom, zoomTarget, 7, dt);
  followCamera(1 - Math.exp(-2.2 * dt));
  tickHover(dt);
  tickHouse(dt, clock.t);
  tickHUD(); tickMarks();
  tickTalk(clock.t);
  tickBoxTalk(clock.t);
  renderer.render(scene, camera);
  if (!drawnOnce) { drawnOnce = true; hide(); }   // her first frame is drawn: fade the loading screen
}
function start() {
  const loop = () => { requestAnimationFrame(loop); frame(); };
  requestAnimationFrame(loop);
  // rAF can stall in embedded or background frames; keep time moving
  setInterval(() => { if (!document.hidden && performance.now() - lastTick > 120) frame(); }, 60);
}

boot().catch((err) => {
  console.error(err);
  hide();
  const m = document.createElement('p'); m.id = 'oops';
  // these two texts stay here, not in words/en.json: they must work when the words (or any game file) fail to load
  m.textContent = err.message === 'WebGL2 required'
    ? 'Yaga needs WebGL 2 to wake up. Try opening this page in Chrome or Safari.'
    : 'Yaga could not load her game files. Try reloading the page.';
  document.body.appendChild(m);
});
