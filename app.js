import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";

const PHASES = ["Idle", "Catch", "Pull", "Push", "Recovery", "ExtendedForward"];

const defaults = {
  rollingAngle: 45,
  strokeInterval: 4,
  glideHold: 0.5,
  bodyPitch: -1,
};

const ui = {
  rollingAngle: document.getElementById("rollingAngle"),
  strokeInterval: document.getElementById("strokeInterval"),
  glideHold: document.getElementById("glideHold"),
  bodyPitch: document.getElementById("bodyPitch"),
  rollingAngleValue: document.getElementById("rollingAngleValue"),
  strokeIntervalValue: document.getElementById("strokeIntervalValue"),
  glideHoldValue: document.getElementById("glideHoldValue"),
  bodyPitchValue: document.getElementById("bodyPitchValue"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  resetBtn: document.getElementById("resetBtn"),
  currentState: document.getElementById("currentState"),
  activeArm: document.getElementById("activeArm"),
  currentRoll: document.getElementById("currentRoll"),
  glideLeft: document.getElementById("glideLeft"),
  leftPhase: document.getElementById("leftPhase"),
  rightPhase: document.getElementById("rightPhase"),
  currentSpeed: document.getElementById("currentSpeed"),
  avgSpeed: document.getElementById("avgSpeed"),
  elapsed: document.getElementById("elapsed"),
  glideRemaining: document.getElementById("glideRemaining"),
  snapshotElapsed: document.getElementById("snapshotElapsed"),
  snapshotDistance: document.getElementById("snapshotDistance"),
  snapshotSpeed: document.getElementById("snapshotSpeed"),
  snapshotEnergy: document.getElementById("snapshotEnergy"),
  leftCount: document.getElementById("leftCount"),
  rightCount: document.getElementById("rightCount"),
  totalCount: document.getElementById("totalCount"),
  distanceTop: document.getElementById("distanceTop"),
  distanceBar: document.getElementById("distanceBar"),
  energyBar: document.getElementById("energyBar"),
  energyText: document.getElementById("energyText"),
  speedChart: document.getElementById("speedChart"),
  energyChart: document.getElementById("energyChart"),
  rollChart: document.getElementById("rollChart"),
  speedHeadline: document.getElementById("speedHeadline"),
  energyHeadline: document.getElementById("energyHeadline"),
  rollHeadline: document.getElementById("rollHeadline"),
  leftPhaseTimeline: document.getElementById("leftPhaseTimeline"),
  rightPhaseTimeline: document.getElementById("rightPhaseTimeline"),
  resultCard: document.getElementById("resultCard"),
  resultTime: document.getElementById("resultTime"),
  resultFinalSpeed: document.getElementById("resultFinalSpeed"),
  resultAvgSpeed: document.getElementById("resultAvgSpeed"),
  resultFinalEnergy: document.getElementById("resultFinalEnergy"),
  rollCanvas: document.getElementById("rollCanvas"),
  rollText: document.getElementById("rollText"),
};

const sim = {
  config: { ...defaults },
  appliedConfig: { ...defaults },
  phase: "Stopped",
  elapsed: 0,
  distance: 0,
  speedKmh: 1.5,
  energy: 100,
  currentRollDisplay: 0,
  rollTargetDisplay: 0,
  holdRemaining: 0,
  nextStrokeTime: Infinity,
  nextStrokeArm: "left",
  averageSpeedKmh: 1.5,
  rollSign: 1,
  chartTimer: 0,
  left: {
    startTime: null,
    phase: "Idle",
    count: 0,
    active: false,
  },
  right: {
    startTime: null,
    phase: "Idle",
    count: 0,
    active: false,
  },
  history: {
    speed: [],
    energy: [],
    roll: [],
  },
};

const three = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  water: null,
  swimmerRoot: null,
  torso: null,
  leftArmPivot: null,
  rightArmPivot: null,
  leftLeg: null,
  rightLeg: null,
  bubbles: null,
  shoulderOffsets: {
    left: new THREE.Vector3(0.31, 0.16, 0.3),
    right: new THREE.Vector3(-0.31, 0.16, 0.3),
  },
};

const clock = new THREE.Clock();

initialize();
requestAnimationFrame(loop);

function initialize() {
  setupThreeScene();
  setupUI();
  setupPhaseTimeline();
  renderAll();
}

