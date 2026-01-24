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

  // Always visible in MR (avoid being occluded by depth or scene mesh)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
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
  mesh.userData._selected = false;

  drawButton(mesh, label, false, false);
  return mesh;
}

function drawButton(btnMesh, text, hover, selected) {
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
  ctx.strokeStyle = selected
    ? "rgba(34,197,94,0.95)"
    : (hover ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.20)");
  ctx.stroke();

  // selected mark (square)
  if (selected) {
    ctx.save();
    ctx.fillStyle = "rgba(34,197,94,0.95)";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4;
    const sx = x + w - 62;
    const sy = y + 22;
    const ss = 32;
    ctx.beginPath();
    ctx.rect(sx, sy, ss, ss);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

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

  const cols = 2;
  const x0 = -0.33;
  const y0 = 0.26;
  const dx = 0.36;
  const dy = 0.13;

  const rows = Math.ceil(buttonSpecs.length / cols);
  const bgH = Math.max(0.62, 0.18 + rows * dy);

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.70, bgH),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.20,
      depthTest: false,
      depthWrite: false
    })
  );
  bg.position.set(0, 0, -0.01);
  root.add(bg);

  const buttons = [];

  // grid: 2 cols

  buttonSpecs.forEach((spec, i) => {
    const btn = makeCanvasButton(spec.label);
    btn.userData.id = spec.id;
    btn.userData.onClick = spec.onClick;
    btn.position.set(x0 + (i % cols) * dx, y0 - Math.floor(i / cols) * dy, 0);
    root.add(btn);
    buttons.push(btn);
  });

  // ensure overlay-like rendering
  root.renderOrder = 9999;
  for (const b of buttons) b.renderOrder = 10000;

  root.userData.buttons = buttons;
  root.visible = false; // يظهر عند بدء XR
  return root;
}

function isControllerConnected(ctrl) {
  return !!(ctrl && ctrl.userData && ctrl.userData.inputSource);
}

function getXRCamera() {
  // In XR, Three.js renders with a derived XR camera. Attaching UI as a child
  // of the base camera may not render. Use the XR camera pose instead.
  try {
    return state.renderer?.xr?.getCamera?.(state.camera) || state.camera;
  } catch {
    return state.camera;
  }
}

function attachPanelToCameraHUD(panel) {
  // Keep panel in the scene, but position it each frame relative to XR camera pose.
  if (panel.parent !== state.scene) {
    panel.parent?.remove(panel);
    state.scene.add(panel);
  }
  panel.userData._attached = true;
  panel.userData._attachedTo = "camera";
}

function attachPanelToLeftHand(panel) {
  // Only attach to a real tracked controller (connected inputSource)
  const c0 = isControllerConnected(state.controller0) ? state.controller0 : null;
  const c1 = isControllerConnected(state.controller1) ? state.controller1 : null;

  const left = (c0?.userData?.inputSource?.handedness === "left")
    ? c0
    : ((c1?.userData?.inputSource?.handedness === "left") ? c1 : (c0 || c1));

  if (!left) return false;

  // attach as child so it follows the hand
  if (panel.parent !== left) {
    panel.parent?.remove(panel);
    left.add(panel);
  }
  // offset near left hand/wrist
  panel.position.set(0.10, 0.06, -0.06);
  panel.rotation.set(-0.35, 0.25, 0);
  panel.userData._attached = true;
  panel.userData._attachedTo = "controller";
  return true;
}

function facePanelToCamera(panel) {
  const cam = getXRCamera();
  if (!panel.userData._attached) return;

  // compute desired world quaternion to face camera
  panel.getWorldPosition(_tmpPos);
  cam.getWorldPosition(_tmpVec);
  const look = _tmpVec.clone().sub(_tmpPos).normalize();
  // Build quaternion that looks at camera (panel forward is +Z for PlaneGeometry, but our plane faces +Z? we want -Z)
  const m = new THREE.Matrix4().lookAt(_tmpPos, _tmpVec, new THREE.Vector3(0, 1, 0));
  const qWorld = new THREE.Quaternion().setFromRotationMatrix(m);

  // convert to local relative to parent
  const parent = panel.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_tmpQuat);
  const qLocal = qWorld.clone().premultiply(_tmpQuat.clone().invert());
  panel.quaternion.copy(qLocal);
}

