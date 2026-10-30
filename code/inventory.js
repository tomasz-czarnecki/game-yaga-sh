// Her things and her money: items stack in S.inv ({ kind: count }), coins in S.coins.
// Item kinds: the crops ('pumpkin', 'cabbage'), 'egg', seeds ('seed:pumpkin'), 'feed', and caught bugs ('bug:ladybug').
// The stall buys what she grows and sells her seeds, feed, hens and two tool upgrades.
import SET from '../settings.js';
import { CROPS, CROP_KINDS } from './farm.js';

/** What the stall pays for one of a kind (0: it doesn't buy it). */
export function sellPrice(kind) {
  if (CROPS[kind]) return CROPS[kind].sell;
  if (kind === 'egg') return SET.shop.egg;
  if (kind.startsWith('bug:')) return SET.shop.bugs[kind.slice(4)] || 0;
  return 0;
}

export const count = (S, kind) => S.inv[kind] || 0;
export function add(S, kind, n = 1) { S.inv[kind] = count(S, kind) + n; }
/** Takes n of a kind if she has them; false if she doesn't. */
export function take(S, kind, n = 1) {
  if (count(S, kind) < n) return false;
  S.inv[kind] -= n;
  if (!S.inv[kind]) delete S.inv[kind];
  return true;
}
/** The kinds she holds, in a steady order: crops, eggs, bugs, then seeds and feed. */
export function held(S) {
  const rank = (k) => (CROPS[k] ? 0 : k === 'egg' ? 1 : k.startsWith('bug:') ? 2 : k.startsWith('seed:') ? 3 : 4);
  return Object.keys(S.inv).filter((k) => S.inv[k] > 0).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
/** Sells n of a kind at the stall; returns the coins it made. */
export function sell(S, kind, n) {
  const price = sellPrice(kind);
  n = Math.min(n, count(S, kind));
  if (!price || !n) return 0;
  take(S, kind, n);
  S.coins += price * n; S.stats.earned += price * n; S.stats.sold += n; S.today.earned += price * n; S.today.sold += n;
  return price * n;
}

/** What the stall sells. `max(S)`: how many more she may buy (upgrades once, hens up to the coop's size). */
export const OFFERS = [
  ...CROP_KINDS.map((c) => ({ id: `seed:${c}`, price: CROPS[c].seed, bulk: 5 })),
  { id: 'feed', price: SET.shop.feed, bulk: 5 },
  { id: 'hen', price: SET.hens.price, max: (S) => SET.hens.most - S.hens },
  { id: 'bigCan', price: SET.can.bigPrice, max: (S) => (S.up.bigCan ? 0 : 1) },
  { id: 'steelShovel', price: SET.shovel.steelPrice, max: (S) => (S.up.steelShovel ? 0 : 1) },
];
export const canBuy = (S, o, n = 1) => S.coins >= o.price * n && (!o.max || o.max(S) >= n);
/** Pays for n of an offer and hands it over. Items go in her bag; a hen or an upgrade is for app.js to bring in. */
export function buy(S, o, n = 1) {
  if (!canBuy(S, o, n)) return false;
  S.coins -= o.price * n;
  if (o.id === 'hen') S.hens += n;
  else if (o.id === 'bigCan') { S.up.bigCan = true; S.can = SET.can.bigHolds; }
  else if (o.id === 'steelShovel') S.up.steelShovel = true;
  else add(S, o.id, n);
  return true;
}
/** How many waterings the can holds now. */
export const canHolds = (S) => (S.up.bigCan ? SET.can.bigHolds : SET.can.holds);
