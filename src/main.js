import { createOrchestration } from './hero/orchestration.js'

const FADE = 0.9

const cell = document.querySelector('[data-cell]')
const canvas = cell.querySelector('[data-canvas]')
const telemetry = cell.querySelector('[data-telemetry]')
const caption = cell.querySelector('[data-caption]')
const ticks = [...cell.querySelectorAll('[data-phases] span')]
const fields = Object.fromEntries(
  [...cell.querySelectorAll('[data-field]')].map((el) => [el.dataset.field, el]),
)

const params = new URLSearchParams(location.search)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const hasWebgl = () => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const pad = (n) => String(n).padStart(2, '0')

const show = (state) => {
  fields.iter.textContent = `${pad(state.iteration)}/08`
  fields.cycle.textContent = `${state.cycleSeconds.toFixed(2)} S`
  fields.dev.textContent = `${state.deviationMm.toFixed(2)} MM`
}

const narrow = innerWidth < 700
const orc = createOrchestration(document.querySelector('[data-orc]'), { compact: narrow })

if (!hasWebgl()) {
  canvas.remove()
  telemetry.remove()
  caption.remove()
  ticks[0].remove()
  orc.update(orc.duration * 0.62)
} else {
  const { mountScene } = await import('./scene/index.js')

  const view = import.meta.env.DEV
    ? Object.fromEntries(
        ['azimuth', 'elevation', 'zoom', 'speed']
          .filter((k) => params.has(k))
          .map((k) => [k, Number(params.get(k))]),
      )
    : {}

  const scene = await mountScene(canvas, {
    demos: narrow ? 4 : undefined,
    zoom: narrow ? 0.78 : undefined,
    ...view,
  })

  const armCycle = scene.cycle
  const total = armCycle + orc.duration

  if (import.meta.env.DEV) window.__cell = { ...scene, orc, total }

  const frame = (t) => {
    const at = ((t % total) + total) % total

    const half = FADE / 2
    const armAlpha = clamp01(
      1 - smoothstep(armCycle, armCycle + half, at) + smoothstep(total - half, total, at),
    )
    const orcAlpha =
      smoothstep(armCycle + half, armCycle + FADE, at) * (1 - smoothstep(total - FADE, total - half, at))

    canvas.style.opacity = armAlpha
    telemetry.style.opacity = armAlpha
    caption.style.opacity = armAlpha
    orc.svg.style.opacity = orcAlpha

    if (armAlpha > 0.002) show(scene.render(Math.min(at, armCycle)))
    if (orcAlpha > 0.002) orc.update(at - armCycle)

    const onOrc = orcAlpha > armAlpha
    ticks[0].toggleAttribute('data-on', !onOrc)
    ticks[1].toggleAttribute('data-on', onOrc)
  }

  const frozen = import.meta.env.DEV ? params.get('t') : null

  if (frozen !== null) {
    frame(Number(frozen))
  } else if (reduced) {
    frame(armCycle - 0.001)
  } else {
    const start = performance.now()
    const tick = (now) => {
      frame(Math.max((now - start) / 1000, 0))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
