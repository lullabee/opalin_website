"""Draws the five "Where it works" card illustrations as sketch-style SVGs.

Matches the hero scene: thin grey outlines drawn in two slightly offset passes,
a perspective grid that fades out radially, and teal "demonstration" paths
that start noisy and converge onto one clean path.

Run: python3 scripts/draw-where-icons.py  (writes public/where/*.svg)
"""

import math
import random
from pathlib import Path

W, H = 320, 220
INK = "#474e56"
GRID = "#cdd1d6"
TEAL = "#117780"
WASH = "#d3f0f3"
OUT = Path(__file__).resolve().parent.parent / "public" / "where"


# projection -----------------------------------------------------------------

CX, CY = 160, 150
COS30, SIN30 = math.cos(math.pi / 6), 0.5
SCALE = 1.0


def iso(x, y, z=0.0):
    return (CX + (x - y) * COS30 * SCALE, CY + ((x + y) * SIN30 - z) * SCALE)


# sketch strokes -------------------------------------------------------------


class Sketch:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.back = []  # fills and shadows
        self.lines = []  # grey outlines
        self.front = []  # teal accents
        self.box = [1e9, 1e9, -1e9, -1e9]

    def _grow(self, pts):
        b = self.box
        for x, y in pts:
            b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)

    def _wobble(self, pts, amp, step=7.0):
        """Resample a polyline and push each point sideways with smooth noise."""
        out = []
        phase = self.rng.uniform(0, 6.28)
        freq = self.rng.uniform(0.05, 0.09)
        dist = 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            seg = math.hypot(x1 - x0, y1 - y0) or 1e-6
            nx, ny = -(y1 - y0) / seg, (x1 - x0) / seg
            n = max(1, int(seg / step))
            for i in range(n):
                t = i / n
                d = dist + seg * t
                off = amp * math.sin(d * freq + phase)
                out.append((x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off))
            dist += seg
        out.append(pts[-1])
        return out

    @staticmethod
    def _d(pts, close=False):
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        return d + (" Z" if close else "")

    def line(self, pts, width=1.0, color=INK, passes=2, amp=0.55, close=False, layer=None, opacity=1.0, dash=None):
        pts = list(pts)
        if close:
            pts = pts + [pts[0]]
        target = self.lines if layer is None else layer
        self._grow(pts)
        for k in range(passes):
            # the second pass is lighter and drifts a little, like a pencil going over the line again
            p = self._wobble(pts, amp * (1 + k * 0.8))
            a = opacity * (1.0 if k == 0 else 0.35)
            extra = f' stroke-dasharray="{dash}"' if dash else ""
            target.append(
                f'<path d="{self._d(p)}" fill="none" stroke="{color}" stroke-width="{width if k == 0 else width * 0.8:.2f}" '
                f'stroke-linecap="round" stroke-linejoin="round" opacity="{a:.2f}"{extra}/>'
            )

    def fill(self, pts, color="#fff", opacity=1.0):
        self._grow(pts)
        self.lines.append(f'<path d="{self._d(pts, True)}" fill="{color}" opacity="{opacity}"/>')

    def shadow(self, x, y, rx, ry):
        sx, sy = iso(x, y)
        self.back.append(
            f'<ellipse cx="{sx:.1f}" cy="{sy:.1f}" rx="{rx}" ry="{ry}" fill="url(#shadow)"/>'
        )

    def svg(self, grid=True):
        g = self._grid() if grid else ""
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
<radialGradient id="fade" cx="50%" cy="68%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="gridmask"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
<radialGradient id="shadow"><stop offset="0" stop-color="#161b21" stop-opacity="0.16"/><stop offset="1" stop-color="#161b21" stop-opacity="0"/></radialGradient>
</defs>
<rect width="{W}" height="{H}" fill="#fff"/>
<g mask="url(#gridmask)">{g}</g>
<g transform="{self._fit()}">
{"".join(self.back)}
{"".join(self.lines)}
{"".join(self.front)}
</g>
</svg>
'''

    def _fit(self, pad_x=18, pad_top=22, pad_bottom=14):
        # scale the drawing to fill the card, keeping its floor on the grid's horizon
        x0, y0, x1, y1 = self.box
        k = 0.9 * min((W - 2 * pad_x) / (x1 - x0), (H - pad_top - pad_bottom) / (y1 - y0), 1.45)
        tx = W / 2 - k * (x0 + x1) / 2
        ty = (H - pad_bottom) - k * y1
        return f"translate({tx:.1f} {ty:.1f}) scale({k:.3f})"

    def _grid(self, size=150, step=18):
        parts = []
        n = int(size / step)
        for i in range(-n, n + 1):
            a, b = iso(i * step, -size), iso(i * step, size)
            c, d = iso(-size, i * step), iso(size, i * step)
            for (x0, y0), (x1, y1) in ((a, b), (c, d)):
                parts.append(f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="{GRID}" stroke-width="0.8"/>')
        return "".join(parts)


# primitives -----------------------------------------------------------------


def box(s, x0, y0, z0, w, d, h, open_top=False, fill="#fff", stroke=INK, layer=None):
    x1, y1, z1 = x0 + w, y0 + d, z0 + h
    P = lambda x, y, z: iso(x, y, z)
    silhouette = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1)]
    s.fill(silhouette, fill)
    top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]
    s.line(top, close=True, color=stroke, layer=layer)
    for x, y in ((x1, y0), (x1, y1), (x0, y1)):
        s.line([P(x, y, z1), P(x, y, z0)], color=stroke, layer=layer)
    s.line([P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], color=stroke, layer=layer)
    if open_top:
        # inner back corner so the box reads as hollow
        s.line([P(x0, y0, z1), P(x0, y0, z1 - h * 0.7)], opacity=0.6)
        s.line([P(x0, y0, z1 - h * 0.7), P(x1, y0, z1 - h * 0.7)], opacity=0.35, passes=1)
        s.line([P(x0, y0, z1 - h * 0.7), P(x0, y1, z1 - h * 0.7)], opacity=0.35, passes=1)


def ellipse_pts(cx, cy, rx, ry, a0=0.0, a1=2 * math.pi, n=36):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def cylinder(s, x, y, z, r, h, fill="#fff", stroke=INK, width=1.0):
    rx, ry = r * 1.2247, r * 0.7071
    bx, by = iso(x, y, z)
    tx, ty = iso(x, y, z + h)
    s.fill(ellipse_pts(bx, by, rx, ry, 0, math.pi) + ellipse_pts(tx, ty, rx, ry, math.pi, 2 * math.pi), fill)
    s.line(ellipse_pts(tx, ty, rx, ry), color=stroke, width=width)
    s.line(ellipse_pts(bx, by, rx, ry, 0, math.pi, 18), color=stroke, width=width)
    s.line([(bx - rx, by), (tx - rx, ty)], color=stroke, width=width)
    s.line([(bx + rx, by), (tx + rx, ty)], color=stroke, width=width)


def circle(s, cx, cy, r, color=INK, width=1.0, fill=None, passes=2):
    if fill:
        s.fill(ellipse_pts(cx, cy, r, r), fill)
    # overshoot a little past the start, as a hand-drawn circle would
    s.line(ellipse_pts(cx, cy, r, r, 0.2, 2 * math.pi + 0.55, 40), color=color, width=width, passes=passes, amp=0.35)


def bar(s, a, b, w):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / L * w / 2, (x1 - x0) / L * w / 2
    quad = [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]
    s.fill(quad)
    s.line([quad[0], quad[1]])
    s.line([quad[3], quad[2]])


def rrect(c, angle, length, width, r=None):
    """Rounded rectangle centred on c, long axis at `angle` (radians)."""
    r = min(width / 2, length / 2) if r is None else r
    ux, uy = math.cos(angle), math.sin(angle)
    vx, vy = -uy, ux
    hl, hw = length / 2 - r, width / 2 - r
    pts = []
    for (sl, sw, a0) in ((1, 1, 0), (-1, 1, 0.5 * math.pi), (-1, -1, math.pi), (1, -1, 1.5 * math.pi)):
        ox = c[0] + ux * sl * hl + vx * sw * hw
        oy = c[1] + uy * sl * hl + vy * sw * hw
        for i in range(7):
            a = a0 + (math.pi / 2) * i / 6
            pts.append((ox + r * (ux * math.cos(a) + vx * math.sin(a)), oy + r * (uy * math.cos(a) + vy * math.sin(a))))
    return pts


def part(s, pts, fill="#fff", color=INK, width=1.0):
    s.fill(pts, fill)
    s.line(pts, close=True, color=color, width=width)


def link(s, a, b, width):
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    part(s, rrect(mid, ang, math.hypot(b[0] - a[0], b[1] - a[1]) + width * 0.6, width))
    # a faint centre seam, like the edge highlights on the hero's links
    s.line([(a[0] + (b[0] - a[0]) * 0.18, a[1] + (b[1] - a[1]) * 0.18), (a[0] + (b[0] - a[0]) * 0.82, a[1] + (b[1] - a[1]) * 0.82)],
           passes=1, opacity=0.3, width=0.7)
    return ang


def arm(s, base, shoulder, elbow, wrist, holding=None, open_grip=False):
    """The hero's six-axis arm, flattened to a side sketch: plate, drum, housings, rounded links, parallel gripper."""
    bx, by = base
    s.back.append(f'<ellipse cx="{bx:.1f}" cy="{by + 3:.1f}" rx="34" ry="10" fill="url(#shadow)"/>')
    # flat mounting plate lying on the floor, with bolt slots
    ex, ey = (COS30, SIN30), (-COS30, SIN30)
    A, B, T = 24, 10, 3.5
    corner = lambda sa, sb, z: (bx + sa * A * ex[0] + sb * B * ey[0], by + sa * A * ex[1] + sb * B * ey[1] - z)
    s.fill([corner(-1, -1, T), corner(1, -1, T), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0), corner(-1, 1, T)])
    s.line([corner(-1, -1, T), corner(1, -1, T), corner(1, 1, T), corner(-1, 1, T)], close=True)
    s.line([corner(1, -1, T), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0), corner(-1, 1, T)])
    s.line([corner(1, 1, T), corner(1, 1, 0)])
    for sa in (-0.7, 0.7):
        s.line([corner(sa - 0.12, 0.45, T), corner(sa + 0.12, 0.45, T)], passes=1, width=1.1, opacity=0.8)
    # drum and pedestal up to the shoulder
    top = shoulder[1] + 8
    part(s, rrect((bx, (by - T + top) / 2), math.pi / 2, (by - T) - top, 17, 3))
    s.line(ellipse_pts(bx, by - T - 5, 8.5, 3, 0, math.pi, 12), passes=1, opacity=0.5)
    # links sit behind their joint housings
    up = link(s, shoulder, elbow, 10)
    part(s, rrect(shoulder, up, 22, 18, 4))
    s.line(ellipse_pts(shoulder[0], shoulder[1], 3.5, 3.5), passes=1, opacity=0.6)
    fore = link(s, elbow, wrist, 8)
    part(s, rrect(elbow, fore + 0.3, 24, 18, 5))
    part(s, rrect((elbow[0] + 2, elbow[1] - 1), fore + 0.3, 13, 11, 3))
    # wrist motor and gripper head
    wx, wy = wrist
    part(s, rrect((wx, wy), 0, 18, 12, 4))
    head = [(wx - 9, wy + 5), (wx + 9, wy + 5), (wx + 9, wy + 16), (wx - 9, wy + 16)]
    part(s, head)
    s.line([(wx - 9, wy + 9), (wx + 9, wy + 9)], passes=1, opacity=0.45, width=0.7)
    # parallel-jaw fingers: two flat slabs
    gap = 7 if open_grip else 5
    for side in (-1, 1):
        x_in = wx + side * gap
        x_out = x_in + side * 4
        slab = [(min(x_in, x_out), wy + 16), (max(x_in, x_out), wy + 16), (max(x_in, x_out), wy + 29), (min(x_in, x_out), wy + 29)]
        part(s, slab)
    if holding:
        hx, hy = wx, wy + 31
        item = [(hx - 6.5, hy - 7), (hx + 6.5, hy - 7), (hx + 6.5, hy + 3), (hx - 6.5, hy + 3)]
        s.fill(item, WASH)
        s.line(item, close=True, color=TEAL, layer=s.front, width=1.1)


def demos(s, pts_fn, count=5, spread=10.0, seed=1):
    """Noisy teal attempts that converge onto the final path, like the hero's learning loop."""
    rng = random.Random(seed)
    for k in range(count):
        a = spread * (1 - k / count)
        jitter = [(rng.uniform(-1, 1), rng.uniform(-1, 1)) for _ in range(4)]
        pts = []
        for i in range(41):
            t = i / 40
            x, y = pts_fn(t)
            # noise is zero at both ends so every attempt starts and ends on target
            env = math.sin(math.pi * t)
            nx = sum(j[0] * math.sin((q + 1) * math.pi * t) for q, j in enumerate(jitter)) / 2
            ny = sum(j[1] * math.sin((q + 1) * math.pi * t + 0.7) for q, j in enumerate(jitter)) / 2
            pts.append((x + nx * a * env, y + ny * a * env))
        s.line(pts, color=TEAL, width=0.8, passes=1, amp=0.2, layer=s.front, opacity=0.18 + 0.1 * k)
    s.line([pts_fn(i / 40) for i in range(41)], color=TEAL, width=1.4, passes=1, amp=0.1, layer=s.front)


def bezier(p0, p1, p2, p3):
    def f(t):
        u = 1 - t
        return (
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        )
    return f


def bracket(s, x, y, sx, sy, n=9):
    s.line([(x, y + sy * n), (x, y), (x + sx * n, y)], width=1.1, passes=1, amp=0.15)


# scenes ---------------------------------------------------------------------


def returns():
    s = Sketch(11)
    s.shadow(-18, 8, 64, 20)
    box(s, -48, -14, 0, 52, 44, 36, open_top=True)
    # open flaps on the two far edges
    P = iso
    s.fill([P(-48, -14, 36), P(4, -14, 36), P(0, -30, 58), P(-52, -30, 58)])
    s.line([P(-48, -14, 36), P(-52, -30, 58), P(0, -30, 58), P(4, -14, 36)])
    s.fill([P(-48, -14, 36), P(-48, 30, 36), P(-66, 34, 52), P(-66, -10, 52)])
    s.line([P(-48, -14, 36), P(-66, -10, 52), P(-66, 34, 52), P(-48, 30, 36)])
    # barcode on the front face
    for i, wv in enumerate((1.2, 0.6, 1.2, 0.6, 1.6, 0.6, 1.2)):
        x = 6 + i * 3.2
        a, b = iso(4, x, 10), iso(4, x, 24)
        s.lines.append(f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" stroke="{TEAL}" stroke-width="{wv}" opacity="0.9"/>')
    wrist = (206, 58)
    arm(s, base=(250, 172), shoulder=(250, 150), elbow=(238, 72), wrist=wrist, holding=True)
    start = iso(-22, 8, 30)
    demos(s, bezier(start, (start[0] + 10, 40), (190, 40), (wrist[0], wrist[1] + 31)), seed=3)
    return s


def open_bin(s, x0, y0, w, d, h, contents=None, rim=INK):
    """Open-top container drawn back wall first, then its contents, then the front walls over them."""
    x1, y1 = x0 + w, y0 + d
    P = iso
    s.fill([P(x0, y0, h), P(x1, y0, h), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0), P(x0, y1, h)])
    s.line([P(x0, y1, h), P(x0, y0, h), P(x1, y0, h)], color=rim)
    s.line([P(x0, y0, h), P(x0, y0, h * 0.35)], opacity=0.5, passes=1)
    s.line([P(x0, y0, h * 0.35), P(x1, y0, h * 0.35)], opacity=0.3, passes=1)
    s.line([P(x0, y0, h * 0.35), P(x0, y1, h * 0.35)], opacity=0.3, passes=1)
    if contents:
        contents()
    s.fill([P(x1, y0, h), P(x1, y1, h), P(x1, y1, 0), P(x1, y0, 0)])
    s.fill([P(x0, y1, h), P(x1, y1, h), P(x1, y1, 0), P(x0, y1, 0)])
    s.line([P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], color=rim)
    s.line([P(x1, y0, h), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0), P(x0, y1, h)])
    s.line([P(x1, y1, h), P(x1, y1, 0)])


def kitting():
    s = Sketch(22)
    s.shadow(-20, -10, 90, 26)
    # three source bins along the back, each holding a different part
    BW, BD, BH = 24, 20, 14
    bins = [(-54, -50), (-54, -24), (-54, 2)]
    parts = [
        lambda x, y: [box(s, x + 4, y + 3, 6, 7, 7, 7), box(s, x + 13, y + 9, 6, 7, 7, 7)],
        lambda x, y: [cylinder(s, x + 8, y + 7, 6, 4, 9), cylinder(s, x + 16, y + 12, 6, 4, 9)],
        lambda x, y: [circle(s, *iso(x + 8, y + 8, 13), 4.5, fill="#fff"), circle(s, *iso(x + 16, y + 12, 12), 4.5, fill="#fff")],
    ]
    # back to front, so each bin's front wall sits over the one behind it
    for i, ((x, y), fill_bin) in enumerate(zip(bins, parts)):
        open_bin(s, x, y, BW, BD, BH, contents=lambda x=x, y=y, f=fill_bin: f(x, y), rim=TEAL if i == 1 else INK)
    # kit pouch in front, with two items already packed
    KX, KY, KW, KD, KH = -6, -14, 34, 26, 13

    def packed():
        box(s, KX + 4, KY + 4, 4, 8, 8, 8)
        circle(s, *iso(KX + 24, KY + 9, 11), 4.5, fill="#fff")

    open_bin(s, KX, KY, KW, KD, KH, contents=packed)
    # drop spot inside the kit, dashed teal
    spot = [iso(KX + 14, KY + 13, KH), iso(KX + 24, KY + 13, KH), iso(KX + 24, KY + 22, KH), iso(KX + 14, KY + 22, KH)]
    s.line(spot, close=True, color=TEAL, width=1.0, passes=1, amp=0.1, layer=s.front, dash="2.5 2.5")
    # the arm has picked a part from the middle bin and carries it to the kit
    pick = iso(-54 + BW / 2, -24 + BD / 2, BH + 4)
    drop = iso(KX + 19, KY + 17, KH + 2)
    wrist = ((pick[0] + drop[0]) / 2 + 4, min(pick[1], drop[1]) - 50)
    held = (wrist[0], wrist[1] + 31)
    bx = drop[0] + 46
    arm(s, base=(bx, 176), shoulder=(bx, 154), elbow=(bx + 2, wrist[1] + 4), wrist=wrist, holding=True)
    demos(s, bezier(pick, (pick[0] + 4, held[1] - 6), (held[0] - 24, held[1] - 4), held), count=4, spread=8, seed=5)
    s.line([bezier(held, (held[0] + 6, held[1] + 20), (drop[0] + 14, drop[1] - 24), drop)(i / 30) for i in range(31)],
           color=TEAL, width=1.0, passes=1, amp=0.1, layer=s.front, dash="2 3", opacity=0.75)
    return s


def resale():
    s = Sketch(33)
    s.shadow(0, 0, 80, 24)
    TOP = 12
    box(s, -40, -40, 0, 80, 80, TOP)
    k = 1.25
    r2 = math.sqrt(0.5)
    # turn the shirt 45 degrees so its chest runs across the screen and the body points at the viewer
    P = lambda u, v, z=0: iso((u + v) * r2 * k, (v - u) * r2 * k, TOP + 0.5 + z)
    # T-shirt lying flat, collar to the back (x across the chest, y down the body)
    tee = [(-6, -26), (6, -26), (14, -24), (30, -14), (25, -5), (16, -10), (16, 26), (-16, 26),
           (-16, -10), (-25, -5), (-30, -14), (-14, -24)]
    s.fill([P(*q) for q in tee])
    s.line([P(*q) for q in tee], close=True, width=1.15)
    s.line([P(-6, -26), P(0, -21), P(6, -26)], width=1.0)
    s.line([P(-6, -26), P(0, -23.5), P(6, -26)], passes=1, opacity=0.5)
    s.line([P(-15, 22.5), P(15, 22.5)], passes=1, opacity=0.35)
    for sx in (-1, 1):
        s.line([P(sx * 27.5, -9.5), P(sx * 21.5, -13.5)], passes=1, opacity=0.4)
    # fold line; the right sleeve folds over it onto the chest
    s.line([P(7, -25), P(7, 26)], color=TEAL, width=1.0, passes=1, amp=0.1, layer=s.front, dash="3 3")
    tip = P(28, -10, 1)
    dest = P(-12, -4, 1)
    wrist = (tip[0], tip[1] - 31)
    arm(s, base=(tip[0] + 58, 186), shoulder=(tip[0] + 58, 164), elbow=(tip[0] + 50, 70), wrist=wrist)
    demos(s, bezier(tip, (tip[0] - 4, tip[1] - 50), (dest[0] + 14, dest[1] - 52), dest), count=4, spread=8, seed=4)
    circle(s, dest[0], dest[1], 2.2, color=TEAL, width=1.1, passes=1)
    return s


def beauty():
    s = Sketch(44)
    s.shadow(-4, 4, 96, 18)
    spots = [(-60, 44, 7, 26, 5), (-32, 26, 8, 40, 4), (-4, 8, 6, 30, 6), (24, -10, 7, 44, 4), (52, -28, 6, 28, 5)]
    # draw back to front so nearer bottles cover farther ones
    order = sorted(range(len(spots)), key=lambda i: spots[i][0] + spots[i][1])
    spots_drawn = [spots[i] for i in order]
    for x, y, r, h, neck in spots_drawn:
        hot = (x, y) == spots[3][:2]
        f, st = (WASH, TEAL) if hot else ("#fff", INK)
        cylinder(s, x, y, 0, r, h, fill=f, stroke=st, width=1.1 if hot else 1.0)
        cylinder(s, x, y, h, r * 0.45, neck, fill=f, stroke=st)
        cylinder(s, x, y, h + neck, r * 0.6, 4, fill="#fff", stroke=st)
    # the arm lifts the checked bottle by its cap for a closer look
    x, y, r, h, neck = spots[3]
    cap_x, cap_y = iso(x, y, h + neck + 4)
    wrist = (cap_x, cap_y - 24)
    arm(s, base=(cap_x + 66, 182), shoulder=(cap_x + 66, 160), elbow=(cap_x + 60, wrist[1] - 8), wrist=wrist, open_grip=True)
    # check mark beside it, and scan brackets around the bottle
    cx, cy = cap_x - 30, cap_y - 6
    circle(s, cx, cy, 10, color=TEAL, width=1.2)
    s.line([(cx - 4.5, cy + 0.5), (cx - 1.3, cy + 3.6), (cx + 5, cy - 3.6)], color=TEAL, width=1.4, passes=1, amp=0.1, layer=s.front)
    bx0, by0 = iso(x, y, h + neck + 8)
    bx1, by1 = iso(x, y, -4)
    for sx, sy, px, py in ((1, 1, bx0 - 18, by0), (1, -1, bx1 - 18, by1), (-1, -1, bx1 + 18, by1)):
        s.line([(px, py + sy * 7), (px, py), (px + sx * 7, py)], color=TEAL, width=1.1, passes=1, amp=0.1, layer=s.front)
    return s


def chips_bag(s, cx, cy, w=17, h=23, hot=False):
    """A pillow-pack snack bag standing upright, crimped top and bottom."""
    color, fillc = (TEAL, WASH) if hot else (INK, "#fff")
    zig = lambda y, x0, x1, n=5: [(x0 + (x1 - x0) * i / n, y + (1.6 if i % 2 else 0)) for i in range(n + 1)]
    top, bottom = cy - h, cy
    body = zig(top, cx - w / 2, cx + w / 2) + [(cx + w / 2 + 1.8, top + h * 0.35), (cx + w / 2 + 1.2, bottom - 3)] + \
        zig(bottom - 1.6, cx + w / 2, cx - w / 2) + [(cx - w / 2 - 1.2, bottom - 3), (cx - w / 2 - 1.8, top + h * 0.35)]
    s.fill(body, fillc)
    s.line(body, close=True, color=color, width=1.1 if hot else 1.0)
    s.line([(cx - w / 2 + 1, top + 4), (cx + w / 2 - 1, top + 4)], color=color, passes=1, opacity=0.5)
    s.line(ellipse_pts(cx, cy - h * 0.48, w * 0.26, h * 0.16), color=color, passes=1, opacity=0.7)


def food():
    s = Sketch(55)
    s.shadow(-10, 10, 100, 20)
    box(s, -84, -6, 0, 120, 26, 14)
    # rollers on the front face
    for i in range(7):
        x = -78 + i * 17
        cx, cy = iso(x + 6, 20, 7)
        circle(s, cx, cy, 3.2, passes=1)
    Z = 14
    # packaged goods, far to near: cereal box, can, milk carton, snack bag, box
    box(s, -74, 1, Z, 13, 6, 24)
    s.line([iso(-61, 1, Z + 17), iso(-61, 7, Z + 17)], passes=1, opacity=0.5)
    s.line([iso(-67, 7, Z + 6), iso(-67, 7, Z + 18)], passes=1, opacity=0.35)
    cylinder(s, -44, 7, Z, 6, 14)
    s.line(ellipse_pts(*iso(-44, 7, Z + 10), 7.3, 4.2, 0, math.pi, 12), passes=1, opacity=0.5)
    # gable-top carton
    box(s, -26, 2, Z, 10, 10, 18)
    ridge_a, ridge_b = iso(-21, 2, Z + 25), iso(-21, 12, Z + 25)
    s.fill([iso(-26, 2, Z + 18), ridge_a, iso(-16, 2, Z + 18)])
    s.line([iso(-26, 2, Z + 18), ridge_a, iso(-16, 2, Z + 18)])
    s.fill([iso(-16, 2, Z + 18), ridge_a, ridge_b, iso(-16, 12, Z + 18)])
    s.line([iso(-16, 2, Z + 18), ridge_a, ridge_b, iso(-16, 12, Z + 18)], close=True)
    s.fill([iso(-26, 12, Z + 18), ridge_b, iso(-16, 12, Z + 18)])
    s.line([iso(-26, 12, Z + 18), ridge_b, iso(-16, 12, Z + 18)])
    s.line([ridge_a, ridge_b], width=1.1)
    # inspected snack bag
    hx, hy = iso(2, 7, Z)
    chips_bag(s, hx, hy + 2, hot=True)
    box(s, 20, 1, Z, 14, 11, 12)
    s.line([iso(34, 1, Z + 6), iso(34, 12, Z + 6)], passes=1, opacity=0.4)
    # overhead camera with a dashed view cone onto the inspected bag
    cam = (hx - 34, 30)
    body = [(cam[0] - 12, cam[1] - 7), (cam[0] + 12, cam[1] - 7), (cam[0] + 12, cam[1] + 5), (cam[0] - 12, cam[1] + 5)]
    s.fill(body)
    s.line(body, close=True)
    circle(s, cam[0], cam[1] + 7, 3, passes=1)
    for side in (-1, 1):
        s.line([(cam[0], cam[1] + 10), (hx + side * 12, hy - 20)], color=TEAL, width=0.9, passes=1, amp=0.1,
               layer=s.front, dash="3 3")
    wrist = (250, 64)
    arm(s, base=(282, 176), shoulder=(282, 154), elbow=(280, 80), wrist=wrist, open_grip=True)
    demos(s, bezier((wrist[0], wrist[1] + 29), (240, 90), (hx + 40, hy - 60), (hx + 4, hy - 26)), count=4, spread=9, seed=9)
    return s


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("returns", returns), ("kitting", kitting), ("resale", resale), ("beauty", beauty), ("food", food)):
        (OUT / f"{name}.svg").write_text(fn().svg())
        print("wrote", OUT / f"{name}.svg")
