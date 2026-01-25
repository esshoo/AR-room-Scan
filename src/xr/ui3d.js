import * as THREE from "three";
import { state } from "../state.js";

// ---------- 3D UI (Quest) ----------
// هدفها: تعمل داخل XR بدون DOM، وتكون مربوطة بالمعصم (اليد اليسرى).

const _raycaster = new THREE.Raycaster();
const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _camPos = new THREE.Vector3();
const _ctrlPos = new THREE.Vector3();
const _offset = new THREE.Vector3(0.055, -0.015, 0.035); // watch-like offset (left controller local)
const _tmpV = new THREE.Vector3();
const _lookQuat = new THREE.Quaternion();
const _lookMat = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

function getHandedController(handed) {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = c0?.userData?.inputSource?.handedness || c0?.userData?.handedness || null;
  const h1 = c1?.userData?.inputSource?.handedness || c1?.userData?.handedness || null;
  if (handed === "left")  return (h0 === "left")  ? c0 : (h1 === "left")  ? c1 : null;
  if (handed === "right") return (h0 === "right") ? c0 : (h1 === "right") ? c1 : null;
  return null;
}

function getLeftAnchor() {
  // Prefer hand-tracking wrist pose if available (more wrist-accurate)
  const wristPose = state.wristPoseByHandedness?.left || null;
  if (wristPose) return { kind: "wristPose", pose: wristPose };

  const leftCtrl = getHandedController("left");
  if (leftCtrl) return { kind: "controller", obj: leftCtrl };

  return null;
}

function getUIInteractor() {
  // UI interaction is RIGHT-hand only (controller preferred, then right hand)
  const rightCtrl = getHandedController("right");
  if (rightCtrl) return rightCtrl;
  return state.handR || null;
}

function makeCanvasButton(label, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const geom = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geom, mat);

  mesh.userData._canvas = canvas;
  mesh.userData._ctx = ctx;
  mesh.userData._tex = tex;
  mesh.userData._label = label;
  mesh.userData._hover = false;
  mesh.userData._active = false;

  drawButton(mesh);
  return mesh;
}

function drawButton(btn) {
  const ctx = btn.userData._ctx;
  const c = btn.userData._canvas;
  const tex = btn.userData._tex;
  const text = btn.userData._label;
  const hover = btn.userData._hover;
  const active = btn.userData._active;

  ctx.clearRect(0, 0, c.width, c.height);

  const r = 28;
  const x = 12, y = 12, w = c.width - 24, h = c.height - 24;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  ctx.fillStyle = hover ? "rgba(59,130,246,0.92)" : "rgba(20,24,33,0.86)";
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = hover ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.22)";
  ctx.stroke();

  // active marker
  if (active) {
    ctx.fillStyle = "rgba(34,197,94,0.95)";
    ctx.fillRect(x + 14, y + 14, 20, 20);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 44px system-ui, -apple-system, Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);

  tex.needsUpdate = true;
}

function makePanel(pages) {
  const root = new THREE.Group();
  root.name = "UI3D_Root";
  root.scale.set(0.82, 0.82, 0.82);

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  );
  bg.position.set(0, 0, -0.01);
  root.add(bg);

  const pageGroups = [];
  const buttons = [];

  pages.forEach((page, pageIndex) => {
    const g = new THREE.Group();
    g.name = `UI3D_Page_${pageIndex}`;
    root.add(g);
    pageGroups.push(g);

    const cols = page.cols;
    const w = page.btnW;
    const h = page.btnH;
    const dx = page.dx;
    const dy = page.dy;
    const x0 = page.x0;
    const y0 = page.y0;

    page.buttons.forEach((spec, i) => {
      const btn = makeCanvasButton(spec.label, w, h);
      btn.userData.id = spec.id;
      btn.userData.onClick = spec.onClick;
      btn.position.set(x0 + (i % cols) * dx, y0 - Math.floor(i / cols) * dy, 0);
      g.add(btn);
      buttons.push(btn);
    });
  });

  root.userData.buttons = buttons;
  root.userData.pageGroups = pageGroups;
  root.userData.page = 0;
  root.visible = false;
  return root;
}

