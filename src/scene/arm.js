import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

import chain from "./data/yam_chain.json";
import layout from "./data/yam_geometry.json";
import geometryUrl from "./data/yam_geometry.bin?url";

const spin = new Quaternion();

function outlineMaterial(color, thickness) {
  const material = new MeshBasicMaterial({ color, side: BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "uniform float outlineThickness;\nvoid main() {",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed += normalize(normal) * outlineThickness;",
      );
  };
  return material;
}

function axisVector([x, y, z]) {
  return new Vector3(x, y, z).normalize();
}

export async function loadArm({ fillColor, lineColor, outline = 0.0018 }) {
  const buffer = await fetch(geometryUrl).then((r) => r.arrayBuffer());

  const fillMaterial = new MeshBasicMaterial({
    color: fillColor,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const lineMaterial = new LineBasicMaterial({ color: lineColor });
  const hullMaterial = outlineMaterial(lineColor, outline);

  const links = new Map();
  const root = new Group();

  for (const name of new Set(
    chain.joints.flatMap((j) => [j.parent, j.child]),
  )) {
    const node = new Object3D();
    node.name = name;
    links.set(name, node);

    const part = layout[chain.meshes[name]];
    if (!part) continue;

    const fill = new BufferGeometry();
    fill.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(buffer, ...part.fill.position), 3),
    );
    fill.setIndex(
      new BufferAttribute(new Uint16Array(buffer, ...part.fill.index), 1),
    );
    fill.computeVertexNormals();
    node.add(new Mesh(fill, hullMaterial));
    node.add(new Mesh(fill, fillMaterial));

    const lines = new BufferGeometry();
    lines.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(buffer, ...part.lines), 3),
    );
    node.add(new LineSegments(lines, lineMaterial));
  }

  const joints = new Map();
  for (const joint of chain.joints) {
    const parent = links.get(joint.parent);
    const child = links.get(joint.child);
    child.position.fromArray(joint.xyz);
    child.rotation.set(...joint.rpy);
    parent.add(child);

    if (joint.type === "fixed") continue;
    joints.set(joint.name, {
      node: child,
      type: joint.type,
      axis: axisVector(joint.axis),
      origin: child.position.clone(),
      quaternion: child.quaternion.clone(),
      limit: joint.limit,
    });
  }

  root.add(links.get(chain.root));

  const setJoint = (name, value) => {
    const j = joints.get(name);
    if (!j) return;
    const v = j.limit
      ? Math.min(Math.max(value, j.limit[0]), j.limit[1])
      : value;
    if (j.type === "revolute") {
      j.node.quaternion
        .copy(j.quaternion)
        .multiply(spin.setFromAxisAngle(j.axis, v));
    } else {
      j.node.position.copy(j.origin).addScaledVector(j.axis, v);
    }
  };

  return {
    root,
    links,
    joints,
    setJoint,
    materials: { fill: fillMaterial, line: lineMaterial, hull: hullMaterial },
  };
}
