import * as THREE from "three";
import { state } from "../state.js";

function makeRayController() {
  const group = new THREE.Group();

  const rayGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const ray = new THREE.Line(rayGeom, new THREE.LineBasicMaterial());
  ray.scale.z = 1.5;
  group.add(ray);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 16, 16),
    new THREE.MeshStandardMaterial({ roughness: 0.2 })
  );
  tip.position.set(0, 0, -1.5);
  group.add(tip);

  return group;
}

export function setupControllers() {
  const { renderer, scene } = state;

  const c0 = renderer.xr.getController(0);
  const c1 = renderer.xr.getController(1);

  c0.add(makeRayController());
  c1.add(makeRayController());

  c0.addEventListener("connected", (e) => { c0.userData.inputSource = e.data; c0.userData.handedness = e.data?.handedness || null; });
  c1.addEventListener("connected", (e) => { c1.userData.inputSource = e.data; c1.userData.handedness = e.data?.handedness || null; });
  c0.addEventListener("disconnected", () => { c0.userData.inputSource = null; c0.userData.handedness = null; });
  c1.addEventListener("disconnected", () => { c1.userData.inputSource = null; c1.userData.handedness = null; });

  scene.add(c0);
  scene.add(c1);

  state.controller0 = c0;
  state.controller1 = c1;
}
