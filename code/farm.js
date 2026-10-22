// The farm: what the shovel can do to a block, and the crops that grow on it.
// Action times are in seconds from the start; `beats` are the moments the shovel hits the ground and
// `dirt` is how many clods fly up on each one.
import SET from '../settings.js';
import { buildBoxModel } from './box-model.js';

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

/** A crop at a growth stage, standing on the ground at the origin (a block is 0.5 m wide). Its boxes are in assets/models/plants/pumpkin.json and cabbage.json. */
export function makeCrop(kind, stage) {
  return buildBoxModel(`plants/${kind}`, 0, stage).group;
}
