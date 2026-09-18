const TERMINALS = new Set(["__end__", "__fail__", "__next__"]);

const SIZE = { nodeW: 132, nodeH: 30, rowH: 52, colW: 164 };

export function extractEdges(nodes) {
  const edges = [];
  for (const [from, node] of Object.entries(nodes)) {
    for (const [kind, to] of Object.entries(node.transitions)) {
      if (TERMINALS.has(to) || !nodes[to]) continue;
      edges.push({ from, to, kind });
    }
  }
  return edges;
}

export function computeDepths(start, nodes) {
  const depths = { [start]: 0 };
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    for (const [kind, to] of Object.entries(nodes[id].transitions)) {
      if (TERMINALS.has(to) || !nodes[to]) continue;
      const d = depths[id] + (kind === "ok" ? 1 : 0);
      if (depths[to] === undefined || depths[to] > d) {
        depths[to] = d;
        queue.push(to);
      }
    }
  }
  for (const id of Object.keys(nodes))
    if (depths[id] === undefined) depths[id] = 0;
  return depths;
}

function okPath(start, nodes) {
  const path = [];
  let id = start;
  while (id && nodes[id] && !path.includes(id)) {
    path.push(id);
    id = nodes[id].transitions.ok;
  }
  return path;
}

/** ok-path in column 0, branches spread right, rows by depth. */
export function layoutSop({ start, nodes }, size = {}) {
  const { nodeW, nodeH, rowH, colW } = { ...SIZE, ...size };
  const path = okPath(start, nodes);
  const onPath = new Set(path);
  const depths = computeDepths(start, nodes);
  const byDepth = new Map();
  for (const id of Object.keys(nodes)) {
    const list = byDepth.get(depths[id]) ?? [];
    list.push(id);
    byDepth.set(depths[id], list);
  }

  const placed = {};
  for (const [depth, ids] of byDepth) {
    let branch = 0;
    for (const id of ids.sort(
      (a, b) => Number(!onPath.has(a)) - Number(!onPath.has(b)),
    )) {
      const col = onPath.has(id) ? 0 : ++branch;
      placed[id] = {
        id,
        label: nodes[id].label,
        kind: nodes[id].kind ?? "policy",
        skill: nodes[id].skill ?? "",
        share: nodes[id].share ?? 0,
        row: depth,
        col,
        x: col * colW,
        y: depth * rowH,
        w: nodeW,
        h: nodeH,
      };
    }
  }

  const list = Object.values(placed);
  return {
    nodes: list,
    byId: placed,
    edges: extractEdges(nodes),
    okPath: path,
    width: Math.max(...list.map((n) => n.x + n.w)),
    height: Math.max(...list.map((n) => n.y + n.h)),
  };
}

const cx = (n) => n.x + n.w / 2;
const cy = (n) => n.y + n.h / 2;

/** `entry` shifts where a branch-return edge lands on its target, so it clears the ok edge. */
export function routeEdge(a, b, { radius = 5, entry = 0 } = {}) {
  if (a.col === b.col) return `M${cx(a)} ${a.y + a.h}V${b.y}`;
  if (a.row === b.row) {
    return a.x < b.x
      ? `M${a.x + a.w} ${cy(a)}H${b.x}`
      : `M${a.x} ${cy(a)}H${b.x + b.w}`;
  }
  const mid = a.y + a.h + (b.y - a.y - a.h) / 2;
  const target = cx(b) + entry;
  const dir = Math.sign(target - cx(a)) || 1;
  return [
    `M${cx(a)} ${a.y + a.h}`,
    `V${mid - radius}`,
    `Q${cx(a)} ${mid} ${cx(a) + dir * radius} ${mid}`,
    `H${target - dir * radius}`,
    `Q${target} ${mid} ${target} ${mid + radius}`,
    `V${b.y}`,
  ].join("");
}
