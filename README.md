# opalin.ai

Static marketing site. Plain HTML/CSS/JS, Vite, no framework. three.js is the only
dependency, lazily imported after first paint.

```
bun install
bun run dev        # localhost:5173
bun run build
bun run check:fk   # gates the hero replay against the recording (keep this green)
```

## Endpoints

Vite is MPA. A route is a directory with an `index.html`; discovery walks nested
directories, so a new route is just a new folder. Shared markup lives in `src/site/*.html`
and is inlined at build time by an `<!-- @name -->` comment.

| route                                 | indexed | notes                                          |
| ------------------------------------- | ------- | ---------------------------------------------- |
| `/`                                   | yes     | the whole pitch, one page                      |
| `/careers/`                           | yes     | index of open roles                            |
| `/careers/teleoperator/`              | yes     | Redwood City, CA and Quebec City               |
| `/careers/robotics-software-engineer/`| yes     | Paris                                          |
| `/careers/applied-ai-engineer/`       | yes     | Paris                                          |
| `/demos-caf9786e1b15275d/`            | no      | unlisted reel, `noindex`, never linked         |
| `/blog/`                              | no      | scaffold only, unlinked, `noindex`             |

Static files served from `public/`: `/robots.txt`, `/sitemap.xml`, `/favicon.svg`.
`/og.png` is referenced by the social meta on every page but **has not been captured yet**.

The demos slug is the only thing keeping that route private. It is deliberately **not** in
`robots.txt` - a `Disallow` line would publish the URL. Only the `noindex` meta and the
unguessable path protect it.

Adding a role: new folder under `careers/`, a card on `/careers/`, and a line in
`public/sitemap.xml` (nothing generates it).

### Dev-only query params

Stripped from production builds. All on `/`.

| param                   | effect                                             |
| ----------------------- | -------------------------------------------------- |
| `?t=`                   | freeze the hero at that second of the 35.1s loop    |
| `?azimuth=` `?elevation=` `?zoom=` | override the camera                      |
| `?speed=`               | override playback rate                             |

`window.__cell` is exposed in dev. Every screenshot during the build was captured with
`?t=`; the reduced-motion and no-WebGL frames go through the same code path, so they cannot
disagree with the animation.

## The hero

Two scenes alternating on a 35.1s loop. `render(t)` is a pure function of time - no timers,
no tween library, no state machine. That is what makes the loop seamless, the frozen frames
honest and the fallbacks free.

**`AZIMUTH` and `PLACE_YAW` are coupled.** The camera must stay perpendicular to the
pick->place chord or one end foreshortens end-on. If `PLACE_YAW` changes, re-solve the
azimuth by measuring - project the gripper position at both poses and maximise their
screen-x separation - not by eye.

### Real vs. synthesised

Real and measured: joint angles, the 17.9mm grasp on a 20.3mm box, the 88.2mm opening, arm
geometry baked from the URDF, table plane and gripper limits. `check:fk` verifies the
replay against the recording at 0.017mm mean / 0.045mm max; threshold is 1mm.

Presentation-layer: the seven demonstration trajectories, the convergence and deviation
readout, the place destination, the per-iteration cycle times, and all of scene B. The
SOP's shape and skill ids are the product's; that particular line was written for the page
and no run of it was recorded.

### Provenance - internal only, never on the page

Session `2026-07-29_17-01-50_cell-clumsy-octopus_raouf_pick_right_arm_black_boxes_half_full_i2rt`,
`demo9.hdf5`, right arm, i2rt YAM, window [0.0, 6.6]s, resampled 15Hz. Also under `source`
in `src/scene/data/pick_demo9.json`. The site must not name the arm vendor, the episode or
the session.

## Gotchas

These all cost real time to find.

- **HDF5 `*_joints` are normalized to [-1, 1], not radians.** Multiply by pi, then apply the
  sign convention `[1, 1, -1, 1, -1, 1]`. Use `py_libs.arm_scene.cell_stored_to_urdf_rad`
  as the authority rather than re-deriving.
- **`*_eef_pos` tracks the `gripper` frame, not `tcp`.** Using `tcp` adds a ~170mm bias.
- **`MeshoptSimplifier.compactMesh` returns `[remap, count]`,** and its unused-vertex
  sentinel is `0xFFFFFFFF`. Letting that reach an index buffer silently draws nothing.
- **`THREE.Color` cannot parse `oklch()`.** Tokens resolve through a 1x1 canvas.
- **The first rAF timestamp can precede `performance.now()`,** making `t` negative on frame
  one, and `-1 % 7` is `-1` in JS. Keep the cycle wrap and demo index sign-safe.
- **A frozen `?t=` renders once,** so `ResizeObserver` must redraw or a resize blanks it.
- **YAM meshes are git-LFS pointers.** `git lfs install --local` then
  `git lfs pull --include="robot_desc/i2rt_yam/linear_gripper/assets/*"` in `../opalin`.
- **Smoothing costs ~0.5mm** of deviation and buys 1.7-3.2x less joint jitter. Keep it.

## House rules

- Light and dark follow the OS; no toggle.
- Palette derives from the product's own theme - brand mint `#86cecb`, neutrals at hue 255.
  **One accent hue; do not add a second.** Amber and green are the product's warning and
  success tokens, used only for state.
- Plain hyphens in all copy, never em dashes.
- The site does not mention grippers, hands or fingers.
- `contact@opalin.ai` is the only address on the site.

## Still to do

- Static WebP stills for the no-WebGL fallback, and `/og.png`. Both are `?t=` capture steps.
- Self-host the four font faces so the two above-the-fold files can be preloaded.
- Analytics (Plausible or Fathom) and deploy.
- Visual pass on the mesh decimation at final hero size, especially the gripper tips.
