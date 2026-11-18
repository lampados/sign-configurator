// three.js preview, independent of the type of LED (SPEC §5). The lightPoints come
// from the pipeline: today the COB strip, tomorrow a free-pitch pixel.
import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  HalfFloatType,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { StlMesh } from '../export/stl';
import type { LightPoint } from '../geometry/lights';
import type { PlateMaterial } from '../geometry/plate';
import {
  createDiffuserGlowMaterial,
  createEmitterMaterial,
  createSplatMaterial,
  createWallGlowMaterial,
  BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_HALO,
  WALL_GLOW_GAIN,
  GAUSSIAN_RADIUS_SIGMA,
  parseHexColor,
} from './neonMaterial';

export type PreviewMode = 'spenta' | 'accesa' | 'senza diffusore';

export interface SignViewData {
  housing: StlMesh;
  diffuser: StlMesh;
  lights: readonly LightPoint[];
  /** LED–diffuser distance, mm. Width of the gaussian. */
  ledGapMm: number;
  /** Backdrop behind the housing (SPEC §13), with its material. Absent: no backdrop. */
  plate?: { mesh: StlMesh; material: PlateMaterial } | null;
  /** Cuts for the print bed (SPEC §14): vertical segments at constant x, over the sign. */
  cuts?: readonly { x: number; y0: number; y1: number; z: number }[];
}

export interface SignScene {
  setSign(sign: SignViewData): void;
  setMode(mode: PreviewMode): void;
  setColor(hex: string): void;
  /**
   * `fisso` uses the picker and stands still. The others move: `arcobaleno` runs through the hues,
   * `respiro` fades in and out, `scia` sends a comet along every piece of strip, `scintille` makes
   * single LEDs flicker. They stop with prefers-reduced-motion and in the snapshot.
   */
  setEffect(effect: PreviewEffect): void;
  /** ACES exposure. The customer stays on the default. */
  setExposure(value: number): void;
  /** Radius of the halo. The bloom threshold does not go down. */
  setHalo(radius: number): void;
  /**
   * Photo of the sign in the standard view (from the front, lit, with the diffuser, 4:3), as a JPEG
   * data URL. It does not depend on how the customer rotated or switched off the preview, which stays as it was.
   * `null` without a sign or if the browser does not return the image.
   */
  snapshot(): string | null;
  dispose(): void;
}

/** Effect of the preview: `fisso` is the solid colour, the others are animated. */
export type PreviewEffect = 'fisso' | 'arcobaleno' | 'respiro' | 'scia' | 'scintille';

const FRONT_LIMIT = (40 * Math.PI) / 180;
/** Beyond this angle between two faces the edge stays sharp in the shading. */
const CREASE_ANGLE = (35 * Math.PI) / 180;
const WALL = 0xe6e0d6;

function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function coarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 720px)').matches;
}

function geometryOf(mesh: StlMesh): BufferGeometry {
  const count = Math.floor(mesh.vertProperties.length / mesh.numProp);
  const positions = new Float32Array(count * 3);
  for (let i = 0, j = 0; i < count; i++, j += 3) {
    const base = i * mesh.numProp;
    positions[j] = mesh.vertProperties[base]!;
    positions[j + 1] = mesh.vertProperties[base + 1]!;
    positions[j + 2] = mesh.vertProperties[base + 2]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.triVerts, 1));
  // Creased normals: curved walls stay soft, flat faces (top of the diffuser, edge,
  // plate) stay flat instead of fanning out towards the vertices shared with the walls.
  const creased = toCreasedNormals(geometry, CREASE_ANGLE);
  geometry.dispose();
  return creased;
}

/** Air around the sign in the framing. */
const FIT_MARGIN = 1.28;
/** Photo for the shop (SPEC §12.7): 4:3, enough for a product card, light to save. */
const SNAPSHOT_W = 1000;
const SNAPSHOT_H = 750;
const SNAPSHOT_QUALITY = 0.86;
/** Under this height the preview is "low" and the sign leaves header and controls free. */
const SHORT_STAGE_PX = 520;
/** Height covered by header (top) and controls (bottom) on the preview. */
const STAGE_CHROME_PX = 65;

