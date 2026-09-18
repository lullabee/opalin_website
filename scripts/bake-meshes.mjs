import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";

const SRC = process.argv[2];
const OUT = process.argv[3];

const WELD_GRID = 2e-5; // 0.02 mm
const FEATURE_ANGLE = 22; // degrees
const LINE_TOLERANCE = 1.5e-4; // 0.15 mm, polyline simplification
const TARGET_RATIO = Number(process.env.RATIO ?? 0.03);
const TARGET_ERROR = Number(process.env.ERR ?? 0.01);

function readStl(buf) {
  const n = buf.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(o + k * 4);
  }
  return pos;
}

function weld(pos) {
  const map = new Map();
  const verts = [];
  const index = new Uint32Array(pos.length / 3);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i],
      y = pos[i + 1],
      z = pos[i + 2];
    const key = `${Math.round(x / WELD_GRID)},${Math.round(y / WELD_GRID)},${Math.round(z / WELD_GRID)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      verts.push(x, y, z);
      map.set(key, id);
    }
    index[i / 3] = id;
  }
  return { positions: new Float32Array(verts), index };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const at = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];

function featureEdges({ positions, index }) {
  const faceNormal = [];
  for (let f = 0; f < index.length; f += 3) {
    const a = at(positions, index[f]),
      b = at(positions, index[f + 1]),
      c = at(positions, index[f + 2]);
    faceNormal.push(norm(cross(sub(b, a), sub(c, a))));
  }
  const edges = new Map();
  for (let f = 0; f < index.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const i0 = index[f + e],
        i1 = index[f + ((e + 1) % 3)];
      if (i0 === i1) continue;
      const key = i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`;
      const rec = edges.get(key);
      if (rec) rec.push(f / 3);
      else edges.set(key, [f / 3]);
    }
  }
  const cosLimit = Math.cos((FEATURE_ANGLE * Math.PI) / 180);
  const keep = [];
  for (const [key, faces] of edges) {
    if (faces.length === 2) {
      if (dot(faceNormal[faces[0]], faceNormal[faces[1]]) > cosLimit) continue;
    } else if (faces.length > 2) continue;
    const [i0, i1] = key.split("_").map(Number);
    keep.push([i0, i1]);
  }
  return keep;
}

function chain(edges) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const used = new Set();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const paths = [];
  const walk = (start) => {
    let path = [start],
      cur = start,
      prev = -1;
    for (;;) {
      const next = (adj.get(cur) ?? []).find(
        (n) => n !== prev && !used.has(key(cur, n)),
      );
      if (next === undefined) break;
      used.add(key(cur, next));
      path.push(next);
      prev = cur;
      cur = next;
      if (cur === start) break;
    }
    if (path.length > 1) paths.push(path);
  };
  for (const [v, ns] of adj) if (ns.length !== 2) walk(v);
  for (const [a, b] of edges) if (!used.has(key(a, b))) walk(a);
  return paths;
}

function simplifyPath(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0,
    idx = 0;
  const a = pts[0],
    b = pts[pts.length - 1];
  const ab = sub(b, a),
    abLen = len(ab) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(cross(sub(pts[i], a), ab)) / abLen;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [a, b];
  return [
    ...simplifyPath(pts.slice(0, idx + 1), tol).slice(0, -1),
    ...simplifyPath(pts.slice(idx), tol),
  ];
}

await MeshoptSimplifier.ready;

const manifest = {};
const chunks = [];
let offset = 0;
const push = (buf) => {
  const o = offset;
  chunks.push(buf);
  offset += buf.byteLength;
  return o;
};
const pad = () => {
  const r = offset % 4;
  if (r) push(Buffer.alloc(4 - r));
};

for (const file of readdirSync(SRC)
  .filter((f) => f.toLowerCase().endsWith(".stl"))
  .sort()) {
  const name = basename(file, ".stl");
  const raw = readStl(readFileSync(join(SRC, file)));
  const welded = weld(raw);
  const srcTris = raw.length / 9;

  const target = Math.max(
    64,
    Math.floor((welded.index.length * TARGET_RATIO) / 3) * 3,
  );
  const [simplified, error] = MeshoptSimplifier.simplify(
    welded.index,
    welded.positions,
    3,
    target,
    TARGET_ERROR,
    ["LockBorder"],
  );
  const remap = new Map();
  const coords = [];
  const fillIdx = new Uint16Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    const old = simplified[i];
    let id = remap.get(old);
    if (id === undefined) {
      id = remap.size;
      remap.set(old, id);
      coords.push(
        welded.positions[old * 3],
        welded.positions[old * 3 + 1],
        welded.positions[old * 3 + 2],
      );
    }
    fillIdx[i] = id;
  }
  if (remap.size > 0xffff)
    throw new Error(
      `${name}: ${remap.size} vertices exceeds Uint16 index range`,
    );
  const fillPos = new Float32Array(coords);

  const paths = chain(featureEdges(welded));
  const lineVerts = [];
  let rawSegs = 0;
  for (const path of paths) {
    rawSegs += path.length - 1;
    const pts = simplifyPath(
      path.map((i) => at(welded.positions, i)),
      LINE_TOLERANCE,
    );
    for (let i = 0; i < pts.length - 1; i++)
      lineVerts.push(...pts[i], ...pts[i + 1]);
  }
  const lines = new Float32Array(lineVerts);

  pad();
  const fillPosOff = push(
    Buffer.from(fillPos.buffer, fillPos.byteOffset, fillPos.byteLength),
  );
  pad();
  const fillIdxOff = push(
    Buffer.from(fillIdx.buffer, fillIdx.byteOffset, fillIdx.byteLength),
  );
  pad();
  const lineOff = push(
    Buffer.from(lines.buffer, lines.byteOffset, lines.byteLength),
  );

  manifest[name] = {
    fill: {
      position: [fillPosOff, fillPos.length],
      index: [fillIdxOff, fillIdx.length],
    },
    lines: [lineOff, lines.length],
  };
  console.log(
    `${name.padEnd(11)} ${String(srcTris).padStart(6)} tris -> ${String(fillIdx.length / 3).padStart(5)}` +
      ` (err ${error.toFixed(4)})   edges ${String(rawSegs).padStart(5)} -> ${String(lines.length / 6).padStart(5)} segs`,
  );
}

const bin = Buffer.concat(chunks);
writeFileSync(join(OUT, "yam_geometry.bin"), bin);
writeFileSync(join(OUT, "yam_geometry.json"), JSON.stringify(manifest) + "\n");
console.log(
  `\ntotal ${(bin.byteLength / 1024).toFixed(0)} KB -> ${join(OUT, "yam_geometry.bin")}`,
);
