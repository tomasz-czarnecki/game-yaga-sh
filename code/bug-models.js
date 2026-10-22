// Bugs for the Black Box Pet: the things it eats instead of fruit (it's debugging, get it).
// Their colours and overall size are in assets/models/enemies/<id>.json; the shapes are drawn here.
// Every bug is built from primitives with named meshes + materials, so the game can either call
// makeBug(THREE, id) directly with its own three.js, or load the GLB exported from Bug Lab.
// Units match the fruit GLBs (~0.4 long), y-up, resting on y = 0, head facing +z.
// tick(t, a): idle/crawl animation; a = amplitude 0..1 (0 = rest pose, used for export).

// the bugs by id; their names (and the in-joke each stands for) are in words/en.json, under "bugs"
export const BUGS = ['ladybug', 'firefly', 'caterpillar', 'snail', 'ant', 'beetle'].map((id) => ({ id }));
const LOOKS = {};

/** Fetches each bug's colours and size from assets/models/enemies/<id>.json; call once at boot, before makeBug. */
export async function loadBugLooks() {
  await Promise.all(BUGS.map(async ({ id }) => {
    LOOKS[id] = await fetch(`./assets/models/enemies/${id}.json`).then((r) => r.json())
      .catch((e) => { throw new Error(`assets/models/enemies/${id}.json: ${e.message}`); });   // say which file has the typo
  }));
}

export function makeBug(THREE, id) {
  const K = kit(THREE), look = LOOKS[id];
  const b = BUILD[id](THREE, K, look.colours);
  b.group.scale.setScalar(look.size);
  b.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return b;
}

