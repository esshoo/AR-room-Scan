import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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

import { setupUI3D, showUI3D, updateUI3D, setUI3DLabel } from "./xr/ui3d.js";
import { setupTools, updateTools } from "./xr/tools.js";

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

// Desktop viewer controls (non-XR)
state.controls = new OrbitControls(state.camera, state.renderer.domElement);
state.controls.enableDamping = true;
state.controls.dampingFactor = 0.08;
state.controls.target.set(0, 1.4, 0);

// lights
state.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.0));
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(2, 4, 1);
state.scene.add(dir);

// (تم حذف مكعب الوسط داخل الغرفة)

// Setup XR visuals + input
setupControllers();
setupHands();
setupHitTestAndPlacement();

// Tools (place/select/move/draw)
const toolActions = setupTools();

// --- Helpers
function disposeObject3D(obj) {
  obj.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
      else o.material.dispose?.();
    }
  });
}

function resetScan() {
  // remove meshes
  for (const m of state.meshObjs.values()) {
    state.scene.remove(m);
    disposeObject3D(m);
  }
  state.meshObjs.clear();

  // remove planes
  for (const l of state.planeLines.values()) {
    state.scene.remove(l);
    disposeObject3D(l);
  }
  state.planeLines.clear();

  state.lastFrame = null;
  state.ui?.log("تم Reset Scan: تم مسح meshes/planes من المشهد.");
}

function fitCameraToObject(root) {
  if (!root) return;

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // fit distance
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(state.camera.fov);
  let dist = maxDim / (2 * Math.tan(fov / 2));
  dist *= 1.2;

  // move camera
  const dir = new THREE.Vector3(0, 0.2, 1).normalize();
  state.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  state.camera.near = Math.max(0.01, dist / 100);
  state.camera.far = Math.max(50, dist * 10);
  state.camera.updateProjectionMatrix();

  state.controls.target.copy(center);
  state.controls.update();
}

// --- UI bindings (Desktop)
state.ui.start.addEventListener("click", async () => {
  try {
    await startXR();

    // Quest performance hints
    const xr = state.renderer.xr;
    xr.setFramebufferScaleFactor?.(0.8);
    xr.setFoveation?.(1);

    // Show 3D UI inside XR
    showUI3D();

    // sync labels
    setUI3DLabel("planes", `Planes:${state.showPlanes ? "ON" : "OFF"}`);
    setUI3DLabel("mesh", `Mesh:${state.showMesh ? "ON" : "OFF"}`);
    setUI3DLabel("freeze", `Freeze:${state.freezeScan ? "ON" : "OFF"}`);
    setUI3DLabel("occ", `Occ:${state.occlusionOn ? "ON" : "OFF"}`);
    setUI3DLabel("roomView", `View:${state.roomViewMode}`);

    state.ui?.log(
      "XR بدأ.\n" +
      "- داخل النظارة: استخدم الليزر واضغط Trigger على لوحة الأزرار داخل المشهد.\n" +
      "- إذا طلب النظام Room Setup / Scene: أكمل ثم ارجع للتجربة."
    );
  } catch (e) {
    state.ui.log(`فشل Start XR:\n${e?.message || e}`);
  }
});

state.ui.stop.addEventListener("click", async () => {
  try { await stopXR(); } catch (e) { state.ui.log(`فشل Stop:\n${e?.message || e}`); }
});

state.ui.capture.addEventListener("click", async () => {
  try { await captureRoom(); } catch (e) { state.ui.log(`فشل Capture:\n${e?.message || e}`); }
});

state.ui.reset.addEventListener("click", resetScan);

state.ui.planes.addEventListener("click", () => {
  togglePlanes();
  setUI3DLabel("planes", `Planes:${state.showPlanes ? "ON" : "OFF"}`);
});
state.ui.mesh.addEventListener("click", () => {
  toggleMesh();
  setUI3DLabel("mesh", `Mesh:${state.showMesh ? "ON" : "OFF"}`);
});
state.ui.freeze.addEventListener("click", () => {
  state.freezeScan = !state.freezeScan;
  state.ui.setFreezeLabel(state.freezeScan);
  state.ui.log(`Freeze: ${state.freezeScan ? "ON" : "OFF"}`);
  setUI3DLabel("freeze", `Freeze:${state.freezeScan ? "ON" : "OFF"}`);
});

