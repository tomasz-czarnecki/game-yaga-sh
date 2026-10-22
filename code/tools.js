// What Yaga can hold. The broom is part of her model (its own mesh, which we can hide); the shovel is
// built from boxes in the chunky style of the terrain, with its origin at her grip so it sits in her fist.
import * as THREE from './lib/three.module.js';
import SET from '../settings.js';
import { buildBoxModel } from './box-model.js';

export const BROOM_MATERIAL = 'b562d2e5_0145_4b57_bd33_a19337e0646b';
// the broom swing: the first half second of her "beating" clip is a fast low sweep, fastest at 0.25 s
export const SWING = { clip: 'Create an animation with the broomstick that she is beating', dur: 0.7, hitAt: 0.25, reach: SET.broom.reach, cost: SET.broom.cost, dmg: SET.broom.damage };
// where the broom's shaft sits in the right-hand bone's own space; a prop built in metres takes its place
const GRIP = { pos: [-0.0286, 0.0534, -0.0215], quat: [0.5843, 0, 0.3404, 0.7367], scale: 0.51149 };

/** A spade about 1.5 m long: grip at the origin, blade down (-y), handle top up (+y). Returns its group and materials (see assets/boxes/shovel.json). */
export function makeShovel() {
  return buildBoxModel('shovel');
}

/** Parents a prop (grip at its origin) to her right hand, exactly where the broom's shaft is. */
export function attachInHand(model, prop) {
  const grip = new THREE.Group();
  grip.position.fromArray(GRIP.pos); grip.quaternion.fromArray(GRIP.quat); grip.scale.setScalar(GRIP.scale);
  grip.add(prop);
  model.getObjectByName('mixamorigRightHand').add(grip);
}
