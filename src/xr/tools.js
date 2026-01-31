import * as THREE from "three";
import { state } from "../state.js";

const _raycaster = new THREE.Raycaster();
const _tmpMat = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _tmpQuat2 = new THREE.Quaternion();
const _axisV = new THREE.Vector3();
const _objPos = new THREE.Vector3();
const _ctrlPos2 = new THREE.Vector3();
const _planeN = new THREE.Vector3();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();

function getHandedness(obj) {
  return obj?.userData?.inputSource?.handedness || obj?.userData?.handedness || null;
}

function getLeftInput() {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = getHandedness(c0);
  const h1 = getHandedness(c1);

  if (h0 === "left") return c0;
  if (h1 === "left") return c1;

  // If one is explicitly right, the other is left.
  if (h0 === "right") return c1;
  if (h1 === "right") return c0;

  // fallback
  return c1 || c0 || null;
}

function getRightInput() {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = getHandedness(c0);
  const h1 = getHandedness(c1);

  if (h0 === "right") return c0;
  if (h1 === "right") return c1;

  // If one is explicitly left, the other is right.
  if (h0 === "left") return c1;
  if (h1 === "left") return c0;

  // fallback
  return c0 || c1 || null;
}

function isLeftObject(obj) {
  if (!obj) return false;
  if (obj === state.handL) return true;
  return getHandedness(obj) === "left";
}

function isRightObject(obj) {
  if (!obj) return false;
  if (obj === state.handR) return true;
  return getHandedness(obj) === "right";
}

function getEventInputSource(evt) {
  return evt?.data?.inputSource || evt?.data || evt?.target?.userData?.inputSource || null;
}

function poseFromControllerRay(controller, dist = 0.8) {
  if (!controller) return null;
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _ctrlPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  const p = _ctrlPos.clone().add(_tmpDir.clone().multiplyScalar(dist));
  const q = controller.getWorldQuaternion(new THREE.Quaternion());
  return {
    transform: {
      position: { x: p.x, y: p.y, z: p.z },
      orientation: { x: q.x, y: q.y, z: q.z, w: q.w }
    }
  };
}

function raycastModelSurface(controller) {
  if (!state.useModelAsWorld || !state.roomModel || !controller) return null;
  // If real room scan is enabled, prefer XR hit-test / scene.
  if (state.roomScanEnabled) return null;

  // Build ray from controller forward
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _ctrlPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  _raycaster.set(_ctrlPos, _tmpDir);

  const meshes = state.modelMeshes && state.modelMeshes.length ? state.modelMeshes : null;
  const hits = meshes
    ? _raycaster.intersectObjects(meshes, true)
    : _raycaster.intersectObject(state.roomModel, true);

  if (!hits || !hits.length) return null;

  const hit = hits[0];
  const p = hit.point.clone();
  // normal in world
  let n = null;
  if (hit.face && hit.object) {
    n = hit.face.normal.clone();
    n.transformDirection(hit.object.matrixWorld).normalize();
  } else {
    n = new THREE.Vector3(0, 1, 0);
  }
  return { point: p, normal: n };
}

function makePoseFromHit(point, normal, controller) {
  // Create orientation that uses surface normal as "up", and faces away from controller
  const up = normal.clone().normalize();
  const fwd = new THREE.Vector3();
  if (controller) {
    _tmpMat.identity().extractRotation(controller.matrixWorld);
    fwd.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  } else {
    fwd.set(0, 0, -1);
  }

  // Project forward onto plane, avoid degeneracy
  const tangentFwd = fwd.clone().addScaledVector(up, -fwd.dot(up));
  if (tangentFwd.lengthSq() < 1e-6) tangentFwd.set(1, 0, 0);
  tangentFwd.normalize();

  const right = new THREE.Vector3().crossVectors(up, tangentFwd).normalize();
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();

  const m = new THREE.Matrix4().makeBasis(right, up, forward);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);

  return {
    transform: {
      position: { x: point.x, y: point.y, z: point.z },
      orientation: { x: q.x, y: q.y, z: q.z, w: q.w }
    },
    _normal: { x: up.x, y: up.y, z: up.z }
  };
}

