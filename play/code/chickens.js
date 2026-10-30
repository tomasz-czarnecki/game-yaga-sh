// The hens and their eggs: small box birds in the chunky style of the terrain.
// Their looks are in assets/models/animals/hen.json and egg.json; this file only moves the parts.
import { buildBoxModel } from './box-model.js';

/** A hen about 0.45 m long, facing +z, standing on the ground at the origin. `variant` picks her feather colour.
 *  Returns its group and `tick(t, walk, peck)`: walk 0…2 swings the legs, peck 0…1 dips the head. */
export function makeChicken(variant = 0) {
  const { group, parts } = buildBoxModel('animals/hen', variant);
  const { body, head, tail, legL, legR } = parts;
  const bodyY = body.position.y, headZ = head.position.z;
  const tick = (t, walk, peck) => {
    const w = Math.sin(t * 10);
    legL.rotation.x = w * 0.8 * walk; legR.rotation.x = -w * 0.8 * walk;
    body.position.y = bodyY + Math.abs(w) * 0.015 * walk;
    head.position.z = headZ + w * 0.02 * walk; head.rotation.x = peck * 0.9;
    tail.rotation.x = Math.sin(t * 3) * 0.05;
  };
  return { group, tick };
}

/** An egg, standing on the ground at the origin. */
export function makeEgg() {
  return buildBoxModel('animals/egg').group;
}
