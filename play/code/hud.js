// The screen's panels and short messages: the market stall, her bag, the goal list, the bed and the morning summary
// (one at a time in #panel, index.html), toasts, and the hint line over the hotbar. While a panel is open the
// game clock stands still (app.js asks panelOpen()). Every text comes from words/en.json, handed over in initHud().
import { held, count, sellPrice, sell, OFFERS, canBuy, buy, canHolds } from './inventory.js';
import { GOALS, nextGoal } from './goals.js';
import { CROPS } from './farm.js';
import SET from '../settings.js';

const $ = (s) => document.querySelector(s);
const root = $('#panel'), card = root.querySelector('.card');
let UI, icon, itemName, open = null, onClose = null;

/** Fills the {name} slots of a template. */
export const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
/** A [one, many] pair of lines: the one that fits n. */
export const plural = (pair, n) => fill(pair[n === 1 ? 0 : 1], { n });

/** `ui` is the words file's ui section; `icons(kind)` gives an item's picture (a data URL); `name(kind)` its name. */
export function initHud(ui, icons, name) {
  UI = ui; icon = icons; itemName = name;
  root.addEventListener('pointerdown', (e) => { if (e.target === root) closePanel(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && open !== 'summary') closePanel(); });
}
export const panelOpen = () => open;

function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function button(text, cls, onClick, disabled = false) {
  const b = h('button', cls, text);
  b.disabled = disabled;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}
const pic = (kind) => { const i = h('img', 'pic'); i.src = icon(kind) || ''; i.alt = ''; return i; };

/** Shows one panel: a title, a close button (unless `locked`), and its body. */
function show(kind, title, body, { locked = false, then = null } = {}) {
  open = kind; onClose = then;
  const head = h('header', null, h('h2', null, title));
  if (!locked) head.append(button('×', 'x', closePanel));
  if (!locked) head.lastChild.setAttribute('aria-label', UI.close);
  card.replaceChildren(head, body);
  root.hidden = false;
  card.querySelector('.go, .row button:not(:disabled)')?.focus({ preventScroll: true });
}
export function closePanel() {
  if (!open) return;
  root.hidden = true; open = null;
  const f = onClose; onClose = null;
  if (f) f();
}

/* ── the market stall: sell on one tab, buy on the other ── */
/** `on.sold(coins)` and `on.bought(offer, n)` let app.js react (sounds, words, a new hen). */
export function openStall(S, on, tab = 'sell') {
  const coins = h('p', 'coins', fill(UI.stall.coins, { n: S.coins }));
  const tabs = h('div', 'tabs',
    button(UI.stall.sell, tab === 'sell' ? 'on' : '', () => openStall(S, on, 'sell')),
    button(UI.stall.buy, tab === 'buy' ? 'on' : '', () => openStall(S, on, 'buy')));
  const list = h('div', 'list');
  if (tab === 'sell') {
    const kinds = held(S).filter((k) => sellPrice(k) > 0);
    if (!kinds.length) list.append(h('p', 'empty', UI.stall.nothing));
    for (const k of kinds) {
      const n = count(S, k), p = sellPrice(k);
      const doSell = (m) => { on.sold(sell(S, k, m)); openStall(S, on, 'sell'); };
      list.append(h('div', 'row', pic(k), h('span', 'name', itemName(k), h('small', null, fill(UI.stall.each, { n: p }))),
        h('b', 'n', `×${n}`), button(UI.stall.sellOne, '', () => doSell(1)), button(UI.stall.sellAll, '', () => doSell(n), n < 2)));
    }
    const total = kinds.reduce((s, k) => s + sellPrice(k) * count(S, k), 0);
    if (kinds.length > 1) list.append(button(fill(UI.stall.sellEverything, { n: total }), 'go', () => {
      let got = 0; for (const k of kinds) got += sell(S, k, count(S, k));
      on.sold(got); openStall(S, on, 'sell');
    }));
  } else {
    for (const o of OFFERS) {
      const left = o.max ? o.max(S) : Infinity;
      const info = h('small', null, offerInfo(o, S));
      const row = h('div', 'row', pic(o.id), h('span', 'name', itemName(o.id), info), h('b', 'n', fill(UI.stall.price, { n: o.price })));
      const doBuy = (m) => { if (buy(S, o, m)) on.bought(o, m); openStall(S, on, 'buy'); };
      if (left <= 0) row.append(h('span', 'done', o.id === 'hen' ? UI.stall.coopFull : UI.stall.owned));
      else {
        if (o.id.startsWith('seed:') || o.id === 'feed') row.append(h('b', 'have', fill(UI.stall.have, { n: count(S, o.id) })));
        row.append(button(UI.stall.buyOne, '', () => doBuy(1), !canBuy(S, o)));
        if (o.bulk) row.append(button(fill(UI.stall.buyMany, { n: o.bulk }), '', () => doBuy(o.bulk), !canBuy(S, o, o.bulk)));
      }
      list.append(row);
    }
  }
  show('stall', UI.stall.title, h('div', 'body', coins, tabs, list));
}
function offerInfo(o, S) {
  const I = UI.itemInfo;
  if (o.id.startsWith('seed:')) { const c = CROPS[o.id.slice(5)]; return fill(I.seed, { days: c.days, sell: c.sell }); }
  if (o.id === 'hen') return fill(I.hen, { n: S.hens, most: SET.hens.most });
  if (o.id === 'bigCan') return fill(I.bigCan, { n: SET.can.bigHolds, m: SET.can.holds });
  return I[o.id];
}

