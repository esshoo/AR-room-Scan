import { state } from "../state.js";

async function tryRequestSession(mode, optsList) {
  let lastErr = null;
  for (const opts of optsList) {
    try {
      return await navigator.xr.requestSession(mode, opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("requestSession failed");
}

export async function startXR() {
  const { renderer } = state;

  if (!navigator.xr) throw new Error("WebXR غير مدعوم (تأكد من HTTPS).");

  const supportsAR = await (navigator.xr.isSessionSupported?.("immersive-ar") ?? Promise.resolve(false));
  const mode = supportsAR ? "immersive-ar" : "immersive-vr";

  // iOS WebXR wrappers (HelloXR etc.) غالباً تحتاج dom-overlay حتى تظل الأزرار قابلة للنقر داخل AR.
  // بعض المتصفحات قد ترفض features غير مدعومة؛ لذلك نجرّب على مراحل.
  const baseDomOverlay = { domOverlay: { root: document.body } };

  const optsList = [
    {
      requiredFeatures: ["local", "hit-test", "dom-overlay"],
      optionalFeatures: [
        "local-floor",
        "bounded-floor",
        "hand-tracking",
        "anchors",
        "plane-detection",
        "mesh-detection"
      ],
      ...baseDomOverlay
    },
    {
      requiredFeatures: ["local", "hit-test"],
      optionalFeatures: [
        "dom-overlay",
        "local-floor",
        "bounded-floor",
        "hand-tracking",
        "anchors",
        "plane-detection",
        "mesh-detection"
      ],
      ...baseDomOverlay
    },
    {
      requiredFeatures: ["local"],
      optionalFeatures: [
        "hit-test",
        "dom-overlay",
        "hand-tracking",
        "anchors"
      ],
      ...baseDomOverlay
    }
  ];

  const session = await tryRequestSession(mode, optsList);

  await renderer.xr.setSession(session);

  state.xrSession = session;

  // حاول local-floor، وإن لم يتوفر استخدم local
  try {
    await session.requestReferenceSpace("local-floor");
    renderer.xr.setReferenceSpaceType("local-floor");
  } catch {
    renderer.xr.setReferenceSpaceType("local");
  }
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

  state.ui?.log("انتهت جلسة XR.");
}
