export const state = {
  // three core
  scene: null,
  camera: null,
  renderer: null,

  // XR session bits
  xrSession: null,
  viewerSpace: null,
  refSpace: null,

  // locomotion (smooth move via thumbstick)
  baseRefSpace: null,
  currentRefSpace: null,
  _lastT: 0,
  moveOffset: { x: 0, y: 0, z: 0 },

  // UI3D interaction guard (prevent placing cubes when clicking UI)
  ui3dHovering: false,
  ui3dConsumeUntil: 0,

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
  activeItemType: "cube" 
};