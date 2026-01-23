import * as THREE from "three";
import { state } from "../state.js";

export function toggleMesh() {
  state.showMesh = !state.showMesh;
  state.ui?.setMeshLabel(state.showMesh);

  if (!state.showMesh) {
    for (const m of state.meshObjs.values()) state.scene.remove(m);
    state.meshObjs.clear();
  }
}

function makeMeshObject() {
  const geom = new THREE.BufferGeometry();
  const mat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.6 });
  return new THREE.Mesh(geom, mat);
}

function getVerticesArray(xrMesh) {
  const v = xrMesh.vertices;
  if (!v) return null;
  if (v instanceof Float32Array) return v;
  if (Array.isArray(v) && v[0] instanceof Float32Array) return v[0];
  return null;
}

function updateMeshGeometry(meshObj, xrMesh) {
  const verts = getVerticesArray(xrMesh);
  const idx = xrMesh.indices;
  if (!verts || !idx) return;

  const geom = meshObj.geometry;
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
}

export function updateMeshes(frame) {
  const { showMesh, freezeScan, refSpace, meshObjs, scene } = state;
  if (!showMesh || freezeScan) return;
  if (!frame || !refSpace) return;
  if (!("detectedMeshes" in frame)) return;

  try {
    const meshes = frame.detectedMeshes;
    let count = 0;

    for (const xrMesh of meshes) {
      count++;
      let obj = meshObjs.get(xrMesh);
      if (!obj) {
        obj = makeMeshObject();
        meshObjs.set(xrMesh, obj);
        scene.add(obj);
      }
      updateMeshGeometry(obj, xrMesh);

      const p = frame.getPose(xrMesh.meshSpace, refSpace);
      if (p) {
        obj.position.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
        obj.quaternion.set(
          p.transform.orientation.x,
          p.transform.orientation.y,
          p.transform.orientation.z,
          p.transform.orientation.w
        );
      }

      if (count > 20) break;
    }

    for (const [xrMesh, obj] of meshObjs) {
      if (!meshes.has(xrMesh)) {
        scene.remove(obj);
        meshObjs.delete(xrMesh);
      }
    }
  } catch {}
}
