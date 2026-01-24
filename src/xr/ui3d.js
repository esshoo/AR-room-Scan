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
const _offset = new THREE.Vector3(0.06, 0.02, -0.10); // offset from controller (local)
const _tmpV = new THREE.Vector3();

function getLeftController() {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = c0?.userData?.inputSource?.handedness;
  const h1 = c1?.userData?.inputSource?.handedness;
  return (h0 === "left") ? c0 : (h1 === "left") ? c1 : (c1 || c0);
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

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.50, 0.38),
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
  const left = getLeftController();
  const xrCam = state.renderer.xr.getCamera(state.camera);
  xrCam.getWorldPosition(_camPos);

  if (left) {
    left.getWorldPosition(_ctrlPos);
    left.getWorldQuaternion(_tmpQuat);
    const off = _offset.clone().applyQuaternion(_tmpQuat);
    panel.position.copy(_ctrlPos).add(off);

    // billboard facing camera yaw (readable)
    xrCam.getWorldQuaternion(_tmpQuat);
    _tmpEuler.setFromQuaternion(_tmpQuat, "YXZ");
    const yaw = _tmpEuler.y;
    panel.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    panel.rotateX(-0.35);
    return;
  }

  // Fallback: in front of camera
  xrCam.getWorldPosition(_ctrlPos);
  xrCam.getWorldQuaternion(_tmpQuat);
  _tmpV.set(0, 0, -1).applyQuaternion(_tmpQuat);
  panel.position.copy(_ctrlPos).add(_tmpV.multiplyScalar(0.65));
  panel.position.y -= 0.18;
  panel.quaternion.copy(_tmpQuat);
}

export function setupUI3D(actions) {
  // Page 0: Scan
  const pageScan = {
    cols: 2,
    btnW: 0.22,
    btnH: 0.085,
    dx: 0.24,
    dy: 0.105,
    x0: -0.12,
    y0: 0.12,
    buttons: [
      { id: "planes",   label: "Planes",  onClick: actions.togglePlanes },
      { id: "mesh",     label: "Mesh",    onClick: actions.toggleMesh },
      { id: "freeze",   label: "Freeze",  onClick: actions.toggleFreeze },
      { id: "export",   label: "Export",  onClick: actions.exportGlb },
      { id: "reset",    label: "Reset",   onClick: actions.resetScan },
      { id: "tools",    label: "Tools",   onClick: () => { actions.openTools?.(); } },
      { id: "occ",      label: "Occ",     onClick: actions.toggleOcclusion },
      { id: "roomView", label: "View",    onClick: actions.cycleRoomView }
    ]
  };

  // Page 1: Tools
  const pageTools = {
    cols: 3,
    btnW: 0.15,
    btnH: 0.078,
    dx: 0.165,
    dy: 0.095,
    x0: -0.16,
    y0: 0.12,
    buttons: [
      { id: "mode",   label: "Mode",   onClick: actions.cycleMode },
      { id: "add",    label: "Add",    onClick: actions.toggleAdd },
      { id: "shape",  label: "Shape",  onClick: actions.cycleShape },
      { id: "scaleUp",   label: "Scale+", onClick: actions.scaleUp },
      { id: "scaleDown", label: "Scale-", onClick: actions.scaleDown },
      { id: "color",  label: "Color",  onClick: actions.cycleColor },
      { id: "delete", label: "Delete", onClick: actions.deleteSelected },
      { id: "clear",  label: "Clear",  onClick: actions.clearMarks },
      { id: "back",   label: "Back",   onClick: () => { actions.backToScan?.(); } }
    ]
  };

  const panel = makePanel([pageScan, pageTools]);
  state.scene.add(panel);
  state.ui3d = panel;
  setPage(panel, 0);

  // Map page switches
  actions.openTools = () => setPage(panel, 1);
  actions.backToScan = () => setPage(panel, 0);

  // Click handling: use selectstart (instant)
  const onSelectStart = () => {
    const hovered = state.ui3d?.userData.hovered;
    if (hovered && typeof hovered.userData.onClick === "function") {
      state.uiConsumedSelect = true;
      hovered.userData.onClick();
    }
  };
  state.controller0?.addEventListener("selectstart", onSelectStart);
  state.controller1?.addEventListener("selectstart", onSelectStart);

  return panel;
}

export function showUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = true;
  setHover(state.ui3d, null);
  updatePanelPose(state.ui3d);
}

export function hideUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = false;
  setHover(state.ui3d, null);
}

export function updateUI3D() {
  if (!state.ui3d || !state.ui3d.visible) return;

  updatePanelPose(state.ui3d);

  const h0 = raycastButtons(state.controller0, state.ui3d);
  const h1 = raycastButtons(state.controller1, state.ui3d);
  const hovered = h0 || h1 || null;
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