function getActionPose(evt) {
  const src = getEventInputSource(evt);
  const controller = evt?.target || getRightInput() || state.handR || null;

  // 0) If a UI press just happened, block world actions briefly
  const now = performance.now();
  if (state.worldBlockUntilMs && now < state.worldBlockUntilMs) return null;

  // 1) If a GLB model is loaded and enabled, use it as the world surface.
  const hit = raycastModelSurface(controller);
  if (hit) return makePoseFromHit(hit.point, hit.normal, controller);

  // 2) exact per-input pose (best for real-room hit-test)
  if (src) {
    const p = state.hitPoseByInputSource?.get?.(src);
    if (p) return p;
  }

  // 3) recent right reticle (if fresh)
  if (state.lastRightReticlePose && state.lastRightReticleTime && (now - state.lastRightReticleTime < 250)) {
    return state.lastRightReticlePose;
  }

  // 4) fallback: controller ray in front
  return poseFromControllerRay(controller, 0.8);
}

function getPoseForInputSource(src) {
  // Prefer per-input pose; then last "right" pose; then generic reticle.
  if (src) {
    const p = state.hitPoseByInputSource?.get?.(src);
    if (p) return p;
  }
  return state.lastRightReticlePose || state.lastReticlePose;
}

function isRightSource(src) {
  return src?.handedness === "right";
}
function raycastPlaced(controller) {
  if (!controller || !state.placedGroup) return null;
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _tmpPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  _raycaster.set(_tmpPos, _tmpDir);

  const hits = _raycaster.intersectObjects(state.placedGroup.children, true);
  if (hits.length) return hits[0].object;

  // fallback: nearest by ray distance to object centers (easier selection)
  let best = null;
  let bestDist = 1e9;
  const threshold = 0.12; // meters
  for (const o of state.placedGroup.children) {
    const center = o.getWorldPosition(_tmpVec);
    const v = center.clone().sub(_tmpPos);
    const proj = v.dot(_tmpDir);
    if (proj < 0) continue;
    const closest = _tmpPos.clone().add(_tmpDir.clone().multiplyScalar(proj));
    const d = center.distanceTo(closest);
    if (d < threshold && d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

function setSelected(obj) {
  // Clear previous selection visuals
  if (state.selectionBoxHelper) state.selectionBoxHelper.visible = false;
  if (state.selectionAxesHelper) state.selectionAxesHelper.visible = false;
  if (state.gizmoGroup) state.gizmoGroup.visible = false;

  state.selectedObj = obj || null;
  state.gizmoActive = null;

  if (!state.selectedObj) return;

  // Create helpers once
  if (!state.selectionHelper) {
    state.selectionHelper = new THREE.Group();
    state.selectionHelper.name = "SelectionHelper";
    state.scene.add(state.selectionHelper);
  }

  if (!state.selectionBoxHelper) {
    state.selectionBoxHelper = new THREE.BoxHelper(state.selectedObj, 0xffffff);
    state.selectionHelper.add(state.selectionBoxHelper);
  }
  state.selectionBoxHelper.setFromObject(state.selectedObj);
  state.selectionBoxHelper.visible = true;

  if (!state.selectionAxesHelper) {
    state.selectionAxesHelper = new THREE.AxesHelper(0.18);
    state.selectionHelper.add(state.selectionAxesHelper);
  }
  state.selectionAxesHelper.visible = false; // keep it off (gizmo is the main affordance)

  ensureGizmo();
  updateGizmoPose();
  state.gizmoGroup.visible = true;
}

function setHovered(obj) {
  state.hoveredObj = obj || null;
  if (!state.hoverBoxHelper) {
    state.hoverBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffff00);
    state.hoverBoxHelper.visible = false;
    state.scene.add(state.hoverBoxHelper);
  }
  if (!state.hoveredObj || state.hoveredObj === state.selectedObj) {
    state.hoverBoxHelper.visible = false;
    return;
  }
  state.hoverBoxHelper.setFromObject(state.hoveredObj);
  state.hoverBoxHelper.visible = true;
}

function ensureGizmo() {
  if (state.gizmoGroup) return;

  const g = new THREE.Group();
  g.name = "Gizmo";
  g.visible = false;

  // Materials (simple + high contrast)
  const matX = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.9 });
  const matY = new THREE.MeshBasicMaterial({ color: 0x55ff55, transparent: true, opacity: 0.9 });
  const matZ = new THREE.MeshBasicMaterial({ color: 0x5555ff, transparent: true, opacity: 0.9 });
  const matW = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });

  // Sizes (will be scaled dynamically)
  const arrowLen = 0.22;
  const shaftLen = 0.16;
  const shaftR = 0.008;
  const headLen = 0.04;
  const headR = 0.016;

  const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 10);
  const headGeo = new THREE.ConeGeometry(headR, headLen, 14);
  const cubeGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
  const ringGeo = new THREE.TorusGeometry(0.16, 0.0055, 10, 48);

  const makeAxis = (axis, mat) => {
    const axisGroup = new THREE.Group();
    axisGroup.userData.axis = axis;

    const shaft = new THREE.Mesh(shaftGeo, mat);
    const head = new THREE.Mesh(headGeo, mat);
    const scaleHandle = new THREE.Mesh(cubeGeo, matW);

    shaft.userData.gizmo = { type: "move", axis };
    head.userData.gizmo = { type: "move", axis };
    scaleHandle.userData.gizmo = { type: "scale", axis };

    shaft.position.y = shaftLen * 0.5;
    head.position.y = shaftLen + headLen * 0.5;
    scaleHandle.position.y = arrowLen;

    axisGroup.add(shaft, head, scaleHandle);

    if (axis === "x") axisGroup.rotation.z = -Math.PI / 2;
    if (axis === "z") axisGroup.rotation.x = Math.PI / 2;
    return axisGroup;
  };

  const axX = makeAxis("x", matX);
  const axY = makeAxis("y", matY);
  const axZ = makeAxis("z", matZ);

  const ringX = new THREE.Mesh(ringGeo, matX);
  const ringY = new THREE.Mesh(ringGeo, matY);
  const ringZ = new THREE.Mesh(ringGeo, matZ);
  ringX.rotation.y = Math.PI / 2;
  ringZ.rotation.x = Math.PI / 2;
  ringX.userData.gizmo = { type: "rotate", axis: "x" };
  ringY.userData.gizmo = { type: "rotate", axis: "y" };
  ringZ.userData.gizmo = { type: "rotate", axis: "z" };

  g.add(axX, axY, axZ, ringX, ringY, ringZ);
  state.scene.add(g);
  state.gizmoGroup = g;
}

