// The goal list: small milestones that point the way, in the order the game suggests them.
// Each is done when `done(S)` holds; its words are ui.goals.<id> in words/en.json, its coin reward settings.goals.<id>.
import SET from '../settings.js';

export const GOALS = [
  { id: 'dig', done: (S) => S.stats.dug >= 1 },
  { id: 'plant', done: (S) => S.stats.planted >= 1 },
  { id: 'water', done: (S) => S.stats.watered >= 1 },
  { id: 'harvest', done: (S) => S.stats.harvested >= 1 },
  { id: 'sell', done: (S) => S.stats.sold >= 1 },
  { id: 'coins100', done: (S) => S.stats.earned >= 100 },
  { id: 'egg', done: (S) => S.stats.eggs >= 1 },
  { id: 'pest', done: (S) => S.stats.swatted >= 1 },
  { id: 'bugs', done: (S) => S.stats.caught.length >= 3 },
  { id: 'bigCan', done: (S) => S.up.bigCan },
  { id: 'field', done: (S) => S.plots.filter((p) => p.crop).length >= 12 },
  { id: 'hens', done: (S) => S.hens >= 4 },
  { id: 'coins1000', done: (S) => S.stats.earned >= 1000 },
].map((g) => ({ ...g, reward: SET.goals[g.id] || 0 }));

/** Marks the goals that have just been reached and pays their rewards. Returns them (usually none). */
export function reached(S) {
  const out = [];
  for (const g of GOALS) {
    if (S.goals.includes(g.id) || !g.done(S)) continue;
    S.goals.push(g.id); S.coins += g.reward; out.push(g);
  }
  return out;
}

/** The first goal not reached yet, or null when all are. */
export const nextGoal = (S) => GOALS.find((g) => !S.goals.includes(g.id)) || null;