function setPage(panel, pageIndex) {
  panel.userData.page = pageIndex;
  panel.userData.pageGroups.forEach((g, i) => (g.visible = (i === pageIndex)));
}

function setHover(panel, btn) {
  for (const b of panel.userData.buttons) {
    const isHover = (b === btn);
    if (b.userData._hover !== isHover) {
      b.userData._hover = isHover;
      drawButton(b);
    }
  }
  panel.userData.hovered = btn || null;
}

function raycastButtons(controller, panel) {
  if (!controller) return null;
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _ctrlPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpV.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  _raycaster.set(_ctrlPos, _tmpV);

  // intersect only visible page buttons
  const visibleButtons = panel.userData.buttons.filter((b) => b.parent?.visible);
  const hits = _raycaster.intersectObjects(visibleButtons, false);
  return hits.length ? hits[0].object : null;
}

function updatePanelPose(panel) {
  const xrCam = state.renderer.xr.getCamera(state.camera);

  const anchor = getLeftAnchor();
  if (anchor?.kind === "wristPose") {
    const p = anchor.pose.transform.position;
    const q = anchor.pose.transform.orientation;

    panel.position.set(p.x, p.y, p.z);

    panel.quaternion.set(q.x, q.y, q.z, q.w);
    // Tilt like a watch face (hand tracking wrist)
    panel.rotateX(-0.85);
    panel.rotateZ(0.35);
    return;
  }

  if (anchor?.kind === "controller") {
    const left = anchor.obj;

    // Place near left wrist (controller space)
    left.getWorldPosition(_ctrlPos);
    left.getWorldQuaternion(_tmpQuat);

    // apply local offset in controller orientation
    _tmpV.copy(_offset).applyQuaternion(_tmpQuat);
    panel.position.copy(_ctrlPos).add(_tmpV);

    // Orient with the controller (watch-like), not straight in front of the ray
    panel.quaternion.copy(_tmpQuat);
    panel.rotateX(-1.05);
    panel.rotateZ(0.55);

    // Slightly bias to face the viewer (readability) without snapping
    xrCam.getWorldPosition(_camPos);
    _lookMat.lookAt(panel.position, _camPos, _up);
    _lookQuat.setFromRotationMatrix(_lookMat);
    panel.quaternion.slerp(_lookQuat, 0.22);

    return;
  }

  // Fallback: in front of camera
  xrCam.getWorldPosition(_ctrlPos);
  xrCam.getWorldQuaternion(_tmpQuat);
  _tmpV.set(0, 0, -1).applyQuaternion(_tmpQuat);
  panel.position.copy(_ctrlPos).add(_tmpV.multiplyScalar(0.55));
  panel.position.y -= 0.12;
  panel.quaternion.copy(_tmpQuat);
}