function updateGizmoPose() {
  if (!state.gizmoGroup || !state.selectedObj) return;
  const obj = state.selectedObj;
  obj.getWorldPosition(_objPos);
  obj.getWorldQuaternion(_tmpQuat2);
  state.gizmoGroup.position.copy(_objPos);
  state.gizmoGroup.quaternion.copy(_tmpQuat2);

  // scale gizmo based on object size (readable but not huge)
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(_tmpVec);
  const maxDim = Math.max(size.x, size.y, size.z);
  const s = THREE.MathUtils.clamp(maxDim * 1.15, 0.18, 0.55);
  state.gizmoGroup.scale.setScalar(s);
}

function raycastGizmo(controller) {
  if (!controller || !state.gizmoGroup || !state.gizmoGroup.visible) return null;
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _ctrlPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  _raycaster.set(_ctrlPos, _tmpDir);
  const hits = _raycaster.intersectObjects(state.gizmoGroup.children, true);
  return hits.length ? hits[0].object : null;
}

function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 72px system-ui, -apple-system, Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.35, 0.175, 1);
  spr.userData._canvas = canvas;
  spr.userData._ctx = ctx;
  return spr;
}

function updateTextSprite(sprite, text) {
  const canvas = sprite.userData._canvas;
  const ctx = sprite.userData._ctx;
  const tex = sprite.material.map;
  if (!canvas || !ctx || !tex) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 72px system-ui, -apple-system, Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  tex.needsUpdate = true;
}


function clearGroup(g) {
  if (!g) return;
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material.dispose?.();
      }
      if (o.material?.map) o.material.map.dispose?.();
    });
  }
}