function setupUI() {
  for (const key of Object.keys(defaults)) {
    const input = ui[key];
    input.addEventListener("input", () => {
      if (!isEditable()) {
        input.value = sim.config[key];
        return;
      }
      sim.config[key] = Number(input.value);
      refreshControlText();
    });
  }

  ui.startBtn.addEventListener("click", startSimulation);
  ui.stopBtn.addEventListener("click", stopSimulation);
  ui.resetBtn.addEventListener("click", resetSimulation);

  for (const btn of document.querySelectorAll("[data-camera]")) {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-camera");
      setCameraPreset(mode);
    });
  }

  refreshControlText();
}

function setupPhaseTimeline() {
  ui.leftPhaseTimeline.innerHTML = "";
  ui.rightPhaseTimeline.innerHTML = "";
  for (const phase of PHASES) {
    const left = document.createElement("span");
    left.className = "phase-pill";
    left.textContent = phase;
    left.dataset.phase = phase;
    ui.leftPhaseTimeline.appendChild(left);

    const right = document.createElement("span");
    right.className = "phase-pill";
    right.textContent = phase;
    right.dataset.phase = phase;
    ui.rightPhaseTimeline.appendChild(right);
  }
}

function setupThreeScene() {
  const container = document.getElementById("threeContainer");
  const width = container.clientWidth;
  const height = container.clientHeight;

  three.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  three.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  three.renderer.setSize(width, height);
  three.renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(three.renderer.domElement);

  three.scene = new THREE.Scene();
  three.scene.fog = new THREE.FogExp2(0x9bc5d8, 0.035);

  three.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 400);
  setCameraPreset("side", true);

  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.target.set(0, 0.55, 0);
  three.controls.enableDamping = true;
  three.controls.minDistance = 4;
  three.controls.maxDistance = 20;
  three.controls.maxPolarAngle = Math.PI * 0.9;

  const hemi = new THREE.HemisphereLight(0xeaf8ff, 0x4f7388, 1.25);
  three.scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(8, 14, 10);
  three.scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fdfff, 0.55);
  fill.position.set(-6, 4, -6);
  three.scene.add(fill);

  createPool();
  createSwimmer();
  createBubbleSystem();

  window.addEventListener("resize", onResize);
}

function createPool() {
  const poolGroup = new THREE.Group();

  const poolFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 10),
    new THREE.MeshStandardMaterial({
      color: 0x9db1b8,
      roughness: 0.72,
      metalness: 0.1,
    })
  );
  poolFloor.rotation.x = -Math.PI / 2;
  poolFloor.position.y = -1.15;
  poolGroup.add(poolFloor);

  const laneMat = new THREE.MeshBasicMaterial({ color: 0x567586 });
  for (let i = -2; i <= 2; i++) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.08), laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, -1.14, i * 1.8);
    poolGroup.add(lane);
  }

  const sideWallMat = new THREE.MeshStandardMaterial({
    color: 0xc0d6dd,
    roughness: 0.85,
    metalness: 0.05,
    transparent: true,
    opacity: 0.42,
  });
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(48, 2.6, 0.16), sideWallMat);
  wallL.position.set(0, 0.0, 5.0);
  poolGroup.add(wallL);
  const wallR = wallL.clone();
  wallR.position.z = -5.0;
  poolGroup.add(wallR);

  const waterGeometry = new THREE.PlaneGeometry(48, 10);
  const waterNormals = new THREE.TextureLoader().load(
    "https://threejs.org/examples/textures/waternormals.jpg",
    (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
  );

  three.water = new Water(waterGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals,
    sunDirection: new THREE.Vector3(0.25, 1, 0.2),
    sunColor: 0xffffff,
    waterColor: 0x66a8c8,
    distortionScale: 1.8,
    alpha: 0.72,
    fog: true,
  });
  three.water.rotation.x = -Math.PI / 2;
  three.water.position.y = 0.78;
  three.water.material.transparent = true;
  three.water.material.depthWrite = false;
  poolGroup.add(three.water);

  const underTint = new THREE.Mesh(
    new THREE.BoxGeometry(48, 2, 10),
    new THREE.MeshStandardMaterial({
      color: 0x6fa6be,
      transparent: true,
      opacity: 0.16,
      roughness: 0.3,
      metalness: 0.05,
    })
  );
  underTint.position.y = -0.18;
  poolGroup.add(underTint);

  three.scene.add(poolGroup);
}

