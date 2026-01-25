import * as THREE from "three";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { state } from "../state.js";

export function setupHands() {
  const { renderer, scene } = state;

  const handModelFactory = new XRHandModelFactory();

  const handL = renderer.xr.getHand(0);
  const handR = renderer.xr.getHand(1);

  handL.add(handModelFactory.createHandModel(handL, "spheres"));
  handR.add(handModelFactory.createHandModel(handR, "spheres"));

  handL.addEventListener("connected", (e) => { handL.userData.inputSource = e.data; handL.userData.handedness = e.data?.handedness || "left"; });
  handR.addEventListener("connected", (e) => { handR.userData.inputSource = e.data; handR.userData.handedness = e.data?.handedness || "right"; });
  handL.addEventListener("disconnected", () => { handL.userData.inputSource = null; handL.userData.handedness = null; });
  handR.addEventListener("disconnected", () => { handR.userData.inputSource = null; handR.userData.handedness = null; });

  scene.add(handL);
  scene.add(handR);

  // markers
  const tipBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.03, 0.03),
    new THREE.MeshStandardMaterial({ roughness: 0.2 })
  );
  tipBox.visible = false;

  const wristBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 16, 16),
    new THREE.MeshStandardMaterial({ roughness: 0.2 })
  );
  wristBall.visible = false;

  scene.add(tipBox);
  scene.add(wristBall);

  state.handL = handL;
  state.handR = handR;
  state.tipBox = tipBox;
  state.wristBall = wristBall;
}

export function updateHandMarkers(frame) {
  const { xrSession, refSpace } = state;
  if (!xrSession || !frame || !refSpace) return;

  // reset cached poses
  state.wristPoseByHandedness.left = null;
  state.wristPoseByHandedness.right = null;
  state.tipPoseByHandedness.left = null;
  state.tipPoseByHandedness.right = null;

  // hide debug markers by default
  if (state.tipBox) state.tipBox.visible = false;
  if (state.wristBall) state.wristBall.visible = false;

  for (const src of xrSession.inputSources || []) {
    if (!src.hand) continue;

    const hand = src.hand;
    const handed = src.handedness || "unknown";

    const wristJoint = hand.get("wrist");
    const tipJoint   = hand.get("index-finger-tip");

    const wristPose = wristJoint ? frame.getJointPose(wristJoint, refSpace) : null;
    const tipPose   = tipJoint ? frame.getJointPose(tipJoint, refSpace) : null;

    if (handed === "left") {
      state.wristPoseByHandedness.left = wristPose || null;
      state.tipPoseByHandedness.left = tipPose || null;
    } else if (handed === "right") {
      state.wristPoseByHandedness.right = wristPose || null;
      state.tipPoseByHandedness.right = tipPose || null;
    }

    // Optional debug markers (disabled by default)
    const dbg = !!state.debugHands;
    if (dbg && handed === "left" && wristPose && state.wristBall) {
      state.wristBall.visible = true;
      state.wristBall.position.set(
        wristPose.transform.position.x,
        wristPose.transform.position.y,
        wristPose.transform.position.z
      );
    }
    if (dbg && handed === "right" && tipPose && state.tipBox) {
      state.tipBox.visible = true;
      state.tipBox.position.set(
        tipPose.transform.position.x,
        tipPose.transform.position.y,
        tipPose.transform.position.z
      );
    }
  }
}