export function setupTools() {
  // groups
  if (!state.drawGroup) {
    state.drawGroup = new THREE.Group();
    state.drawGroup.name = "DrawGroup";
    state.scene.add(state.drawGroup);
  }
  if (!state.measureGroup) {
    state.measureGroup = new THREE.Group();
    state.measureGroup.name = "MeasureGroup";
    state.scene.add(state.measureGroup);
  }

  // controller press states
  const begin = (evt) => {
  const inputObj = evt?.target || null;

  // World tools are RIGHT-hand only.
  if (isLeftObject(inputObj)) return;

  const h = getHandedness(inputObj);
  if (h && h !== "right" && inputObj !== state.handR) return;

  // إذا كان المؤشر فوق زر في الـ UI3D، تجاهل ضغط العالم (منع تداخل).
  if (state.uiPressActive) return;
  if (state.ui3d?.visible && state.ui3d?.userData?.hovered && isRightObject(inputObj)) return;

  if (state.uiConsumedThisFrame) return;
  if (state.worldBlockUntilMs && performance.now() < state.worldBlockUntilMs) return;
  if (state.worldBlockUntilMs && performance.now() < state.worldBlockUntilMs) return;

  const src = getEventInputSource(evt);
  state._activeSource = src;


    // Gizmo interaction (Select mode): grab a handle to move/scale/rotate.
    if (state.toolMode === "select" && state.selectedObj) {
      const controller = evt?.target || getRightInput();
      const hit = raycastGizmo(controller);
      const giz = hit?.userData?.gizmo || null;
      if (giz) {
        controller.getWorldPosition(_ctrlPos2);
        state.gizmoActive = {
          type: giz.type,
          axis: giz.axis,
          controller,
          startCtrlPos: _ctrlPos2.clone(),
          startPos: state.selectedObj.position.clone(),
          startQuat: state.selectedObj.quaternion.clone(),
          startScale: state.selectedObj.scale.clone(),
        };
        return;
      }
    }

    if (state.toolMode === "draw") {
  state._drawActive = true;

  // Start a new dynamic line (avoid setFromPoints each frame - heavy on Quest)
  const maxPts = 4096;
  const positions = new Float32Array(maxPts * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({ color: state.defaultColor });
  const line = new THREE.Line(geom, mat);
  line.frustumCulled = false;
  line.userData.kind = "drawLine";

  line.userData._maxPoints = maxPts;
  line.userData._positions = positions;
  line.userData._count = 0;
  line.userData._lastP = null;

  state.drawGroup.add(line);
  state._activeLine = line;
  return;
}

if (state.toolMode === "measure") {
      // handled on click (select event) so we can use reticle pose
      return;
    }
  };

  const end = (evt) => {
  const inputObj = evt?.target || null;

  // World tools are RIGHT-hand only.
  if (isLeftObject(inputObj)) return;

  const h = getHandedness(inputObj);
  if (h && h !== "right" && inputObj !== state.handR) return;

  const src = getEventInputSource(evt);
  state._activeSource = null;


    state.gizmoActive = null;
    state._drawActive = false;
    state._activeLine = null;
  };

  // attach listeners
  [state.controller0, state.controller1, state.handL, state.handR].forEach((c) => {
    c?.addEventListener?.("selectstart", begin);
    c?.addEventListener?.("selectend", end);
  });
}

export function onSceneSelect(evt) {
  const inputObj = evt?.target || null;

  // World actions are RIGHT-hand only.
  if (isLeftObject(inputObj)) return;

  const h = getHandedness(inputObj);
  if (h && h !== "right" && inputObj !== state.handR) return;

  // إذا كان المؤشر فوق زر في الـ UI3D، تجاهل ضغط العالم (منع تداخل).
  if (state.uiPressActive) return;
  if (state.ui3d?.visible && state.ui3d?.userData?.hovered && isRightObject(inputObj)) return;

  if (state.uiConsumedThisFrame) return;
  if (state.worldBlockUntilMs && performance.now() < state.worldBlockUntilMs) return;
  if (state.worldBlockUntilMs && performance.now() < state.worldBlockUntilMs) return;

  const src = getEventInputSource(evt);
  const poseForAction = getActionPose(evt);


  // Called from hit-test "select" after UI3D check
  if (state.toolMode === "add") {
    const pose = poseForAction;
    if (!pose || !state.placedGroup) return;

    let geom;
    if (state.activeShape === "circle") geom = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 32);
    else if (state.activeShape === "triangle") geom = new THREE.ConeGeometry(0.08, 0.12, 3);
    else geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    const mat = new THREE.MeshStandardMaterial({ color: state.defaultColor, roughness: 0.35, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.type = state.activeShape;

    mesh.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    mesh.quaternion.set(
      pose.transform.orientation.x,
      pose.transform.orientation.y,
      pose.transform.orientation.z,
      pose.transform.orientation.w
    );
    state.placedGroup.add(mesh);
    setSelected(mesh);
    return;
  }

  // Select / Measure actions
  if (state.toolMode === "select") {
    // Use the event target (controller/hand) for best accuracy.
    const controller = evt?.target || getRightInput() || getLeftInput();
    const hit = raycastPlaced(controller);
    setSelected(hit);
    return;
  }

  if (state.toolMode === "measure") {
    const now = performance.now();
    // Debounce: prevents double-firing and "zero" distances
    if (now - (state._measureLastClickMs || 0) < 160) return;
    state._measureLastClickMs = now;

    // Auto-reset if user started but didn't finish for a while
    if (state._measureFirst && (now - (state._measureT0 || 0) > 8000)) {
      state._measureFirst = null;
      if (state.measureFirstMarker) state.measureFirstMarker.visible = false;
      if (state.measurePreviewLine) state.measurePreviewLine.visible = false;
      if (state.measurePreviewLabel) state.measurePreviewLabel.visible = false;
    }

    const pose = poseForAction;
    if (!pose) return;
    const p = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    if (!state._measureFirst) {
      state._measureFirst = p;
      state._measureT0 = now;

      // marker for first point
      if (!state.measureFirstMarker) {
        const g = new THREE.SphereGeometry(0.015, 16, 12);
        const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
        state.measureFirstMarker = new THREE.Mesh(g, m);
        state.measureGroup.add(state.measureFirstMarker);
      }
      state.measureFirstMarker.position.copy(p);
      state.measureFirstMarker.visible = true;

      // preview line + label
      if (!state.measurePreviewLine) {
        const geomPrev = new THREE.BufferGeometry().setFromPoints([p, p]);
        state.measurePreviewLine = new THREE.Line(geomPrev, new THREE.LineBasicMaterial({ color: 0xffffff }));
        state.measureGroup.add(state.measurePreviewLine);
      }
      if (!state.measurePreviewLabel) {
        state.measurePreviewLabel = makeTextSprite("0.00 m");
        state.measureGroup.add(state.measurePreviewLabel);
      }
      return;
    }
    const a = state._measureFirst;
    const b = p;
    // Ignore accidental second point too close to the first
    if (a.distanceTo(b) < 0.01) return;
    state._measureFirst = null;
    if (state.measureFirstMarker) state.measureFirstMarker.visible = false;
    if (state.measurePreviewLine) state.measurePreviewLine.visible = false;
    if (state.measurePreviewLabel) state.measurePreviewLabel.visible = false;

    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffffff }));
    line.userData.kind = "measureLine";
    line.userData.a = a.toArray();
    line.userData.b = b.toArray();
    state.measureGroup.add(line);

    const d = a.distanceTo(b);
    const spr = makeTextSprite(`${d.toFixed(2)} m`);
    spr.userData.kind = "measureLabel";
    spr.userData.text = `${d.toFixed(2)} m`;
    spr.position.copy(a.clone().add(b).multiplyScalar(0.5));
    spr.position.y += 0.05;
    state.measureGroup.add(spr);
  }
}

