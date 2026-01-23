import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { state } from "../state.js";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 1) RAW: دمج mesh كما هو (قد يكون ضخم/عشوائي)
function buildMergedRawMesh() {
  const geoms = [];
  for (const m of state.meshObjs.values()) {
    if (!m.geometry?.attributes?.position) continue;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    geoms.push(g);
  }
  if (!geoms.length) return null;

  const merged = mergeGeometries(geoms, false);
  if (!merged) return null;

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: 0xBDBDBD, roughness: 1.0, metalness: 0.0 })
  );
  mesh.name = "Room_RawMesh";
  return mesh;
}

function classifyPlaneNormalY(normalY) {
  // plane local normal is +Y, after transform: if facing up -> floor, facing down -> ceiling
  if (Math.abs(normalY) > 0.75) return normalY > 0 ? "FLOOR" : "CEILING";
  return "WALL";
}

// 2) PLANES: قشرة معمارية (أرض/جدار/سقف) بألوان مختلفة
function buildCleanPlanesGroup() {
  const frame = state.lastFrame;
  const refSpace = state.refSpace;

  if (!frame || !refSpace) return null;
  if (!state.planeLines.size) return null;

  const buckets = { FLOOR: [], WALL: [], CEILING: [] };

  for (const [xrPlane] of state.planeLines) {
    const polygon = xrPlane.polygon;
    if (!polygon || polygon.length < 3) continue;

    const pose = frame.getPose(xrPlane.planeSpace, refSpace);
    if (!pose) continue;

    // shape from (x,z) then rotate to lie on XZ local plane
    const shapePts = polygon.map(p => new THREE.Vector2(p.x, p.z));
    const shape = new THREE.Shape(shapePts);
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(Math.PI / 2);

    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    geom.applyMatrix4(matrix);

    // classify by world normal
    const n = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(matrix)).normalize();
    const kind = classifyPlaneNormalY(n.y);

    buckets[kind].push(geom);
  }

  const group = new THREE.Group();
  group.name = "Architectural_Shell";

  const addBucket = (kind, color, name) => {
    if (!buckets[kind].length) return;
    const merged = mergeGeometries(buckets[kind], false);
    if (!merged) return;

    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide
      })
    );
    mesh.name = name;
    group.add(mesh);
  };

  addBucket("FLOOR",   0x9CA3AF, "Floor");
  addBucket("WALL",    0xD1D5DB, "Walls");
  addBucket("CEILING", 0x6B7280, "Ceiling");

  return group.children.length ? group : null;
}

export function exportRoomGLB(mode = "PLANES") { // 'PLANES' or 'RAW'
  let root;

  if (mode === "RAW") {
    root = buildMergedRawMesh();
    if (!root) return state.ui?.log("لا يوجد Raw Mesh. فعّل Mesh أولاً.");
  } else {
    root = buildCleanPlanesGroup();
    if (!root) return state.ui?.log("لا يوجد Planes جاهزة للتصدير. فعّل Planes وامسح الغرفة ثم جرّب.");
  }

  const exporter = new GLTFExporter();
  exporter.parse(
    root,
    (result) => {
      const fileName = mode === "RAW" ? "room_raw_scan.glb" : "room_arch_shell.glb";
      const blob = new Blob([result], { type: "model/gltf-binary" });
      downloadBlob(blob, fileName);
      state.ui?.log(`تم تصدير ${fileName}`);
    },
    (err) => {
      state.ui?.log("خطأ تصدير: " + err);
    },
    { binary: true }
  );
}