function createSwimmer() {
  const swimmerRoot = new THREE.Group();
  swimmerRoot.position.set(0, 0.52, 0);
  swimmerRoot.rotation.y = Math.PI / 2;

  const torsoGroup = new THREE.Group();
  swimmerRoot.add(torsoGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a8d98, roughness: 0.72, metalness: 0.05 });
  const leftMat = new THREE.MeshStandardMaterial({ color: 0xd24e4e, roughness: 0.72, metalness: 0.05 });
  const rightMat = new THREE.MeshStandardMaterial({ color: 0x4d7ec3, roughness: 0.72, metalness: 0.05 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.33, 1.08), bodyMat);
  torso.position.z = 0.0;
  torsoGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), new THREE.MeshStandardMaterial({ color: 0xa7a59c, roughness: 0.85 }));
  head.position.set(0, 0.11, 0.63);
  torsoGroup.add(head);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), bodyMat);
  hips.position.set(0, -0.03, -0.62);
  torsoGroup.add(hips);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.31, 0.16, 0.3);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.9), leftMat);
  leftArm.position.z = 0.44;
  leftArmPivot.add(leftArm);
  torsoGroup.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(-0.31, 0.16, 0.3);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.9), rightMat);
  rightArm.position.z = 0.44;
  rightArmPivot.add(rightArm);
  torsoGroup.add(rightArmPivot);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 1.16), bodyMat);
  leftLeg.position.set(-0.15, -0.12, -1.22);
  torsoGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 1.16), bodyMat);
  rightLeg.position.set(0.15, -0.12, -1.22);
  torsoGroup.add(rightLeg);

  three.scene.add(swimmerRoot);
  three.swimmerRoot = swimmerRoot;
  three.torso = torsoGroup;
  three.leftArmPivot = leftArmPivot;
  three.rightArmPivot = rightArmPivot;
  three.leftLeg = leftLeg;
  three.rightLeg = rightLeg;
}

function createBubbleSystem() {
  const count = 180;
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 0.6;
    const y = 0.1 + Math.random() * 0.7;
    const z = -0.6 + Math.random() * 1.6;
    positions.set([x, y, z], i * 3);
    seeds.push(Math.random() * 10);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.userData.seeds = seeds;

  const mat = new THREE.PointsMaterial({
    color: 0xd9f4ff,
    size: 0.03,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const bubbles = new THREE.Points(geo, mat);
  bubbles.position.set(0, 0.0, 0.2);
  three.swimmerRoot.add(bubbles);
  three.bubbles = bubbles;
}

function startSimulation() {
  if (sim.phase === "Running" || sim.phase === "InitialRollToRightMax" || sim.phase === "InitialGlideHold") {
    return;
  }

  sim.appliedConfig = { ...sim.config };
  sim.phase = "InitialRollToRightMax";
  sim.elapsed = 0;
  sim.distance = 0;
  sim.speedKmh = 1.5;
  sim.averageSpeedKmh = 1.5;
  sim.energy = 100;
  sim.currentRollDisplay = 0;
  sim.rollTargetDisplay = sim.appliedConfig.rollingAngle;
  sim.holdRemaining = 0;
  sim.nextStrokeTime = Infinity;
  sim.nextStrokeArm = "left";
  sim.left.startTime = null;
  sim.right.startTime = null;
  sim.left.phase = "Idle";
  sim.right.phase = "Idle";
  sim.left.active = false;
  sim.right.active = false;
  sim.left.count = 0;
  sim.right.count = 0;
  sim.history.speed = [];
  sim.history.energy = [];
  sim.history.roll = [];
  sim.chartTimer = 0;
  sim.rollSign = detectRollSign();

  ui.resultCard.classList.add("hidden");
  setInputsLocked(true);
}

function stopSimulation() {
  if (sim.phase === "Stopped") return;
  if (sim.phase !== "Finished") {
    sim.phase = "Stopped";
  }
  setInputsLocked(false);
}

function resetSimulation() {
  sim.config = { ...defaults };
  sim.appliedConfig = { ...defaults };
  sim.phase = "Stopped";
  sim.elapsed = 0;
  sim.distance = 0;
  sim.speedKmh = 1.5;
  sim.averageSpeedKmh = 1.5;
  sim.energy = 100;
  sim.currentRollDisplay = 0;
  sim.rollTargetDisplay = 0;
  sim.holdRemaining = 0;
  sim.left = { startTime: null, phase: "Idle", count: 0, active: false };
  sim.right = { startTime: null, phase: "Idle", count: 0, active: false };
  sim.history = { speed: [], energy: [], roll: [] };
  sim.chartTimer = 0;

  ui.resultCard.classList.add("hidden");
  for (const key of Object.keys(defaults)) {
    ui[key].value = defaults[key];
  }
  refreshControlText();
  setInputsLocked(false);
}

function isEditable() {
  return sim.phase === "Stopped" || sim.phase === "Finished";
}

function setInputsLocked(locked) {
  ui.rollingAngle.disabled = locked;
  ui.strokeInterval.disabled = locked;
  ui.glideHold.disabled = locked;
  ui.bodyPitch.disabled = locked;
}

function detectRollSign() {
  const positiveRoll = THREE.MathUtils.degToRad(10);
  const left = three.shoulderOffsets.left.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), positiveRoll);
  const right = three.shoulderOffsets.right.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), positiveRoll);
  return right.y > left.y ? 1 : -1;
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (sim.phase !== "Stopped" && sim.phase !== "Finished") {
    updateSimulation(dt);
  }

  updateModel(dt);
  updateWater(dt);
  updateCharts(dt);
  renderAll();
}