export function updateTools() {
  // Hover highlight in Select mode (right-hand ray)
  if (state.toolMode === "select" && !state.gizmoActive) {
    const controller = getRightInput() || state.handR;
    const hObj = raycastPlaced(controller);
    setHovered(hObj);
  } else {
    setHovered(null);
  }

  // Gizmo manipulation
  if (state.gizmoActive && state.selectedObj) {
    const g = state.gizmoActive;
    const obj = state.selectedObj;
    const controller = g.controller || getRightInput() || state.handR;
    if (controller) {
      controller.getWorldPosition(_ctrlPos2);
      const delta = _ctrlPos2.clone().sub(g.startCtrlPos);

      // Axis in world (gizmo is aligned to object)
      _axisV.set(
        g.axis === "x" ? 1 : 0,
        g.axis === "y" ? 1 : 0,
        g.axis === "z" ? 1 : 0
      );
      const axisWorld = _axisV.applyQuaternion(state.gizmoGroup?.quaternion || obj.getWorldQuaternion(_tmpQuat2)).normalize();
      const proj = delta.dot(axisWorld);

      if (g.type === "move") {
        obj.position.copy(g.startPos).add(axisWorld.multiplyScalar(proj));
      } else if (g.type === "scale") {
        const factor = THREE.MathUtils.clamp(1 + proj * 2.0, 0.1, 10);
        obj.scale.copy(g.startScale).multiplyScalar(factor);
      } else if (g.type === "rotate") {
        obj.getWorldPosition(_objPos);
        _v0.copy(g.startCtrlPos).sub(_objPos);
        _v1.copy(_ctrlPos2).sub(_objPos);

        // Project into plane orthogonal to axisWorld
        _planeN.copy(axisWorld);
        _v0.addScaledVector(_planeN, -_v0.dot(_planeN));
        _v1.addScaledVector(_planeN, -_v1.dot(_planeN));
        if (_v0.lengthSq() > 1e-6 && _v1.lengthSq() > 1e-6) {
          _v0.normalize();
          _v1.normalize();
          const cross = _v0.clone().cross(_v1);
          const sin = _planeN.dot(cross);
          const cos = _v0.dot(_v1);
          const ang = Math.atan2(sin, cos);
          const q = new THREE.Quaternion().setFromAxisAngle(_planeN, ang);
          obj.quaternion.copy(q).multiply(g.startQuat);
        }
      }
      updateGizmoPose();
    }
  }

  // Measure preview (after first point)
  let previewPose = null;
  const _now = performance.now();
  const controller = getRightInput() || state.handR;

  // Prefer model surface when a GLB is loaded
  const hit = raycastModelSurface(controller);
  if (hit) {
    previewPose = makePoseFromHit(hit.point, hit.normal, controller);
  } else if (state.lastRightReticlePose && state.lastRightReticleTime && (_now - state.lastRightReticleTime < 250)) {
    previewPose = state.lastRightReticlePose;
  } else {
    previewPose = poseFromControllerRay(controller, 0.8);
  }
  if (state.toolMode === "measure" && state._measureFirst && state.measurePreviewLine && state.measurePreviewLabel && previewPose) {
    const pose = previewPose;
    const cur = _tmpVec.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z).clone();
    const a = state._measureFirst;
    const b = cur;

    state.measurePreviewLine.visible = true;
    state.measurePreviewLine.geometry.setFromPoints([a, b]);

    const d = a.distanceTo(b);
    state.measurePreviewLabel.visible = true;
    state.measurePreviewLabel.position.copy(a.clone().add(b).multiplyScalar(0.5));
    state.measurePreviewLabel.position.y += 0.05;
    updateTextSprite(state.measurePreviewLabel, `${d.toFixed(2)} m`);
  }

  // Move selected object by pose (right only)
  if (state._moveActive && state.selectedObj) {
    const src = state._activeSource;
    const pose = getPoseForInputSource(src);
    if (pose) state.selectedObj.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
  }

  // Rotate selected object (right only) using right thumbstick X while holding trigger
  if (state._rotateActive && state.selectedObj) {
    const src = state._activeSource;
    const gp = src?.gamepad;
    if (gp?.axes?.length) {
      const a0 = gp.axes[0] ?? 0;
      const a1 = gp.axes[1] ?? 0;
      const a2 = (gp.axes.length >= 4 ? gp.axes[2] : 0) ?? 0;
      const useAlt = (Math.abs(a0) + Math.abs(a1) < 0.01) && (Math.abs(a2) > 0.01);
      const axX = useAlt ? a2 : a0;
      const dead = 0.15;
      const x = Math.abs(axX) < dead ? 0 : axX;
      if (x !== 0) state.selectedObj.rotation.y += x * 0.06;
    }
  }

  // Draw line by sampling controller pose (RIGHT only)
