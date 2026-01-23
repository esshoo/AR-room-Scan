import * as THREE from "three";
import { state } from "../state.js";

export function setupHitTestAndPlacement() {
  const { scene } = state;

  // Reticle (الهدف)
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 })
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);
  state.reticle = reticle;

  // placed objects group
  const placed = new THREE.Group();
  scene.add(placed);
  state.placedGroup = placed;

  // bind select events
  const bindSelect = (obj) => obj.addEventListener("select", onSelect);
  bindSelect(state.controller0);
  bindSelect(state.controller1);
  bindSelect(state.handL);
  bindSelect(state.handR);
}

// ✅ دالة جديدة لتحديد شكل العنصر بناءً على نوعه
function createMeshByType(type) {
  let geometry, material;

  switch (type) {
    case "sofa":
      // تمثيل تقريبي للكنبة (أحمر عريض)
      geometry = new THREE.BoxGeometry(0.4, 0.2, 0.2); 
      material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });
      break;
    case "table":
      // تمثيل تقريبي للطاولة (أزرق مسطح)
      geometry = new THREE.BoxGeometry(0.3, 0.05, 0.3);
      material = new THREE.MeshStandardMaterial({ color: 0x0000ff, roughness: 0.2 });
      break;
    case "wall_point":
      // نقطة كهرباء (أصفر صغير)
      geometry = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16);
      geometry.rotateX(Math.PI / 2); // ليكون مسطحاً على الجدار
      material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
      break;
    default: // "cube"
      geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.0 });
      break;
  }

  const mesh = new THREE.Mesh(geometry, material);
  
  // ✅ حفظ النوع داخل المجسم لكي يظهر في ملف JSON لاحقاً
  mesh.userData.type = type; 
  
  return mesh;
}

function placeCubeFromPose(pose) {
  const { placedGroup } = state;

  // ✅ نستخدم الدالة الجديدة لإنشاء المجسم حسب النوع المختار
  const mesh = createMeshByType(state.activeItemType);

  mesh.position.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );
  mesh.quaternion.set(
    pose.transform.orientation.x,
    pose.transform.orientation.y,
    pose.transform.orientation.z,
    pose.transform.orientation.w
  );
  
  placedGroup.add(mesh);
}

function onSelect(evt) {
  const src = evt?.target?.userData?.inputSource || null;
  const { hitPoseByInputSource, lastReticlePose } = state;

  if (src && hitPoseByInputSource.has(src)) {
    placeCubeFromPose(hitPoseByInputSource.get(src));
    return;
  }
  if (lastReticlePose) {
    placeCubeFromPose(lastReticlePose);
  }
}

function consumeTransient(frame, source) {
  const { refSpace, hitPoseByInputSource } = state;
  if (!source || !frame.getHitTestResultsForTransientInput) return false;

  const trs = frame.getHitTestResultsForTransientInput(source);
  let any = false;

  for (const tr of trs) {
    if (!tr.results || tr.results.length === 0) continue;
    const pose = tr.results[0].getPose(refSpace);
    if (!pose) continue;
    any = true;
    hitPoseByInputSource.set(tr.inputSource, pose);
  }
  return any;
}

function applyPoseToReticle(pose) {
  const { reticle } = state;
  reticle.visible = true;
  reticle.position.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z
  );
  reticle.quaternion.set(
    pose.transform.orientation.x,
    pose.transform.orientation.y,
    pose.transform.orientation.z,
    pose.transform.orientation.w
  );
  state.lastReticlePose = pose;
}

export function updateHitTest(frame) {
  const {
    xrSession, refSpace, reticle,
    transientHitTestSourceGeneric, transientHitTestSourceTouch,
    viewerHitTestSource, hitPoseByInputSource
  } = state;

  if (!xrSession || !frame || !refSpace) return;

  reticle.visible = false;
  state.lastReticlePose = null;
  hitPoseByInputSource.clear();

  const any1 = consumeTransient(frame, transientHitTestSourceGeneric);
  const any2 = consumeTransient(frame, transientHitTestSourceTouch);
  const anyTransient = any1 || any2;

  if (anyTransient) {
    const sources = xrSession.inputSources || [];
    const pick = (predicate) => {
      for (const s of sources) {
        if (!hitPoseByInputSource.has(s)) continue;
        if (predicate(s)) return hitPoseByInputSource.get(s);
      }
      return null;
    };

    const chosenPose =
      pick(s => !!s.gamepad && s.handedness === "right") ||
      pick(s => !!s.gamepad) ||
      pick(s => !!s.hand && s.handedness === "right") ||
      pick(s => !!s.hand) ||
      null;

    if (chosenPose) {
      applyPoseToReticle(chosenPose);
      return;
    }
  }

  if (viewerHitTestSource && frame.getHitTestResults) {
    const hits = frame.getHitTestResults(viewerHitTestSource);
    if (hits && hits.length) {
      const pose = hits[0].getPose(refSpace);
      if (pose) applyPoseToReticle(pose);
    }
  }
}