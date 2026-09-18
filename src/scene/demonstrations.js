import { BufferAttribute, BufferGeometry, Color, LineSegments, ShaderMaterial } from 'three'

const vertexShader = `
attribute vec3 aOffset;
attribute float aDemo;
uniform float uAmplitude;
varying float vDemo;
void main() {
  vDemo = aDemo;
  vec3 p = position + aOffset * uAmplitude;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const fragmentShader = `
uniform vec3 uColor;
uniform float uAmplitude;
varying float vDemo;
void main() {
  float presence = clamp(uAmplitude * 3.0, 0.0, 1.0);
  gl_FragColor = vec4(uColor, 0.10 + 0.30 * presence);
}`

export function createDemonstrations(paths, { color }) {
  const perPath = paths[0].ideal.length
  const segments = paths.length * (perPath - 1) * 2

  const position = new Float32Array(segments * 3)
  const offset = new Float32Array(segments * 3)
  const demo = new Float32Array(segments)

  let w = 0
  paths.forEach((path, d) => {
    for (let i = 0; i < perPath - 1; i++) {
      for (const k of [i, i + 1]) {
        const ideal = path.ideal[k]
        const noisy = path.noisy[k]
        position[w * 3] = ideal.x
        position[w * 3 + 1] = ideal.y
        position[w * 3 + 2] = ideal.z
        offset[w * 3] = noisy.x - ideal.x
        offset[w * 3 + 1] = noisy.y - ideal.y
        offset[w * 3 + 2] = noisy.z - ideal.z
        demo[w] = d
        w++
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aOffset', new BufferAttribute(offset, 3))
  geometry.setAttribute('aDemo', new BufferAttribute(demo, 1))

  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uAmplitude: { value: 1 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  })

  const lines = new LineSegments(geometry, material)
  lines.frustumCulled = false

  return { lines, setAmplitude: (v) => { material.uniforms.uAmplitude.value = v } }
}
