export function createUI() {
  const ui = document.createElement("div");
  ui.id = "ui";
  ui.style.cssText = `
    position:fixed; top:12px; left:12px; right:12px; z-index:10;
    display:block;
    font-family:system-ui,sans-serif;
    pointer-events:auto;
  `;

  // Hamburger toggle (Desktop)
  const menuBtn = document.createElement("button");
  menuBtn.id = "menuBtn";
  menuBtn.textContent = "☰";
  menuBtn.title = "Menu";
  menuBtn.style.cssText = `
    width:44px; height:44px; border:0; border-radius:12px;
    background: rgba(20,24,33,0.88); color:#fff; font-weight:900;
    cursor:pointer; user-select:none;
    backdrop-filter: blur(6px);
  `;

  const panel = document.createElement("div");
  panel.id = "panel";
  panel.style.cssText = `
    position: fixed; top: 64px; left: 12px; z-index: 11;
    display:none; flex-direction:column; gap:10px;
    width: min(520px, calc(100vw - 24px));
  `;

  const row = (title) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      display:flex; flex-wrap:wrap; gap:10px; align-items:center;
      padding:10px; border-radius:12px;
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(6px);
    `;
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = `
      width:100%;
      font-weight:800; font-size:12px; letter-spacing:0.3px;
      opacity:0.9; color:#fff;
    `;
    wrap.appendChild(h);
    return wrap;
  };

  const btn = (id, text) => {
    const b = document.createElement("button");
    b.id = id;
    b.textContent = text;
    b.style.cssText = `
      padding:10px 14px; border:0; border-radius:10px;
      background:#fff; color:#000; font-weight:800; cursor:pointer;
      user-select:none;
    `;
    return b;
  };

  const logEl = document.createElement("div");
  logEl.id = "log";
  logEl.style.cssText = `
    padding:12px; border-radius:12px;
    background:rgba(255,255,255,0.10); color:#fff;
    font-size:13px; line-height:1.45; white-space:pre-wrap;
    min-height: 90px;
  `;
  logEl.textContent =
    "جاهز.\n" +
    "- سطح المكتب: اسحب بالماوس للدوران، عجلة للزووم، زر يمين للتحريك.\n" +
    "- Quest: افتح الصفحة من Quest Browser (HTTPS) ثم اضغط Start XR.\n" +
    "ملاحظة: داخل الـ MR التحكم سيتم من لوحة ثلاثية الأبعاد داخل المشهد (UI 3D).";

  // --- Buttons
  const start = btn("start", "Start XR");
  const stop = btn("stop", "Stop");
  const enableRoomScan = btn("enableRoomScan", "Enable Room Scan: OFF");
  const capture = btn("capture", "Capture Room");
  const planes = btn("togglePlanes", "Planes: OFF");
  const mesh = btn("toggleMesh", "Mesh: OFF");
  const freeze = btn("toggleFreeze", "Freeze: OFF");
  const reset = btn("resetScan", "Reset Scan");

  const exportGlb = btn("exportGlb", "Export GLB");
  const importGlbBtn = btn("importGlbBtn", "Import GLB");
  const fitView = btn("fitView", "Fit View");

  const toggleOcc = btn("toggleOcclusion", "Occlusion: OFF");
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

  // --- Layout
  const rowXR = row("XR");
  rowXR.append(start, stop, enableRoomScan, capture, reset);

  const rowScan = row("SCAN VIEW");
  rowScan.append(planes, mesh, freeze, roomView, toggleOcc);

  const rowFiles = row("FILES");
  rowFiles.append(exportGlb, importGlbBtn, fitView, exportJson, importJsonBtn);

  panel.append(rowXR, rowScan, rowFiles);

  ui.append(menuBtn, panel, logEl, fileInput, glbInput);
  document.body.appendChild(ui);

  const closePanel = () => { panel.style.display = "none"; };
  const openPanel = () => { panel.style.display = "flex"; };
  const isOpen = () => panel.style.display !== "none";

  // Toggle menu
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) closePanel();
    else openPanel();
  });

  // Close on outside click
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    const t = e.target;
    if (t === panel || panel.contains(t) || t === menuBtn) return;
    closePanel();
  });

  // Auto-close when any button inside is used
  panel.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.tagName === "BUTTON") closePanel();
  });

  return {
    el: ui,

    start, stop, enableRoomScan, capture, reset,
    planes, mesh, freeze, roomView, toggleOcc,

    exportGlb, importGlbBtn, fitView,
    exportJson, importJsonBtn,

    fileInput, glbInput,

    log: (msg) => { logEl.textContent = msg; },

    setPlanesLabel: (on) => { planes.textContent = `Planes: ${on ? "ON" : "OFF"}`; },
    setMeshLabel: (on) => { mesh.textContent = `Mesh: ${on ? "ON" : "OFF"}`; },
    setFreezeLabel: (on) => { freeze.textContent = `Freeze: ${on ? "ON" : "OFF"}`; },
    setOcclusionLabel: (on) => { toggleOcc.textContent = `Occlusion: ${on ? "ON" : "OFF"}`; },
    setRoomScanLabel: (on) => { enableRoomScan.textContent = `Enable Room Scan: ${on ? "ON" : "OFF"}`; },
    setRoomViewLabel: (mode) => { roomView.textContent = `Room View: ${mode}`; }
  };
}
