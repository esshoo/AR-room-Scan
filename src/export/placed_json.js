import * as THREE from "three";
import { state } from "../state.js";

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
  spr.userData.kind = "measureLabel";
  spr.userData.text = text;
  return spr;
}

function createPrimitive(shape, colorHex = 0x3b82f6) {
  let geom;
  if (shape === "circle") geom = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 32);
  else if (shape === "triangle") geom = new THREE.ConeGeometry(0.08, 0.12, 3);
  else geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);

  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.type = shape || "box";
  return mesh;
}

export function exportPlacedJSON() {
  const data = {
    version: 3,
    items: [],
    draws: [],
    measures: []
  };

  // primitives
  if (state.placedGroup) {
    for (const child of state.placedGroup.children) {
      const c = child.material?.color?.getHex?.() ?? state.defaultColor ?? 0x3b82f6;
      data.items.push({
        shape: child.userData.type || child.userData.shape || "box",
        color: c,
        position: child.position.toArray(),
        quaternion: child.quaternion.toArray(),
        scale: child.scale.toArray()
      });
    }
  }

  // draw lines
  if (state.drawGroup) {
    for (const obj of state.drawGroup.children) {
      if (!obj || !obj.isLine) continue;
      const attr = obj.geometry?.getAttribute?.("position");
      const count = obj.userData?._count ?? attr?.count ?? 0;
      const pts = [];
      if (attr && count) {
        for (let i = 0; i < count; i++) {
          pts.push(attr.getX(i), attr.getY(i), attr.getZ(i));
        }
      }
      data.draws.push({
        color: obj.material?.color?.getHex?.() ?? state.defaultColor ?? 0x3b82f6,
        points: pts
      });
    }
  }

  // measurements (lines tagged as measureLine)
  if (state.measureGroup) {
    for (const obj of state.measureGroup.children) {
      if (obj?.userData?.kind === "measureLine") {
        data.measures.push({
          a: obj.userData.a,
          b: obj.userData.b
        });
      }
    }
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "design_plan.json";
  a.click();
  URL.revokeObjectURL(url);
  state.ui?.log("تم تصدير design_plan.json (يشمل مجسمات + رسم + قياس)");
}

export async function importPlacedJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  // clear existing
  state.placedGroup?.clear?.();
  if (state.drawGroup) {
    for (const c of [...state.drawGroup.children]) state.drawGroup.remove(c);
  }
  if (state.measureGroup) {
    for (const c of [...state.measureGroup.children]) state.measureGroup.remove(c);
  }

  // items
  if (Array.isArray(data.items) && state.placedGroup) {
    for (const item of data.items) {
      const mesh = createPrimitive(item.shape || item.type || "box", item.color ?? state.defaultColor ?? 0x3b82f6);
      if (item.position) mesh.position.fromArray(item.position);
      if (item.quaternion) mesh.quaternion.fromArray(item.quaternion);
      if (item.scale) mesh.scale.fromArray(item.scale);
      state.placedGroup.add(mesh);
    }
    state.ui?.log(`تم استيراد ${data.items.length} عنصر.`);
  }

  // draws
  if (Array.isArray(data.draws) && state.drawGroup) {
    for (const d of data.draws) {
      const pts = d.points || [];
      if (pts.length < 6) continue;
      const count = Math.floor(pts.length / 3);
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) positions[i] = pts[i];

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setDrawRange(0, count);

      const mat = new THREE.LineBasicMaterial({ color: d.color ?? state.defaultColor ?? 0x3b82f6 });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      line.userData.kind = "drawLine";
      line.userData._count = count;
      line.userData._positions = positions;
      state.drawGroup.add(line);
    }
    state.ui?.log(`تم استيراد ${data.draws.length} رسم.`);
  }

  // measures
  if (Array.isArray(data.measures) && state.measureGroup) {
    for (const m of data.measures) {
      if (!m.a || !m.b) continue;
      const a = new THREE.Vector3().fromArray(m.a);
      const b = new THREE.Vector3().fromArray(m.b);
      const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      line.userData.kind = "measureLine";
      line.userData.a = m.a;
      line.userData.b = m.b;
      state.measureGroup.add(line);

      const d = a.distanceTo(b);
      const spr = makeTextSprite(`${d.toFixed(2)} m`);
      spr.position.copy(a.clone().add(b).multiplyScalar(0.5));
      spr.position.y += 0.05;
      state.measureGroup.add(spr);
    }
    state.ui?.log(`تم استيراد ${data.measures.length} قياس.`);
  }
}
