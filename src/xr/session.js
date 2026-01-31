import { state } from "../state.js";

export async function startXR(opts = {}) {
  const { renderer } = state;

  if (!navigator.xr) throw new Error("WebXR غير مدعوم (تأكد من HTTPS).");

  const supportsAR = await (navigator.xr.isSessionSupported?.("immersive-ar") ?? Promise.resolve(false));
  const mode = supportsAR ? "immersive-ar" : "immersive-vr";

  const featureLevel = opts?.featureLevel || "base";
  const baseFeatures = ["local-floor", "bounded-floor", "hand-tracking", "hit-test"];

  // ميزات "Room/Scene" على Quest قد تسبب تعليق شاشة الدخول على بعض الإصدارات
  // لذلك نفعلها فقط عند الطلب (featureLevel === "room").
  const roomFeatures = ["plane-detection", "mesh-detection", "anchors", "scene"];

  const optionalFeatures = (featureLevel === "room")
    ? [...baseFeatures, ...roomFeatures]
    : [...baseFeatures];

  let session = null;
  try {
    session = await navigator.xr.requestSession(mode, { optionalFeatures });
  } catch (err) {
    // fallback: لو فشل طلب ميزات room، ارجع للـ base
    if (featureLevel === "room") {
      state.ui?.log("تعذر تفعيل Room/Scene Features — سيتم البدء بالوضع الأساسي.");
      session = await navigator.xr.requestSession(mode, { optionalFeatures: [...baseFeatures] });
    } else {
      throw err;
    }
  }
;

  await renderer.xr.setSession(session);

  state.xrSession = session;
  state.xrFeatureLevel = (opts?.featureLevel || "base");
  state.refSpace = renderer.xr.getReferenceSpace();

  // viewer space fallback
  try { state.viewerSpace = await session.requestReferenceSpace("viewer"); }
  catch { state.viewerSpace = null; }

  const enabled = Array.isArray(session.enabledFeatures) ? session.enabledFeatures : [];

  // transient sources (2 profiles لتحسين التوافق)
  state.transientHitTestSourceGeneric = null;
  state.transientHitTestSourceTouch = null;

  if (session.requestHitTestSourceForTransientInput) {
    try {
      state.transientHitTestSourceGeneric = await session.requestHitTestSourceForTransientInput({
        profile: "generic-trigger"
      });
    } catch {}

    try {
      state.transientHitTestSourceTouch = await session.requestHitTestSourceForTransientInput({
        profile: "oculus-touch-v3"
      });
    } catch {}
  }

  // viewer hit-test fallback لو transient غير متاح
  state.viewerHitTestSource = null;
  if (!state.transientHitTestSourceGeneric && !state.transientHitTestSourceTouch &&
      enabled.includes("hit-test") && state.viewerSpace && session.requestHitTestSource) {
    try {
      state.viewerHitTestSource = await session.requestHitTestSource({ space: state.viewerSpace });
    } catch {}
  }

  session.addEventListener("end", () => cleanupXR());

  state.ui?.log(
    `XR started: ${mode}\n` +
    `enabledFeatures: ${enabled.length ? enabled.join(", ") : "(غير متاح)"}\n` +
    `HitTest: ${(state.transientHitTestSourceGeneric || state.transientHitTestSourceTouch) ? "TRANSIENT" : (state.viewerHitTestSource ? "VIEWER" : "OFF")}\n` +
    `- كنترولر: Trigger يضع مكعب.\n` +
    `- يد: Pinch/Select يضع مكعب.\n`
  );
}

export async function stopXR() {
  if (state.xrSession) await state.xrSession.end();
}

export async function captureRoom() {
  const s = state.xrSession;
  if (!s) return state.ui?.log("ابدأ XR أولاً.");

  if (typeof s.initiateRoomCapture !== "function") {
    return state.ui?.log("Capture Room غير متاح في هذا المتصفح/الإصدار.");
  }
  await s.initiateRoomCapture();
  state.ui?.log("تم طلب Room Capture. بعد التأكيد جرّب Planes/Mesh.");
}

function cleanupXR() {
  try { state.viewerHitTestSource?.cancel?.(); } catch {}
  try { state.transientHitTestSourceGeneric?.cancel?.(); } catch {}
  try { state.transientHitTestSourceTouch?.cancel?.(); } catch {}

  state.viewerHitTestSource = null;
  state.transientHitTestSourceGeneric = null;
  state.transientHitTestSourceTouch = null;

  state.xrSession = null;
  state.viewerSpace = null;
  state.refSpace = null;

  state.hitPoseByInputSource.clear();
  state.lastReticlePose = null;
  if (state.reticle) state.reticle.visible = false;

  // اخفاء UI 3D إن وجدت
  if (state.ui3d) state.ui3d.visible = false;

  state.ui?.log("انتهت جلسة XR.");
}
