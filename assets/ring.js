/* Opalin ring fly-through landing — vanilla Three.js port of the
   opalin-hologram RingTunnel prototype (React Three Fiber original).
   Same colors, layout, materials and camera choreography. */

import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ChromaticAberrationEffect,
  VignetteEffect,
  NoiseEffect,
  BlendFunction,
  KernelSize,
} from "postprocessing";

const { lerp, smoothstep, damp } = THREE.MathUtils;

/* ─── Tunnel layout ──────────────────────────────────────────────────────── */
const RING_COUNT = 13;
const SPACING_START = 5.6; // roomy gaps right after the hero…
const SPACING_END = 2.0; // …tightening as the tunnel deepens
const TEAL = "#80c8c3";
const TEAL_DEEP = "#2f6f6a";
const FOG = "#9ec0bd";

// arithmetic series: gaps run linearly from SPACING_START to SPACING_END
const TUNNEL_DEPTH = ((RING_COUNT - 1) * (SPACING_START + SPACING_END)) / 2;
const Z_HERO = 9.5; // camera rests here → the logo "O" reads as the hero mark
const Z_ENTER = 1.1; // end of the zoom → we're right at the "O"
const Z_END = -TUNNEL_DEPTH + 1.4; // settles among the last rings

/* Real Opalin logo (CAD export). Scaled so the "O" stands LOGO_HEIGHT tall;
   at that size the inner hole is ~1.24 half-width — wide enough for the
   camera to pass through. */
const LOGO_HEIGHT = 4.0;

/* ─── Scroll narrative beats (offset 0 → 1) ──────────────────────────────── */
const HERO_END = 0.05; // logo dwells only briefly — movement starts almost immediately
const ZOOM_END = 0.3; // zoom into the O completes here
const REVEAL_START = 0.1; // tunnel rings begin to materialise
const REVEAL_END = 0.34; // tunnel fully present

/* matches drei ScrollControls damping={0.28} (smooth-time seconds) */
const SCROLL_DAMP = 7;

/* raises the hero "O" above screen center so the logo + wordmark block reads
   vertically centered; fades out during the dive so the camera still flies
   through the ring's middle */
const HERO_LIFT = 0.85;

function buildRings() {
  const rings = [];
  let z = 0;
  for (let i = 0; i < RING_COUNT; i++) {
    if (i > 0) {
      // gaps start wide and tighten as the tunnel deepens
      const g = (i - 1) / Math.max(1, RING_COUNT - 2);
      z -= lerp(SPACING_START, SPACING_END, g);
    }
    const wave = Math.sin(i * 0.7) * 0.18 + Math.cos(i * 0.33) * 0.1;
    rings.push({
      z,
      scale: 1.04 + wave * 0.45,
      roll: (i * Math.PI) / 6,
      spin: 0.05 + (i % 2) * 0.02,
      dir: i % 2 === 0 ? 1 : -1,
    });
  }
  return rings;
}

/* camera z as a function of scroll: dwell at hero → zoom in → fly through */
function cameraZ(off) {
  if (off < HERO_END) return Z_HERO;
  if (off < ZOOM_END) {
    const t = smoothstep((off - HERO_END) / (ZOOM_END - HERO_END), 0, 1);
    return lerp(Z_HERO, Z_ENTER, t);
  }
  const t = smoothstep((off - ZOOM_END) / (1 - ZOOM_END), 0, 1);
  return lerp(Z_ENTER, Z_END, t);
}

/* shared teal-glass material props for every ring */
const glass = {
  color: TEAL,
  transmission: 0.72,
  thickness: 1.4,
  ior: 1.42,
  roughness: 0.14,
  metalness: 0.16,
  clearcoat: 1,
  clearcoatRoughness: 0.18,
  iridescence: 0.4,
  iridescenceIOR: 1.3,
  attenuationColor: new THREE.Color(TEAL_DEEP),
  attenuationDistance: 2.6,
  envMapIntensity: 1.7,
};

