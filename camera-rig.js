// How the camera frames Pani Yaga at each zoom level. The camera is always a perspective one: far away
// with a tiny field of view it looks isometric, so zoom 0 is the classic view. Zooming out shows a little
// more of the field; zooming in dollies the camera down and in, turning it from the isometric angle to a
// human eye-level view of her and the Box.
import * as THREE from './lib/three.module.js';

export const ZOOM = { min: -1, max: 1 };
const FAR = 300;                                    // default distance: far enough that perspective is barely visible
const DEFAULT = { yaw: Math.PI / 4, pitch: 0.62, minHalfH: 6.5, minHalfW: 5.0, aimY: 1.0 };
const CLOSE = { dist: 5.5, pitch: 0.14, minHalfH: 1.7, minHalfW: 1.6, aimY: 1.25 };
const OUT = 1.6;                                    // zoomed all the way out the view is this much taller

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const framing = (minH, minW, aspect) => Math.max(minH, minW / aspect);   // narrow phones widen the view

/** Camera numbers for a zoom level: half the visible height at her, distance, pitch, yaw, the height the
 *  camera aims at, and `close` (0…1): how far into the human close-up it is. */
export function rigAt(zoom, aspect) {
  const h0 = framing(DEFAULT.minHalfH, DEFAULT.minHalfW, aspect), h1 = framing(CLOSE.minHalfH, CLOSE.minHalfW, aspect);
  const t = Math.max(0, zoom), s = smooth(t);
  return {
    halfH: zoom < 0 ? lerp(h0, h0 * OUT, -zoom) : h0 * Math.pow(h1 / h0, t),
    dist: FAR * Math.pow(CLOSE.dist / FAR, t),
    pitch: lerp(DEFAULT.pitch, CLOSE.pitch, s),
    yaw: DEFAULT.yaw,
    aimY: lerp(DEFAULT.aimY, CLOSE.aimY, s),
    close: t,
  };
}

/** Puts `cam` at the rig's distance from `aim`, looking at `look`, with the field of view that frames
 *  `rig.halfH` at that distance. `floor(x, z)` keeps the camera above the ground. */
export function placeCamera(cam, rig, aim, look, floor = null) {
  const c = Math.cos(rig.pitch);
  cam.position.set(Math.sin(rig.yaw) * c, Math.sin(rig.pitch), Math.cos(rig.yaw) * c).multiplyScalar(rig.dist).add(aim);
  if (floor) cam.position.y = Math.max(cam.position.y, floor(cam.position.x, cam.position.z));
  cam.fov = (2 * Math.atan(rig.halfH / rig.dist) * 180) / Math.PI;
  cam.near = Math.max(0.1, rig.dist - 110);
  cam.far = rig.dist + 200;
  cam.updateProjectionMatrix();
  cam.lookAt(look);
  cam.updateMatrixWorld();
}
