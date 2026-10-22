// The hens and their eggs: small box birds in the chunky style of the terrain.
import * as THREE from './lib/three.module.js';

const FEATHERS = [0xE9DFC8, 0x8A5A3A, 0x6c6a6b];        // cream, brown and grey hens
const HURT = new THREE.Color(0xB32A1F);

/** A hen about 0.45 m long, facing +z, standing on the ground at the origin.
 *  Returns its group and `tick(t, walk, peck, hurt)`: walk 0…2 swings the legs, peck 0…1 dips the head, hurt flashes it red. */
export function makeChicken(variant = 0) {
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: color, emissiveIntensity: 0.05 });
  const feather = mat(FEATHERS[variant % FEATHERS.length]), dark = mat(0x2a241f), gold = mat(0xD6A446), red = mat(0xB32A1F);
  const mats = [feather, dark, gold, red];
  const group = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  const add = (parent, size, m, x, y, z, rx = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
    o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; parent.add(o);
  };
  body.position.y = 0.27; group.add(body);
  add(body, [0.26, 0.24, 0.34], feather, 0, 0, 0);                    // body
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.17); body.add(tail);
  add(tail, [0.06, 0.2, 0.14], feather, 0, 0.08, -0.03, -0.5);        // tail, leaning back
  add(body, [0.04, 0.16, 0.22], feather, 0.14, 0, 0); add(body, [0.04, 0.16, 0.22], feather, -0.14, 0, 0);   // wings
  head.position.set(0, 0.14, 0.16); body.add(head);
  add(head, [0.14, 0.15, 0.14], feather, 0, 0.08, 0.04);              // head
  add(head, [0.06, 0.04, 0.08], gold, 0, 0.07, 0.14);                 // beak
  add(head, [0.04, 0.06, 0.1], red, 0, 0.18, 0.03);                   // comb
  add(head, [0.03, 0.05, 0.03], red, 0, 0.01, 0.1);                   // wattle
  add(head, [0.025, 0.025, 0.02], dark, 0.075, 0.11, 0.08); add(head, [0.025, 0.025, 0.02], dark, -0.075, 0.11, 0.08);   // eyes
  const legs = [-0.06, 0.06].map((x) => {
    const leg = new THREE.Group(); leg.position.set(x, 0.16, 0); group.add(leg);
    add(leg, [0.03, 0.16, 0.03], gold, 0, -0.08, 0); add(leg, [0.07, 0.02, 0.1], gold, 0, -0.16, 0.03);
    return leg;
  });
  const tick = (t, walk, peck, hurt) => {
    const w = Math.sin(t * 10);
    legs[0].rotation.x = w * 0.8 * walk; legs[1].rotation.x = -w * 0.8 * walk;
    body.position.y = 0.27 + Math.abs(w) * 0.015 * walk;
    head.position.z = 0.16 + w * 0.02 * walk; head.rotation.x = peck * 0.9;
    tail.rotation.x = Math.sin(t * 3) * 0.05 + (hurt ? -0.4 : 0);
    for (const m of mats) { m.emissive.copy(hurt ? HURT : m.color); m.emissiveIntensity = hurt ? 0.9 : 0.05; }
  };
  return { group, tick };
}

/** An egg, standing on the ground at the origin. */
export function makeEgg() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: 0xF0EADC, roughness: 0.7, emissive: 0xF0EADC, emissiveIntensity: 0.12 }));
  m.scale.set(0.085, 0.115, 0.085); m.position.y = 0.1; m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}
