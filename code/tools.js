// What Pani Yaga can hold. The broom is part of her model (its own mesh, which we can hide); the shovel is
// built here from boxes in the chunky style of the terrain, with its origin at her grip so it sits in her fist.
import * as THREE from './lib/three.module.js';
import SET from '../settings.js';

export const BROOM_MATERIAL = 'b562d2e5_0145_4b57_bd33_a19337e0646b';
// the broom swing: the first half second of her "beating" clip is a fast low sweep, fastest at 0.25 s
export const SWING = { clip: 'Create an animation with the broomstick that she is beating', dur: 0.7, hitAt: 0.25, reach: SET.broom.reach, cost: SET.broom.cost, dmg: SET.broom.damage };
// where the broom's shaft sits in the right-hand bone's own space; a prop built in metres takes its place
const GRIP = { pos: [-0.0286, 0.0534, -0.0215], quat: [0.5843, 0, 0.3404, 0.7367], scale: 0.51149 };

/** A spade about 1.5 m long: grip at the origin, blade down (-y), handle top up (+y). Returns its group and materials. */
export function makeShovel() {
  const mat = (color, metalness) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness, emissive: color, emissiveIntensity: 0.04 });
  const wood = mat(0x6b4532, 0), iron = mat(0x56585c, 0.3), edge = mat(0x8a8d92, 0.4);
  const group = new THREE.Group(), blade = new THREE.Group();
  const add = (parent, size, m, x, y, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o);
  };
  add(group, [0.045, 1.05, 0.045], wood, 0, -0.105, 0);                  // shaft
  add(group, [0.26, 0.045, 0.045], wood, 0, 0.4, 0);                     // D-handle: bar and two uprights
  add(group, [0.04, 0.11, 0.04], wood, -0.11, 0.34, 0); add(group, [0.04, 0.11, 0.04], wood, 0.11, 0.34, 0);
  add(blade, [0.08, 0.1, 0.08], iron, 0, -0.65, 0);                      // collar
  add(blade, [0.27, 0.3, 0.025], iron, 0, -0.84, 0);                     // blade
  add(blade, [0.17, 0.1, 0.025], edge, 0, -1.04, 0);                     // tip
  group.add(blade);
  return { group, mats: [wood, iron, edge] };
}

/** Parents a prop (grip at its origin) to her right hand, exactly where the broom's shaft is. */
export function attachInHand(model, prop) {
  const grip = new THREE.Group();
  grip.position.fromArray(GRIP.pos); grip.quaternion.fromArray(GRIP.quat); grip.scale.setScalar(GRIP.scale);
  grip.add(prop);
  model.getObjectByName('mixamorigRightHand').add(grip);
}
