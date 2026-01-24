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

function raycastPlaced(controller) {
  if (!controller || !state.placedGroup) return null;
  _tmpMat.identity().extractRotation(controller.matrixWorld);
  _tmpPos.setFromMatrixPosition(controller.matrixWorld);
  _tmpDir.set(0, 0, -1).applyMatrix4(_tmpMat).normalize();
  _raycaster.set(_tmpPos, _tmpDir);
  const hits = _raycaster.intersectObjects(state.placedGroup.children, true);
  return hits.length ? hits[0].object : null;
}

function setSelected(obj) {
  if (state.selectedObj && state.selectedObj.material && state.selectedObj.material.emissive) {
    state.selectedObj.material.emissive.setHex(0x000000);
  }
  state.selectedObj = obj;
  if (state.selectedObj && state.selectedObj.material && state.selectedObj.material.emissive) {
    state.selectedObj.material.emissive.setHex(0x2233ff);
  }
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
  return spr;
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

    if (state.toolMode === "move" && state.selectedObj) {
      state._moveActive = true;
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

  const end = () => {
    state._moveActive = false;
    state._drawActive = false;
    state._activeLine = null;
  };

  // attach listeners
  [state.controller0, state.controller1].forEach((c) => {
    c?.addEventListener?.("selectstart", begin);
    c?.addEventListener?.("selectend", end);
  });
}

export function onSceneSelect() {
  // Called from hit-test "select" after UI3D check
  if (state.addMode) {
    const pose = state.lastReticlePose;
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
    const pose = state.lastReticlePose;
    if (!pose) return;
    const p = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    if (!state._measureFirst) {
      state._measureFirst = p;
      return;
    }
    const a = state._measureFirst;
    const b = p;
    state._measureFirst = null;

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
  // Move selected object by reticle
  if (state._moveActive && state.selectedObj && state.lastReticlePose) {
    const pose = state.lastReticlePose;
    state.selectedObj.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
  }

  // Draw line by sampling reticle
  if (state._drawActive && state._activeLine && state.lastReticlePose) {
    const pose = state.lastReticlePose;
    const p = _tmpVec.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z).clone();
    const pts = state._activeLine.userData._points;
    const last = pts.length ? pts[pts.length - 1] : null;
    if (!last || last.distanceTo(p) > 0.01) {
      pts.push(p);
      const geom = state._activeLine.geometry;
      geom.setFromPoints(pts);
    }
  }
}

export function toolActions() {
  const colors = [0x3b82f6, 0x22c55e, 0xef4444, 0xf59e0b, 0xffffff];
  return {
    cycleMode: () => {
      const order = ["select", "move", "draw", "measure"];
      const idx = order.indexOf(state.toolMode);
      state.toolMode = order[(idx + 1) % order.length];
      state._measureFirst = null;
      state._moveActive = false;
      state._drawActive = false;
      state._activeLine = null;
    },
    toggleAdd: () => {
      state.addMode = !state.addMode;
      if (state.addMode) state.toolMode = "select"; // keep selection available
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
    },
    scaleDown: () => {
      if (!state.selectedObj) return;
      state.selectedObj.scale.multiplyScalar(0.87);
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
    }
  };
}
