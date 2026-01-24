import * as THREE from "three";
import { state } from "../state.js";

// دالة مساعدة لإنشاء المجسمات المضافة (Box/Circle/Triangle) مع توافق للأنواع القديمة.
function createObjectByType(type, colorHex = 0xffffff) {
  let geometry;
  switch (type) {
    case "sphere":
    case "circle":
      geometry = new THREE.SphereGeometry(0.08, 18, 14);
      type = "sphere";
      break;
    case "triangle":
      geometry = new THREE.CylinderGeometry(0.09, 0.09, 0.10, 3);
      break;
    case "box":
    case "cube":
    default:
      geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      type = (type === "cube") ? "box" : type;
      break;
  }

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.0, roughness: 0.35 })
  );

  mesh.userData.kind = "placed";
  mesh.userData.shapeType = type;
  return mesh;
}

export function exportPlacedJSON() {
  const data = {
    version: 2,
    items: [],
    measurements: [] // مكان مخصص للقياسات مستقبلاً
  };

  for (const child of state.placedGroup.children) {
    const color = child.material?.color ? child.material.color.getHex() : 0xffffff;
    data.items.push({
      type: child.userData.shapeType || child.userData.type || "box",
      position: child.position.toArray(),
      quaternion: child.quaternion.toArray(),
      scale: child.scale.toArray(),
      color
    });
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "design_plan.json"; // اسم الملف الجديد
  a.click();
  URL.revokeObjectURL(url);
  state.ui?.log("تم تصدير design_plan.json");
}

export async function importPlacedJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  state.placedGroup.clear();

  if (data.items) {
    for (const item of data.items) {
      const obj = createObjectByType(item.type, item.color ?? 0xffffff);
      obj.position.fromArray(item.position);
      obj.quaternion.fromArray(item.quaternion);
      obj.scale.fromArray(item.scale);
      state.placedGroup.add(obj);
    }
    state.ui?.log(`تم استيراد ${data.items.length} عنصر.`);
  }
}