/* ─── Renderer / scene / camera ──────────────────────────────────────────── */
const canvas = document.getElementById("scene");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (e) {
  // no WebGL — the gradient background + DOM lockup still make a valid page
  console.error("WebGL unavailable, falling back to static hero", e);
  document.getElementById("scroll-hint").style.display = "none";
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 11, 46);

  const camera = new THREE.PerspectiveCamera(
    46,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );
  camera.position.set(0, -HERO_LIFT, Z_HERO);

  /* ─── Studio environment + light at the end of the tunnel ──────────────
     Equivalent of drei's <Environment> with Lightformers: emissive planes in
     a virtual scene rendered once into a cube map, used as env + background. */
  function lightformer(form, intensity, color, position, rotation, scale) {
    const geometry =
      form === "circle"
        ? new THREE.CircleGeometry(1, 64)
        : new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.color.set(color).multiplyScalar(intensity);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    return mesh;
  }

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#abc8c5");
  envScene.add(
    lightformer("rect", 2.2, "#ffffff", [0, 6, 2], [-Math.PI / 2, 0, 0], [14, 14, 1]),
    lightformer("rect", 2.6, "#eafbf9", [-7, 1, 2], [0, Math.PI / 2, 0], [10, 6, 1]),
    lightformer("rect", 2.6, "#eafbf9", [7, 1, 2], [0, -Math.PI / 2, 0], [10, 6, 1]),
    lightformer("rect", 1.4, TEAL, [0, -6, 1], [Math.PI / 2, 0, 0], [12, 12, 1]),
    lightformer("circle", 3.5, "#ffffff", [0, 0, Z_END - 8], null, [5, 6, 1])
  );
  const envFBO = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
  });
  new THREE.CubeCamera(1, 1000, envFBO).update(renderer, envScene);
  scene.environment = envFBO.texture;
  scene.background = envFBO.texture;
  scene.backgroundBlurriness = 0.75;

  const endLight = new THREE.PointLight("#e8fffd", 10, 30);
  endLight.position.set(0, 0, Z_END - 6);
  scene.add(endLight);
  scene.add(new THREE.AmbientLight("#ffffff", 0.4));

  /* ─── Tunnel: hero logo + the drifting logo rings behind it ────────────── */
  // mid-tunnel rings = original layout minus index 0 (the hero takes its place)
  const rings = buildRings().slice(1);
  const driftGroup = new THREE.Group();
  scene.add(driftGroup);

  let heroMesh = null;
  const ringMeshes = [];

  new OBJLoader().load("assets/opalin-logo.obj", (obj) => {
    const parts = [];
    obj.traverse((child) => {
      if (child.isMesh) parts.push(child.geometry);
    });
    const geo = mergeGeometries(parts, false);
    geo.center();
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox.getSize(size);
    const s = LOGO_HEIGHT / size.y;
    geo.scale(s, s, s);

    heroMesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({ ...glass, transparent: true, opacity: 1 })
    );
    scene.add(heroMesh);

    for (const d of rings) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({ ...glass, transparent: true, opacity: 0 })
      );
      m.position.set(0, 0, d.z);
      m.scale.setScalar(d.scale);
      m.visible = false;
      driftGroup.add(m);
      ringMeshes.push(m);
    }
  });

  /* ─── Post-processing ───────────────────────────────────────────────────── */
  const composer = new EffectComposer(renderer, {
    multisampling: 4,
    frameBufferType: THREE.HalfFloatType,
  });
  composer.addPass(new RenderPass(scene, camera));
  const noise = new NoiseEffect({
    premultiply: true,
    // OVERLAY, not SOFT_LIGHT: soft-light math NaNs on HDR speculars,
    // which rendered as black/rainbow specks at the highlight cores
    blendFunction: BlendFunction.OVERLAY,
  });
  noise.blendMode.opacity.value = 0.045;
  composer.addPass(
    new EffectPass(
      camera,
      new BloomEffect({
        mipmapBlur: true,
        intensity: 1,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.2,
        kernelSize: KernelSize.LARGE,
      }),
      new ChromaticAberrationEffect({
        offset: new THREE.Vector2(0.0008, 0.0008),
        radialModulation: false,
        modulationOffset: 0,
      }),
      new VignetteEffect({ offset: 0.25, darkness: 0.55 }),
      noise
    )
  );

  /* ─── Scroll state (native page scroll standing in for ScrollControls) ─── */
  let offset = 0;
  function targetOffset() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  /* ─── DOM overlay refs ─────────────────────────────────────────────────── */
  const overlay = {
    header: document.getElementById("overlay-header"),
    lockup: document.getElementById("hero-lockup"),
    hint: document.getElementById("scroll-hint"),
    final: document.getElementById("final-card"),
  };
  const setOpacity = (el, o) => {
    if (el) el.style.opacity = String(o);
  };

  /* ─── Frame loop: tunnel + camera rig + overlay choreography ───────────── */
  const lookTarget = new THREE.Vector3();
  const clock = new THREE.Clock();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    offset = damp(offset, targetOffset(), SCROLL_DAMP, delta);
    const off = offset;

    const dive = smoothstep(off, HERO_END, ZOOM_END); // 0 hero → 1 flying
    const reveal = smoothstep(off, REVEAL_START, REVEAL_END); // tunnel fade-in

    // hero: never rolls in the screen plane — only a subtle back-and-forth
    // sway around Y that settles as the camera dives through it
    if (heroMesh) {
      heroMesh.rotation.y = Math.sin(t * 0.45) * 0.09 * (1 - dive);
    }

    driftGroup.rotation.z = Math.sin(t * 0.05) * 0.05 * dive;

    for (let j = 0; j < ringMeshes.length; j++) {
      const m = ringMeshes[j];
      const d = rings[j];
      m.visible = reveal > 0.02;
      m.material.opacity = reveal;
      const s = lerp(0.92, 1, reveal) * d.scale;
      m.scale.setScalar(s);
      // tunnel rings may roll — only the hero logo stays fixed
      m.rotation.z = d.roll + t * d.spin * d.dir * dive;
    }

    // camera rig
    const z = cameraZ(off);

    const driftX =
      (Math.sin(t * 0.25) * 0.18 + Math.sin(off * Math.PI * 3) * 0.4) * dive;
    const driftY =
      (Math.cos(t * 0.21) * 0.14 + Math.cos(off * Math.PI * 2) * 0.28) * dive;

    // translate camera and look target down together (no tilt) so the hero
    // appears above screen center; collapses to 0 as the dive begins
    const lift = HERO_LIFT * (1 - dive);

    camera.position.x = damp(camera.position.x, driftX, 4, delta);
    camera.position.y = damp(camera.position.y, driftY - lift, 4, delta);
    camera.position.z = z;

    lookTarget.set(driftX * 0.35, driftY * 0.35 - lift, z - 9);
    camera.lookAt(lookTarget);
    camera.rotation.z =
      (Math.sin(off * Math.PI * 2.5) * 0.12 + Math.sin(t * 0.3) * 0.02) * dive;

    // DOM overlay choreography
    setOpacity(overlay.lockup, 1 - smoothstep(off, 0.02, 0.1));
    setOpacity(overlay.hint, 1 - smoothstep(off, 0.015, 0.08));
    setOpacity(overlay.header, smoothstep(off, 0.1, 0.3));
    const finalOp = smoothstep(off, 0.9, 1);
    setOpacity(overlay.final, finalOp);
    if (overlay.final) {
      // the card itself stays pointer-transparent (only the CTA is clickable)
      // so wheel events pass through and the user can scroll back out
      overlay.final.style.transform = `translate(-50%, calc(-50% + ${(1 - finalOp) * 26}px))`;
      overlay.final.style.visibility = finalOp < 0.02 ? "hidden" : "visible";
    }

    composer.render(delta);
  });
}
