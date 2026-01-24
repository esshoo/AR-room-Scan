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

import { setupUI3D, showUI3D, updateUI3D, setUI3DLabel, setUI3DActive } from "./xr/ui3d.js";
import { setupTools, updateTools, onSceneSelect, toolActions } from "./xr/tools.js";

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

// Tools (shapes, move, draw, measure)
setupTools();
state.onSceneSelect = onSceneSelect;
state.toolActions = toolActions();

// --- Locomotion
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _yawQuat = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function updateLocomotion(t) {
  if (!state.renderer.xr.isPresenting) return;
  if (!state.baseRefSpace || !state.xrSession) return;

  const now = (typeof t === "number") ? t : performance.now();
  const last = state._lastT || now;
  const dt = Math.min(0.05, Math.max(0.0, (now - last) / 1000));
  state._lastT = now;

  // left controller thumbstick
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = c0?.userData?.inputSource?.handedness;
  const h1 = c1?.userData?.inputSource?.handedness;
  const left = (h0 === "left") ? c0 : (h1 === "left") ? c1 : (c1 || c0);

  const gp = left?.userData?.inputSource?.gamepad;
  if (!gp || !gp.axes || gp.axes.length < 2) return;

  // Prefer axes[0/1]; fall back to [2/3] if 0/1 are zeros.
  const a0 = gp.axes[0] ?? 0;
  const a1 = gp.axes[1] ?? 0;
  const a2 = (gp.axes.length >= 4 ? gp.axes[2] : 0) ?? 0;
  const a3 = (gp.axes.length >= 4 ? gp.axes[3] : 0) ?? 0;
  const useAlt = (Math.abs(a0) + Math.abs(a1) < 0.01) && (Math.abs(a2) + Math.abs(a3) > 0.01);

  let axX = useAlt ? a2 : a0;
  let axY = useAlt ? a3 : a1;

  const dead = 0.15;
  axX = Math.abs(axX) < dead ? 0 : axX;
  axY = Math.abs(axY) < dead ? 0 : axY;
  if (axX === 0 && axY === 0) return;

  // Fix: left/right swapped on some builds
  const x = -axX;
  const y = axY;

  const xrCam = state.renderer.xr.getCamera(state.camera);
  xrCam.getWorldQuaternion(_tmpQuat);
  _tmpEuler.setFromQuaternion(_tmpQuat, "YXZ");
  const yaw = _tmpEuler.y;
  _yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  _fwd.set(0, 0, -1).applyQuaternion(_yawQuat);
  _right.set(1, 0, 0).applyQuaternion(_yawQuat);

  const speed = 1.6; // m/s
  state.moveOffset.x += (_right.x * x + _fwd.x * y) * speed * dt;
  state.moveOffset.z += (_right.z * x + _fwd.z * y) * speed * dt;

  const rs = state.baseRefSpace.getOffsetReferenceSpace(
    new XRRigidTransform({ x: state.moveOffset.x, y: 0, z: state.moveOffset.z })
  );
  state.currentRefSpace = rs;
  state.refSpace = rs;
  state.renderer.xr.setReferenceSpace?.(rs);
}

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

    // Reference spaces for locomotion offset
    state.baseRefSpace = state.renderer.xr.getReferenceSpace();
    state.currentRefSpace = state.baseRefSpace;
    state.moveOffset.x = 0;
    state.moveOffset.z = 0;
    state._lastT = 0;

    // Hide reference cube in XR
    if (state.refCube) state.refCube.visible = false;

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

    // tools labels
    setUI3DLabel("mode", `Mode:${state.toolMode.toUpperCase()}`);
    setUI3DLabel("add", `Add:${state.addMode ? "ON" : "OFF"}`);
    setUI3DActive("add", state.addMode);
    setUI3DLabel("shape", `Shape:${state.activeShape.toUpperCase()}`);

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
  try {
    await stopXR();
    if (state.refCube) state.refCube.visible = true;
  } catch (e) {
    state.ui.log(`فشل Stop:\n${e?.message || e}`);
  }
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

state.ui.fitView.addEventListener("click", () => fitCameraToObject(state.roomModel || state.refCube));

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
  cycleMode: () => {
    state.toolActions.cycleMode();
    setUI3DLabel("mode", `Mode:${state.toolMode.toUpperCase()}`);
  },
  toggleAdd: () => {
    state.toolActions.toggleAdd();
    setUI3DLabel("add", `Add:${state.addMode ? "ON" : "OFF"}`);
    setUI3DActive("add", state.addMode);
  },
  cycleShape: () => {
    state.toolActions.cycleShape();
    setUI3DLabel("shape", `Shape:${state.activeShape.toUpperCase()}`);
  },
  scaleUp: () => state.toolActions.scaleUp(),
  scaleDown: () => state.toolActions.scaleDown(),
  cycleColor: () => state.toolActions.cycleColor(),
  deleteSelected: () => state.toolActions.deleteSelected(),
  clearMarks: () => state.toolActions.clearMarks()
});

// keyboard: F to fit
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "f") fitCameraToObject(state.roomModel || state.refCube);
});

// Render loop
state.renderer.setAnimationLoop((t, frame) => {
  if (!state.renderer.xr.isPresenting) {
    state.refCube.rotation.y += 0.003;
    state.controls.update();
  }

  // reference space (with locomotion offset)
  state.refSpace = state.currentRefSpace || state.renderer.xr.getReferenceSpace();
  if (state.renderer.xr.isPresenting) updateLocomotion(t);

  if (frame && state.xrSession && state.refSpace) {
    state.lastFrame = frame;

    updateHandMarkers(frame);
    updateHitTest(frame);
    updatePlanes(frame);
    updateMeshes(frame);
    updateUI3D();
    updateTools();
  }

  state.renderer.render(state.scene, state.camera);
});

window.addEventListener("resize", () => {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
});
