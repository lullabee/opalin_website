import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments } from 'three'

const SEGMENTS = 12

/** Ground grid whose lines fade radially into the page ground, so the square edge never shows. */
export function createGrid({ size, divisions, color, ground, falloff = 0.42 }) {
  const near = new Color(color)
  const far = new Color(ground)
  const half = size / 2
  const step = size / divisions
  const positions = []
  const colors = []
  const c = new Color()

  const push = (x, y) => {
    positions.push(x, y, 0)
    const fade = Math.min(Math.hypot(x, y) / (half * falloff), 1)
    c.copy(near).lerp(far, fade * fade)
    colors.push(c.r, c.g, c.b)
  }

  for (let i = 0; i <= divisions; i++) {
    const at = -half + i * step
    for (let s = 0; s < SEGMENTS; s++) {
      const a = -half + (size * s) / SEGMENTS
      const b = -half + (size * (s + 1)) / SEGMENTS
      push(at, a)
      push(at, b)
      push(a, at)
      push(b, at)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))

  return new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }))
}