export function setupUI3D(actions) {
  // Page 0: Scan
  const pageScan = {
    cols: 3,
    btnW: 0.105,
    btnH: 0.050,
    dx: 0.115,
    dy: 0.062,
    x0: -0.115,
    y0: 0.085,
    buttons: [
      { id: "planes",   label: "Planes",  onClick: actions.togglePlanes },
      { id: "mesh",     label: "Mesh",    onClick: actions.toggleMesh },
      { id: "freeze",   label: "Freeze",  onClick: actions.toggleFreeze },

      { id: "capture",  label: "Capture", onClick: actions.captureRoom },
      { id: "export",   label: "Export",  onClick: actions.exportGlb },
      { id: "reset",    label: "Reset",   onClick: actions.resetScan },

      { id: "occ",      label: "Occ",     onClick: actions.toggleOcclusion },
      { id: "roomView", label: "View",    onClick: actions.cycleRoomView },
      { id: "tools",    label: "Tools",   onClick: () => { actions.openTools?.(); } },
    ]
  };

  // Page 1: Tools
  const pageTools = {
    cols: 3,
    btnW: 0.105,
    btnH: 0.050,
    dx: 0.115,
    dy: 0.062,
    x0: -0.115,
    y0: 0.085,
    buttons: [
      { id: "t_select", label: "Select", onClick: () => actions.setTool?.("select") },
      { id: "t_move",   label: "Move",   onClick: () => actions.setTool?.("move") },
      { id: "t_rot",    label: "Rotate", onClick: () => actions.setTool?.("rotate") },

      { id: "t_draw",   label: "Draw",   onClick: () => actions.setTool?.("draw") },
      { id: "t_meas",   label: "Measure",onClick: () => actions.setTool?.("measure") },
      { id: "add",      label: "Add",    onClick: actions.toggleAdd },

      { id: "shape",    label: "Shape",  onClick: actions.cycleShape },
      { id: "scaleUp",  label: "Scale+", onClick: actions.scaleUp },
      { id: "scaleDown",label: "Scale-", onClick: actions.scaleDown },

      { id: "color",    label: "Color",  onClick: actions.cycleColor },
      { id: "delete",   label: "Delete", onClick: actions.deleteSelected },
      { id: "clear",    label: "Clear",  onClick: actions.clearMarks },

      { id: "back",     label: "Back",   onClick: () => { actions.backToScan?.(); } }
    ]
  };

  const panel = makePanel([pageScan, pageTools]);
  state.scene.add(panel);
  state.ui3d = panel;
  setPage(panel, 0);

  // Map page switches
  actions.openTools = () => setPage(panel, 1);
  actions.backToScan = () => setPage(panel, 0);

  // Click handling: UI panel is on LEFT wrist, interaction is RIGHT-hand only.
// Debounce rules:
// - requires hovering a button
// - click fires on selectend if the same button is still hovered
// - requires a short hover dwell to avoid accidental presses
const HOVER_DWELL_MS = 120;

const onSelectStart = (evt) => {
  const interactor = getUIInteractor();
  const srcObj = evt?.target || null;
  if (!interactor || !srcObj || srcObj !== interactor) return;

  const hovered = state.ui3d?.userData.hovered || null;
  if (!hovered || typeof hovered.userData.onClick !== "function") return;

  // Mark UI consumed so world tools won't start on the same trigger press.
  state.uiConsumedThisFrame = true;

  state.uiPress = {
    id: hovered.userData.id,
    btn: hovered,
    t0: performance.now()
  };
};

const onSelectEnd = (evt) => {
  const interactor = getUIInteractor();
  const srcObj = evt?.target || null;
  if (!interactor || !srcObj || srcObj !== interactor) return;

  const press = state.uiPress;
  state.uiPress = null;

  const hovered = state.ui3d?.userData.hovered || null;
  if (!press || !hovered || hovered !== press.btn) return;

  // Ensure user actually hovered the button a bit (prevents "brush-by" clicks)
  const hoveredSince = state.ui3d?.userData.hoverStartTime || 0;
  if (performance.now() - hoveredSince < HOVER_DWELL_MS) return;

  state.uiConsumedThisFrame = true;
  hovered.userData.onClick();
};

[state.controller0, state.controller1, state.handL, state.handR].forEach((c) => {
  c?.addEventListener?.("selectstart", onSelectStart);
  c?.addEventListener?.("selectend", onSelectEnd);
});

return panel;
}

export function showUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = true;
  setHover(state.ui3d, null);
  state.uiPress = null;
  updatePanelPose(state.ui3d);
}

export function hideUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = false;
  setHover(state.ui3d, null);
  state.uiPress = null;
}

export function updateUI3D() {
  if (!state.ui3d || !state.ui3d.visible) return;

  updatePanelPose(state.ui3d);

  const interactor = getUIInteractor();
  const hovered = raycastButtons(interactor, state.ui3d) || null;

  // Track hover dwell
  const prev = state.ui3d.userData.hovered || null;
  if (prev !== hovered) {
    state.ui3d.userData.hoverStartTime = performance.now();
  }

  setHover(state.ui3d, hovered);
}

export function setUI3DLabel(id, text) {
  if (!state.ui3d) return;
  const btn = state.ui3d.userData.buttons.find(b => b.userData.id === id);
  if (!btn) return;
  btn.userData._label = text;
  drawButton(btn);
}

export function setUI3DActive(id, active) {
  if (!state.ui3d) return;
  const btn = state.ui3d.userData.buttons.find(b => b.userData.id === id);
  if (!btn) return;
  if (btn.userData._active !== !!active) {
    btn.userData._active = !!active;
    drawButton(btn);
  }
}
