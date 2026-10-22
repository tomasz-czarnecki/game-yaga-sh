// Builds the chunky box models that live as plain data in assets/boxes/*.json (hen, egg, crops, shovel).
// A model is named materials plus boxes, and boxes can sit inside named parts (groups) that the code can move:
//   materials: { name: { colour, roughness?, metalness?, glow? } }   defaults: { roughness, glow }
//   boxes:     [{ size: [x, y, z], material, at: [x, y, z], turn?: [x, y, z] in degrees, shape?: 'sphere' }]
//   parts:     { name: { at?, turn?, boxes?, parts? } }
//   variants:  [{ material: colour }]  colour sets, picked by number (the hens)
//   stages:    [{ boxes?, parts? }]    one look per growth stage, picked by number (the crops)
import * as THREE from './lib/three.module.js';

const files = {};

/** Fetches the model files; call once at boot, before building anything. */
export async function loadBoxModels(names) {
  await Promise.all(names.map(async (name) => {
    files[name] = await fetch(`./assets/boxes/${name}.json`).then((r) => r.json())
      .catch((e) => { throw new Error(`assets/boxes/${name}.json: ${e.message}`); });   // say which file has the typo
  }));
}

const radians = (v) => v.map((d) => (d * Math.PI) / 180);

/** Builds one model. Returns its group, its named parts, and its materials (each keeps its base glow in userData.glow). */
export function buildBoxModel(name, variant = 0, stage = 0) {
  const json = files[name], colours = json.variants ? json.variants[variant % json.variants.length] : {};
  const materials = {}, parts = {}, group = new THREE.Group();
  for (const [id, m] of Object.entries(json.materials)) {
    const colour = colours[id] ?? m.colour, glow = m.glow ?? json.defaults.glow;
    materials[id] = new THREE.MeshStandardMaterial({ color: colour, roughness: m.roughness ?? json.defaults.roughness, metalness: m.metalness ?? 0, emissive: colour, emissiveIntensity: glow });
    materials[id].userData.glow = glow;
  }
  const place = (o, spec) => {
    if (spec.at) o.position.set(...spec.at);
    if (spec.turn) o.rotation.set(...radians(spec.turn));
  };
  const fill = (parent, spec) => {
    for (const b of spec.boxes || []) {
      if (!materials[b.material]) throw new Error(`assets/boxes/${name}.json: no material called "${b.material}"`);
      const sphere = b.shape === 'sphere';
      const mesh = new THREE.Mesh(sphere ? new THREE.SphereGeometry(0.5, 14, 10) : new THREE.BoxGeometry(...b.size), materials[b.material]);
      if (sphere) mesh.scale.set(...b.size);
      place(mesh, b);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    }
    for (const [id, p] of Object.entries(spec.parts || {})) {
      const part = new THREE.Group(); place(part, p);
      parts[id] = part; parent.add(part); fill(part, p);
    }
  };
  fill(group, json.stages ? json.stages[stage] : json);
  return { group, parts, mats: Object.values(materials) };
}
