import { DoubleSide, Group, Mesh, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Cessna 172 by e737 (https://sketchfab.com/e0057537), CC BY 4.0.
// Real-world meters, Y-up, nose along local -X. We turn the nose to +Z
// so it matches the flight basis, and drop the wheels onto y = 0.
const NOSE_TO_FORWARD = Math.PI / 2;
const WHEEL_DROP = 1.36;

function isMesh(obj: Object3D): obj is Mesh {
  return (obj as Mesh).isMesh === true;
}

export function makeCraft() {
  const craft = new Group();
  const prop = new Group();
  craft.add(prop);

  const loader = new GLTFLoader();
  loader.load("/models/c172.glb", (gltf) => {
    const model = gltf.scene;
    model.rotation.y = NOSE_TO_FORWARD;
    model.position.y = WHEEL_DROP;
    model.traverse((obj) => {
      if (!isMesh(obj)) return;
      obj.frustumCulled = false;
      const mats = (Array.isArray(obj.material) ? obj.material : [obj.material]) as Material[];
      for (const mat of mats) {
        if (!mat) continue;
        mat.side = DoubleSide;
        const std = mat as Material & { envMapIntensity?: number; roughness?: number };
        if (typeof std.envMapIntensity === "number") std.envMapIntensity = 0.85;
        if (typeof std.roughness === "number" && std.roughness < 0.2) std.roughness = 0.35;
      }
    });
    craft.add(model);
  });

  return { craft, prop };
}
