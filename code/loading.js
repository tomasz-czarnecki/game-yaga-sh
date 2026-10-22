// The loading screen (#loading in index.html): a progress bar, the file loading now, and the last few that finished.
// Vercel compresses every file and sends no size, so a model's size comes from boot() (rough, only for the bar).
// Its texts stay here and in index.html, not in words/en.json: they show before the words have loaded.
const el = document.querySelector('#loading');
const bar = el.querySelector('.bar'), fill = bar.querySelector('i'), pct = el.querySelector('.pct');
const now = el.querySelector('.now'), size = el.querySelector('.size'), tally = el.querySelector('.tally'), list = el.querySelector('.files');
const CODE = 2.5e6;          // three.js and the game code: already here when this runs
const SMALL = 2e4;           // what one JSON file counts for on the bar
const files = [], finished = [];
let queued = false;

const mb = (b) => (b / 1e6).toFixed(1);
const short = (url) => url.replace(/^\.\/(assets\/)?/, '');

function track(url, bytes) {
  const f = { name: short(url), bytes, got: 0, unpacking: false, done: false };
  files.push(f); redraw();
  return f;
}
function finish(f) { f.done = true; finished.push(f.name); redraw(); }
// timers, not requestAnimationFrame: rAF can stall in an embedded or hidden frame, and then loading would never finish
function redraw() { if (!queued) { queued = true; setTimeout(draw, 50); } }

function draw() {
  queued = false;
  bar.classList.remove('wait');
  const total = CODE + files.reduce((s, f) => s + f.bytes, 0);
  const got = CODE + files.reduce((s, f) => s + (f.done ? f.bytes : Math.min(f.got, f.bytes * 0.99)), 0);
  const p = Math.floor((100 * got) / total);
  fill.style.width = `${p}%`; pct.textContent = `${p}%`;
  const big = files.filter((f) => !f.done).sort((a, b) => b.bytes - a.bytes)[0];
  if (big) {
    now.textContent = big.name;
    size.textContent = big.unpacking ? 'unpacking…' : big.bytes > SMALL ? `${mb(big.got)} of ${mb(big.bytes)} MB` : '';
  }
  tally.textContent = `${finished.length} of ${files.length} files`;
  list.replaceChildren(...finished.slice(-4).map((name) => Object.assign(document.createElement('li'), { textContent: `✓ ${name}` })));
}

/** Fetches a JSON file and ticks it off; a typo in it names the file in the error. */
export function getJSON(url) {
  const f = track(url, SMALL);
  return fetch(url).then((r) => r.json()).then((json) => { finish(f); return json; }, (e) => { throw new Error(`${url}: ${e.message}`); });
}

/** Loads a .glb with the bar following it: downloads it, then unpacks it (which takes a while for her model on a phone).
 *  `mbSize` is its rough size in MB, used when the server sends none. */
export async function loadGLB(loader, url, mbSize) {
  const f = track(url, mbSize * 1e6);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  const sent = Number(res.headers.get('Content-Length'));
  if (sent) f.bytes = sent;
  const reader = res.body.getReader(), parts = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) { parts.push(r.value); f.got += r.value.byteLength; redraw(); }
  f.unpacking = true; redraw();
  const gltf = await loader.parseAsync(await new Blob(parts).arrayBuffer(), url.replace(/[^/]*$/, ''));
  finish(f);
  return gltf;
}

/** The last step: shows "Building her world…" and resolves once that is on screen, before the heavy setup starts. */
export function building() {
  now.textContent = 'Building her world…'; size.textContent = '';
  return new Promise((resolve) => setTimeout(resolve, 50));     // a moment free for the browser to paint it
}

/** Fades the loading screen out (frame() in app.js calls it once her first frame has been drawn). */
export function hide() { el.classList.add('gone'); }