function kit(THREE) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const LR = (s) => (s < 0 ? 'L' : 'R');
  const sph = {};
  const sphere = (seg) => sph[seg] || (sph[seg] = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.66))));

  const mat = (name, color, o = {}) => {
    const { phys, double, e, ei, ...rest } = o;
    const M = phys ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new M({ name, color, roughness: 0.45, metalness: 0, ...rest });
    if (e) { m.emissive.set(e); m.emissiveIntensity = ei ?? 1; }
    if (double) m.side = THREE.DoubleSide;
    return m;
  };
  const group = (parent, name, p = [0, 0, 0]) => {
    const g = new THREE.Group(); g.name = name; g.position.set(...p); parent.add(g); return g;
  };
  const mesh = (parent, name, geo, m, p = [0, 0, 0], s) => {
    const o = new THREE.Mesh(geo, m); o.name = name; o.position.set(...p);
    if (s) o.scale.set(...s);
    parent.add(o); return o;
  };
  const ball = (parent, name, m, p, s, seg = 32) => mesh(parent, name, sphere(seg), m, p, Array.isArray(s) ? s : [s, s, s]);
  const stick = (parent, name, a, b, r0, r1, m) => {
    const d = V().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 12, 1); g.translate(0, len / 2, 0);
    const o = mesh(parent, name, g, m); o.position.copy(a); o.quaternion.setFromUnitVectors(UP, d.normalize());
    return o;
  };
  // a polyline of tapered sticks with ball joints
  const chain = (parent, name, pts, r0, r1, m, tip = 0) => {
    const P = pts.map((p) => (p.isVector3 ? p : V(...p))), n = P.length - 1, r = (i) => lerp(r0, r1, i / n);
    for (let i = 0; i < n; i++) {
      stick(parent, `${name}_Seg${i + 1}`, P[i], P[i + 1], r(i), r(i + 1), m);
      if (i > 0) ball(parent, `${name}_Joint${i}`, m, P[i].toArray(), r(i), 12);
    }
    if (tip) ball(parent, `${name}_Tip`, m, P[n].toArray(), tip, 14);
    return P;
  };
  // six legs: hips mirrored, joints relative to the hip, feet land on the ground (parent must sit at y = 0)
  const legs = (parent, name, m, specs, r) => {
    const out = [];
    specs.forEach((s, i) => [-1, 1].forEach((side) => {
      const g = group(parent, `${name}_${LR(side)}${i + 1}`, [side * s.hip[0], s.hip[1], s.hip[2]]);
      const pts = [V()];
      for (const j of s.joints) pts.push(V(side * j[0], j[1], j[2]));
      pts.push(V(side * s.foot[0], -s.hip[1] + r * 0.75, s.foot[1]));
      chain(g, g.name, pts, r, r * 0.75, m, r * 0.85);
      out.push({ g, side, phase: (i + (side > 0 ? 1 : 0)) % 2 ? Math.PI : 0 });   // tripod gait
    }));
    return out;
  };
  const walk = (L, t, a, speed = 10, swing = 0.3, lift = 0.25) => {
    for (const { g, side, phase } of L) {
      const p = t * speed + phase;
      g.rotation.y = -side * Math.sin(p) * swing * a;
      g.rotation.z = side * Math.max(0, Math.cos(p)) * lift * a;
    }
  };
  const antennae = (parent, name, m, pts, r, tip) => [-1, 1].map((side) => {
    const b = pts[0];
    const g = group(parent, `${name}_${LR(side)}`, [side * b[0], b[1], b[2]]);
    g.userData.side = side;
    g.userData.pts = chain(g, g.name, pts.map((p) => V(side * (p[0] - b[0]), p[1] - b[1], p[2] - b[2])), r, r * 0.7, m, tip);
    return g;
  });
  const sway = (A, t, a, k = 0.18, w = 3) => A.forEach((g) => {
    const s = g.userData.side;
    g.rotation.x = Math.sin(t * w + s) * k * a;
    g.rotation.y = Math.sin(t * w * 0.7 + s * 2) * k * 0.6 * a;
  });
  const eyes = (parent, name, mW, mP, p, r, look = [0.45, 0.15, 1]) => [-1, 1].forEach((side) => {
    const c = V(side * p[0], p[1], p[2]);
    ball(parent, `${name}_${LR(side)}`, mW, c.toArray(), r, 24);
    const d = V(side * look[0], look[1], look[2]).normalize();
    ball(parent, `${name}_${LR(side)}_Pupil`, mP, c.clone().addScaledVector(d, r * 0.58).toArray(), r * 0.52, 18);
  });

  // elytra: half of an upper half-ellipsoid, optionally tapered to a point at the rear (-z)
  const tap = (x, y, z, t) => { const b = Math.max(0, -z), k = 1 - t * b * b; return [x * k, y * (1 - t * 0.45 * b * b), z]; };
  const shellGeo = (side, rx, ry, rz, taper = 0) => {
    const g = new THREE.SphereGeometry(1, 56, 28, side > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI / 2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const [x, y, z] = tap(a.getX(i), a.getY(i), a.getZ(i), taper);
      a.setXYZ(i, x * rx, y * ry, z * rz);
    }
    g.computeVertexNormals();
    return g;
  };
  // a point on an ellipsoid E = [rx, ry, rz, taper]; az from +z toward +x, el up from the rim
  const onE = (E, az, el, lift = 0) => {
    const [x, y, z] = tap(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), E[3] || 0);
    const p = V(x * E[0], y * E[1], z * E[2]);
    const n = V(p.x / (E[0] * E[0]), p.y / (E[1] * E[1]), p.z / (E[2] * E[2])).normalize();
    return { p: p.addScaledVector(n, lift), n };
  };
  // a flattened bead sitting on an ellipsoid surface: spots, patches
  const spot = (parent, name, m, E, az, el, r, th = 0.006) => {
    const { p, n } = onE(E, az, el);
    const [rx, rz] = Array.isArray(r) ? r : [r, r];
    const o = ball(parent, name, m, p.toArray(), [rx, th, rz], 28);
    o.quaternion.setFromUnitVectors(UP, n);
    return o;
  };
  // a thin raised line drawn along an ellipsoid surface at constant elevation
  const seam = (parent, name, m, E, a0, a1, el, r, n = 40) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(onE(E, lerp(a0, a1, i / n), el, r * 0.35).p);
    return mesh(parent, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, r, 8, false), m);
  };
  const wings = (parent, name, m, E, center, gap = 0.04) => [-1, 1].map((side) => {
    const g = group(parent, `${name}_${LR(side)}`, center);
    g.position.x += side * 0.0015;
    g.rotation.z = -side * gap;
    g.userData.side = side;
    mesh(g, `${g.name}_Shell`, shellGeo(side, E[0], E[1], E[2], E[3] || 0), m);
    return g;
  });

  return { V, UP, lerp, LR, mat, group, mesh, ball, stick, chain, legs, walk, antennae, sway, eyes, onE, spot, seam, wings };
}

