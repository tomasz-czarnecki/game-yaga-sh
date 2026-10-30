// The game clock and the night. Time is game hours in S.hour: a day runs from wakeHour (6:00) to passOutHour
// the next morning (2:00 is 26 here). It moves only while the game runs, and stands still while a panel is open.
// A day ends when she goes to bed in the hut or passes out at 2:00; endDay() then works out the night.
import SET from '../settings.js';
import { overnight, atRisk } from './farm.js';

export const HOUR = SET.day.length / 24;                    // seconds in one game hour
export const WAKE = SET.day.wakeHour;
export const DUSK = SET.day.nightStarts;
export const PASS_OUT = 24 + SET.day.passOutHour;
const P = SET.pests;

export const isNight = (h) => h >= DUSK || h < WAKE;
/** 13.4 → "13:20" (to ten minutes, like the HUD shows it). */
export function clockText(h) {
  const m = Math.floor((h % 24) * 60), pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(Math.floor((m % 60) / 10) * 10)}`;
}

/** How many pests come tonight: none if no crop is at risk, more the more crops are. */
export function pestsDue(S) {
  const n = S.plots.filter(atRisk).length;
  return n ? Math.min(P.most, P.perNight + Math.floor(n / P.perCrops)) : 0;
}

/** The night passes. `pending` is how many pests are still out there or had yet to come: each eats a crop at risk
 *  (dry or ripe) before morning. Then watered crops grow, the soil dries, fed hens lay, and a new day starts.
 *  Changes S and returns what happened for the morning summary; app.js redraws the field from it. */
export function endDay(S, { passedOut = false, pending = 0 } = {}) {
  const r = { day: S.day, passedOut, eaten: [], eggs: 0, hungry: 0, earned: S.today.earned, sold: S.today.sold };
  for (let i = 0; i < pending; i++) {
    const prey = S.plots.filter(atRisk);
    if (!prey.length) break;
    const p = prey[(Math.random() * prey.length) | 0];
    r.eaten.push({ x: p.x, z: p.z, crop: p.crop });
    p.crop = null; p.growth = 0;
  }
  Object.assign(r, overnight(S.plots));
  S.plots = S.plots.filter((p) => !r.reverted.includes(p));
  r.eggs = Math.min(S.hens, S.trough); r.hungry = S.hens - r.eggs; S.trough -= r.eggs;
  S.day++; S.hour = WAKE; S.pests = { due: -1, came: 0 };
  S.stamina = passedOut ? SET.her.passOutStamina : 1;
  S.mana = Math.min(1, S.mana + SET.mana.sleep);
  S.today = { earned: 0, sold: 0 };
  return r;
}
