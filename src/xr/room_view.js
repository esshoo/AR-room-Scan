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