if (state._drawActive && state._activeLine) {
  const line = state._activeLine;
  const src = state._activeSource;

  // Prefer exact pose if available, otherwise use the pressed controller ray
  const pose = (src && state.hitPoseByInputSource?.get?.(src)) || null;
  let p = null;

  if (pose) {
    p = _tmpVec.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
  } else {
    const controller = getRightInput() || state.handR;
    if (controller) {
      // If a GLB model is loaded, draw on its surface when possible
      const hit = raycastModelSurface(controller);
      if (hit) p = _tmpVec.copy(hit.point);
      else {
        const pseudo = poseFromControllerRay(controller, 0.8);
        p = _tmpVec.set(pseudo.transform.position.x, pseudo.transform.position.y, pseudo.transform.position.z);
      }
    }
  }

  if (p) {
    const last = line.userData._lastP;
    if (!last || last.distanceTo(p) > 0.01) {
      const maxPts = line.userData._maxPoints || 4096;
      const positions = line.userData._positions;
      let count = line.userData._count || 0;

      if (count < maxPts && positions) {
        positions[count * 3 + 0] = p.x;
        positions[count * 3 + 1] = p.y;
        positions[count * 3 + 2] = p.z;
        count++;
        line.userData._count = count;
        line.userData._lastP = p.clone();

        const attr = line.geometry.getAttribute("position");
        attr.needsUpdate = true;
        line.geometry.setDrawRange(0, count);
      }
    }
  }
}

