import * as THREE from "three";
import { state } from "../state.js";

function setWireframeOnImportedRoom(on) {
  if (!state.roomModel) return;

  state.roomModel.traverse((obj) => {
    if (!obj.isMesh) return;

    // إذا occlusion ON، المادة depth-only، لا نعدل wireframe
    if (state.occlusionOn) return;

    if (obj.material) {
      obj.material.wireframe = !!on;
      if (on) {
        obj.material.transparent = true;
        obj.material.opacity = 1.0;
      }
      obj.material.needsUpdate = true;
    }
  });
}

function clearScanMeshes() {
  for (const m of state.meshObjs.values()) state.scene.remove(m);
  state.meshObjs.clear();
}

function clearScanPlanes() {
  for (const l of state.planeLines.values()) state.scene.remove(l);
  state.planeLines.clear();
}

export function cycleRoomView() {
  const order = ["FULL", "WIRE", "PLANES"];
  const i = order.indexOf(state.roomViewMode);
  state.roomViewMode = order[(i + 1) % order.length];
  state.ui?.setRoomViewLabel(state.roomViewMode);

  // FULL: أظهر mesh (المسح) وأخفِ planes، وwireframe OFF
  if (state.roomViewMode === "FULL") {
    state.showMesh = true;
    state.showPlanes = false;
    state.ui?.setMeshLabel(true);
    state.ui?.setPlanesLabel(false);

    setWireframeOnImportedRoom(false);
    state.ui?.log("Room View: FULL");
    return;
  }

  // WIRE: mesh ON + wireframe ON، planes OFF
  if (state.roomViewMode === "WIRE") {
    state.showMesh = true;
    state.showPlanes = false;
    state.ui?.setMeshLabel(true);
    state.ui?.setPlanesLabel(false);

    setWireframeOnImportedRoom(true);
    state.ui?.log("Room View: WIRE");
    return;
  }

  // PLANES: planes ON فقط (نخفي mesh scan)
  if (state.roomViewMode === "PLANES") {
    state.showMesh = false;
    state.showPlanes = true;
    state.ui?.setMeshLabel(false);
    state.ui?.setPlanesLabel(true);

    // نخفي scan mesh الحالي لتصفية العرض
    clearScanMeshes();

    // ملاحظة: planes سيتم رسمها عبر updatePlanes طالما showPlanes=true
    state.ui?.log("Room View: PLANES");
  }
}


// -----------------------------
// Model (GLB) overlays: use the imported GLB as your "virtual room"
// These are lightweight and do NOT require Quest Room/Scene features.
// -----------------------------
function setModelWireframe(on) {
  state.showModelWire = !!on;
  if (!state.roomModel) return;
  state.roomModel.traverse((obj) => {
    if (!obj.isMesh) return;
    // If occlusion is ON, material is depth-only; don't switch it
    if (state.occlusionOn) return;
    const mat = obj.material;
    if (!mat) return;
    if (Array.isArray(mat)) {
      mat.forEach((m) => { if (m) { m.wireframe = !!on; m.needsUpdate = true; }});
    } else {
      mat.wireframe = !!on;
      mat.needsUpdate = true;
    }
  });
}

function ensureModelEdgesGroup() {
  if (!state.roomModel) return null;
  if (state.modelEdgesGroup) return state.modelEdgesGroup;

  const g = new THREE.Group();
  g.name = "ModelEdges";
  g.visible = false;

  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

  state.roomModel.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const eg = new THREE.EdgesGeometry(obj.geometry, 20);
    const ls = new THREE.LineSegments(eg, mat);
    ls.matrixAutoUpdate = false;
    // copy world transform of mesh into line segment (so it matches exactly)
    obj.updateWorldMatrix(true, false);
    ls.matrix.copy(obj.matrixWorld);
    g.add(ls);
  });

  state.scene.add(g);
  state.modelEdgesGroup = g;
  return g;
}

export function toggleModelEdges() {
  const g = ensureModelEdgesGroup();
  if (!g) return;
  state.showModelEdges = !state.showModelEdges;
  g.visible = state.showModelEdges;
  state.ui?.log(state.showModelEdges ? "Model Planes/Edges: ON" : "Model Planes/Edges: OFF");
}

export function toggleModelWire() {
  const next = !state.showModelWire;
  setModelWireframe(next);
  state.ui?.log(next ? "Model Mesh Wireframe: ON" : "Model Mesh Wireframe: OFF");
}

export function cycleModelView() {
  // FULL -> WIRE -> EDGES -> FULL
  if (!state.roomModel) return;
  if (!state.showModelWire && !state.showModelEdges) {
    // FULL -> WIRE
    setModelWireframe(true);
    if (state.modelEdgesGroup) state.modelEdgesGroup.visible = false;
    state.showModelEdges = false;
    state.ui?.log("Model View: WIRE");
    return "WIRE";
  }
  if (state.showModelWire && !state.showModelEdges) {
    // WIRE -> EDGES
    setModelWireframe(false);
    const g = ensureModelEdgesGroup();
    if (g) g.visible = true;
    state.showModelEdges = true;
    state.ui?.log("Model View: EDGES");
    return "EDGES";
  }
  // EDGES -> FULL
  setModelWireframe(false);
  if (state.modelEdgesGroup) state.modelEdgesGroup.visible = false;
  state.showModelEdges = false;
  state.ui?.log("Model View: FULL");
  return "FULL";
}
