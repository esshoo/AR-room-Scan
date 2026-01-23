import * as THREE from "three";
import { state } from "../state.js";

export function togglePlanes() {
  state.showPlanes = !state.showPlanes;
  state.ui?.setPlanesLabel(state.showPlanes);

  if (!state.showPlanes) {
    for (const line of state.planeLines.values()) state.scene.remove(line);
    state.planeLines.clear();
  }
}

function makePlaneLine() {
  const geom = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial();
  return new THREE.LineLoop(geom, mat);
}

function updatePlaneLine(line, plane) {
  const pts = plane.polygon.map(p => new THREE.Vector3(p.x, p.y, p.z));
  if (pts.length >= 3) pts.push(pts[0].clone());
  line.geometry.setFromPoints(pts);
  line.geometry.computeBoundingSphere();
}

export function updatePlanes(frame) {
  const { showPlanes, freezeScan, refSpace, planeLines, scene } = state;
  if (!showPlanes || freezeScan) return;
  if (!frame || !refSpace) return;
  if (!("detectedPlanes" in frame)) return;

  try {
    const planes = frame.detectedPlanes;
    let count = 0;

    for (const plane of planes) {
      count++;
      let line = planeLines.get(plane);
      if (!line) {
        line = makePlaneLine();
        planeLines.set(plane, line);
        scene.add(line);
      }
      updatePlaneLine(line, plane);

      const p = frame.getPose(plane.planeSpace, refSpace);
      if (p) {
        line.position.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
        line.quaternion.set(
          p.transform.orientation.x,
          p.transform.orientation.y,
          p.transform.orientation.z,
          p.transform.orientation.w
        );
      }

      if (count > 30) break;
    }

    for (const [plane, line] of planeLines) {
      if (!planes.has(plane)) {
        scene.remove(line);
        planeLines.delete(plane);
      }
    }
  } catch {}
}