const BUILD = {
  ladybug(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'Ladybug';
    const red = K.mat('M_LadyShell', C.shell, { roughness: 0.26, double: true });
    const ink = K.mat('M_LadyInk', C.body, { roughness: 0.5 });
    const dot = K.mat('M_LadySpot', C.spots, { roughness: 0.3 });
    const cream = K.mat('M_LadyCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_LadyPupil', C.pupils, { roughness: 0.12 });

    const body = K.group(root, 'Ladybug_Body');
    K.ball(body, 'Ladybug_Belly', ink, [0, 0.066, -0.005], [0.122, 0.05, 0.15]);
    const E = [0.135, 0.112, 0.155];
    const W = K.wings(body, 'Ladybug_Elytra', red, E, [0, 0.065, -0.028], 0.035);
    const SP = [[0.78, 0.62, 0.03], [1.62, 0.3, 0.034], [2.42, 0.56, 0.027]];
    W.forEach((w) => SP.forEach(([az, el, r], i) => K.spot(w, `${w.name}_Spot${i + 1}`, dot, E, az * w.userData.side, el, r)));
    const mid = K.group(body, 'Ladybug_Scutellum', [0, 0.065, -0.028]);
    K.spot(mid, 'Ladybug_Spot7', dot, E, 0, 0.84, 0.03);   // the seventh, straddling the seam

    const PE = [0.088, 0.056, 0.058];
    const pro = K.group(body, 'Ladybug_Pronotum', [0, 0.072, 0.108]);
    K.ball(pro, 'Ladybug_Pronotum_Plate', ink, [0, 0, 0], PE);
    [-1, 1].forEach((s) => K.spot(pro, `Ladybug_Patch_${K.LR(s)}`, cream, PE, s * 0.8, 0.28, 0.024, 0.005));

    const head = K.group(body, 'Ladybug_Head', [0, 0.064, 0.158]);
    K.ball(head, 'Ladybug_Head_Shell', ink, [0, 0, 0], [0.05, 0.042, 0.042]);
    K.eyes(head, 'Ladybug_Eye', cream, pupil, [0.026, 0.014, 0.03], 0.017);
    const ant = K.antennae(head, 'Ladybug_Antenna', ink, [[0.014, 0.03, 0.03], [0.032, 0.062, 0.058], [0.048, 0.074, 0.072]], 0.004, 0.008);

    const L = K.legs(root, 'Ladybug_Leg', ink, [
      { hip: [0.05, 0.05, 0.075], joints: [[0.06, -0.005, 0.035]], foot: [0.1, 0.065] },
      { hip: [0.06, 0.045, 0.0], joints: [[0.075, -0.004, 0.0]], foot: [0.125, -0.005] },
      { hip: [0.055, 0.045, -0.07], joints: [[0.07, -0.004, -0.035]], foot: [0.115, -0.095] },
    ], 0.008);

    const tick = (t, a) => {
      K.walk(L, t, a, 10, 0.32, 0.3);
      K.sway(ant, t, a);
      body.position.y = Math.abs(Math.sin(t * 10)) * 0.004 * a;
      body.rotation.z = Math.sin(t * 10) * 0.02 * a;
    };
    return { group: root, tick };
  },

  firefly(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'Firefly';
    const shell = K.mat('M_FireflyShell', C.shell, { roughness: 0.42, double: true });
    const edge = K.mat('M_FireflyEdge', C.edges, { roughness: 0.5 });
    const shield = K.mat('M_FireflyShield', C.shield, { roughness: 0.38 });
    const ink = K.mat('M_FireflyInk', C.body, { roughness: 0.5 });
    const lamp = K.mat('M_FireflyLantern', C.lantern, { roughness: 0.35, e: C.lanternGlow, ei: 1.6 });
    const cream = K.mat('M_FireflyCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_FireflyPupil', C.pupils, { roughness: 0.12 });

    const body = K.group(root, 'Firefly_Body');
    K.ball(body, 'Firefly_Belly', ink, [0, 0.062, -0.01], [0.055, 0.038, 0.13]);
    const lampG = K.group(body, 'Firefly_Lantern', [0, 0.06, -0.15]);
    const tip = K.ball(lampG, 'Firefly_Lantern_Tip', lamp, [0, 0, -0.045], [0.05, 0.042, 0.062]);
    K.ball(lampG, 'Firefly_Lantern_Seg', lamp, [0, 0.002, 0.018], [0.056, 0.042, 0.046]);

    const E = [0.066, 0.046, 0.14, 0.3];
    const W = K.wings(body, 'Firefly_Elytra', shell, E, [0, 0.078, -0.02], 0.07);
    W.forEach((w) => { const s = w.userData.side; K.seam(w, `${w.name}_Edge`, edge, E, s * 0.12, s * 2.9, 0.1, 0.0035); });

    const PE = [0.068, 0.026, 0.062];
    const pro = K.group(body, 'Firefly_Pronotum', [0, 0.09, 0.115]);
    K.ball(pro, 'Firefly_Pronotum_Plate', shield, [0, 0, 0], PE);
    K.spot(pro, 'Firefly_Pronotum_Spot', ink, PE, 0, Math.PI / 2, [0.018, 0.03], 0.005);

    const head = K.group(body, 'Firefly_Head', [0, 0.072, 0.165]);
    K.ball(head, 'Firefly_Head_Shell', ink, [0, 0, 0], [0.036, 0.032, 0.032]);
    K.eyes(head, 'Firefly_Eye', cream, pupil, [0.022, 0.01, 0.022], 0.016);
    const ant = K.antennae(head, 'Firefly_Antenna', ink, [[0.012, 0.022, 0.022], [0.03, 0.06, 0.07], [0.055, 0.08, 0.12], [0.08, 0.085, 0.16]], 0.0038, 0.005);

    const L = K.legs(root, 'Firefly_Leg', ink, [
      { hip: [0.035, 0.045, 0.07], joints: [[0.055, 0.02, 0.03]], foot: [0.1, 0.08] },
      { hip: [0.04, 0.042, 0.0], joints: [[0.07, 0.02, 0.0]], foot: [0.12, 0.0] },
      { hip: [0.038, 0.042, -0.06], joints: [[0.065, 0.02, -0.035]], foot: [0.11, -0.11] },
    ], 0.0055);

    const glow = { anchor: tip, level: 1.6 };
    const tick = (t, a) => {
      K.walk(L, t, a, 7, 0.28, 0.25);
      K.sway(ant, t, a, 0.14, 2.2);
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 4);
      glow.level = K.lerp(2.2, 0.7 + 3.4 * blink, a);
      lamp.emissiveIntensity = glow.level;
      body.position.y = Math.abs(Math.sin(t * 7)) * 0.003 * a;
    };
    return { group: root, tick, glow };
  },

  caterpillar(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'Caterpillar';
    const skin = K.mat('M_CaterSkin', C.skin, { roughness: 0.5 });
    const gold = K.mat('M_CaterDot', C.dots, { roughness: 0.35 });
    const pore = K.mat('M_CaterPore', C.pores, { roughness: 0.4 });
    const foot = K.mat('M_CaterFoot', C.feet, { roughness: 0.55 });
    const face = K.mat('M_CaterHead', C.head, { roughness: 0.4 });
    const cream = K.mat('M_CaterCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_CaterPupil', C.pupils, { roughness: 0.12 });

    const N = 8, segs = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), r = 0.05 * (1 - 0.32 * u * u), z = 0.11 - i * 0.05;
      const E = [r, r * 0.95, r * 0.68];
      const g = K.group(root, `Caterpillar_Seg${i + 1}`, [0, E[1], z]);
      K.ball(g, `${g.name}_Body`, skin, [0, 0, 0], E);
      [-1, 1].forEach((s) => {
        K.spot(g, `${g.name}_Dot_${K.LR(s)}`, gold, E, s * Math.PI / 2, 0.85, 0.013, 0.005);
        K.spot(g, `${g.name}_Pore_${K.LR(s)}`, pore, E, s * Math.PI / 2, 0.2, 0.006, 0.003);
        if (i < 3) K.chain(g, `${g.name}_Leg_${K.LR(s)}`, [[s * r * 0.42, -E[1] * 0.6, 0.004], [s * r * 0.6, -E[1] + 0.005, 0.01]], 0.0065, 0.004, foot, 0.005);
        else K.ball(g, `${g.name}_Proleg_${K.LR(s)}`, foot, [s * r * 0.52, -E[1] + 0.011, 0], [0.012, 0.011, 0.014], 16);
      });
      if (i === N - 1) K.chain(g, 'Caterpillar_Horn', [[0, E[1] * 0.7, 0], [0, E[1] * 1.6, -0.012], [0, E[1] * 2.1, -0.035]], 0.006, 0.003, foot, 0.007);
      segs.push({ g, y: E[1], z, i });
    }
    const head = K.group(root, 'Caterpillar_Head', [0, 0.056, 0.158]);
    K.ball(head, 'Caterpillar_Head_Shell', face, [0, 0, 0], [0.05, 0.048, 0.045]);
    K.eyes(head, 'Caterpillar_Eye', cream, pupil, [0.021, 0.014, 0.032], 0.014, [0.3, 0.1, 1]);
    const ant = K.antennae(head, 'Caterpillar_Antenna', face, [[0.016, 0.04, 0.006], [0.027, 0.072, 0.018]], 0.0045, 0.0095);
    const base = { y: head.position.y, z: head.position.z };

    const tick = (t, a) => {
      for (const s of segs) {
        const ph = t * 3.6 - s.i * 0.8, up = Math.pow(Math.max(0, Math.sin(ph)), 2);
        s.g.position.y = s.y + 0.02 * up * a;
        s.g.position.z = s.z + 0.006 * Math.cos(ph) * a;
      }
      const ph = t * 3.6 + 0.8, up = Math.pow(Math.max(0, Math.sin(ph)), 2);
      head.position.y = base.y + 0.016 * up * a;
      head.position.z = base.z + 0.006 * Math.cos(ph) * a;
      head.rotation.x = -0.12 * up * a;
      head.rotation.y = Math.sin(t * 1.3) * 0.18 * a;
      K.sway(ant, t, a, 0.2, 4);
    };
    return { group: root, tick };
  },

  snail(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'Snail';
    const skin = K.mat('M_SnailSkin', C.skin, { roughness: 0.38 });
    const shellM = K.mat('M_SnailShell', C.shell, { roughness: 0.32, double: true });
    const stripe = K.mat('M_SnailStripe', C.stripe, { roughness: 0.4 });
    const hole = K.mat('M_SnailAperture', C.opening, { roughness: 0.45, double: true });   // the body filling the opening
    const cream = K.mat('M_SnailCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_SnailPupil', C.pupils, { roughness: 0.12 });

    const body = K.group(root, 'Snail_Body');
    const foot = K.group(body, 'Snail_Foot', [0, 0, -0.02]);
    K.ball(foot, 'Snail_Foot_Skirt', skin, [0, 0.012, 0.0], [0.064, 0.012, 0.19]);
    K.ball(foot, 'Snail_Foot_Body', skin, [0, 0.036, 0.0], [0.06, 0.036, 0.19]);
    K.ball(body, 'Snail_Neck', skin, [0, 0.05, 0.08], [0.052, 0.05, 0.07]);
    K.ball(body, 'Snail_Mantle', skin, [0, 0.088, -0.006], [0.06, 0.062, 0.07]);   // body filling the shell opening
    const head = K.group(body, 'Snail_Head', [0, 0.08, 0.14]);
    K.ball(head, 'Snail_Head_Shell', skin, [0, 0, 0], [0.048, 0.056, 0.05]);
    // eyes on stalks
    const stalks = K.antennae(head, 'Snail_Stalk', skin, [[0.016, 0.045, 0.008], [0.026, 0.09, 0.026], [0.036, 0.125, 0.04]], 0.0085, 0);
    stalks.forEach((g) => {
      const P = g.userData.pts, tip = P[P.length - 1], s = g.userData.side;
      K.ball(g, `${g.name}_Eye`, cream, tip.toArray(), 0.017, 24);
      const d = K.V(s * 0.25, 0.1, 1).normalize();
      K.ball(g, `${g.name}_Pupil`, pupil, tip.clone().addScaledVector(d, 0.017 * 0.58).toArray(), 0.017 * 0.52, 18);
    });
    [-1, 1].forEach((s) => K.chain(head, `Snail_Feeler_${K.LR(s)}`, [[s * 0.02, -0.006, 0.04], [s * 0.032, -0.02, 0.066]], 0.006, 0.0045, skin, 0.0055));

    // shell: a log-spiral tube coiling around x, aperture at the bottom opening forward
    // from the opening (front, low, facing down) the body whorl rises up the front, over the top, down the back, then curls in
    const G = Math.log(3) / (2 * Math.PI), T = 2.6 * 2 * Math.PI, REND = 0.115, KR = 0.62, AL = -0.8 * Math.PI - T;
    const R = (th) => REND * Math.exp(G * (th - T));
    const ring = (th) => { const q = th + AL; return { c: K.V(0, R(th) * Math.sin(q), -R(th) * Math.cos(q)), rad: K.V(0, Math.sin(q), -Math.cos(q)), r: KR * R(th) }; };
    const nU = 220, nV = 32, pos = [], idx = [];
    for (let i = 0; i <= nU; i++) {
      const { c, rad, r } = ring((T * i) / nU);
      for (let j = 0; j <= nV; j++) {
        const f = (2 * Math.PI * j) / nV;
        pos.push(c.x + r * Math.sin(f), c.y + r * Math.cos(f) * rad.y, c.z + r * Math.cos(f) * rad.z);
      }
    }
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
      const p = i * (nV + 1) + j, q = p + nV + 1;
      idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const shell = K.group(body, 'Snail_Shell', [0, 0.152, -0.1]);
    K.mesh(shell, 'Snail_Shell_Coil', geo, shellM);
    { // the opening, filled with body
      const { c, rad, r } = ring(T), cap = [c.x, c.y, c.z], ci = [];
      for (let j = 0; j <= nV; j++) { const f = (2 * Math.PI * j) / nV; cap.push(c.x + r * Math.sin(f), c.y + r * Math.cos(f) * rad.y, c.z + r * Math.cos(f) * rad.z); }
      for (let j = 1; j <= nV; j++) ci.push(0, j + 1, j);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3)); g.setIndex(ci); g.computeVertexNormals();
      K.mesh(shell, 'Snail_Shell_Aperture', g, hole);
    }
    [-1, 1].forEach((s) => { // a cream spiral line down each side
      const pts = [];
      for (let i = 0; i <= 120; i++) { const { c, r } = ring(T * (0.45 + 0.55 * i / 120)); pts.push(K.V(c.x + s * r * 1.002, c.y, c.z)); }
      K.mesh(shell, `Snail_Shell_Stripe_${K.LR(s)}`, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.005, 8, false), stripe);
    });

    const hy = head.position.y, sy = shell.position.y;
    const tick = (t, a) => {   // slow: it's a slow query
      const w = Math.sin(t * 1.8);
      foot.scale.z = 1 + 0.04 * w * a;
      head.position.y = hy + 0.006 * Math.sin(t * 1.8 + 1) * a;
      head.rotation.y = Math.sin(t * 0.8) * 0.16 * a;
      head.rotation.x = Math.sin(t * 1.8 + 1) * 0.05 * a;
      shell.position.y = sy + 0.003 * w * a;
      shell.rotation.x = Math.sin(t * 1.8 - 0.6) * 0.035 * a;
      K.sway(stalks, t, a, 0.22, 1.5);
    };
    return { group: root, tick };
  },

  ant(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'Ant';
    const shell = K.mat('M_AntShell', C.rear, { roughness: 0.26 });
    const dark = K.mat('M_AntDark', C.body, { roughness: 0.34 });
    const band = K.mat('M_AntBand', C.bands, { roughness: 0.4 });
    const legM = K.mat('M_AntLeg', C.legs, { roughness: 0.4 });
    const cream = K.mat('M_AntCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_AntPupil', C.pupils, { roughness: 0.12 });

    const body = K.group(root, 'Ant_Body');
    const head = K.group(body, 'Ant_Head', [0, 0.105, 0.152]);
    K.ball(head, 'Ant_Head_Shell', dark, [0, 0, 0], [0.052, 0.045, 0.048]);
    K.eyes(head, 'Ant_Eye', cream, pupil, [0.035, 0.012, 0.022], 0.014, [0.8, 0.2, 0.6]);
    [-1, 1].forEach((s) => K.chain(head, `Ant_Mandible_${K.LR(s)}`, [[s * 0.018, -0.022, 0.035], [s * 0.03, -0.028, 0.058], [s * 0.008, -0.03, 0.072]], 0.0068, 0.004, band, 0.004));
    const ant = K.antennae(head, 'Ant_Antenna', legM, [[0.018, 0.03, 0.025], [0.05, 0.09, 0.035], [0.075, 0.075, 0.11], [0.08, 0.055, 0.142]], 0.0045, 0.0065);
    K.ball(body, 'Ant_Neck', dark, [0, 0.1, 0.112], 0.016, 16);
    const meso = K.ball(body, 'Ant_Thorax', dark, [0, 0.098, 0.066], [0.034, 0.034, 0.062]);
    meso.rotation.x = -0.25;
    K.ball(body, 'Ant_Petiole', dark, [0, 0.09, 0.0], [0.016, 0.022, 0.018], 20);
    const gas = K.group(body, 'Ant_Gaster', [0, 0.092, -0.1]);
    const gb = K.ball(gas, 'Ant_Gaster_Shell', shell, [0, 0, 0], [0.064, 0.056, 0.088]);
    gb.rotation.x = -0.2;
    [-0.18, -0.52].forEach((z, i) => K.mesh(gb, `Ant_Gaster_Band${i + 1}`, new THREE.TorusGeometry(Math.sqrt(1 - z * z), 0.035, 8, 48), band, [0, 0, z]));

    const L = K.legs(root, 'Ant_Leg', legM, [
      { hip: [0.022, 0.085, 0.09], joints: [[0.045, 0.045, 0.035], [0.075, -0.04, 0.07]], foot: [0.092, 0.105] },
      { hip: [0.026, 0.082, 0.065], joints: [[0.056, 0.048, 0.0], [0.1, -0.042, -0.004]], foot: [0.124, -0.008] },
      { hip: [0.024, 0.082, 0.04], joints: [[0.052, 0.045, -0.036], [0.092, -0.042, -0.096]], foot: [0.108, -0.145] },
    ], 0.0052);

    const tick = (t, a) => {
      K.walk(L, t, a, 15, 0.3, 0.3);
      K.sway(ant, t, a, 0.22, 6);
      gas.rotation.x = Math.sin(t * 15) * 0.04 * a;
      head.rotation.y = Math.sin(t * 1.7) * 0.15 * a;
      body.position.y = Math.abs(Math.sin(t * 15)) * 0.003 * a;
    };
    return { group: root, tick };
  },

  beetle(THREE, K, C) {
    const root = new THREE.Group(); root.name = 'JewelBeetle';
    const jewel = K.mat('M_BeetleJewel', C.shell, { phys: true, roughness: 0.28, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.9, iridescenceIOR: 1.5, double: true });
    const jewelDk = K.mat('M_BeetleJewelDark', C.neck, { phys: true, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, iridescence: 0.7, iridescenceIOR: 1.5 });
    const gold = K.mat('M_BeetleGold', C.stripes, { roughness: 0.3, metalness: 0.35 });
    const copper = K.mat('M_BeetleCopper', C.legs, { roughness: 0.35, metalness: 0.2 });
    const cream = K.mat('M_BeetleCream', C.eyes, { roughness: 0.35 });
    const pupil = K.mat('M_BeetlePupil', C.pupils, { roughness: 0.12 });

    const body = K.group(root, 'JewelBeetle_Body');
    K.ball(body, 'JewelBeetle_Belly', copper, [0, 0.058, -0.03], [0.072, 0.042, 0.17]);
    const E = [0.085, 0.07, 0.185, 0.55];
    const W = K.wings(body, 'JewelBeetle_Elytra', jewel, E, [0, 0.062, -0.045], 0.03);
    W.forEach((w) => {
      const s = w.userData.side;
      K.seam(w, `${w.name}_Stripe1`, gold, E, s * 0.18, s * 2.9, 0.62, 0.0045);
      K.seam(w, `${w.name}_Stripe2`, gold, E, s * 0.2, s * 2.7, 0.22, 0.0042);
    });
    const PE = [0.074, 0.042, 0.055];
    const pro = K.group(body, 'JewelBeetle_Pronotum', [0, 0.075, 0.12]);
    K.ball(pro, 'JewelBeetle_Pronotum_Plate', jewelDk, [0, 0, 0], PE);
    [-1, 1].forEach((s) => K.spot(pro, `JewelBeetle_Pronotum_Dash_${K.LR(s)}`, gold, PE, s * 0.55, 0.5, [0.009, 0.026], 0.003));

    const head = K.group(body, 'JewelBeetle_Head', [0, 0.065, 0.172]);
    K.ball(head, 'JewelBeetle_Head_Shell', jewel, [0, 0, 0], [0.042, 0.036, 0.034]);
    K.eyes(head, 'JewelBeetle_Eye', cream, pupil, [0.027, 0.012, 0.022], 0.016);
    const ant = K.antennae(head, 'JewelBeetle_Antenna', copper, [[0.012, 0.025, 0.025], [0.035, 0.05, 0.06], [0.058, 0.06, 0.095]], 0.004, 0.006);

    const L = K.legs(root, 'JewelBeetle_Leg', copper, [
      { hip: [0.045, 0.045, 0.07], joints: [[0.06, 0.01, 0.035]], foot: [0.11, 0.085] },
      { hip: [0.05, 0.042, 0.0], joints: [[0.075, 0.012, 0.0]], foot: [0.13, -0.01] },
      { hip: [0.048, 0.042, -0.07], joints: [[0.07, 0.01, -0.04]], foot: [0.12, -0.12] },
    ], 0.0072);

    const tick = (t, a) => {
      K.walk(L, t, a, 8, 0.28, 0.26);
      K.sway(ant, t, a, 0.16, 2.6);
      const crack = Math.pow(Math.max(0, Math.sin(t * 0.8)), 10) * a;   // now and then it flashes the wings
      W.forEach((w) => { w.rotation.z = -w.userData.side * (0.03 + 0.22 * crack); w.rotation.x = -0.12 * crack; });
      body.position.y = Math.abs(Math.sin(t * 8)) * 0.003 * a;
    };
    return { group: root, tick };
  },
};
