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