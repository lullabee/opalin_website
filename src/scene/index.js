import { Box3, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";

import { tokenColor } from "./tokens.js";
import { loadArm } from "./arm.js";
import { loadTrajectory } from "./trajectory.js";
import { createTrail } from "./trail.js";
import { createDemonstrations } from "./demonstrations.js";
import { createGrid } from "./grid.js";

const FINGER_STROKE_M = 0.0475;
const TRAIL_SAMPLES = 260;
const DEMO_SAMPLES = 130;
const DEMOS = 7;
const ITERATIONS = 8;
const DECAY = 6.2;
const SPEED = 2.5;
const PACE_FIRST = 0.72;
const PACE_LAST = 1.35;

const AZIMUTH = -2.29;
const AZIMUTH_SWING = 0.22;
const ELEVATION = 0.55;
const ELEVATION_SWING = 0.07;
const RESUME_DELAY_MS = 2000;
const RESUME_RATE = 1.6;

export async function mountScene(canvas, view = {}) {
  const azimuthBase = view.azimuth ?? AZIMUTH;
  const elevationBase = view.elevation ?? ELEVATION;
  const zoom = view.zoom ?? 0.62;
  const speed = view.speed ?? SPEED;
  const demoCount = view.demos ?? DEMOS;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  camera.up.set(0, 0, 1);
  const target = new Vector3();

  const [arm, track] = await Promise.all([
    loadArm({
      fillColor: tokenColor("--geo-fill"),
      lineColor: tokenColor("--geo-line"),
    }),
    loadTrajectory({ demos: demoCount }),
  ]);

  const passes = [];
  let clock = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const k = ITERATIONS === 1 ? 1 : i / (ITERATIONS - 1);
    const duration =
      track.duration / (speed * (PACE_FIRST + (PACE_LAST - PACE_FIRST) * k));
    passes.push({
      start: clock,
      duration,
      u: k,
      cycleSeconds: speed * duration,
    });
    clock += duration;
  }
  const cycle = clock;

  const grid = createGrid({
    size: 1.8,
    divisions: 18,
    color: tokenColor("--geo-grid"),
    ground: tokenColor("--surface"),
  });
  scene.add(grid);
  scene.add(arm.root);

  const tip = arm.links.get("gripper");

  const pose = (t, options) => {
    const frame = track.sample(t, options);
    for (let i = 0; i < 6; i++) arm.setJoint(`joint${i + 1}`, frame.joints[i]);
    const half = Math.min(frame.gripperMm / 2000, FINGER_STROKE_M);
    arm.setJoint("joint7", half);
    arm.setJoint("joint8", -half);
    return frame;
  };

  const tipAt = (t, options) => {
    pose(t, options);
    arm.root.updateMatrixWorld(true);
    return new Vector3().setFromMatrixPosition(tip.matrixWorld);
  };

  const learned = [];
  for (let i = 0; i < TRAIL_SAMPLES; i++)
    learned.push(tipAt((i / (TRAIL_SAMPLES - 1)) * track.duration));
  const trail = createTrail(learned, {
    color: tokenColor("--accent-ink"),
    fade: 0.55,
  });
  scene.add(trail.line);

  const paths = [];
  for (let d = 0; d < demoCount; d++) {
    const ideal = [];
    const noisy = [];
    for (let i = 0; i < DEMO_SAMPLES; i++) {
      const t = (i / (DEMO_SAMPLES - 1)) * track.duration;
      ideal.push(tipAt(t));
      noisy.push(tipAt(t, { demo: d, amplitude: 1 }));
    }
    paths.push({ ideal, noisy });
  }
  const demonstrations = createDemonstrations(paths, {
    color: tokenColor("--accent-ink"),
  });
  scene.add(demonstrations.lines);

  const bounds = new Box3();
  const part = new Box3();
  for (let t = 0; t <= track.duration; t += 0.2) {
    pose(t);
    arm.root.updateMatrixWorld(true);
    bounds.union(part.setFromObject(arm.root, true));
  }
  bounds.getCenter(target);
  const reach = Math.max(...bounds.getSize(new Vector3()).toArray());

  let drawn = false;

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    const span = reach * zoom;
    const aspect = width / height;
    const halfW = aspect >= 1 ? span * aspect : span;
    const halfH = aspect >= 1 ? span : span / aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (drawn) renderer.render(scene, camera);
  };

  const drag = {
    azimuth: 0,
    elevation: 0,
    blend: 0,
    active: false,
    idleAt: 0,
    x: 0,
    y: 0,
  };

  canvas.addEventListener("pointerdown", (e) => {
    drag.active = true;
    drag.blend = 1;
    drag.x = e.clientX;
    drag.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag.active) return;
    drag.azimuth -= (e.clientX - drag.x) * 0.004;
    drag.elevation = Math.min(
      Math.max(drag.elevation + (e.clientY - drag.y) * 0.004, -0.5),
      0.8,
    );
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const release = () => {
    if (!drag.active) return;
    drag.active = false;
    drag.idleAt = performance.now();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  let last = performance.now();
  const state = {
    time: 0,
    progress: 0,
    iteration: 1,
    deviationMm: 12,
    cycleSeconds: 0,
    amplitude: 1,
    gripperMm: 0,
    joints: null,
  };

  const render = (t) => {
    const inCycle = ((t % cycle) + cycle) % cycle;
    let index = ITERATIONS - 1;
    while (index > 0 && inCycle < passes[index].start) index--;
    const current = passes[index];
    const local = Math.min((inCycle - current.start) / current.duration, 1);

    const amplitude = Math.exp(-DECAY * current.u);
    const frame = pose(local * track.duration, { demo: index, amplitude });

    demonstrations.setAmplitude(amplitude);
    trail.setHead(local);

    state.time = t;
    state.progress = local;
    state.iteration = index + 1;
    state.deviationMm = 12 * amplitude + 0.08;
    state.cycleSeconds = current.cycleSeconds;
    state.amplitude = amplitude;
    state.gripperMm = frame.gripperMm;
    state.joints = frame.joints;

    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!drag.active && drag.blend > 0 && now - drag.idleAt > RESUME_DELAY_MS) {
      drag.blend = Math.max(0, drag.blend - dt * RESUME_RATE);
    }

    const orbit = (t / cycle) * Math.PI * 2;
    const azimuth =
      azimuthBase + Math.sin(orbit) * AZIMUTH_SWING + drag.azimuth * drag.blend;
    const elevation =
      elevationBase +
      Math.sin(orbit * 2) * ELEVATION_SWING +
      drag.elevation * drag.blend;

    const r = 3;
    camera.position.set(
      target.x + r * Math.cos(elevation) * Math.cos(azimuth),
      target.y + r * Math.cos(elevation) * Math.sin(azimuth),
      target.z + r * Math.sin(elevation),
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    drawn = true;
    return state;
  };

  resize();
  new ResizeObserver(resize).observe(canvas);

  const graspS = track.graspFrame / (track.meta.frames - 1);

  return {
    render,
    renderer,
    scene,
    camera,
    arm,
    track,
    bounds,
    trail,
    demonstrations,
    cycle,
    passes,
    graspS,
  };
}