function updateSimulation(dt) {
  sim.elapsed += dt;
  sim.distance += (sim.speedKmh / 3.6) * dt;
  sim.averageSpeedKmh = sim.elapsed > 0 ? (sim.distance / sim.elapsed) * 3.6 : 1.5;

  if (sim.phase === "InitialRollToRightMax") {
    const done = moveRollToward(sim.appliedConfig.rollingAngle, dt);
    if (done) {
      if (sim.appliedConfig.glideHold > 0) {
        sim.phase = "InitialGlideHold";
        sim.holdRemaining = sim.appliedConfig.glideHold;
      } else {
        enterRunningWithFirstStroke();
      }
    }
  } else if (sim.phase === "InitialGlideHold") {
    applyGlideRecovery(dt);
    sim.holdRemaining = Math.max(0, sim.holdRemaining - dt);
    if (sim.holdRemaining <= 0) {
      enterRunningWithFirstStroke();
    }
  } else if (sim.phase === "Running") {
    updateRunningRoll(dt);
    scheduleStrokes();
  }

  updateArmPhases();
  checkFinish();
}

function updateRunningRoll(dt) {
  if (sim.holdRemaining > 0) {
    applyGlideRecovery(dt);
    sim.holdRemaining = Math.max(0, sim.holdRemaining - dt);
    if (sim.holdRemaining === 0) {
      sim.rollTargetDisplay = sim.rollTargetDisplay > 0 ? -sim.appliedConfig.rollingAngle : sim.appliedConfig.rollingAngle;
    }
    return;
  }

  const reached = moveRollToward(sim.rollTargetDisplay, dt);
  if (reached) {
    if (sim.appliedConfig.glideHold > 0) {
      sim.holdRemaining = sim.appliedConfig.glideHold;
    } else {
      sim.rollTargetDisplay = sim.rollTargetDisplay > 0 ? -sim.appliedConfig.rollingAngle : sim.appliedConfig.rollingAngle;
    }
  }
}

function moveRollToward(target, dt) {
  const rate = 30;
  const delta = target - sim.currentRollDisplay;
  const step = rate * dt;
  if (Math.abs(delta) <= step) {
    sim.currentRollDisplay = target;
    return true;
  }
  sim.currentRollDisplay += Math.sign(delta) * step;
  return false;
}

function enterRunningWithFirstStroke() {
  startStroke("left");
  sim.nextStrokeArm = "right";
  sim.nextStrokeTime = sim.elapsed + sim.appliedConfig.strokeInterval;
  sim.phase = "Running";
  sim.rollTargetDisplay = -sim.appliedConfig.rollingAngle;
}

function scheduleStrokes() {
  while (sim.elapsed + 1e-8 >= sim.nextStrokeTime) {
    startStroke(sim.nextStrokeArm);
    sim.nextStrokeArm = sim.nextStrokeArm === "left" ? "right" : "left";
    sim.nextStrokeTime += sim.appliedConfig.strokeInterval;
  }
}