state.ui.roomView.addEventListener("click", () => {
  cycleRoomView();
  setUI3DLabel("roomView", `View:${state.roomViewMode}`);
});

state.ui.exportGlb.addEventListener("click", () => exportRoomGLB("PLANES"));

state.ui.importGlbBtn.addEventListener("click", () => state.ui.glbInput.click());
state.ui.glbInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await importRoomGLBFromFile(file);
  fitCameraToObject(state.roomModel);
  state.ui.glbInput.value = "";
});

state.ui.fitView.addEventListener("click", () => {
  if (state.roomModel) fitCameraToObject(state.roomModel);
});

state.ui.toggleOcc.addEventListener("click", () => {
  toggleOcclusion();
  setUI3DLabel("occ", `Occ:${state.occlusionOn ? "ON" : "OFF"}`);
});

state.ui.exportJson.addEventListener("click", () => exportPlacedJSON());
state.ui.importJsonBtn.addEventListener("click", () => state.ui.fileInput.click());
state.ui.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try { await importPlacedJSON(file); }
  catch (err) { state.ui.log("فشل Import: " + (err?.message || err)); }
  finally { state.ui.fileInput.value = ""; }
});

// 3D UI actions (Inside XR)
setupUI3D({
  capture: () => captureRoom(),
  togglePlanes: () => { togglePlanes(); setUI3DLabel("planes", `Planes:${state.showPlanes ? "ON" : "OFF"}`); },
  toggleMesh: () => { toggleMesh(); setUI3DLabel("mesh", `Mesh:${state.showMesh ? "ON" : "OFF"}`); },
  toggleFreeze: () => {
    state.freezeScan = !state.freezeScan;
    state.ui?.setFreezeLabel(state.freezeScan);
    setUI3DLabel("freeze", `Freeze:${state.freezeScan ? "ON" : "OFF"}`);
  },
  exportGlb: () => exportRoomGLB("PLANES"),
  resetScan: () => resetScan(),
  cycleRoomView: () => { cycleRoomView(); setUI3DLabel("roomView", `View:${state.roomViewMode}`); },
  toggleOcclusion: () => { toggleOcclusion(); setUI3DLabel("occ", `Occ:${state.occlusionOn ? "ON" : "OFF"}`); },

  // Tools
  toolSelect: () => toolActions.setToolSelect(),
  toolBox: () => toolActions.setToolPlace("box"),
  toolCircle: () => toolActions.setToolPlace("sphere"),
  toolTriangle: () => toolActions.setToolPlace("triangle"),
  toolMove: () => toolActions.setToolMove(),
  toolDraw: () => toolActions.setToolDraw(),
  color: () => toolActions.color(),
  scaleUp: () => toolActions.scaleUp(),
  scaleDown: () => toolActions.scaleDown(),
  del: () => toolActions.del(),
  clearDraw: () => toolActions.clearDraw()
});

// keyboard: F to fit
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "f" && state.roomModel) fitCameraToObject(state.roomModel);
});

// Render loop
state.renderer.setAnimationLoop((t, frame) => {
  state.refSpace = state.renderer.xr.getReferenceSpace();

  // Desktop controls when not presenting XR
  if (!state.renderer.xr.isPresenting) {
    state.controls.update();
  }

  // Keep XR UI responsive even if reference space isn't available yet
  if (state.renderer.xr.isPresenting) {
    updateUI3D();
  }

  if (frame && state.xrSession && state.refSpace) {
    state.lastFrame = frame;

    updateHandMarkers(frame);
    updateHitTest(frame);
    updatePlanes(frame);
    updateMeshes(frame);
    updateTools();
  }

  state.renderer.render(state.scene, state.camera);
});

window.addEventListener("resize", () => {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
});
