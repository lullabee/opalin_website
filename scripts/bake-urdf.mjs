import { readFileSync, writeFileSync } from 'node:fs'

const SRC = process.argv[2]
const OUT = process.argv[3]

const nums = (s, fb) => (s ?? fb).trim().split(/\s+/).map(Number)
const attr = (tag, name) => tag.match(new RegExp(`${name}=["']([^"']*)["']`))?.[1]

const urdf = readFileSync(SRC, 'utf8')
const joints = []

for (const [, body] of urdf.matchAll(/<joint\b([\s\S]*?)<\/joint>/g)) {
  const head = body.slice(0, body.indexOf('>') + 1)
  const origin = body.match(/<origin\b[^>]*>/)?.[0] ?? ''
  const axis = body.match(/<axis\b[^>]*>/)?.[0] ?? ''
  const limit = body.match(/<limit\b[^>]*>/)?.[0] ?? ''
  joints.push({
    name: attr(head, 'name'),
    type: attr(head, 'type'),
    parent: attr(body.match(/<parent\b[^>]*>/)[0], 'link'),
    child: attr(body.match(/<child\b[^>]*>/)[0], 'link'),
    xyz: nums(attr(origin, 'xyz'), '0 0 0'),
    rpy: nums(attr(origin, 'rpy'), '0 0 0'),
    axis: axis ? nums(attr(axis, 'xyz'), '0 0 1') : null,
    limit: limit ? [Number(attr(limit, 'lower')), Number(attr(limit, 'upper'))] : null,
  })
}

const meshes = {}
for (const [, name, body] of urdf.matchAll(/<link\s+name=["']([^"']+)["']([\s\S]*?)<\/link>/g)) {
  const visual = body.match(/<visual>[\s\S]*?<\/visual>/)?.[0]
  const file = visual && attr(visual.match(/<mesh\b[^>]*>/)?.[0] ?? '', 'filename')
  if (file) meshes[name] = file.replace(/^assets\//, '').replace(/\.stl$/i, '')
}

const links = [...new Set(joints.flatMap((j) => [j.parent, j.child]))]
const root = links.find((l) => !joints.some((j) => j.child === l))

writeFileSync(OUT, JSON.stringify({ root, joints, meshes }, null, 2) + '\n')
console.log(`${joints.length} joints, ${Object.keys(meshes).length} meshes, root "${root}" -> ${OUT}`)
