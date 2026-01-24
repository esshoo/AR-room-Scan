import * as THREE from "three";
import { state } from "../state.js";

const _raycaster = new THREE.Raycaster();
const _tmpMatrix = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();

const COLOR_PALETTE = [
  0xffffff,
  0x3b82f6,
  0x22c55e,
  0xf59e0b,
  0xef4444,
  0xa855f7,
  0x06b6d4
];

function handednessOf(c) {
  return c?.userData?.inputSource?.handedness || null;
}

function getController(handedness) {
  const c0 = state.controller0;
  const c1 = state.controller1;
  if (handednessOf(c0) === handedness) return c0;
  if (handednessOf(c1) === handedness) return c1;
  // fallback: index 0 is usually left, but not guaranteed
  return handedness === "left" ? (c0 || c1) : (c1 || c0);
}

function isHoveringUI() {
  return !!(state.ui3d?.visible && state.ui3d?.userData?.hovered);
}

function makeShape(type) {
  let geometry;
  switch (type) {
    case "sphere":
      geometry = new THREE.SphereGeometry(0.08, 18, 14);
      break;
    case "triangle":
      // triangular prism (stable, easy selection)
      geometry = new THREE.CylinderGeometry(0.09, 0.09, 0.10, 3);
      break;
    case "box":
    default:
      geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: COLOR_PALETTE[state.selectedColorIndex % COLOR_PALETTE.length],
    metalness: 0.0,
    roughness: 0.35
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.kind = "placed";
  mesh.userData.shapeType = type;
  return mesh;
}

function poseToObject3D(pose, obj) {
  obj.position.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );
  obj.quaternion.set(
    pose.transform.orientation.x,
    pose.transform.orientation.y,
    pose.transform.orientation.z,
    pose.transform.orientation.w
  );
}

function selectObject(obj) {
  state.selectedObject = obj || null;
  if (!state._selectionBox) {
    state._selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x3b82f6);
    state._selectionBox.visible = false;
    state.scene.add(state._selectionBox);
  }
  if (!obj) {
    state._selectionBox.visible = false;
    return;
  }
  state._selectionBox.setFromObject(obj);
  state._selectionBox.visible = true;
}

function raycastPlaced(controller) {
  if (!controller || !state.placedGroup) return null;

  _tmpMatrix.identity().extractRotation(controller.matrixWorld);
  _tmpPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMatrix).normalize();

  _raycaster.set(_tmpPos, _tmpDir);
  const hits = _raycaster.intersectObjects(state.placedGroup.children, true);
  if (!hits.length) return null;
  // climb to direct child of placedGroup
  let o = hits[0].object;
  while (o && o.parent && o.parent !== state.placedGroup) o = o.parent;
  return o || null;
}

function startDrawing() {
  if (!state.drawGroup) {
    state.drawGroup = new THREE.Group();
    state.drawGroup.name = "DrawGroup";
    state.scene.add(state.drawGroup);
  }
  state._drawing = true;
  state._drawPoints = [];

  const geom = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({
    color: COLOR_PALETTE[state.selectedColorIndex % COLOR_PALETTE.length]
  });
  const line = new THREE.Line(geom, mat);
  line.frustumCulled = false;
  state.drawGroup.add(line);
  state._drawLine = line;
}

function stopDrawing() {
  state._drawing = false;
  state._drawLine = null;
  state._drawPoints = [];
}

function updateDrawing() {
  if (!state._drawing || !state._drawLine) return;

  const right = getController("right");
  if (!right) return;

  // tip point ~ 1.5m forward (matches visual ray)
  const p = new THREE.Vector3(0, 0, -1.5).applyMatrix4(right.matrixWorld);
  const pts = state._drawPoints;

  // sample distance threshold
  if (pts.length) {
    const last = pts[pts.length - 1];
    if (last.distanceToSquared(p) < 0.0002) return;
  }

  pts.push(p);
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  state._drawLine.geometry.dispose?.();
  state._drawLine.geometry = geom;
}

function placeAtReticle(shapeType) {
  const pose = state.lastReticlePose;
  if (!pose || !state.placedGroup) return;
  const mesh = makeShape(shapeType);
  poseToObject3D(pose, mesh);
  state.placedGroup.add(mesh);
  selectObject(mesh);
}

function moveSelectedToReticle() {
  const pose = state.lastReticlePose;
  const obj = state.selectedObject;
  if (!pose || !obj) return;
  poseToObject3D(pose, obj);
}

function cycleSelectedColor() {
  state.selectedColorIndex = (state.selectedColorIndex + 1) % COLOR_PALETTE.length;
  const obj = state.selectedObject;
  if (obj?.material?.color) obj.material.color.setHex(COLOR_PALETTE[state.selectedColorIndex]);
}

function scaleSelected(mult) {
  const obj = state.selectedObject;
  if (!obj) return;
  obj.scale.multiplyScalar(mult);
  if (state._selectionBox?.visible) state._selectionBox.setFromObject(obj);
}

function deleteSelected() {
  const obj = state.selectedObject;
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse?.((o) => {
    o.geometry?.dispose?.();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
      else o.material.dispose?.();
    }
  });
  selectObject(null);
}

function clearDrawings() {
  if (!state.drawGroup) return;
  for (const c of [...state.drawGroup.children]) {
    c.geometry?.dispose?.();
    c.material?.dispose?.();
    state.drawGroup.remove(c);
  }
}

export function setupTools() {
  const right = getController("right");
  const left = getController("left");

  const onSelectStart = () => {
    if (isHoveringUI()) return; // click is for UI

    if (state.activeTool === "draw") {
      startDrawing();
      return;
    }

    if (state.activeTool === "place") {
      placeAtReticle(state.activeItemType);
      return;
    }

    if (state.activeTool === "move") {
      state._moving = true;
      moveSelectedToReticle();
      return;
    }

    // select tool
    const picked = raycastPlaced(getController("right"));
    if (picked) selectObject(picked);
  };

  const onSelectEnd = () => {
    state._moving = false;
    if (state.activeTool === "draw") stopDrawing();
  };

  // bind to both controllers (hand tracking also fires select, but this is ok)
  right?.addEventListener("selectstart", onSelectStart);
  right?.addEventListener("selectend", onSelectEnd);
  left?.addEventListener("selectstart", onSelectStart);
  left?.addEventListener("selectend", onSelectEnd);

  // Expose actions for UI3D
  return {
    setToolSelect: () => { state.activeTool = "select"; },
    setToolPlace: (shapeType) => {
      state.activeTool = "place";
      state.activeItemType = shapeType;
    },
    setToolMove: () => { state.activeTool = "move"; },
    setToolDraw: () => { state.activeTool = "draw"; },
    color: () => cycleSelectedColor(),
    scaleUp: () => scaleSelected(1.12),
    scaleDown: () => scaleSelected(0.90),
    del: () => deleteSelected(),
    clearDraw: () => clearDrawings()
  };
}

export function updateTools() {
  if (state._moving && state.activeTool === "move") {
    moveSelectedToReticle();
  }
  updateDrawing();
  if (state._selectionBox?.visible && state.selectedObject) {
    state._selectionBox.setFromObject(state.selectedObject);
  }
}
