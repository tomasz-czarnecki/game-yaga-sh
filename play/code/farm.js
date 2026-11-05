// The farm's rules: what each action does to a plot, how crops grow (one stage of a day per watered morning),
// and what the night does to the field. Plots are plain saved data in S.plots:
//   { x, z, was, crop, growth, watered, bare }   was: the block it was dug from; growth: watered mornings so far;
//   bare: mornings it has lain dug with nothing planted.
// app.js draws the plots and walks her to them; this file only decides.
import SET from '../settings.js';
import { buildBoxModel } from './box-model.js';

/** The things she does on the farm. `clip` is one of her animations, played from `from` seconds into it for `dur`
 *  seconds; `doneAt` is when the result lands; `beats` are the moments a tool hits the ground and `dirt` how many
 *  clods (or drops) fly up on each one. `reach` is how far from the target she stands. */
export const FARM = {
  dig: { clip: 'swing', dur: 1.5, beats: [0.45, 1.05], doneAt: 1.2, dirt: 6, reach: 1.0 },
  plant: { clip: 'bow', from: 0.9, dur: 1.1, beats: [0.55], doneAt: 0.6, dirt: 3, reach: 0.85 },
  water: { clip: 'bow', from: 0.9, dur: 1.1, beats: [0.45, 0.7], doneAt: 0.65, drops: 7, reach: 0.9 },
  harvest: { clip: 'bow', from: 0.9, dur: 1.1, beats: [0.5], doneAt: 0.6, dirt: 4, reach: 0.85 },
  grow: { clip: 'cast_a_spell', dur: 2.2, beats: [], doneAt: 1.5, reach: 1.1 },   // the Grow spell
  pick: { clip: 'bow', from: 0.9, dur: 1.0, beats: [], doneAt: 0.6, reach: 0.7 },   // picking up an egg
  catch: { clip: 'football_catch', dur: 1.1, beats: [], doneAt: 0.45, reach: 0.9 }, // catching a bug
  fill: { clip: 'bow', from: 0.9, dur: 1.2, beats: [0.5, 0.8], doneAt: 0.9, drops: 5, reach: 1.1 },   // filling the can
  feed: { clip: 'bow', from: 0.9, dur: 1.1, beats: [], doneAt: 0.6, reach: 1.0 },   // the hens' trough
  pet: { clip: 'agree', dur: 1.2, beats: [], doneAt: 0.4, reach: 0.9 },            // stroking a hen
};

export const CROPS = SET.crops;
export const CROP_KINDS = Object.keys(CROPS);

/** A crop that has had all its watered mornings. */
export const ripe = (p) => !!p.crop && p.growth >= CROPS[p.crop].days;
/** How grown a plot's crop looks: 0 sprout, 1 young (halfway), 2 ripe. */
export function stageOf(p) {
  const days = CROPS[p.crop].days;
  return p.growth >= days ? 2 : p.growth >= Math.ceil(days / 2) ? 1 : 0;
}
/** Mornings left until it is ripe, if it is watered every day. */
export const daysLeft = (p) => Math.max(0, CROPS[p.crop].days - p.growth);
/** Pests go for crops that are dry or ripe; a watered, growing crop is safe. */
export const atRisk = (p) => !!p.crop && (!p.watered || ripe(p));

/** A freshly dug plot. */
export const newPlot = (x, z, was) => ({ x, z, was, crop: null, growth: 0, watered: false, bare: 0 });

/** The night passes for the field: watered crops grow a day, every plot dries, and dug soil left bare too long
 *  turns back. Returns what happened, for the morning summary; `reverted` lists the plots to give back to the map. */
export function overnight(plots) {
  const r = { grew: 0, ripened: 0, dry: 0, reverted: [] };
  for (const p of plots) {
    if (p.crop) {
      if (p.watered && !ripe(p)) {
        p.growth++; r.grew++;
        if (ripe(p)) r.ripened++;
      } else if (!p.watered && !ripe(p)) r.dry++;
      p.bare = 0;
    } else if (++p.bare > SET.soil.bareDays) r.reverted.push(p);
    p.watered = false;
  }
  return r;
}

/** A crop at a growth stage, standing on the ground at the origin, drawn for a 0.5 m block (the game scales it to the real block size). Its boxes are in assets/models/plants/pumpkin.json and cabbage.json. */
export function makeCrop(kind, stage) {
  return buildBoxModel(`plants/${kind}`, 0, stage).group;
}
