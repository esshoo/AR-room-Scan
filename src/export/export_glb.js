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

// 1. دالة بناء شبكة المسح (القديمة - للعشوائيات)
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
  return merged ? new THREE.Mesh(merged, new THREE.MeshStandardMaterial()) : null;
}

// 2. (جديد) دالة بناء الحوائط النظيفة من الـ Planes
function buildCleanPlanesMesh() {
  const geoms = [];

  // نمر على كل مسطح (حائط/أرضية) تم اكتشافه
  for (const [xrPlane, lineLoop] of state.planeLines) {
    // نحصل على نقاط المضلع (Polygon)
    const polygon = xrPlane.polygon; 
    if (!polygon || polygon.length < 3) continue;

    // تحويل النقاط إلى شكل ثنائي الأبعاد
    const shapePts = polygon.map(p => new THREE.Vector2(p.x, p.z)); // WebXR planes lie on XZ locally
    const shape = new THREE.Shape(shapePts);
    
    // إنشاء هندسة (Geometry) من الشكل
    const geom = new THREE.ShapeGeometry(shape);
    
    // تدويرها لتناسب إحداثيات WebXR (X-Z plane -> X-Y plane logic adjustment if needed)
    // لكن الـ ShapeGeometry ينشأ في XY، والـ XRPlane يكون في XZ محلياً عادة.
    // الأسهل: نطبق مصفوفة التحويل الخاصة بالـ Plane مباشرة
    
    // تصحيح التوجيه: ShapeGeometry يكون مسطحاً على Z=0.
    // نحتاج تدويره ليكون مسطحاً على Y=0 (كما هو في إحداثيات الـ Plane المحلية)
    geom.rotateX(Math.PI / 2);

    // نطبق مكان ودوران الحائط في الغرفة
    const pose = state.lastFrame?.getPose(xrPlane.planeSpace, state.refSpace);
    if (pose) {
      const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
      geom.applyMatrix4(matrix);
      geoms.push(geom);
    }
  }

  if (!geoms.length) return null;

  const merged = mergeGeometries(geoms, false);
  if (!merged) return null;

  // نعطيها اسماً مميزاً لبرامج التصميم
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
  );
  mesh.name = "Architectural_Shell";
  return mesh;
}

export function exportRoomGLB(mode = "PLANES") { // 'PLANES' or 'RAW'
  let roomMesh;
  
  if (mode === "RAW") {
    roomMesh = buildMergedRawMesh();
    if (!roomMesh) return state.ui?.log("لا يوجد Raw Mesh. هل قمت بتفعيل Mesh؟");
  } else {
    // الوضع الافتراضي الجديد: الحوائط النظيفة فقط
    roomMesh = buildCleanPlanesMesh();
    if (!roomMesh) return state.ui?.log("لا يوجد Planes. تأكد من مسح الحوائط جيداً.");
  }

  const exporter = new GLTFExporter();
  exporter.parse(
    roomMesh,
    (result) => {
      const fileName = mode === "RAW" ? "room_raw_scan.glb" : "room_clean_walls.glb";
      const blob = new Blob([result], { type: "model/gltf-binary" });
      downloadBlob(blob, fileName);
      state.ui?.log(`تم تصدير ${fileName}`);
    },
    (err) => {
      state.ui?.log("خطأ: " + err);
    },
    { binary: true }
  );
}