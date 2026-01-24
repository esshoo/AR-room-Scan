import * as THREE from "three";
import { state } from "../state.js";

const _raycaster = new THREE.Raycaster();
const _tmpMat = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();

function getLeftInput() {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = c0?.userData?.inputSource?.handedness;
  const h1 = c1?.userData?.inputSource?.handedness;
  return (h0 === "left") ? c0 : (h1 === "left") ? c1 : (c1 || c0);
}

function getRightInput() {
  const c0 = state.controller0;
  const c1 = state.controller1;
  const h0 = c0?.userData?.inputSource?.handedness;
  const h1 = c1?.userData?.inputSource?.handedness;
  return (h0 === "right") ? c0 : (h1 === "right") ? c1 : (c0 || c1);
}

function getPoseForInputSource(src) {
  if (!src) return state.lastReticlePose;
  const pose = state.hitPoseByInputSource?.get?.(src);
  return pose || state.lastReticlePose;
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
  // clear previous highlight
  if (state.selectedObj && state.selectionBoxHelper) {
    state.selectionBoxHelper.visible = false;
    state.selectionAxesHelper.visible = false;
  }

  state.selectedObj = obj || null;

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
  } else {
    state.selectionBoxHelper.setFromObject(state.selectedObj);
  }
  state.selectionBoxHelper.visible = true;

  if (!state.selectionAxesHelper) {
    state.selectionAxesHelper = new THREE.AxesHelper(0.25);
    state.selectionHelper.add(state.selectionAxesHelper);
  }
  // attach axes to the selected object position
  state.selectionAxesHelper.position.copy(state.selectedObj.getWorldPosition(new THREE.Vector3()));
  state.selectionAxesHelper.visible = true;
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
    if (state.uiConsumedSelect) return;
    const src = evt?.target?.userData?.inputSource;
    if (!isRightSource(src)) return;
    state._activeSource = src;

    if (state.toolMode === "move" && state.selectedObj) {
      state._moveActive = true;
      return;
    }

    if (state.toolMode === "rotate" && state.selectedObj) {
      state._rotateActive = true;
      return;
    }

    if (state.toolMode === "draw") {
      state._drawActive = true;
      // start a new line
      const geom = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({ color: state.defaultColor });
      const line = new THREE.Line(geom, mat);
      line.userData._points = [];
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
    const src = evt?.target?.userData?.inputSource;
    if (src && !isRightSource(src)) return;
    state._activeSource = null;

    state._moveActive = false;
    state._rotateActive = false;
    state._drawActive = false;
    state._activeLine = null;
  };

  // attach listeners
  [state.controller0, state.controller1].forEach((c) => {
    c?.addEventListener?.("selectstart", begin);
    c?.addEventListener?.("selectend", end);
  });
}

export function onSceneSelect(evt) {
  const src = evt?.target?.userData?.inputSource;
  if (src && !isRightSource(src)) return;
  const poseForAction = getPoseForInputSource(src);

  // Called from hit-test "select" after UI3D check
  if (state.addMode) {
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
    const controller = getRightInput() || getLeftInput();
    const hit = raycastPlaced(controller);
    setSelected(hit);
    return;
  }

  if (state.toolMode === "measure") {
    const pose = poseForAction;
    if (!pose) return;
    const p = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    if (!state._measureFirst) {
      state._measureFirst = p;

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
    state._measureFirst = null;
      if (state.measureFirstMarker) state.measureFirstMarker.visible = false;
      if (state.measurePreviewLine) state.measurePreviewLine.visible = false;
      if (state.measurePreviewLabel) state.measurePreviewLabel.visible = false;

    if (state.measureFirstMarker) state.measureFirstMarker.visible = false;
    if (state.measurePreviewLine) state.measurePreviewLine.visible = false;
    if (state.measurePreviewLabel) state.measurePreviewLabel.visible = false;

    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffffff }));
    state.measureGroup.add(line);

    const d = a.distanceTo(b);
    const spr = makeTextSprite(`${d.toFixed(2)} m`);
    spr.position.copy(a.clone().add(b).multiplyScalar(0.5));
    spr.position.y += 0.05;
    state.measureGroup.add(spr);
  }
}

export function updateTools() {
  // Measure preview (after first point)
  if (state.toolMode === "measure" && state._measureFirst && state.measurePreviewLine && state.measurePreviewLabel && state.lastReticlePose) {
    const pose = state.lastReticlePose;
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

  // Draw line by sampling pose (right only)
  if (state._drawActive && state._activeLine) {
    const src = state._activeSource;
    const pose = getPoseForInputSource(src);
    if (!pose) return;
    const p = _tmpVec.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z).clone();
    const pts = state._activeLine.userData._points;
    const last = pts.length ? pts[pts.length - 1] : null;
    if (!last || last.distanceTo(p) > 0.008) {
      pts.push(p);
      state._activeLine.geometry.setFromPoints(pts);
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
      state.addMode = !state.addMode;
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
