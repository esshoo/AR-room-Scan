export const state = {
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

  // أدوات التفاعل داخل XR
  activeTool: "select", // select | place | move | draw
  selectedObject: null,
  selectedColorIndex: 0,
  drawGroup: null,
  _drawing: false,
  _drawLine: null,
  _drawPoints: []
};