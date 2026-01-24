export function createUI() {
  // --- Root overlay
  const ui = document.createElement("div");
  ui.id = "ui";
  ui.style.cssText = `
    position:fixed; inset:0; z-index:10;
    font-family:system-ui,sans-serif;
    pointer-events:none;
  `;

  // --- Hamburger button
  const menuBtn = document.createElement("button");
  menuBtn.id = "menuBtn";
  menuBtn.textContent = "☰";
  menuBtn.title = "Menu";
  menuBtn.style.cssText = `
    position:fixed; top:12px; left:12px;
    width:44px; height:44px;
    border:0; border-radius:12px;
    background: rgba(255,255,255,0.92);
    color:#000; font-size:22px; font-weight:900;
    cursor:pointer;
    pointer-events:auto;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
  `;

  // --- Popover panel
  const pop = document.createElement("div");
  pop.id = "menuPop";
  pop.style.cssText = `
    position:fixed; top:64px; left:12px;
    width:min(360px, calc(100vw - 24px));
    max-height: calc(100vh - 88px);
    overflow:auto;
    display:none;
    padding:12px;
    border-radius:16px;
    background: rgba(15,18,25,0.92);
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 28px rgba(0,0,0,0.55);
    pointer-events:auto;
  `;

  const row = (title) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      display:flex; flex-wrap:wrap; gap:10px; align-items:center;
      padding:10px; border-radius:12px;
      background: rgba(255,255,255,0.08);
      margin-bottom:10px;
    `;
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = `
      width:100%;
      font-weight:800; font-size:12px; letter-spacing:0.3px;
      opacity:0.95; color:#fff;
      margin-bottom:2px;
    `;
    wrap.appendChild(h);
    return wrap;
  };

  const btn = (id, text, kind = "primary") => {
    const b = document.createElement("button");
    b.id = id;
    b.textContent = text;
    b.style.cssText = `
      padding:10px 14px; border:0; border-radius:12px;
      background:${kind === "ghost" ? "rgba(255,255,255,0.10)" : "#fff"};
      color:${kind === "ghost" ? "#fff" : "#000"};
      font-weight:800; cursor:pointer; user-select:none;
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
    "ملاحظة: داخل الـ MR التحكم سيكون من لوحة ثلاثية الأبعاد داخل المشهد.";

  // --- Buttons
  const start = btn("start", "Start XR");
  const stop = btn("stop", "Stop", "ghost");
  const capture = btn("capture", "Capture Room", "ghost");
  const reset = btn("resetScan", "Reset Scan", "ghost");

  const planes = btn("togglePlanes", "Planes: OFF", "ghost");
  const mesh = btn("toggleMesh", "Mesh: OFF", "ghost");
  const freeze = btn("toggleFreeze", "Freeze: OFF", "ghost");
  const roomView = btn("roomView", "Room View: FULL", "ghost");
  const toggleOcc = btn("toggleOcclusion", "Occlusion: OFF", "ghost");

  const exportGlb = btn("exportGlb", "Export GLB", "ghost");
  const importGlbBtn = btn("importGlbBtn", "Import GLB", "ghost");
  const fitView = btn("fitView", "Fit View", "ghost");

  const exportJson = btn("exportJson", "Export JSON", "ghost");
  const importJsonBtn = btn("importJsonBtn", "Import JSON", "ghost");

  // Hidden inputs
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.style.display = "none";
  fileInput.id = "importJsonFile";

  const glbInput = document.createElement("input");
  glbInput.type = "file";
  glbInput.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
  glbInput.style.display = "none";
  glbInput.id = "importGlbFile";

  // Layout
  const rowXR = row("XR");
  rowXR.append(start, stop, capture, reset);

  const rowScan = row("SCAN VIEW");
  rowScan.append(planes, mesh, freeze, roomView, toggleOcc);

  const rowFiles = row("FILES");
  rowFiles.append(exportGlb, importGlbBtn, fitView, exportJson, importJsonBtn);

  pop.append(rowXR, rowScan, rowFiles, logEl, fileInput, glbInput);
  ui.append(menuBtn, pop);
  document.body.appendChild(ui);

  // --- Menu behavior: toggle + auto-hide
  const openMenu = () => { pop.style.display = "block"; };
  const closeMenu = () => { pop.style.display = "none"; };
  const isOpen = () => pop.style.display !== "none";

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) closeMenu();
    else openMenu();
  });

  // Hide on click outside
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    const t = e.target;
    if (t === menuBtn) return;
    if (pop.contains(t)) return;
    closeMenu();
  }, { capture: true });

  // Hide after clicking any button in the panel
  pop.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.tagName === "BUTTON") {
      // let the button's own handler fire, then close
      setTimeout(closeMenu, 0);
    }
  });

  return {
    el: ui,

    start, stop, capture, reset,
    planes, mesh, freeze, roomView, toggleOcc,

    exportGlb, importGlbBtn, fitView,
    exportJson, importJsonBtn,

    fileInput, glbInput,

    log: (msg) => { logEl.textContent = msg; },

    setPlanesLabel: (on) => { planes.textContent = `Planes: ${on ? "ON" : "OFF"}`; },
    setMeshLabel: (on) => { mesh.textContent = `Mesh: ${on ? "ON" : "OFF"}`; },
    setFreezeLabel: (on) => { freeze.textContent = `Freeze: ${on ? "ON" : "OFF"}`; },
    setOcclusionLabel: (on) => { toggleOcc.textContent = `Occlusion: ${on ? "ON" : "OFF"}`; },
    setRoomViewLabel: (mode) => { roomView.textContent = `Room View: ${mode}`; }
  };
}
