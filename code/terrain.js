// Box terrain for the Yaga game: a grid of columns described by assets/world/home.json, the format a future
// generator writes too. How each kind of block looks is in assets/world/blocks/<kind>.json. One merged mesh holds every visible top and side; water is its own mesh.
// Heights in the JSON count blocks of `step` metres; everything here works in world metres.
import * as THREE from './lib/three.module.js';

// The colours are dark fantasy, drawn from her clothes: umber earth, moss like her skirt, charcoal like her hoodie.
// Dirt's top matches DAY.ground in app.js (the night tint is worked out from it).
const BLOCKS = ['dirt', 'grass', 'field', 'road', 'sand', 'stone', 'farmland'];   // solid kinds; water is a surface, not a block
let PALETTE, WATER;

/** Fetches how each block looks; call at boot, before loadWorld. A new kind needs its file and a place in BLOCKS. */
export async function loadBlocks() {
  const read = (name) => fetch(`./assets/world/blocks/${name}.json`).then((r) => r.json())
    .catch((e) => { throw new Error(`assets/world/blocks/${name}.json: ${e.message}`); });   // say which file has the typo
  const [water, ...solid] = await Promise.all(['water', ...BLOCKS].map(read));
  PALETTE = Object.fromEntries(BLOCKS.map((name, i) => [name, {
    top: new THREE.Color(solid[i].top), top2: new THREE.Color(solid[i].top2 ?? solid[i].top), side: new THREE.Color(solid[i].side),
  }]));
  WATER = { color: new THREE.Color(water.colour), opacity: water.opacity, drop: water.drop };   // surface sits `drop` below the shore
}
const OUTER = 130;                                  // flat dirt beyond the map reaches this far
let grid = null;

/** Reads the world JSON: per cell its type, solid top (metres) and water surface (NaN where dry).
 *  `spawn` {x, z} is where the walkable area starts: dry cells joined to it by steps of at most one block. */
export function loadWorld({ cell, step, origin, legend, tiles, heights }, spawn) {
  const rows = tiles.length, cols = tiles[0].length, n = rows * cols;
  const kind = new Array(n), top = new Float32Array(n), surface = new Float32Array(n).fill(NaN);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i, name = legend[tiles[j][i]], h = parseInt(heights[j][i], 36) * step;
      const wet = name === 'water';
      kind[k] = wet ? 'sand' : name;                // a pond's bed is sand, one block under the shore
      top[k] = wet ? h - step : h;
      if (wet) surface[k] = h - WATER.drop;
    }
  }
  grid = { cell, step, ox: origin.x, oz: origin.z, cols, rows, kind, top, surface };
  grid.reach = floodFill(cellAt(spawn.x, spawn.z));
}

function cellAt(x, z) {
  const i = Math.floor((x - grid.ox) / grid.cell), j = Math.floor((z - grid.oz) / grid.cell);
  return i < 0 || j < 0 || i >= grid.cols || j >= grid.rows ? -1 : j * grid.cols + i;
}

/** Marks every dry cell reachable from `start` by 4-neighbour steps of at most one block up or down. */
function floodFill(start) {
  const { cols, rows, top, surface, step } = grid;
  const reach = new Uint8Array(cols * rows), queue = [start];
  reach[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % cols, j = (k / cols) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, n = b * cols + a;
      if (a < 0 || b < 0 || a >= cols || b >= rows || reach[n] || !Number.isNaN(surface[n])) continue;
      if (Math.abs(top[n] - top[k]) > step) continue;
      reach[n] = 1; queue.push(n);
    }
  }
  return reach;
}

/** Can she stand here? Beyond the map, always (bugs on their way out cross it). */
export function walkable(x, z) {
  const k = cellAt(x, z);
  return k < 0 || grid.reach[k] === 1;
}

const SAMPLE = 0.125;                               // metres between checks along a line
const AHEAD = 12;                                   // path cells looked at when picking the next waypoint
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const cellCentre = (k) => ({ x: grid.ox + ((k % grid.cols) + 0.5) * grid.cell, z: grid.oz + (Math.floor(k / grid.cols) + 0.5) * grid.cell });