// Selection helpers update
  if (state.selectedObj && state.selectionBoxHelper) {
    state.selectionBoxHelper.update();
    if (state.selectionAxesHelper) {
      state.selectionAxesHelper.position.copy(state.selectedObj.getWorldPosition(_tmpVec));
      state.selectionAxesHelper.quaternion.copy(state.selectedObj.getWorldQuaternion(new THREE.Quaternion()));
    }
  }
}

export function toolActions() {
  const colors = [0x3b82f6, 0x22c55e, 0xef4444, 0xf59e0b, 0xffffff];

  return {
    cycleMode: () => {
      const order = ["select", "move", "rotate", "draw", "measure"];
      const idx = order.indexOf(state.toolMode);
      state.toolMode = order[(idx + 1) % order.length];
      state._measureFirst = null;
      state._moveActive = false;
      state._rotateActive = false;
      state._drawActive = false;
      state._activeLine = null;
      if (state.measureFirstMarker) state.measureFirstMarker.visible = false;
      if (state.measurePreviewLine) state.measurePreviewLine.visible = false;
      if (state.measurePreviewLabel) state.measurePreviewLabel.visible = false;
    },

    toggleAdd: () => {
      state.toolMode = (state.toolMode === "add") ? "select" : "add";
    },

    cycleShape: () => {
      const order = ["box", "circle", "triangle"];
      const idx = order.indexOf(state.activeShape);
      state.activeShape = order[(idx + 1) % order.length];
      state.activeItemType = state.activeShape;
    },

    scaleUp: () => {
      if (!state.selectedObj) return;
      state.selectedObj.scale.multiplyScalar(1.15);
      state.selectionBoxHelper?.update?.();
    },

    scaleDown: () => {
      if (!state.selectedObj) return;
      state.selectedObj.scale.multiplyScalar(0.87);
      state.selectionBoxHelper?.update?.();
    },

    cycleColor: () => {
      const i = colors.indexOf(state.defaultColor);
      state.defaultColor = colors[(i + 1) % colors.length];
      if (state.selectedObj?.material?.color) state.selectedObj.material.color.setHex(state.defaultColor);
    },

    deleteSelected: () => {
      if (!state.selectedObj) return;
      const obj = state.selectedObj;
      setSelected(null);
      obj.parent?.remove(obj);
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
    },

    clearMarks: () => {
      clearGroup(state.drawGroup);
      clearGroup(state.measureGroup);
      state._measureFirst = null;
      state.measurePreviewLine = null;
      state.measureFirstMarker = null;
      state.measurePreviewLabel = null;
    }
  };
}
