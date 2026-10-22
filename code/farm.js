// The farm: what the shovel can do to a block, and the crops that grow on it.
// Action times are in seconds from the start; `beats` are the moments the shovel hits the ground and
// `dirt` is how many clods fly up on each one.
import * as THREE from './lib/three.module.js';
import SET from '../settings.js';

/** The things she does with the shovel. `clip` is one of her animations, `doneAt` is when the result lands. */
export const FARM = {
  dig: { cost: SET.farm.digCost, clip: 'swing', dur: 2.4, beats: [0.5, 1.0, 1.5, 2.0], doneAt: 2.2, dirt: 6 },
  plant: { cost: SET.farm.plantCost, clip: 'bow', dur: 1.6, beats: [0.8], doneAt: 1.0, dirt: 3 },
  harvest: { cost: SET.farm.harvestCost, clip: 'swing', dur: 1.8, beats: [0.5, 1.0], doneAt: 1.2, dirt: 5 },
  grow: { cost: 0, mana: SET.farm.growMana, clip: 'cast_a_spell', dur: 2.2, beats: [], doneAt: 1.5 },    // the Grow spell: mana ripens a crop at once
  egg: { cost: 0, clip: 'bow', dur: 1.3, beats: [], doneAt: 0.8 },                         // picking up an egg
};

export const CROPS = ['pumpkin', 'cabbage'];
export const GROW = { young: SET.farm.youngAfter, ripe: SET.farm.ripeAfter };   // seconds after planting

/** How grown a plot's crop is: 0 sprout, 1 young, 2 ripe. `plot.at` is when it was planted (ms). */
export function stageOf(plot, now = Date.now()) {
  const s = (now - plot.at) / 1000;
  return s >= GROW.ripe ? 2 : s >= GROW.young ? 1 : 0;
}

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: color, emissiveIntensity: 0.05 });
const LEAF = 0x587a35, LEAF_LIGHT = 0x7f9f4c, STEM = 0x4b5632, ORANGE = 0xd2762a, ORANGE_DARK = 0xb85f1f;

/** A crop at a growth stage, built from boxes, standing on the ground at the origin (a block is 0.5 m wide). */
export function makeCrop(kind, stage) {
  const g = new THREE.Group();
  const box = (w, h, d, color, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  const leaves = (n, size, y, color) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; box(size, 0.02, size * 0.5, color, Math.cos(a) * size * 0.5, y, Math.sin(a) * size * 0.5, -a); } };
  if (kind === 'pumpkin') {
    if (stage === 0) { box(0.03, 0.1, 0.03, STEM, 0, 0.05, 0); leaves(2, 0.12, 0.1, LEAF); }
    else if (stage === 1) { leaves(4, 0.2, 0.06, LEAF); box(0.12, 0.1, 0.12, LEAF_LIGHT, 0, 0.06, 0); box(0.03, 0.06, 0.03, STEM, 0, 0.13, 0); }
    else {
      leaves(4, 0.2, 0.04, LEAF);
      box(0.3, 0.2, 0.3, ORANGE, 0, 0.12, 0); box(0.3, 0.2, 0.3, ORANGE_DARK, 0, 0.12, 0, Math.PI / 4);   // two turned boxes make a round pumpkin
      box(0.05, 0.09, 0.05, STEM, 0, 0.27, 0);
    }
  } else {
    if (stage === 0) box(0.08, 0.06, 0.08, LEAF_LIGHT, 0, 0.03, 0);
    else if (stage === 1) { box(0.26, 0.02, 0.26, LEAF, 0, 0.03, 0); box(0.16, 0.12, 0.16, LEAF_LIGHT, 0, 0.1, 0); }
    else {
      box(0.36, 0.04, 0.36, LEAF, 0, 0.03, 0); box(0.3, 0.18, 0.3, LEAF_LIGHT, 0, 0.14, 0);
      box(0.2, 0.12, 0.2, 0x9cba62, 0, 0.27, 0); box(0.1, 0.05, 0.1, 0xc2d98a, 0, 0.34, 0);
    }
  }
  return g;
}
