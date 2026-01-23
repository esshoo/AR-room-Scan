export function createUI() {
  const ui = document.createElement("div");
  ui.id = "ui";
  ui.style.cssText = `
    position:fixed; top:12px; left:12px; right:12px; z-index:10;
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    font-family:system-ui,sans-serif;
  `;
  // مهم لـ iOS WebXR wrappers: تأكد أن الـ UI يستقبل اللمس/النقر داخل dom-overlay
  ui.style.pointerEvents = "auto";

  const btn = (id, text) => {
    const b = document.createElement("button");
    b.id = id;
    b.textContent = text;
    b.style.cssText = `
      padding:10px 14px; border:0; border-radius:10px;
      background:#fff; color:#000; font-weight:700; cursor:pointer;
    `;
    return b;
  };

  const logEl = document.createElement("div");
  logEl.id = "log";
  logEl.style.cssText = `
    flex:1; min-width:320px;
    padding:10px 12px; border-radius:10px;
    background:rgba(255,255,255,0.12); color:#fff;
    font-size:13px; line-height:1.35; white-space:pre-wrap;
  `;
  logEl.textContent = "جاهز. افتح الصفحة من Quest Browser (HTTPS) ثم اضغط Start XR.";

  const start = btn("start", "Start XR");
  const stop = btn("stop", "Stop");
  const capture = btn("capture", "Capture Room");
  const planes = btn("togglePlanes", "Planes: OFF");
  const mesh = btn("toggleMesh", "Mesh: OFF");
  const freeze = btn("toggleFreeze", "Freeze: OFF");

  const exportGlb = btn("exportGlb", "Export GLB");
  const importGlbBtn = btn("importGlbBtn", "Import GLB");
  const toggleOcc = btn("toggleOcclusion", "Occlusion: OFF");

  // ✅ جديد: تبديل عرض الغرفة (FULL/WIRE/PLANES)
  const roomView = btn("roomView", "Room View: FULL");

  const exportJson = btn("exportJson", "Export JSON");
  const importJsonBtn = btn("importJsonBtn", "Import JSON");

  // JSON input (hidden)
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.style.display = "none";
  fileInput.id = "importJsonFile";

  // GLB input (hidden)
  const glbInput = document.createElement("input");
  glbInput.type = "file";
  glbInput.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
  glbInput.style.display = "none";
  glbInput.id = "importGlbFile";

  ui.append(
    start, stop, capture, planes, mesh, freeze,
    exportGlb, importGlbBtn, toggleOcc, roomView,
    exportJson, importJsonBtn,
    logEl,
    fileInput, glbInput
  );

  document.body.appendChild(ui);

  return {
    el: ui,

    start, stop, capture,
    planes, mesh, freeze,

    exportGlb, importGlbBtn, toggleOcc, roomView,
    exportJson, importJsonBtn,

    fileInput, glbInput,

    log: (msg) => { logEl.textContent = msg; },
    setPlanesLabel: (on) => { planes.textContent = `Planes: ${on ? "ON" : "OFF"}`; },
    setMeshLabel: (on) => { mesh.textContent = `Mesh: ${on ? "ON" : "OFF"}`; },
    setFreezeLabel: (on) => { freeze.textContent = `Freeze: ${on ? "ON" : "OFF"}`; },
    setOcclusionLabel: (on) => { toggleOcc.textContent = `Occlusion: ${on ? "ON" : "OFF"}`; },

    // ✅ جديد
    setRoomViewLabel: (mode) => { roomView.textContent = `Room View: ${mode}`; }
  };
}
