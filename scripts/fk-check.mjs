import { readFileSync } from 'node:fs'
import { Object3D, Quaternion, Vector3 } from 'three'

const chain = JSON.parse(readFileSync('src/scene/data/yam_chain.json', 'utf8'))
const meta = JSON.parse(readFileSync('src/scene/data/pick_demo9.json', 'utf8'))
const bin = readFileSync('src/scene/data/pick_demo9.bin')
const ref = JSON.parse(readFileSync(process.argv[2], 'utf8')).eef

const frames = meta.frames
const joints = new Int16Array(bin.buffer, bin.byteOffset, frames * 6)

const links = new Map()
for (const n of new Set(chain.joints.flatMap((j) => [j.parent, j.child]))) links.set(n, new Object3D())
const mov = []
for (const j of chain.joints) {
  const c = links.get(j.child)
  c.position.fromArray(j.xyz)
  c.rotation.set(...j.rpy)
  links.get(j.parent).add(c)
  if (j.type === 'revolute') mov.push({ node: c, axis: new Vector3(...j.axis).normalize(), base: c.quaternion.clone() })
}
const root = links.get(chain.root)
const eef = links.get('gripper')
const spin = new Quaternion()
const world = new Vector3()

let sum = 0
let max = 0
for (let f = 0; f < frames; f++) {
  for (let k = 0; k < 6; k++) {
    mov[k].node.quaternion.copy(mov[k].base).multiply(spin.setFromAxisAngle(mov[k].axis, (joints[f * 6 + k] / 32767) * Math.PI))
  }
  root.updateMatrixWorld(true)
  world.setFromMatrixPosition(eef.matrixWorld)
  const d = Math.hypot(world.x - ref[f][0], world.y - ref[f][1], world.z - ref[f][2])
  sum += d
  if (d > max) max = d
}

const mean = (sum / frames) * 1000
console.log(`frames ${frames}   mean ${mean.toFixed(3)} mm   max ${(max * 1000).toFixed(3)} mm`)
if (mean > 1) {
  console.error('FAIL: replayed kinematics diverge from the recorded gripper path')
  process.exit(1)
}
console.log('OK: replay matches the recorded gripper path')
