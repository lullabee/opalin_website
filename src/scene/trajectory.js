import meta from './data/pick_demo9.json'
import trackUrl from './data/pick_demo9.bin?url'

const JOINTS = 6
const CHANNELS = JOINTS + 1

const JOINT_SIGMA = 1.6
const GRIPPER_SIGMA = 2.6
const NOISE_RAD = 0.21
const TIME_WOBBLE = 0.06
const PLACE_YAW = 1.7
const PLACE_BLEND = [0.5, 1.0]

function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const weights = []
  for (let i = -radius; i <= radius; i++) weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  const total = weights.reduce((a, b) => a + b, 0)
  return { radius, weights: weights.map((w) => w / total) }
}

function smooth(channel, frames, stride, offset, sigma) {
  const { radius, weights } = gaussianKernel(sigma)
  const out = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let acc = 0
    for (let k = -radius; k <= radius; k++) {
      const i = Math.min(Math.max(f + k, 0), frames - 1)
      acc += channel[i * stride + offset] * weights[k + radius]
    }
    out[f] = acc
  }
  return out
}

const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const catmullRom = (a, b, c, d, t) => {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(demos) {
  const random = mulberry32(0x09a11)
  const table = []
  for (let d = 0; d < demos; d++) {
    const perJoint = []
    for (let n = 0; n < JOINTS; n++) {
      perJoint.push({
        f1: 2 + random() * 3,
        f2: 4 + random() * 4,
        p1: random() * Math.PI * 2,
        p2: random() * Math.PI * 2,
        gain: (0.55 + random() * 0.75) * (random() < 0.5 ? -1 : 1),
      })
    }
    table.push(perJoint)
  }
  const at = (demo, joint, s) => {
    const w = table[((demo % demos) + demos) % demos][joint]
    const envelope = Math.sin(Math.PI * s)
    return envelope * w.gain * (Math.sin(s * w.f1 * 3 + w.p1) * 0.7 + Math.sin(s * w.f2 * 2 + w.p2) * 0.3)
  }
  at.pacing = (demo, s) => {
    const w = table[((demo % demos) + demos) % demos][0]
    return Math.sin(Math.PI * s) * (Math.sin(s * w.f1 * 1.7 + w.p2) * 0.6 + Math.sin(s * w.f2 * 1.1 + w.p1) * 0.4)
  }
  return at
}

export async function loadTrajectory({ demos = 7 } = {}) {
  const buffer = await fetch(trackUrl).then((r) => r.arrayBuffer())
  const frames = meta.frames
  const rawJoints = new Int16Array(buffer, 0, frames * JOINTS)
  const rawGripper = new Int16Array(buffer, frames * JOINTS * 2, frames)

  const track = new Float32Array(frames * CHANNELS)
  for (let f = 0; f < frames; f++) {
    for (let n = 0; n < JOINTS; n++) track[f * CHANNELS + n] = (rawJoints[f * JOINTS + n] / 32767) * Math.PI
    track[f * CHANNELS + JOINTS] = rawGripper[f] / 100
  }

  for (let n = 0; n < JOINTS; n++) {
    const channel = smooth(track, frames, CHANNELS, n, JOINT_SIGMA)
    for (let f = 0; f < frames; f++) track[f * CHANNELS + n] = channel[f]
  }
  const grip = smooth(track, frames, CHANNELS, JOINTS, GRIPPER_SIGMA)
  for (let f = 0; f < frames; f++) track[f * CHANNELS + JOINTS] = grip[f]

  const findGrasp = () => {
    let lo = Infinity
    let hi = -Infinity
    for (let f = 0; f < frames; f++) {
      const v = track[f * CHANNELS + JOINTS]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const threshold = lo + (hi - lo) * 0.12
    for (let f = 0; f < frames; f++) if (track[f * CHANNELS + JOINTS] <= threshold) return f
    return frames - 1
  }

  const graspFrame = findGrasp()
  const placeTarget = new Float32Array(JOINTS)
  for (let n = 0; n < JOINTS; n++) placeTarget[n] = track[graspFrame * CHANNELS + n]
  placeTarget[0] += PLACE_YAW

  const noise = makeNoise(demos)
  const out = { joints: new Float32Array(JOINTS), gripperMm: 0 }
  const clamp = (i) => Math.min(Math.max(i, 0), frames - 1)

  const pacing = (s, demo, amplitude) =>
    amplitude ? clamp01(s + noise.pacing(demo, s) * amplitude * TIME_WOBBLE) : s

  const sample = (t, { demo = 0, amplitude = 0 } = {}) => {
    const s = pacing(clamp01(t / meta.duration_s), demo, amplitude)
    const x = s * (frames - 1)
    const i = Math.floor(x)
    const f = x - i
    const i0 = clamp(i - 1) * CHANNELS
    const i1 = clamp(i) * CHANNELS
    const i2 = clamp(i + 1) * CHANNELS
    const i3 = clamp(i + 2) * CHANNELS
    const blend = smoothstep(PLACE_BLEND[0], PLACE_BLEND[1], s)
    for (let n = 0; n < JOINTS; n++) {
      const recorded = catmullRom(track[i0 + n], track[i1 + n], track[i2 + n], track[i3 + n], f)
      const value = recorded + (placeTarget[n] - recorded) * blend
      out.joints[n] = amplitude ? value + noise(demo, n, s) * amplitude * NOISE_RAD : value
    }
    out.gripperMm = catmullRom(track[i0 + JOINTS], track[i1 + JOINTS], track[i2 + JOINTS], track[i3 + JOINTS], f)
    return out
  }

  return { meta, sample, duration: meta.duration_s, demos, graspFrame }
}
