import * as THREE from "three";
import { state } from "../state.js";

/**
 * UI 3D داخل المشهد لتعمل داخل النظارة (Quest) بدون الحاجة للنقر على DOM.
 * - Raycast من الكنترولر
 * - Select للتفعيل
 */
const _raycaster = new THREE.Raycaster();
const _tmpMatrix = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();

function makeCanvasButton(label, w = 0.20, h = 0.075) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const geom = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geom, mat);

  mesh.userData._canvas = canvas;
  mesh.userData._ctx = ctx;
  mesh.userData._tex = tex;
  mesh.userData._label = label;
  mesh.userData._baseColor = "#0E1117";
  mesh.userData._border = "rgba(255,255,255,0.25)";
  mesh.userData._fg = "#FFFFFF";
  mesh.userData._hover = false;

  drawButton(mesh, label, false);
  return mesh;
}

function drawButton(btnMesh, text, hover) {
  const ctx = btnMesh.userData._ctx;
  const c = btnMesh.userData._canvas;
  const tex = btnMesh.userData._tex;

  ctx.clearRect(0, 0, c.width, c.height);

  // background rounded rect
  const r = 36;
  const x = 16, y = 16, w = c.width - 32, h = c.height - 32;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  ctx.fillStyle = hover ? "rgba(59,130,246,0.92)" : "rgba(20,24,33,0.88)";
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = hover ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.20)";
  ctx.stroke();

  // text
  ctx.fillStyle = "#fff";
  ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);

  tex.needsUpdate = true;
}

function makePanel(buttonSpecs) {
  const root = new THREE.Group();
  root.name = "UI3D_Root";

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.46),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.20 })
  );
  bg.position.set(0, 0, -0.01);
  root.add(bg);

  const buttons = [];

  // grid: 2 cols
  const cols = 2;
  const x0 = -0.24;
  const y0 = 0.16;
  const dx = 0.26;
  const dy = 0.095;

  buttonSpecs.forEach((spec, i) => {
    const btn = makeCanvasButton(spec.label);
    btn.userData.id = spec.id;
    btn.userData.onClick = spec.onClick;
    btn.position.set(x0 + (i % cols) * dx, y0 - Math.floor(i / cols) * dy, 0);
    root.add(btn);
    buttons.push(btn);
  });

  // Make HUD always visible on top
  root.renderOrder = 9999;
  root.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m.depthTest = false; m.depthWrite = false; });
    }
    o.frustumCulled = false;
    o.renderOrder = 9999;
  });

  root.userData.buttons = buttons;
  root.visible = false; // يظهر عند بدء XR
  return root;
}

function getXRWorldCamera() {
  // XR camera (ArrayCamera) when presenting; fallback to normal camera
  return state.renderer?.xr?.getCamera ? state.renderer.xr.getCamera(state.camera) : state.camera;
}

function getLeftInputController() {
  const c0 = state.controller0;
  const c1 = state.controller1;

  const h0 = c0?.userData?.inputSource?.handedness;
  const h1 = c1?.userData?.inputSource?.handedness;

  if (h0 === "left") return c0;
  if (h1 === "left") return c1;

  // fallback: prefer controller1 as "left" on Quest in most cases
  return c1 || c0 || null;
}

function placePanelInFrontOfCamera(panel) {
  const cam = getXRWorldCamera();
  cam.getWorldPosition(_tmpPos);
  cam.getWorldQuaternion(_tmpQuat);

  // place at 0.8m in front of camera, slightly down & left
  _tmpDir.set(0, 0, -1).applyQuaternion(_tmpQuat);
  const p = _tmpPos.clone().add(_tmpDir.multiplyScalar(0.8));
  p.y -= 0.18;

  // nudge left relative to camera yaw
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    new THREE.Euler().setFromQuaternion(_tmpQuat, "YXZ").y
  );
  _tmpVec.set(-0.18, 0, 0).applyQuaternion(yaw);
  p.add(_tmpVec);

  panel.position.copy(p);
  panel.quaternion.copy(yaw);
  panel.rotateY(Math.PI);   // face camera
  panel.rotateX(-0.45);     // tilt a bit
}

