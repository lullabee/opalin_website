import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  ShaderMaterial,
} from "three";

const vertexShader = `
attribute float aProgress;
varying float vProgress;
void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uHead;
uniform float uFade;
varying float vProgress;
void main() {
  float age = uHead - vProgress;
  if (age < 0.0 || age > uFade) discard;
  gl_FragColor = vec4(uColor, 1.0 - age / uFade);
}`;

export function createTrail(points, { color, fade = 1.0 }) {
  const position = new Float32Array(points.length * 3);
  const progress = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    position[i * 3] = points[i].x;
    position[i * 3 + 1] = points[i].y;
    position[i * 3 + 2] = points[i].z;
    progress[i] = i / (points.length - 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aProgress", new BufferAttribute(progress, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uHead: { value: 0 },
      uFade: { value: fade },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const line = new Line(geometry, material);
  line.frustumCulled = false;

  return {
    line,
    material,
    setHead: (v) => {
      material.uniforms.uHead.value = v;
    },
  };
}