function startStroke(arm) {
  const armState = arm === "left" ? sim.left : sim.right;
  armState.startTime = sim.elapsed;
  armState.count += 1;

  sim.energy = clamp(sim.energy - 3, 0, 100);

  const delta = computeSpeedDelta(arm);
  sim.speedKmh = Math.max(1.5, sim.speedKmh + delta);
}

function computeSpeedDelta(arm) {
  const startAngle = arm === "left" ? -sim.currentRollDisplay : sim.currentRollDisplay;
  let delta = 0;

  if (startAngle <= -50) delta = 0.2;
  else if (startAngle <= -40) delta = 0.15;
  else if (startAngle <= -30) delta = 0.1;
  else if (startAngle < 0) delta = 0.05;
  else delta = -0.2;

  const p = sim.appliedConfig.bodyPitch;
  if (p >= -1 && p <= 1) delta *= 1.5;
  else if ((p >= -3 && p <= -2) || (p >= 2 && p <= 3)) delta *= 1.0;
  else delta *= 0.5;

  return delta;
}

function applyGlideRecovery(dt) {
  sim.energy = clamp(sim.energy + dt * 1.0, 0, 100);
}

function updateArmPhases() {
  sim.left.phase = evaluateArmPhase(sim.left.startTime, sim.elapsed);
  sim.right.phase = evaluateArmPhase(sim.right.startTime, sim.elapsed);

  sim.left.active = isArmActive(sim.left.startTime, sim.elapsed);
  sim.right.active = isArmActive(sim.right.startTime, sim.elapsed);
}

function evaluateArmPhase(startTime, now) {
  if (startTime === null) return "Idle";
  const t = now - startTime;
  if (t < 0) return "Idle";
  if (t < 0.5) return "Catch";
  if (t < 1.0) return "Pull";
  if (t < 2.0) return "Push";
  if (t < 4.0) return "Recovery";
  return "ExtendedForward";
}

function isArmActive(startTime, now) {
  if (startTime === null) return false;
  const t = now - startTime;
  return t >= 0 && t < 4;
}

function checkFinish() {
  if (sim.distance < 50 || sim.phase === "Finished") return;
  sim.distance = 50;
  sim.phase = "Finished";
  setInputsLocked(false);

  ui.resultTime.textContent = `${sim.elapsed.toFixed(1)}s`;
  ui.resultFinalSpeed.textContent = `${sim.speedKmh.toFixed(2)} km/h`;
  ui.resultAvgSpeed.textContent = `${sim.averageSpeedKmh.toFixed(2)} km/h`;
  ui.resultFinalEnergy.textContent = `${sim.energy.toFixed(1)}%`;
  ui.resultCard.classList.remove("hidden");
}

function updateModel(dt) {
  const rollRad = THREE.MathUtils.degToRad(sim.currentRollDisplay * sim.rollSign);
  const pitchRad = THREE.MathUtils.degToRad(sim.appliedConfig.bodyPitch || sim.config.bodyPitch);
  three.swimmerRoot.rotation.x = pitchRad;
  three.torso.rotation.z = rollRad;

  const leftPose = computeArmPose(sim.left.startTime);
  const rightPose = computeArmPose(sim.right.startTime);

  three.leftArmPivot.rotation.x = leftPose.angle;
  three.leftArmPivot.rotation.y = leftPose.sweep;
  three.leftArmPivot.rotation.z = leftPose.lift;
  three.rightArmPivot.rotation.x = rightPose.angle;
  three.rightArmPivot.rotation.y = -rightPose.sweep;
  three.rightArmPivot.rotation.z = -rightPose.lift;

  const kick = Math.sin(sim.elapsed * 8.4) * 0.16;
  three.leftLeg.rotation.x = kick;
  three.rightLeg.rotation.x = -kick;

  if (three.bubbles) {
    const attr = three.bubbles.geometry.getAttribute("position");
    const seeds = three.bubbles.geometry.userData.seeds;
    const effort = (sim.left.phase === "Push" || sim.right.phase === "Push") ? 1.8 : 1.0;
    for (let i = 0; i < attr.count; i++) {
      const i3 = i * 3;
      const seed = seeds[i];
      let y = attr.array[i3 + 1];
      y += dt * (0.3 + (seed % 0.2) * effort);
      if (y > 1.25) y = 0.06;
      attr.array[i3 + 1] = y;
      attr.array[i3] = Math.sin(sim.elapsed * 1.5 + seed) * 0.28;
    }
    attr.needsUpdate = true;
    three.bubbles.visible = sim.phase !== "Stopped";
  }
}

