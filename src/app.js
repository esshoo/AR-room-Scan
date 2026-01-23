import * as THREE from "three";
import { state } from "./state.js";
import { createUI } from "./ui/ui.js";

import { setupControllers } from "./xr/controllers.js";
import { setupHands, updateHandMarkers } from "./xr/hands.js";
import { setupHitTestAndPlacement, updateHitTest } from "./xr/hittest.js";
import { togglePlanes, updatePlanes } from "./xr/planes.js";
import { toggleMesh, updateMeshes } from "./xr/meshes.js";
import { startXR, stopXR, captureRoom } from "./xr/session.js";

import { exportRoomGLB } from "./export/export_glb.js";
import { exportPlacedJSON, importPlacedJSON } from "./export/placed_json.js";
import { importRoomGLBFromFile, toggleOcclusion } from "./export/import_glb.js";
import { cycleRoomView } from "./xr/room_view.js";

// UI
state.ui = createUI();
state.ui.setOcclusionLabel(false);
state.ui.setRoomViewLabel("FULL");

// Three init
state.scene = new THREE.Scene();
state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
state.camera.position.set(0, 1.6, 2);

state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
state.renderer.setSize(window.innerWidth, window.innerHeight);
state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
state.renderer.xr.enabled = true;
state.renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(state.renderer.domElement);

state.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.0));

// reference cube
state.refCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.25, 0.25, 0.25),
  new THREE.MeshStandardMaterial({ metalness: 0.0, roughness: 0.3 })
);
state.refCube.position.set(0, 1.2, -1);
state.scene.add(state.refCube);

// Setup XR visuals + input
setupControllers();
setupHands();
setupHitTestAndPlacement();

// UI bindings
state.ui.start.addEventListener("click", async () => {
  try { await startXR(); } catch (e) { state.ui.log(`فشل Start XR:\n${e?.message || e}`); }
});
state.ui.stop.addEventListener("click", async () => {
  try { await stopXR(); } catch (e) { state.ui.log(`فشل Stop:\n${e?.message || e}`); }
});
state.ui.capture.addEventListener("click", async () => {
  try { await captureRoom(); } catch (e) { state.ui.log(`فشل Capture:\n${e?.message || e}`); }
});

state.ui.planes.addEventListener("click", () => togglePlanes());
state.ui.mesh.addEventListener("click", () => toggleMesh());
state.ui.freeze.addEventListener("click", () => {
  state.freezeScan = !state.freezeScan;
  state.ui.setFreezeLabel(state.freezeScan);
  state.ui.log(`Freeze: ${state.freezeScan ? "ON" : "OFF"}`);
});

state.ui.roomView.addEventListener("click", () => cycleRoomView());

// Export/Import room
// ✅ تعديل: نمرر الوضع الافتراضي (يمكنك تغييره لاحقاً ليكون RAW إذا أردت)
state.ui.exportGlb.addEventListener("click", () => exportRoomGLB("PLANES")); 

state.ui.importGlbBtn.addEventListener("click", () => state.ui.glbInput.click());
state.ui.glbInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await importRoomGLBFromFile(file);
  state.ui.glbInput.value = "";
});

state.ui.toggleOcc.addEventListener("click", () => toggleOcclusion());

state.ui.exportJson.addEventListener("click", () => exportPlacedJSON());
state.ui.importJsonBtn.addEventListener("click", () => state.ui.fileInput.click());
state.ui.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try { await importPlacedJSON(file); } catch (err) { state.ui.log("فشل Import: " + (err?.message || err)); } 
  finally { state.ui.fileInput.value = ""; }
});

// Render loop
state.renderer.setAnimationLoop((t, frame) => {
  state.refCube.rotation.y += 0.003;
  state.refSpace = state.renderer.xr.getReferenceSpace();

  if (frame && state.xrSession && state.refSpace) {
    // ✅ (هام جداً) حفظ الفريم لاستخدامه عند التصدير
    state.lastFrame = frame;

    updateHandMarkers(frame);
    updateHitTest(frame);
    updatePlanes(frame);
    updateMeshes(frame);
  }

  state.renderer.render(state.scene, state.camera);
});

window.addEventListener("resize", () => {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
});