export function mountSignScene(host: HTMLElement, options?: { background?: number }): SignScene {
  const mobile = coarsePointer();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const backdrop = options?.background ?? WALL;

  host.replaceChildren();
  host.style.position = 'relative';
  host.style.minHeight = '70vh';
  host.style.background = cssHex(backdrop);
  host.style.overflow = 'hidden';

  const renderer = new WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '70vh';
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(backdrop);

  const daylight = new HemisphereLight(0xfff6ea, 0xc9c2b6, 0.85);
  const sun = new DirectionalLight(0xfffaf3, 1.15);
  sun.position.set(0.4, 0.8, 1);
  scene.add(daylight, sun);

  const wall = new Mesh(new BufferGeometry());
  scene.add(wall);

  const camera = new PerspectiveCamera(38, 1, 0.1, 8000);
  camera.position.set(0, 0, 400);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.zoomSpeed = 0.6;
  controls.rotateSpeed = 0.45;
  controls.mouseButtons.LEFT = MOUSE.ROTATE;
  controls.maxPolarAngle = Math.PI / 2 + FRONT_LIMIT;
  controls.minPolarAngle = Math.PI / 2 - FRONT_LIMIT;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomScale = mobile ? 0.5 : 1;
  const bloom = new UnrealBloomPass(new Vector2(256, 256), DEFAULT_HALO * 0.35, DEFAULT_HALO, BLOOM_THRESHOLD);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const housingMaterial = new MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.78,
    metalness: 0.12,
    side: DoubleSide,
  });
  const diffuserOff = new MeshStandardMaterial({ color: 0xf7f4ef, roughness: 0.94, metalness: 0, side: DoubleSide });
  // Backdrop: black transparent acrylic (glossy smoke, the wall shows behind) or matt wood.
  const plateMaterials: Record<PlateMaterial, MeshStandardMaterial> = {
    // Clear acrylic: almost invisible, glossy; holes and wires show behind.
    clear: new MeshStandardMaterial({
      color: 0xc8d4de,
      roughness: 0.04,
      metalness: 0.25,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: DoubleSide,
      emissive: 0xffffff,
    }),
    // Black transparent acrylic (smoke).
    black: new MeshStandardMaterial({
      // On the customer's black background a solid black would disappear: a glossy smoke grey sets it apart.
      color: 0x3a3a48,
      roughness: 0.16,
      metalness: 0.4,
      transparent: true,
      opacity: 0.8,
      // The glow of the neon on the plate: glossy acrylic reflects it, a little damped.
      emissive: 0xb4b4c8,
      depthWrite: false,
      side: DoubleSide,
    }),
    // Matt wood diffuses the glow warmly.
    wood: new MeshStandardMaterial({ color: 0xa2713f, roughness: 0.82, metalness: 0, side: DoubleSide, emissive: 0xffd2a0 }),
  };

  const glowTarget = new WebGLRenderTarget(128, 128, { type: HalfFloatType, depthBuffer: false });
  glowTarget.texture.generateMipmaps = false;
  const glowScene = new Scene();
  const glowCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  glowCamera.position.set(0, 0, 80);
  const splatMaterial = createSplatMaterial();
  const ledGeometry = new BufferGeometry();
  const splat = new Points(ledGeometry, splatMaterial);
  splat.frustumCulled = false;
  glowScene.add(splat);
  const glowMaterial = createDiffuserGlowMaterial(glowTarget.texture);
  // The plate sits in front of the wall and would cover its glow: the plate receives it, from the same texture.
  for (const material of Object.values(plateMaterials)) {
    material.emissiveMap = glowTarget.texture;
    material.emissiveIntensity = 0;
  }
  const wallMaterial = createWallGlowMaterial(glowTarget.texture, new Color(backdrop));
  wall.material = wallMaterial;
  const emitterMaterial = createEmitterMaterial();
  const emitters = new Points(ledGeometry, emitterMaterial);
  emitters.frustumCulled = false;
  emitters.visible = false;
  scene.add(emitters);

  let housingMesh: Mesh | null = null;
  let diffuserMesh: Mesh | null = null;
  let plateMesh: Mesh | null = null;
  let cutLines: LineSegments | null = null;
  const cutMaterial = new LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 3, depthTest: false, transparent: true, opacity: 0.9 });
  let lights: readonly LightPoint[] = [];
  let ledGap = 6;
  let mode: PreviewMode = 'accesa';
  let effect: PreviewEffect = 'fisso';
  let haloRadius = DEFAULT_HALO;
  const baseColor = new Color('#ff2fd6');
  const scratch = new Color();
  let maxIndex = new Map<number, number>();

  const animated = (): boolean => effect !== 'fisso';

  // Declared before resize(): the observer calls resize at once, with the sign still absent.
  let viewBox: Box3 | null = null;

  const fitDistance = (size: Vector3): number => {
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = Math.max(camera.aspect, 0.2);
    const distForHeight = Math.max(size.y, 1) / 2 / tan;
    const distForWidth = Math.max(size.x, 1) / 2 / (tan * aspect);
    // Low preview (phone in landscape, or panel open): header and controls cover
    // about 65 px above and below, and the sign shrinks to stay out of them.
    const hostH = host.clientHeight;
    const heightMargin = hostH > 0 && hostH < SHORT_STAGE_PX
      ? Math.max(FIT_MARGIN, (hostH / Math.max(hostH - 2 * STAGE_CHROME_PX, hostH * 0.4)) * 1.1)
      : FIT_MARGIN;
    return Math.max(distForHeight * heightMargin, distForWidth * FIT_MARGIN, 40 * FIT_MARGIN);
  };

  const aimCamera = (box: Box3, resetAngle: boolean): void => {
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const distance = fitDistance(size);
    controls.target.copy(center);
    if (resetAngle) {
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      camera.position.set(center.x, center.y, center.z + distance);
    } else {
      const offset = new Vector3().subVectors(camera.position, center);
      if (offset.lengthSq() < 1) offset.set(0, 0, 1);
      offset.setLength(distance);
      camera.position.copy(center).add(offset);
    }
    camera.near = Math.max(0.1, distance / 200);
    camera.far = Math.max(distance * 30, 100);
    camera.updateProjectionMatrix();
    controls.update();
    if (!resetAngle) return;
    const azimuth = controls.getAzimuthalAngle();
    const polar = controls.getPolarAngle();
    controls.minAzimuthAngle = azimuth - FRONT_LIMIT;
    controls.maxAzimuthAngle = azimuth + FRONT_LIMIT;
    controls.minPolarAngle = Math.max(0.05, polar - FRONT_LIMIT);
    controls.maxPolarAngle = Math.min(Math.PI - 0.05, polar + FRONT_LIMIT);
  };

  const frame = (box: Box3): void => {
    viewBox = box.clone();
    aimCamera(box, true);

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const span = Math.max(size.x, size.y, 40);
    wall.geometry.dispose();
    const plane = new BufferGeometry();
    const z = box.min.z - 12;
    const w = span * 4;
    const positions = new Float32Array([
      center.x - w, center.y - w, z,
      center.x + w, center.y - w, z,
      center.x + w, center.y + w, z,
      center.x - w, center.y - w, z,
      center.x + w, center.y + w, z,
      center.x - w, center.y + w, z,
    ]);
    plane.setAttribute('position', new BufferAttribute(positions, 3));
    plane.computeVertexNormals();
    wall.geometry = plane;
  };

  const resize = (): void => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, Math.round(host.clientHeight || window.innerHeight * 0.7));
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.setSize(Math.max(1, Math.floor(width * bloomScale)), Math.max(1, Math.floor(height * bloomScale)));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (viewBox) aimCamera(viewBox, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const applyMode = (): void => {
    const on = mode === 'accesa';
    const open = mode === 'senza diffusore';
    if (diffuserMesh) {
      diffuserMesh.visible = !open;
      diffuserMesh.material = on ? glowMaterial : diffuserOff;
    }
    emitters.visible = open && lights.length > 0;
    // With a backdrop the room stays a little brighter, otherwise the plate disappears into black.
    const room = plateMesh ? 3 : 1;
    daylight.intensity = on || open ? 0.22 * room : 0.9;
    sun.intensity = on || open ? 0.28 * room : 1.15;
    bloom.threshold = BLOOM_THRESHOLD;
    bloom.radius = haloRadius;
    bloom.strength = on || open ? haloRadius * 0.35 : 0;
    const spread = DEFAULT_HALO > 0 ? haloRadius / DEFAULT_HALO : 0;
    wallMaterial.uniforms.uGain!.value = on ? WALL_GLOW_GAIN * spread : 0;
    const plateGlow = on ? WALL_GLOW_GAIN * spread : 0;
    plateMaterials.wood.emissiveIntensity = plateGlow * 0.9;
    plateMaterials.black.emissiveIntensity = plateGlow * 0.85;
    plateMaterials.clear.emissiveIntensity = plateGlow * 0.5;
    bloom.enabled = on || open;
  };

  const layoutGlow = (box: Box3): void => {
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 10);
    const pad = Math.max(ledGap * GAUSSIAN_RADIUS_SIGMA, 8);
    const minX = box.min.x - pad;
    const maxX = box.max.x + pad;
    const minY = box.min.y - pad;
    const maxY = box.max.y + pad;
    const worldW = Math.max(maxX - minX, 1);
    const worldH = Math.max(maxY - minY, 1);
    const cap = mobile ? 256 : 512;
    const scale = Math.min(cap / worldW, cap / worldH, mobile ? 2 : 4);
    const texW = Math.max(32, Math.round(worldW * scale));
    const texH = Math.max(32, Math.round(worldH * scale));
    glowTarget.setSize(texW, texH);
    glowCamera.left = minX;
    glowCamera.right = maxX;
    glowCamera.top = maxY;
    glowCamera.bottom = minY;
    glowCamera.updateProjectionMatrix();
    const pixelsPerMm = texH / worldH;
    splatMaterial.uniforms.uPointSize!.value = ledGap * GAUSSIAN_RADIUS_SIGMA * 2 * pixelsPerMm;
    glowMaterial.uniforms.uOrigin!.value.set(minX, minY);
    glowMaterial.uniforms.uSpan!.value.set(worldW, worldH);
    wallMaterial.uniforms.uOrigin!.value.set(minX, minY);
    wallMaterial.uniforms.uSpan!.value.set(worldW, worldH);
    emitterMaterial.uniforms.uPointSize!.value = Math.max(6, 2.2 * pixelsPerMm);
    void span;
  };

  /** Coordinates of the glow texture on the plate: the same as the wall, from the XY plane. */
  const plateGlowUv = (geometry: BufferGeometry): void => {
    const origin = wallMaterial.uniforms.uOrigin!.value as Vector2;
    const span = wallMaterial.uniforms.uSpan!.value as Vector2;
    const pos = geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - origin.x) / span.x;
      uv[i * 2 + 1] = (pos.getY(i) - origin.y) / span.y;
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  };

  const paintColors = (time: number): void => {
    const attr = splat.geometry.getAttribute('ledColor') as BufferAttribute | undefined;
    if (!attr) return;
    const data = attr.array as Float32Array;
    // Time 0 is the still frame (snapshot, reduced motion): full colour, or the rainbow standing still.
    const moving = time > 0 && !reducedMotion.matches;
    const shift = moving ? (time * 0.00008) % 1 : 0;
    const breath = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(time * 0.0021));
    const head = (time * 0.00035) % 1;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!;
      const span = Math.max(1, maxIndex.get(light.segment) ?? 1);
      if (effect === 'arcobaleno') {
        scratch.setHSL((light.index / span + shift) % 1, 0.9, 0.58);
      } else if (!moving || effect === 'fisso') {
        scratch.copy(baseColor);
      } else if (effect === 'respiro') {
        scratch.copy(baseColor).multiplyScalar(breath);
      } else if (effect === 'scia') {
        // Distance behind the head of the comet, along the piece of strip: a tail of a third.
        const behind = (head - light.index / span + 1) % 1;
        const tail = behind < 0.34 ? 1 - behind / 0.34 : 0;
        scratch.copy(baseColor).multiplyScalar(0.12 + 0.88 * tail * tail);
      } else {
        // Every LED flickers with its own phase and speed, the same at every run.
        const seed = Math.sin((i + 1) * 12.9898) * 43758.5453;
        const phase = seed - Math.floor(seed);
        const wave = 0.5 + 0.5 * Math.sin(time * (0.003 + phase * 0.006) + phase * 6.283);
        scratch.copy(baseColor).multiplyScalar(0.25 + 0.75 * wave * wave);
      }
      data[i * 3] = scratch.r;
      data[i * 3 + 1] = scratch.g;
      data[i * 3 + 2] = scratch.b;
    }
    attr.needsUpdate = true;
  };

  const renderGlow = (): void => {
    if (lights.length === 0) return;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(glowTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(glowScene, glowCamera);
    renderer.setRenderTarget(previous);
    renderer.autoClear = autoClear;
  };

  const setLights = (next: readonly LightPoint[]): void => {
    lights = next;
    maxIndex = new Map();
    for (const light of next) maxIndex.set(light.segment, Math.max(maxIndex.get(light.segment) ?? 0, light.index));
    const positions = new Float32Array(next.length * 3);
    const colors = new Float32Array(next.length * 3);
    for (let i = 0; i < next.length; i++) {
      const light = next[i]!;
      positions[i * 3] = light.pos[0];
      positions[i * 3 + 1] = light.pos[1];
      positions[i * 3 + 2] = light.pos[2];
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('ledColor', new BufferAttribute(colors, 3));
    splat.geometry.dispose();
    splat.geometry = geometry;
    emitters.geometry = geometry;
    paintColors(0);
  };

  let disposed = false;
  renderer.setAnimationLoop((time) => {
    if (disposed) return;
    controls.update();
    const glowing = mode !== 'spenta';
    if (glowing && animated() && !reducedMotion.matches) paintColors(time);
    if (mode === 'accesa') renderGlow();
    if (glowing) composer.render();
    else renderer.render(scene, camera);
  });

  const onMotion = (): void => {
    paintColors(0);
    if (mode === 'accesa') renderGlow();
  };
  reducedMotion.addEventListener('change', onMotion);

  return {
    setSign(sign: SignViewData): void {
      housingMesh?.geometry.dispose();
      diffuserMesh?.geometry.dispose();
      if (housingMesh) scene.remove(housingMesh);
      if (diffuserMesh) scene.remove(diffuserMesh);
      if (plateMesh) {
        scene.remove(plateMesh);
        plateMesh.geometry.dispose();
        plateMesh = null;
      }
      if (cutLines) {
        scene.remove(cutLines);
        cutLines.geometry.dispose();
        cutLines = null;
      }
      if (sign.cuts && sign.cuts.length > 0) {
        const positions = new Float32Array(sign.cuts.length * 6);
        sign.cuts.forEach((cut, i) => positions.set([cut.x, cut.y0, cut.z, cut.x, cut.y1, cut.z], i * 6));
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        cutLines = new LineSegments(geometry, cutMaterial);
        cutLines.computeLineDistances();
        cutLines.renderOrder = 10;
        scene.add(cutLines);
      }
      ledGap = Math.max(0.4, sign.ledGapMm);
      housingMesh = new Mesh(geometryOf(sign.housing), housingMaterial);
      diffuserMesh = new Mesh(geometryOf(sign.diffuser), diffuserOff);
      scene.add(housingMesh, diffuserMesh);
      if (sign.plate) {
        // Flat faces: per-face normals, otherwise the large face fades towards the edges and
        // shows the long triangles of the triangulation.
        plateMesh = new Mesh(geometryOf(sign.plate.mesh), plateMaterials[sign.plate.material]);
        plateMesh.renderOrder = -1;
        scene.add(plateMesh);
      }
      setLights(sign.lights);
      const box = new Box3().setFromObject(housingMesh);
      if (box.isEmpty()) box.set(new Vector3(-10, -10, 0), new Vector3(10, 10, 12));
      layoutGlow(box);
      if (plateMesh) plateGlowUv(plateMesh.geometry);
      // The framing includes the backdrop; the glow is still computed on the sign.
      const view = plateMesh ? box.clone().union(new Box3().setFromObject(plateMesh)) : box;
      frame(view);
      applyMode();
      paintColors(0);
      renderGlow();
    },
    setMode(next: PreviewMode): void {
      mode = next;
      applyMode();
    },
    setColor(hex: string): void {
      parseHexColor(hex, baseColor);
      paintColors(0);
      if (mode === 'accesa') renderGlow();
    },
    setEffect(next: PreviewEffect): void {
      effect = next;
      paintColors(reducedMotion.matches ? 0 : performance.now());
      if (mode === 'accesa') renderGlow();
    },
    setExposure(value: number): void {
      renderer.toneMappingExposure = Math.min(1.8, Math.max(0.2, value));
    },
    setHalo(radius: number): void {
      haloRadius = Math.min(0.6, Math.max(0, radius));
      applyMode();
    },
    snapshot(): string | null {
      if (!viewBox || !diffuserMesh) return null;
      const savedMode = mode;
      const savedPosition = camera.position.clone();
      const savedTarget = controls.target.clone();
      const savedRatio = renderer.getPixelRatio();
      const savedCuts = cutLines?.visible ?? false;
      try {
        mode = 'accesa';
        applyMode();
        // The cuts for the print bed are a help for whoever prints, they are not part of the product.
        if (cutLines) cutLines.visible = false;
        renderer.setPixelRatio(1);
        renderer.setSize(SNAPSHOT_W, SNAPSHOT_H, false);
        composer.setSize(SNAPSHOT_W, SNAPSHOT_H);
        bloom.setSize(SNAPSHOT_W, SNAPSHOT_H);
        camera.aspect = SNAPSHOT_W / SNAPSHOT_H;
        // From the front, with the same margin as the preview: the sign fills the frame.
        const center = viewBox.getCenter(new Vector3());
        const size = viewBox.getSize(new Vector3());
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        const distance = Math.max(size.y / 2 / tan, size.x / 2 / (tan * camera.aspect), 40) * FIT_MARGIN;
        camera.position.set(center.x, center.y, center.z + distance);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        paintColors(0);
        renderGlow();
        composer.render();
        // Right after the render: the content of the canvas is valid until the next composition.
        const url = renderer.domElement.toDataURL('image/jpeg', SNAPSHOT_QUALITY);
        return url.startsWith('data:image/jpeg;base64,') ? url : null;
      } catch {
        return null;
      } finally {
        if (cutLines) cutLines.visible = savedCuts;
        mode = savedMode;
        applyMode();
        renderer.setPixelRatio(savedRatio);
        resize();
        camera.position.copy(savedPosition);
        controls.target.copy(savedTarget);
        camera.updateProjectionMatrix();
        controls.update();
        if (mode === 'accesa') renderGlow();
      }
    },
    dispose(): void {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      reducedMotion.removeEventListener('change', onMotion);
      controls.dispose();
      housingMesh?.geometry.dispose();
      diffuserMesh?.geometry.dispose();
      plateMesh?.geometry.dispose();
      cutLines?.geometry.dispose();
      cutMaterial.dispose();
      splat.geometry.dispose();
      housingMaterial.dispose();
      diffuserOff.dispose();
      plateMaterials.clear.dispose();
      plateMaterials.black.dispose();
      plateMaterials.wood.dispose();
      splatMaterial.dispose();
      glowMaterial.dispose();
      wallMaterial.dispose();
      emitterMaterial.dispose();
      glowTarget.dispose();
      composer.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}

export type { LightPoint };
