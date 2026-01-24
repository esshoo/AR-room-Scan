export function createUI() {
  const ui = document.createElement("div");
  ui.id = "ui";
  ui.style.cssText = `
    position:fixed; inset:0; z-index:10;
    font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;
    pointer-events:none;
  `;

  // Toggle button (hamburger)
  const toggle = document.createElement("button");
  toggle.id = "uiToggle";
  toggle.type = "button";
  toggle.textContent = "☰";
  toggle.setAttribute("aria-label", "Toggle menu");
  toggle.style.cssText = `
    position:fixed; top:12px; left:12px; z-index:20;
    width:44px; height:44px; border:0; border-radius:12px;
    background:rgba(255,255,255,0.92); color:#000;
    font-size:20px; font-weight:900; cursor:pointer;
    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    pointer-events:auto;
  `;

  const menu = document.createElement("div");
  menu.id = "menu";
  menu.style.cssText = `
    position:fixed; top:66px; left:12px; z-index:19;
    width:min(420px, calc(100vw - 24px));
    max-height: min(78vh, calc(100vh - 86px));
    overflow:auto;
    display:none;
    gap:10px;
    padding:10px;
    border-radius:14px;
    background:rgba(12,16,24,0.70);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border:1px solid rgba(255,255,255,0.14);
    box-shadow: 0 14px 40px rgba(0,0,0,0.35);
    pointer-events:auto;
  `;

  const row = (title) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      display:flex; flex-wrap:wrap; gap:10px; align-items:center;
      padding:10px; border-radius:12px;
      background: rgba(255,255,255,0.08);
    `;
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = `
      width:100%;
      font-weight:900; font-size:12px; letter-spacing:0.3px;
      opacity:0.95; color:#fff;
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
      background:#fff; color:#000; font-weight:900; cursor:pointer;
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
    "- Quest: اضغط Start XR ثم استخدم لوحة 3D داخل النظارة.\n" +
    "ملاحظة: DOM menu يمكن إخفاؤه بزر ☰.";

  // --- Buttons
  const start = btn("start", "Start XR");
  const stop = btn("stop", "Stop");
  const capture = btn("capture", "Capture Room");
  const reset = btn("resetScan", "Reset Scan");

  const planes = btn("togglePlanes", "Planes: OFF");
  const mesh = btn("toggleMesh", "Mesh: OFF");
  const freeze = btn("toggleFreeze", "Freeze: OFF");
  const toggleOcc = btn("toggleOcclusion", "Occlusion: OFF");
  const roomView = btn("roomView", "Room View: FULL");

  const exportGlb = btn("exportGlb", "Export GLB");
  const importGlbBtn = btn("importGlbBtn", "Import GLB");
  const fitView = btn("fitView", "Fit View");

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
  rowXR.append(start, stop, capture, reset);

  const rowScan = row("SCAN VIEW");
  rowScan.append(planes, mesh, freeze, roomView, toggleOcc);

  const rowFiles = row("FILES");
  rowFiles.append(exportGlb, importGlbBtn, fitView, exportJson, importJsonBtn);

  menu.append(rowXR, rowScan, rowFiles, logEl);

  ui.append(toggle, menu, fileInput, glbInput);
  document.body.appendChild(ui);

  // --- Menu behavior
  const isMenuOpen = () => menu.style.display !== "none";
  const openMenu = () => { menu.style.display = "flex"; menu.style.flexDirection = "column"; };
  const closeMenu = () => { menu.style.display = "none"; };

  toggle.addEventListener("click", () => {
    if (isMenuOpen()) closeMenu();
    else openMenu();
  });

  // Auto-hide when user clicks outside the menu
  document.addEventListener("pointerdown", (e) => {
    if (!isMenuOpen()) return;
    const t = e.target;
    if (t === toggle) return;
    if (menu.contains(t)) return;
    closeMenu();
  });

  // Auto-hide after clicking any button inside menu
  menu.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.tagName === "BUTTON") closeMenu();
  });

  return {
    el: ui,

    start, stop, capture, reset,
    planes, mesh, freeze, roomView, toggleOcc,

    exportGlb, importGlbBtn, fitView,
    exportJson, importJsonBtn,

    fileInput, glbInput,

    openMenu,
    closeMenu,

    log: (msg) => { logEl.textContent = msg; },

    setPlanesLabel: (on) => { planes.textContent = `Planes: ${on ? "ON" : "OFF"}`; },
    setMeshLabel: (on) => { mesh.textContent = `Mesh: ${on ? "ON" : "OFF"}`; },
    setFreezeLabel: (on) => { freeze.textContent = `Freeze: ${on ? "ON" : "OFF"}`; },
    setOcclusionLabel: (on) => { toggleOcc.textContent = `Occlusion: ${on ? "ON" : "OFF"}`; },
    setRoomViewLabel: (mode) => { roomView.textContent = `Room View: ${mode}`; }
  };
}
