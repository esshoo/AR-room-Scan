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

function makeCanvasButton(label, w = 0.28, h = 0.10) {
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
    new THREE.PlaneGeometry(0.70, 0.62),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.20 })
  );
  bg.position.set(0, 0, -0.01);
  root.add(bg);

  const buttons = [];

  // grid: 2 cols
  const cols = 2;
  const x0 = -0.33;
  const y0 = 0.22;
  const dx = 0.36;
  const dy = 0.13;

  buttonSpecs.forEach((spec, i) => {
    const btn = makeCanvasButton(spec.label);
    btn.userData.id = spec.id;
    btn.userData.onClick = spec.onClick;
    btn.position.set(x0 + (i % cols) * dx, y0 - Math.floor(i / cols) * dy, 0);
    root.add(btn);
    buttons.push(btn);
  });

  root.userData.buttons = buttons;
  root.visible = false; // يظهر عند بدء XR
  return root;
}

function placePanelInFrontOfCamera(panel) {
  const cam = state.camera;
  cam.getWorldPosition(_tmpPos);
  cam.getWorldQuaternion(_tmpQuat);

  // place at 1m in front of camera, slightly down
  _tmpDir.set(0, 0, -1).applyQuaternion(_tmpQuat);
  const p = _tmpPos.clone().add(_tmpDir.multiplyScalar(1.0));
  p.y -= 0.15;

  panel.position.copy(p);
  panel.quaternion.copy(_tmpQuat);
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
      hovered.userData.onClick();
    }
  };

  // bind controller select to click
  state.controller0?.addEventListener("selectstart", onSelect);
  state.controller1?.addEventListener("selectstart", onSelect);

  return panel;
}

export function showUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = true;
  placePanelInFrontOfCamera(state.ui3d);
  setHover(state.ui3d, null);
}

export function hideUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = false;
  setHover(state.ui3d, null);
}

export function updateUI3D() {
  if (!state.ui3d || !state.ui3d.visible) return;

  // allow re-center with A/X long press later; for now just raycast
  const h0 = raycastFromController(state.controller0, state.ui3d);
  const h1 = raycastFromController(state.controller1, state.ui3d);

  const hovered = h0 || h1 || null;
  setHover(state.ui3d, hovered);
}

export function setUI3DLabel(id, text) {
  if (!state.ui3d) return;
  const btn = state.ui3d.userData.buttons.find(b => b.userData.id === id);
  if (!btn) return;
  btn.userData._label = text;
  drawButton(btn, text, btn.userData._hover);
}
