// What Yaga can hold. Both are props on her right hand: the broom is assets/models/tools/broom.glb, the shovel is
// built from boxes in the chunky style of the terrain. Each has its origin at her grip so it sits in her fist.
import * as THREE from './lib/three.module.js';
import SET from '../settings.js';
import { buildBoxModel } from './box-model.js';

// the broom swing: the first half second of her "beating" clip is a fast low sweep, fastest at 0.25 s
export const SWING = { clip: 'Create an animation with the broomstick that she is beating', dur: 0.7, hitAt: 0.25, reach: SET.broom.reach, cost: SET.broom.cost, dmg: SET.broom.damage };
// where a prop's grip sits in the right-hand bone's own space; a prop built in metres (origin at the grip, handle up, head down) takes its place
const GRIP = { pos: [-0.0286, 0.0534, -0.0215], quat: [0.5843, 0, 0.3404, 0.7367], scale: 0.51149 };

/** A spade about 1.5 m long: grip at the origin, blade down (-y), handle top up (+y). Returns its group and materials (see assets/models/tools/shovel.json). */
export function makeShovel() {
  return buildBoxModel('tools/shovel');
}

/** Parents a prop (grip at its origin) to her right hand, exactly where the broom's shaft is. */
export function attachInHand(model, prop) {
  const grip = new THREE.Group();
  grip.position.fromArray(GRIP.pos); grip.quaternion.fromArray(GRIP.quat); grip.scale.setScalar(GRIP.scale);
  grip.add(prop);
  model.getObjectByName('mixamorigRightHand').add(grip);
}