function computeArmPose(startTime) {
  if (startTime === null) return { angle: 0, sweep: 0, lift: 0 };
  const t = sim.elapsed - startTime;
  if (t < 0) return { angle: 0, sweep: 0, lift: 0 };

  // Keep shoulder rotation direction consistent across the full stroke cycle.
  // The arm enters downward, then continues rotating the same way through
  // push and recovery until it returns to the forward extended pose.
  const fullTurn = Math.PI * 2;

  if (t < 0.5) {
    const p = t / 0.5;
    return {
      angle: lerp(0.0, 0.88, p),
      sweep: lerp(0.0, -0.12, p),
      lift: lerp(0.0, 0.02, p),
    };
  }
  if (t < 1.0) {
    const p = (t - 0.5) / 0.5;
    return {
      angle: lerp(0.88, 1.72, p),
      sweep: lerp(-0.12, -0.04, p),
      lift: lerp(0.02, 0.0, p),
    };
  }
  if (t < 2.0) {
    const p = (t - 1.0) / 1.0;
    return {
      angle: lerp(1.72, 2.46, p),
      sweep: lerp(-0.04, 0.12, p),
      lift: lerp(0.0, -0.04, p),
    };
  }
  if (t < 4.0) {
    const p = (t - 2.0) / 2.0;
    return {
      angle: lerp(2.46, fullTurn - 0.06, p),
      sweep: lerp(0.12, 0.0, p),
      lift: Math.sin(p * Math.PI) * 0.28,
    };
  }
  return { angle: 0, sweep: 0, lift: 0 };
}

function updateWater(dt) {
  if (three.water) {
    three.water.material.uniforms["time"].value += dt * 0.66;
  }
}

function updateCharts(dt) {
  sim.chartTimer += dt;
  if (sim.chartTimer < 0.12) return;
  sim.chartTimer = 0;

  sim.history.speed.push({ t: sim.elapsed, v: sim.speedKmh });
  sim.history.energy.push({ t: sim.elapsed, v: sim.energy });
  sim.history.roll.push({ t: sim.elapsed, v: sim.currentRollDisplay });

  trimHistory(sim.history.speed, 25);
  trimHistory(sim.history.energy, 25);
  trimHistory(sim.history.roll, 25);
}

function trimHistory(list, seconds) {
  const threshold = sim.elapsed - seconds;
  while (list.length && list[0].t < threshold) list.shift();
}

function renderAll() {
  drawRollIndicator();
  drawChart(ui.speedChart, sim.history.speed, 1.5, Math.max(3.5, sim.speedKmh + 0.5), "#278ba9", "rgba(75, 167, 193, 0.3)");
  drawChart(ui.energyChart, sim.history.energy, 0, 100, "#e28152", "rgba(237, 155, 108, 0.26)");
  drawChart(ui.rollChart, sim.history.roll, -75, 75, "#376fa0", "rgba(115, 156, 197, 0.24)");

  const activeArm = sim.left.active && sim.right.active ? "Both" : sim.left.active ? "Left" : sim.right.active ? "Right" : "None";
  const stateLabel =
    sim.phase === "InitialRollToRightMax"
      ? "Initial Rolling"
      : sim.phase === "InitialGlideHold"
        ? "Initial Glide Hold"
        : sim.phase === "Running" && sim.holdRemaining > 0
          ? "Glide Hold"
          : sim.phase;

  ui.currentState.textContent = stateLabel;
  ui.activeArm.textContent = activeArm;
  ui.currentRoll.textContent = `${sim.currentRollDisplay.toFixed(1)}°`;
  ui.glideLeft.textContent = `${sim.holdRemaining.toFixed(1)}s`;
  ui.leftPhase.textContent = sim.left.phase;
  ui.rightPhase.textContent = sim.right.phase;

  ui.currentSpeed.textContent = `${sim.speedKmh.toFixed(2)} km/h`;
  ui.avgSpeed.textContent = `${sim.averageSpeedKmh.toFixed(2)} km/h`;
  ui.elapsed.textContent = `${sim.elapsed.toFixed(1)}s`;
  ui.glideRemaining.textContent = `${sim.holdRemaining.toFixed(1)}s`;

  ui.snapshotElapsed.textContent = `${sim.elapsed.toFixed(1)}s`;
  ui.snapshotDistance.textContent = `${sim.distance.toFixed(1)}m`;
  ui.snapshotSpeed.textContent = `${sim.speedKmh.toFixed(2)} km/h`;
  ui.snapshotEnergy.textContent = `${sim.energy.toFixed(1)}%`;

  ui.leftCount.textContent = String(sim.left.count);
  ui.rightCount.textContent = String(sim.right.count);
  ui.totalCount.textContent = String(sim.left.count + sim.right.count);

  ui.distanceTop.textContent = `${sim.distance.toFixed(1)} / 50.0 m`;
  ui.distanceBar.style.width = `${clamp((sim.distance / 50) * 100, 0, 100)}%`;
  ui.energyBar.style.width = `${sim.energy.toFixed(1)}%`;
  ui.energyText.textContent = `${sim.energy.toFixed(1)}%`;

  ui.speedHeadline.textContent = `${sim.speedKmh.toFixed(2)} km/h`;
  ui.energyHeadline.textContent = `${sim.energy.toFixed(1)}%`;
  ui.rollHeadline.textContent = `${sim.currentRollDisplay.toFixed(1)}°`;

  highlightPhaseTimeline(ui.leftPhaseTimeline, sim.left.phase);
  highlightPhaseTimeline(ui.rightPhaseTimeline, sim.right.phase);

  three.controls.update();
  three.renderer.render(three.scene, three.camera);
}