function placePanelOnLeftWrist(panel) {
  const left = getLeftInputController();
  if (!left) return false;

  left.updateMatrixWorld?.(true);
  left.getWorldPosition(_tmpPos);
  left.getWorldQuaternion(_tmpQuat);

  // wrist offset in controller local space (tweakable)
  const localOffset = new THREE.Vector3(0.08, 0.04, -0.06);
  const worldOffset = localOffset.applyQuaternion(_tmpQuat);
  const p = _tmpPos.clone().add(worldOffset);

  // orient panel to face camera (yaw only) but stay near wrist
  const cam = getXRWorldCamera();
  cam.getWorldQuaternion(_tmpQuat);
  const yawY = new THREE.Euler().setFromQuaternion(_tmpQuat, "YXZ").y;
  const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawY);

  panel.position.copy(p);
  panel.quaternion.copy(yawQuat);
  panel.rotateY(Math.PI);
  panel.rotateX(-0.55);

  return true;
}

function setHover(panel, btn) {
  const buttons = panel.userData.buttons;
  for (const b of buttons) {
    const isHover = (b === btn);
    if (b.userData._hover !== isHover) {
      b.userData._hover = isHover;
      drawButton(b, b.userData._label, isHover);
    }
  }
  panel.userData.hovered = btn || null;
}

function raycastFromController(controller, panel) {
  if (!controller) return null;

  _tmpMatrix.identity().extractRotation(controller.matrixWorld);
  _tmpPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMatrix).normalize();

  _raycaster.set(_tmpPos, _tmpDir);
  const hits = _raycaster.intersectObjects(panel.userData.buttons, false);
  return hits.length ? hits[0].object : null;
}

export function setupUI3D(actions) {
  const specs = [
    { id: "capture",  label: "Capture", onClick: actions.capture },
    { id: "planes",   label: "Planes",  onClick: actions.togglePlanes },
    { id: "mesh",     label: "Mesh",    onClick: actions.toggleMesh },
    { id: "freeze",   label: "Freeze",  onClick: actions.toggleFreeze },
    { id: "export",   label: "Export",  onClick: actions.exportGlb },
    { id: "reset",    label: "Reset",   onClick: actions.resetScan },
    { id: "roomView", label: "View",    onClick: actions.cycleRoomView },
    { id: "occ",      label: "Occ",     onClick: actions.toggleOcclusion }
  ];

  const panel = makePanel(specs);
  state.scene.add(panel);
  state.ui3d = panel;

  const onSelect = () => {
    const hovered = state.ui3d?.userData.hovered;
    if (hovered && typeof hovered.userData.onClick === "function") {
      // Prevent placement handler from also firing (cube placement)
      state.ui3dConsumeUntil = performance.now() + 120;
      hovered.userData.onClick();
    }
  };

  // bind controller select to click
  state.controller0?.addEventListener("select", onSelect);
  state.controller1?.addEventListener("select", onSelect);

  return panel;
}

export function showUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = true;
  // Prefer left wrist; fallback to front-of-camera HUD
  const ok = placePanelOnLeftWrist(state.ui3d);
  if (!ok) placePanelInFrontOfCamera(state.ui3d);

  setHover(state.ui3d, null);
}

export function hideUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = false;
  setHover(state.ui3d, null);
}

export function updateUI3D() {
  if (!state.ui3d || !state.ui3d.visible) return;

  // keep panel attached (wrist) while in XR
  const ok = placePanelOnLeftWrist(state.ui3d);
  if (!ok) placePanelInFrontOfCamera(state.ui3d);

  // raycast
  const h0 = raycastFromController(state.controller0, state.ui3d);
  const h1 = raycastFromController(state.controller1, state.ui3d);

  const hovered = h0 || h1 || null;
  setHover(state.ui3d, hovered);
  state.ui3dHovering = !!hovered;
}


export function setUI3DLabel(id, text) {
  if (!state.ui3d) return;
  const btn = state.ui3d.userData.buttons.find(b => b.userData.id === id);
  if (!btn) return;
  btn.userData._label = text;
  drawButton(btn, text, btn.userData._hover);
}
