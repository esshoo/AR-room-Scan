import * as THREE from "three";
import { state } from "../state.js";

// دالة مساعدة لتحميل الأثاث بناءً على النوع (Placeholder حالياً)
function createObjectByType(type) {
  let color = 0xffffff;
  let scale = [0.1, 0.1, 0.1];

  switch(type) {
    case "sofa": color = 0xff0000; scale = [0.4, 0.2, 0.2]; break; // كنبة حمراء
    case "table": color = 0x0000ff; scale = [0.3, 0.15, 0.3]; break; // طاولة زرقاء
    case "lamp": color = 0xffff00; scale = [0.05, 0.3, 0.05]; break; // مصباح أصفر
    default: color = 0x888888; // مكعب افتراضي
  }

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1), // نبدأ بوحدة 1متر
    new THREE.MeshStandardMaterial({ color: color })
  );
  mesh.scale.set(...scale);
  mesh.userData.type = type; // نخزن النوع داخل المجسم
  return mesh;
}

export function exportPlacedJSON() {
  const data = {
    version: 2,
    items: [],
    measurements: [] // مكان مخصص للقياسات مستقبلاً
  };

  for (const child of state.placedGroup.children) {
    data.items.push({
      type: child.userData.type || "cube", // نحفظ النوع (كنبة، سرير..)
      position: child.position.toArray(),
      quaternion: child.quaternion.toArray(),
      scale: child.scale.toArray()
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
      const obj = createObjectByType(item.type);
      obj.position.fromArray(item.position);
      obj.quaternion.fromArray(item.quaternion);
      obj.scale.fromArray(item.scale);
      state.placedGroup.add(obj);
    }
    state.ui?.log(`تم استيراد ${data.items.length} عنصر.`);
  }
}