function placePanelInFrontOfCamera(panel) {
  const cam = getXRCamera();
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
      drawButton(b, b.userData._label, isHover, !!b.userData._selected);
    }
  }
  panel.userData.hovered = btn || null;
}

function setSelected(panel, id) {
  const buttons = panel.userData.buttons;
  for (const b of buttons) {
    const shouldSelect = (b.userData.id === id);
    // only tool buttons use selection state (we allow selecting any id passed)
    if (b.userData._selected !== shouldSelect) {
      b.userData._selected = shouldSelect;
      drawButton(b, b.userData._label, !!b.userData._hover, shouldSelect);
    }
  }
  panel.userData._selectedId = id;
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
    // Tools
    { id: "tool_select",   label: "Tool:Select",  onClick: () => actions.toolSelect?.() },
    { id: "tool_box",      label: "Add:Box",      onClick: () => actions.toolBox?.() },
    { id: "tool_circle",   label: "Add:Circle",   onClick: () => actions.toolCircle?.() },
    { id: "tool_triangle", label: "Add:Triangle", onClick: () => actions.toolTriangle?.() },
    { id: "tool_move",     label: "Tool:Move",    onClick: () => actions.toolMove?.() },
    { id: "tool_draw",     label: "Tool:Draw",    onClick: () => actions.toolDraw?.() },

    // Edit actions
    { id: "act_color",   label: "Color",   onClick: () => actions.color?.() },
    { id: "act_scaleUp", label: "Scale +", onClick: () => actions.scaleUp?.() },
    { id: "act_scaleDn", label: "Scale -", onClick: () => actions.scaleDown?.() },
    { id: "act_delete",  label: "Delete",  onClick: () => actions.del?.() },
    { id: "act_clear",   label: "ClearDraw", onClick: () => actions.clearDraw?.() },

    // Scan/Export
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
      // selection mark for tools
      if (hovered.userData.id?.startsWith("tool_")) {
        setSelected(state.ui3d, hovered.userData.id);
      }
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
  // Prefer controller, otherwise pin to camera HUD (reliable)
  state.ui3d.userData._attached = false;
  state.ui3d.userData._attachedTo = null;
  const ok = attachPanelToLeftHand(state.ui3d);
  if (!ok) attachPanelToCameraHUD(state.ui3d);
  setHover(state.ui3d, null);
  // default selected tool
  setSelected(state.ui3d, "tool_select");
}

export function hideUI3D() {
  if (!state.ui3d) return;
  state.ui3d.visible = false;
  setHover(state.ui3d, null);
}

export function updateUI3D() {
  if (!state.ui3d || !state.ui3d.visible) return;

  // controllers may connect after session start — if we're on camera HUD, switch to left controller when available
  if (state.ui3d.userData._attachedTo !== "controller") {
    const ok = attachPanelToLeftHand(state.ui3d);
    if (!ok) {
      // keep HUD attached
      attachPanelToCameraHUD(state.ui3d);
    }
  }

  // If attached to camera HUD, keep it in a stable spot in view
  if (state.ui3d.userData._attachedTo === "camera") {
    const cam = getXRCamera();
    cam.getWorldPosition(_tmpPos);
    cam.getWorldQuaternion(_tmpQuat);

    // HUD offset in camera-local space
    const off = _tmpVec.set(-0.22, -0.12, -0.55).applyQuaternion(_tmpQuat);
    state.ui3d.position.copy(_tmpPos.clone().add(off));
    state.ui3d.quaternion.copy(_tmpQuat);
  }

  // allow re-center with A/X long press later; for now just raycast
  const h0 = raycastFromController(state.controller0, state.ui3d);
  const h1 = raycastFromController(state.controller1, state.ui3d);

  const hovered = h0 || h1 || null;
  setHover(state.ui3d, hovered);

  // Keep panel facing the camera only when attached to controller
  if (state.ui3d.userData._attachedTo === "controller") {
    facePanelToCamera(state.ui3d);
  }
}

export function setUI3DLabel(id, text) {
  if (!state.ui3d) return;
  const btn = state.ui3d.userData.buttons.find(b => b.userData.id === id);
  if (!btn) return;
  btn.userData._label = text;
  drawButton(btn, text, btn.userData._hover, !!btn.userData._selected);
}

export function setUI3DSelected(id) {
  if (!state.ui3d) return;
  setSelected(state.ui3d, id);
}