/* ── her bag ── */
export function openBag(S) {
  const list = h('div', 'list');
  const kinds = held(S);
  if (!kinds.length) list.append(h('p', 'empty', UI.bag.empty));
  for (const k of kinds) {
    const p = sellPrice(k);
    list.append(h('div', 'row', pic(k), h('span', 'name', itemName(k), p ? h('small', null, fill(UI.stall.each, { n: p })) : null), h('b', 'n', `×${count(S, k)}`)));
  }
  list.append(h('p', 'note', fill(UI.bag.can, { n: S.can, m: canHolds(S) })));
  show('bag', UI.bag.title, h('div', 'body', h('p', 'coins', fill(UI.stall.coins, { n: S.coins })), list));
}

/* ── the goal list ── */
export function openGoals(S) {
  const list = h('ol', 'goals');
  const next = nextGoal(S);
  for (const g of GOALS) {
    const done = S.goals.includes(g.id);
    list.append(h('li', done ? 'done' : g === next ? 'next' : '', h('span', 'tick', done ? '✓' : ''), h('span', 'name', UI.goals[g.id]),
      g.reward ? h('small', null, fill(UI.goal.reward, { n: g.reward })) : null));
  }
  show('goals', UI.goal.title, h('div', 'body', list));
}

/* ── bed ── */
export function openBed(early, time, onSleep) {
  const body = h('div', 'body', h('p', null, fill(early ? UI.bed.early : UI.bed.late, { time })),
    h('div', 'actions', button(UI.bed.stay, '', closePanel), button(UI.bed.sleep, 'go', () => { closePanel(); onSleep(); })));
  show('bed', UI.bed.title, body);
}

/* ── the morning summary ── */
/** `r` is what endDay() in day.js reports. */
export function openSummary(r, S, onStart) {
  const M = UI.summary, lines = [];
  if (r.passedOut) lines.push(fill(M.passedOut, { n: Math.round(S.stamina * 100) }));
  if (r.sold) lines.push(fill(plural(M.earned, r.sold), { coins: r.earned }));
  if (r.eaten.length) lines.push(plural(M.eaten, r.eaten.length));
  if (r.grew) lines.push(plural(M.grew, r.grew));
  if (r.ripened) lines.push(plural(M.ripened, r.ripened));
  if (r.dry) lines.push(plural(M.dry, r.dry));
  if (r.eggs) lines.push(plural(M.eggs, r.eggs));
  if (r.hungry) lines.push(plural(M.hungry, r.hungry));
  if (r.reverted.length) lines.push(plural(M.reverted, r.reverted.length));
  if (!lines.length) lines.push(M.quiet);
  const g = nextGoal(S);
  const body = h('div', 'body', h('ul', 'summary', ...lines.map((l) => h('li', null, l))),
    g ? h('p', 'note', fill(UI.goal.next, { goal: UI.goals[g.id] })) : null,
    h('div', 'actions', button(fill(M.start, { day: S.day }), 'go', closePanel)));
  show('summary', fill(M.title, { day: S.day }), body, { locked: true, then: onStart });
}

/* ── toasts and the hint line ── */
const toasts = $('#toasts');
/** A short message that slides in at the top and fades by itself. `kind` styles it: 'goal', 'coins' or none. */
export function toast(text, kind = '') {
  const t = h('div', `toast ${kind}`, text);
  t.addEventListener('animationend', () => t.remove());
  toasts.append(t);
  while (toasts.children.length > 3) toasts.firstChild.remove();
}
const hintEl = $('#hint');
/** The line over the hotbar: what the tool does, or what a tap will do. */
export function hint(text) { if (hintEl.textContent !== text) hintEl.textContent = text; }