/** True if walking straight from a to b stays on walkable ground and never steps more than one block. */
function clearLine(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / SAMPLE);
  let prev = groundY(ax, az);
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n, y = groundY(x, z);
    if (!walkable(x, z) || Math.abs(y - prev) > grid.step) return false;
    prev = y;
  }
  return true;
}

/** Can she step from cell k onto cell n? */
const stepOk = (k, n) => grid.reach[n] === 1 && Math.abs(grid.top[n] - grid.top[k]) <= grid.step;

/** The shortest 8-neighbour path of cell indices from `from` to `to` (corners aren't cut), or null. */
function findPath(from, to) {
  const { cols, rows } = grid, prev = new Int32Array(cols * rows).fill(-1), queue = [from];
  prev[from] = from;
  for (let q = 0; q < queue.length && prev[to] < 0; q++) {
    const k = queue[q], i = k % cols, j = (k / cols) | 0;
    for (const [di, dj] of NEIGHBOURS) {
      const a = i + di, b = j + dj, n = b * cols + a;
      if (a < 0 || b < 0 || a >= cols || b >= rows || prev[n] >= 0 || !stepOk(k, n)) continue;
      if (di && dj && !(stepOk(k, j * cols + a) && stepOk(k, b * cols + i))) continue;
      prev[n] = k; queue.push(n);
    }
  }
  if (prev[to] < 0) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

/** Where to head from a towards b: b itself when the straight line is clear, otherwise the furthest
 *  point of a path around the water and cliffs that she can walk to in a straight line. */
export function waypoint(ax, az, bx, bz) {
  if (clearLine(ax, az, bx, bz)) return { x: bx, z: bz };
  const from = cellAt(ax, az), to = cellAt(bx, bz);
  const path = from >= 0 && to >= 0 ? findPath(from, to) : null;
  if (!path) return { x: bx, z: bz };
  for (let i = Math.min(path.length - 1, AHEAD); i > 1; i--) {
    const c = cellCentre(path[i]);
    if (clearLine(ax, az, c.x, c.z)) return c;
  }
  return cellCentre(path[Math.min(1, path.length - 1)]);
}

/** The nearest cell centre inside the map around a point where `ok(x, z)` holds, searching outward ring by ring. */
export function nearest(x, z, ok) {
  const s = grid.cell, i0 = Math.floor((x - grid.ox) / s), j0 = Math.floor((z - grid.oz) / s);
  for (let r = 0; r < 40; r++) {
    let best = null, bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const cx = grid.ox + (i0 + di + 0.5) * s, cz = grid.oz + (j0 + dj + 0.5) * s, d = Math.hypot(cx - x, cz - z);
        if (cellAt(cx, cz) >= 0 && d < bestD && ok(cx, cz)) { best = { x: cx, z: cz }; bestD = d; }
      }
    }
    if (best) return best;
  }
  return { x, z };
}

/** Height of the solid ground at a point (the pond bed under water); 0 beyond the map. */
export function groundY(x, z) {
  const k = cellAt(x, z);
  return k < 0 ? 0 : grid.top[k];
}

/** The type of the block under a point ('dirt', 'grass', 'farmland'…; a pond's bed reads as 'sand'), '' beyond the map. */
export function kindAt(x, z) {
  const k = cellAt(x, z);
  return k < 0 ? '' : grid.kind[k];
}

/** The centre of the block under a point. */
export function blockCentre(x, z) {
  const s = grid.cell;
  return { x: grid.ox + (Math.floor((x - grid.ox) / s) + 0.5) * s, z: grid.oz + (Math.floor((z - grid.oz) / s) + 0.5) * s };
}

