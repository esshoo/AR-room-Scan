import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { state } from "../state.js";

function makeOcclusionMaterial() {
  // Depth-only: يحجب الأجسام خلفه بدون ما يظهر
  const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
  m.colorWrite = false; // لا يكتب لون
  m.depthWrite = true;  // يكتب depth
  m.depthTest = true;
  return m;
}

function setOcclusionForObject(root, on) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;

    if (on) {
      if (!obj.userData._origMat) obj.userData._origMat = obj.material;
      obj.material = makeOcclusionMaterial();
      obj.renderOrder = 0;
    } else {
      if (obj.userData._origMat) obj.material = obj.userData._origMat;
      delete obj.userData._origMat;
    }
  });
}

export async function importRoomGLBFromFile(file) {
  if (!file) return;

  const url = URL.createObjectURL(file);

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);

    // remove old model if any
    if (state.roomModel) {
      state.scene.remove(state.roomModel);
      state.roomModel = null;
    }

    const model = gltf.scene || gltf.scenes?.[0];
    if (!model) {
      state.ui?.log("لم يتم العثور على scene داخل الملف.");
      return;
    }

    model.updateMatrixWorld(true);

    // Add to scene
    state.scene.add(model);
    state.roomModel = model;

    // If occlusion already ON, apply it
    if (state.occlusionOn) {
      setOcclusionForObject(model, true);
    }

    state.ui?.log(`تم استيراد GLB: ${file.name}`);
  } catch (e) {
    state.ui?.log("فشل Import GLB: " + (e?.message || e));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function toggleOcclusion() {
  state.occlusionOn = !state.occlusionOn;
  state.ui?.setOcclusionLabel(state.occlusionOn);

  if (!state.roomModel) {
    state.ui?.log(`Occlusion: ${state.occlusionOn ? "ON" : "OFF"} (لا يوجد Room Model مستورد بعد)`);
    return;
  }

  setOcclusionForObject(state.roomModel, state.occlusionOn);
  state.ui?.log(`Occlusion: ${state.occlusionOn ? "ON" : "OFF"}`);
}