function drawRollIndicator() {
  const canvas = ui.rollCanvas;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = 44;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(25, 71, 99, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(25, 71, 99, 0.25)";
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();

  const angle = THREE.MathUtils.degToRad(sim.currentRollDisplay);
  const x = Math.cos(angle) * r;
  const y = Math.sin(angle) * r;
  ctx.strokeStyle = "#2e93b7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - x, cy + y);
  ctx.lineTo(cx + x, cy - y);
  ctx.stroke();

  ui.rollText.textContent = `Roll ${sim.currentRollDisplay.toFixed(1)}°`;
}

function drawChart(canvas, points, minY, maxY, strokeColor, fillColor) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(20, 52, 76, 0.05)";
  for (let i = 0; i <= 4; i++) {
    const y = (height / 4) * i;
    ctx.fillRect(0, y, width, 1);
  }

  if (points.length < 2) return;

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t || tMin + 1;
  const tRange = Math.max(0.1, tMax - tMin);
  const yRange = Math.max(0.001, maxY - minY);

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = ((p.t - tMin) / tRange) * width;
    const y = height - ((p.v - minY) / yRange) * (height - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo(width, height - 2);
  ctx.lineTo(0, height - 2);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}

function highlightPhaseTimeline(container, phase) {
  for (const node of container.children) {
    node.classList.toggle("active", node.dataset.phase === phase);
  }
}

function refreshControlText() {
  ui.rollingAngleValue.textContent = `${sim.config.rollingAngle.toFixed(0)}°`;
  ui.strokeIntervalValue.textContent = `${sim.config.strokeInterval.toFixed(1)}s`;
  ui.glideHoldValue.textContent = `${sim.config.glideHold.toFixed(1)}s`;
  ui.bodyPitchValue.textContent = `${sim.config.bodyPitch.toFixed(0)}°`;
}

function setCameraPreset(mode, immediate = false) {
  const presets = {
    side: new THREE.Vector3(0.2, 3.0, 8.5),
    top: new THREE.Vector3(0.1, 11.5, 0.1),
    front: new THREE.Vector3(9.0, 2.6, 0.2),
  };
  const to = presets[mode] || presets.side;

  if (immediate) {
    three.camera.position.copy(to);
    three.controls?.target.set(0, 0.55, 0);
    return;
  }

  const from = three.camera.position.clone();
  const start = performance.now();
  const duration = 450;

  function animateCamera(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    three.camera.position.lerpVectors(from, to, eased);
    three.controls.target.set(0, 0.55, 0);
    if (t < 1) requestAnimationFrame(animateCamera);
  }
  requestAnimationFrame(animateCamera);
}

function onResize() {
  const container = document.getElementById("threeContainer");
  const width = container.clientWidth;
  const height = container.clientHeight;
  three.camera.aspect = width / height;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(width, height);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
