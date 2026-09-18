import line from "../scene/data/sop_line.json";
import { layoutSop, routeEdge } from "./sop-layout.js";

const NS = "http://www.w3.org/2000/svg";

const WIDE = {
  w: 620,
  h: 442,
  pad: 26,
  laneAt: 34,
  stepH: 32,
  gap: 14,
  trackAt: 80,
  panel: { x: 26, y: 94, w: 568, h: 306 },
  graph: { x: 60, y: 140, nodeW: 128, nodeH: 28, rowH: 48, colW: 158 },
  note: { x: 392, y: 140 },
  legend: { x: 26, y: 420, step: 128, perRow: 4 },
};

const COMPACT = {
  w: 380,
  h: 400,
  pad: 14,
  laneAt: 14,
  stepW: 86,
  stepH: 24,
  gap: 6,
  trackAt: 106,
  panel: { x: 114, y: 36, w: 252, h: 264 },
  graph: { x: 122, y: 76, nodeW: 112, nodeH: 22, rowH: 36, colW: 124 },
  note: null,
  legend: { x: 14, y: 332, step: 118, perRow: 2 },
};

const NOTE_W = 176;
const NOTE_ROW = 17;

const RECOVERY_PART = 1;
const SWAP = 0.16;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const el = (name, attrs = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Ordered [id, share] the run walks through, given which repeat of the step it is on. */
function orderFor(step, graph, part) {
  const ids = [];
  let id = graph.start;
  while (id && graph.nodes[id]) {
    ids.push(id);
    id = graph.nodes[id].transitions.ok;
  }
  if (step.id !== "kit" || part !== RECOVERY_PART) {
    return ids.map((n) => [n, graph.nodes[n].share]);
  }
  return [
    ["select", 0.16],
    ["pick", 0.2],
    ["correct_pick", 0.2],
    ["place", 0.3],
    ["home", 0.14],
  ];
}

function walk(order, p) {
  let acc = 0;
  for (let i = 0; i < order.length; i++) {
    const [id, share] = order[i];
    if (p < acc + share || i === order.length - 1) {
      return { live: id, local: clamp01((p - acc) / share), index: i };
    }
    acc += share;
  }
  return { live: order[0][0], local: 0, index: 0 };
}

export function createOrchestration(mount, { compact = false } = {}) {
  const G = compact ? COMPACT : WIDE;
  const { pad } = G;
  const steps = [];
  let clock = 0;
  for (const step of line.mission) {
    steps.push({ ...step, start: clock });
    clock += step.duration;
  }
  const duration = clock;

  const svg = el("svg", {
    viewBox: `0 0 ${G.w} ${G.h}`,
    "aria-hidden": "true",
  });

  const headY = compact ? G.h - 18 : 14;
  svg.append(
    el("text", { class: "orc-head", x: pad, y: headY }, `SOP · ${line.label}`),
  );
  const headRight = el("text", {
    class: "orc-head orc-right",
    x: G.w - pad,
    y: headY,
  });
  svg.append(headRight);

  const laneSpan = compact
    ? steps.length * G.stepH + (steps.length - 1) * G.gap
    : G.w - pad * 2;
  const stepW = compact
    ? G.stepW
    : (laneSpan - G.gap * (steps.length - 1)) / steps.length;
  const stepAdvance = (compact ? G.stepH : stepW) + G.gap;

  const laneEls = steps.map((step, i) => {
    const x = compact ? G.laneAt : pad + i * stepAdvance;
    const y = compact ? G.laneAt + 22 + i * stepAdvance : G.laneAt;
    const g = el("g", { class: "orc-step" });
    g.append(
      el("rect", { x, y, width: stepW, height: G.stepH, rx: 3 }),
      el(
        "text",
        { class: "orc-step-num", x: x + 8, y: y + G.stepH / 2 + 3.5 },
        String(i + 1).padStart(2, "0"),
      ),
      el(
        "text",
        { class: "orc-step-label", x: x + 26, y: y + G.stepH / 2 + 3.5 },
        step.label,
      ),
    );
    const fill = el("rect", {
      class: "orc-step-fill",
      x,
      y: y + G.stepH - 2,
      width: 0,
      height: 2,
    });
    g.append(fill);
    svg.append(g);
    if (i < steps.length - 1) {
      const d = compact
        ? `M${x + stepW / 2} ${y + G.stepH}V${y + stepAdvance}`
        : `M${x + stepW} ${y + G.stepH / 2}H${x + stepAdvance}`;
      svg.append(el("path", { class: "orc-link", d }));
    }
    return { g, fill, x: x + stepW, y: y + G.stepH / 2, cx: x + stepW / 2 };
  });

  const trackLen = compact ? steps.length * stepAdvance - G.gap : laneSpan;
  const trackFrom = compact ? G.laneAt + 22 : pad;
  const track = el("g");
  for (const step of steps) {
    const at = trackFrom + (step.start / duration) * trackLen;
    const len = (step.duration / duration) * trackLen - 2;
    track.append(
      el("rect", {
        class: "orc-track",
        x: compact ? G.trackAt : at,
        y: compact ? at : G.trackAt,
        width: compact ? 3 : len,
        height: compact ? len : 3,
      }),
    );
  }
  const trackFill = el("rect", {
    class: "orc-track-fill",
    x: compact ? G.trackAt : pad,
    y: compact ? trackFrom : G.trackAt,
    width: compact ? 3 : 0,
    height: compact ? 0 : 3,
  });
  track.append(trackFill);
  svg.append(track);

  svg.append(
    el("rect", {
      class: "orc-panel",
      x: G.panel.x + 0.5,
      y: G.panel.y + 0.5,
      width: G.panel.w - 1,
      height: G.panel.h - 1,
      rx: 3,
    }),
  );
  const bracket = el("path", { class: "orc-bracket" });
  svg.append(bracket);

  const panelLabel = el("text", {
    class: "orc-head",
    x: G.panel.x + 14,
    y: G.panel.y + 20,
  });
  svg.append(panelLabel);

  const views = {};
  for (const step of steps) {
    const graph = line.graphs[step.graph];
    const layout = layoutSop(graph, G.graph);
    const view = el("g", {
      class: "orc-view",
      transform: `translate(${G.graph.x} ${G.graph.y})`,
    });

    const edges = layout.edges.map((edge) => {
      const path = el("path", {
        class: "orc-edge",
        "data-kind": edge.kind,
        d: routeEdge(layout.byId[edge.from], layout.byId[edge.to], {
          entry: layout.byId[edge.from].col > layout.byId[edge.to].col ? 28 : 0,
        }),
      });
      view.append(path);
      return { edge, path };
    });

    const nodes = layout.nodes.map((node) => {
      const g = el("g", { class: "orc-node", "data-kind": node.kind });
      g.append(
        el("rect", {
          class: "orc-node-box",
          x: node.x,
          y: node.y,
          width: node.w,
          height: node.h,
          rx: 2,
        }),
        el("rect", {
          class: "orc-rail",
          x: node.x + 3,
          y: node.y + 5,
          width: 2.5,
          height: node.h - 10,
        }),
        el(
          "text",
          {
            class: "orc-node-label",
            x: node.x + 14,
            y: node.y + node.h / 2 + 3,
          },
          node.label,
        ),
        el("rect", {
          class: "orc-node-fill",
          x: node.x,
          y: node.y + node.h - 2,
          width: 0,
          height: 2,
        }),
      );
      view.append(g);
      return { node, g, fill: g.querySelector(".orc-node-fill") };
    });

    const token = el("circle", { class: "orc-token", r: 2.6, cx: 0, cy: 0 });
    view.append(token);

    svg.append(view);
    views[step.id] = { view, layout, graph, nodes, edges, token };
  }

  const note = el("g", {
    class: "orc-note",
    transform: `translate(${G.note?.x ?? 0} ${G.note?.y ?? 0})`,
  });
  const rows = ["NODE", "SKILL", "KIND", "ON SKIP", "RECORD"].map((key, i) => {
    const y = i * NOTE_ROW + 12;
    note.append(el("text", { class: "orc-note-key", x: 0, y }, key));
    const value = el("text", { class: "orc-note-value", x: 62, y });
    note.append(value);
    return value;
  });
  note.append(
    el("path", {
      class: "orc-note-rule",
      d: `M0 ${5 * NOTE_ROW + 20}H${NOTE_W}`,
    }),
  );
  const elapsed = el("text", {
    class: "orc-note-value",
    x: 0,
    y: 5 * NOTE_ROW + 38,
  });
  note.append(elapsed);
  if (G.note) svg.append(note);

  const legend = el("g", { class: "orc-legend" });
  [
    ["fixture", "FIXTURE"],
    ["perception", "PERCEPTION"],
    ["policy", "LEARNED POLICY"],
    ["human", "HUMAN"],
  ].forEach(([kind, label], i) => {
    const x = G.legend.x + (i % G.legend.perRow) * G.legend.step;
    const y = G.legend.y + Math.floor(i / G.legend.perRow) * 16;
    legend.append(
      el("rect", {
        class: "orc-rail",
        "data-kind": kind,
        x,
        y: y - 7,
        width: 2.5,
        height: 9,
      }),
      el("text", { class: "orc-legend-label", x: x + 10, y }, label),
    );
  });
  svg.append(legend);

  mount.append(svg);

  const setState = (node, state) => {
    if (node.dataset.state !== state) node.dataset.state = state;
  };

  const update = (t) => {
    const time = clamp01(t / duration) * duration;
    let index = steps.length - 1;
    while (index > 0 && time < steps[index].start) index--;
    const step = steps[index];
    const p = clamp01((time - step.start) / step.duration);

    const parts = step.parts ?? 1;
    const part = Math.min(Math.floor(p * parts), parts - 1);
    const pp = parts === 1 ? p : clamp01(p * parts - part);

    const order = orderFor(step, line.graphs[step.graph], part);
    const { live, local, index: orderIndex } = walk(order, pp);
    const taken = order.map(([id]) => id);

    headRight.textContent =
      parts > 1
        ? `NODE ${index + 1}/${steps.length} · PART ${part + 1}/${parts}`
        : `NODE ${index + 1}/${steps.length}`;

    trackFill.setAttribute(
      compact ? "height" : "width",
      (time / duration) * trackLen,
    );

    laneEls.forEach((lane, i) => {
      setState(lane.g, i < index ? "done" : i === index ? "live" : "idle");
      lane.fill.setAttribute(
        "width",
        i < index ? stepW : i === index ? stepW * p : 0,
      );
    });

    const lane = laneEls[index];
    bracket.setAttribute(
      "d",
      compact
        ? `M${lane.x} ${lane.y}H${G.trackAt}M${G.trackAt + 3} ${lane.y}H${G.panel.x}`
        : `M${lane.cx} ${G.laneAt + G.stepH}V${G.trackAt}M${lane.cx} ${G.trackAt + 3}V${G.panel.y}`,
    );

    const since = time - step.start;
    const appear =
      smoothstep(0, SWAP, since) *
      (1 - smoothstep(step.duration - SWAP, step.duration, since));
    panelLabel.textContent = `${step.graph.toUpperCase()} · ${Object.keys(line.graphs[step.graph].nodes).length} NODES`;
    panelLabel.style.opacity = appear;

    for (const [id, view] of Object.entries(views)) {
      view.view.style.display = id === step.id ? "" : "none";
    }

    const view = views[step.id];
    view.view.style.opacity = appear;
    note.style.opacity = appear;

    for (const { node, g, fill } of view.nodes) {
      const at = taken.indexOf(node.id);
      const state =
        at === -1
          ? "skip"
          : at < orderIndex
            ? "done"
            : at === orderIndex
              ? node.kind === "human"
                ? "alert"
                : "live"
              : "idle";
      setState(g, state);
      fill.setAttribute(
        "width",
        at === -1
          ? 0
          : at < orderIndex
            ? node.w
            : at === orderIndex
              ? node.w * local
              : 0,
      );
    }

    for (const { edge, path } of view.edges) {
      const from = taken.indexOf(edge.from);
      const to = taken.indexOf(edge.to);
      const onRoute = from !== -1 && to === from + 1;
      const state = !onRoute
        ? "skip"
        : to < orderIndex
          ? "done"
          : to === orderIndex
            ? "live"
            : "idle";
      setState(path, state);
      if (state === "live" && local < 0.4) {
        const u = smoothstep(0, 0.4, local);
        const point = path.getPointAtLength(path.getTotalLength() * u);
        view.token.setAttribute("cx", point.x);
        view.token.setAttribute("cy", point.y);
        view.token.style.opacity = 1 - u * u;
      }
    }
    if (orderIndex === 0 || local >= 0.4) view.token.style.opacity = 0;

    const node = line.graphs[step.graph].nodes[live];
    const values = [
      live,
      node.skill,
      node.kind,
      node.transitions.skip ?? "-",
      node.kind === "human" ? "teleop_recovery" : "-",
    ];
    rows.forEach((row, i) => {
      if (row.textContent !== values[i]) row.textContent = values[i];
    });
    elapsed.textContent = `${since.toFixed(2)} S IN STEP`;
  };

  return { update, duration, svg };
}
