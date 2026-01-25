export const state = {
  ui3dInput: null,
  worldInput: null,
  uiConsumedThisFrame: false,
  uiPress: null,
  wristPoseByHandedness: { left: null, right: null },
  tipPoseByHandedness: { left: null, right: null },
  // three core
  scene: null,
  camera: null,
  renderer: null,

  // XR session bits
  xrSession: null,
  viewerSpace: null,
  refSpace: null,

  // hit-test sources
  viewerHitTestSource: null,
  transientHitTestSourceGeneric: null,
  transientHitTestSourceTouch: null,

  // UI
  ui: null,
  ui3d: null,

  // perf ticks
  _meshTick: 0,
  _planeTick: 0, 

  // feature toggles
  showPlanes: false,
  showMesh: false,
  freezeScan: false,

  // occlusion + imported room
  roomModel: null,
  occlusionOn: false,

  // Room View Mode
  roomViewMode: "FULL", 

  // visuals
  refCube: null,
  reticle: null,

  // input
  controller0: null,
  controller1: null,
  handL: null,
  handR: null,

  // hand markers
  tipBox: null,
  wristBall: null,

  // placement + scan data
  placedGroup: null,
  meshObjs: new Map(),
  planeLines: new Map(),

  // hit poses
  hitPoseByInputSource: new Map(),
  lastReticlePose: null,

  // ✅ (جديد) نحفظ آخر فريم لتصدير الحوائط بدقة
  lastFrame: null,

  // ✅ (جديد) نوع العنصر المراد وضعه (cube, sofa, table...)
  activeItemType: "cube",

  // ---------- Tools / UI ----------
  toolMode: "select",          // select | move | draw | measure
  addMode: false,               // if true: place primitive on trigger
  activeShape: "box",          // box | circle | triangle
  defaultColor: 0x3b82f6,
  selectedObj: null,
  selectionHelper: null,
  selectionBoxHelper: null,
  selectionAxesHelper: null,
  uiConsumedSelect: false,

  // draw + measure groups
  drawGroup: null,
  measureGroup: null,
  measurePreviewLine: null,
  measureFirstMarker: null,
  measurePreviewLabel: null,
  _drawActive: false,
  _moveActive: false,
  _rotateActive: false,
  _measureFirst: null,

  // locomotion
  baseRefSpace: null,
  currentRefSpace: null,
  moveOffset: { x: 0, z: 0 },
  _lastT: 0
};