/** Digs a block into farmland: its kind becomes 'farmland' and only its own four vertices are recoloured. */
export function tillCell(x, z) {
  const k = cellAt(x, z);
  if (k < 0) return;
  grid.kind[k] = 'farmland';
  const t = PALETTE.farmland, c = new THREE.Color().copy((((k / grid.cols) | 0) % 2) ? t.top2 : t.top).multiplyScalar(jitter(k, 1, 0.05));
  for (let v = 0; v < 4; v++) grid.colors.setXYZ(grid.topVert[k] + v, c.r, c.g, c.b);
  grid.colors.needsUpdate = true;
}

/** A stable per-face brightness wobble, so the blocks don't look stamped. */
const jitter = (k, salt, amp) => 1 + amp * ((((k * 2654435761 + salt * 40503) >>> 0) / 4294967295) * 2 - 1);

/** Collects flat-coloured quads into one indexed geometry. */
function quads() {
  const pos = [], nor = [], col = [], idx = [];
  /** Corner p and edges u, v; u × v is the outward normal. */
  const add = (p, u, v, c) => {
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz), base = pos.length / 3;
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(p[0] + a * u[0] + b * v[0], p[1] + a * u[1] + b * v[1], p[2] + a * u[2] + b * v[2]);
      nor.push(nx / l, ny / l, nz / l);
      col.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return base;                                    // the quad's first vertex, so its colour can be changed later
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  };
  return { add, geometry };
}

/** The meshes for the loaded world. `mats` are tinted by day and night; `group` goes into the scene. */
export function terrainMeshes() {
  const { cell: s, ox, oz, cols, rows, kind, top, surface } = grid;
  const solid = quads(), water = quads(), c = new THREE.Color();
  const topAt = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : top[j * cols + i]);
  grid.topVert = new Int32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i, t = PALETTE[kind[k]], x0 = ox + i * s, z0 = oz + j * s, y = top[k];
      grid.topVert[k] = solid.add([x0, y, z0], [0, 0, s], [s, 0, 0], c.copy(j % 2 ? t.top2 : t.top).multiplyScalar(jitter(k, 1, 0.05)));
      c.copy(t.side).multiplyScalar(jitter(k, 2, 0.04));
      const lower = (di, dj) => Math.max(0, y - topAt(i + di, j + dj));   // how far a neighbour lies below this top
      const dE = lower(1, 0), dW = lower(-1, 0), dS = lower(0, 1), dN = lower(0, -1);
      if (dE) solid.add([x0 + s, y - dE, z0], [0, dE, 0], [0, 0, s], c);
      if (dW) solid.add([x0, y - dW, z0], [0, 0, s], [0, dW, 0], c);
      if (dS) solid.add([x0, y - dS, z0 + s], [s, 0, 0], [0, dS, 0], c);
      if (dN) solid.add([x0, y - dN, z0], [0, dN, 0], [s, 0, 0], c);
      if (!Number.isNaN(surface[k])) water.add([x0, surface[k], z0], [0, 0, s], [s, 0, 0], WATER.color);
    }
  }
  const x1 = ox + cols * s, z1 = oz + rows * s, dirt = PALETTE.dirt.top;   // the flat dirt around the map
  solid.add([-OUTER, 0, -OUTER], [0, 0, oz + OUTER], [2 * OUTER, 0, 0], dirt);
  solid.add([-OUTER, 0, z1], [0, 0, OUTER - z1], [2 * OUTER, 0, 0], dirt);
  solid.add([-OUTER, 0, oz], [0, 0, z1 - oz], [ox + OUTER, 0, 0], dirt);
  solid.add([x1, 0, oz], [0, 0, z1 - oz], [OUTER - x1, 0, 0], dirt);

  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, transparent: true, opacity: WATER.opacity, depthWrite: false });
  const geometry = solid.geometry(); grid.colors = geometry.getAttribute('color');
  const ground = new THREE.Mesh(geometry, solidMat); ground.castShadow = true; ground.receiveShadow = true;
  const pond = new THREE.Mesh(water.geometry(), waterMat);
  const group = new THREE.Group(); group.add(ground, pond);
  return { group, solid: ground, mats: [solidMat, waterMat] };
}
