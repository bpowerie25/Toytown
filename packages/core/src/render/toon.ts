import {
  AmbientLight,
  BackSide,
  Color,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  LinearSRGBColorSpace,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  Vector3,
  type Light,
  type Material,
} from 'three';
import { hexToRgb } from '../geometry';
import type { Theme } from '../themes';

/**
 * Colours are sRGB hex from the theme, used as-is: the renderer outputs without colour-space
 * conversion, so a face lit to exactly 1.0 shows the exact palette colour.
 */
export const rgb = (hex: string) =>
  new Color().setRGB(
    ...(hexToRgb(hex).map((c) => c / 255) as [number, number, number]),
    LinearSRGBColorSpace,
  );
const vec = (hex: string) => new Vector3(...hexToRgb(hex).map((c) => c / 255));

/** The toon ramp: one texel per brightness step, darkest to lightest. */
export function gradientMap(steps: number[]): DataTexture {
  const t = new DataTexture(
    Uint8Array.from(steps.map((s) => Math.round(s * 255))),
    steps.length,
    1,
    RedFormat,
  );
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * One sun, ambient light, and an optional soft sky/ground fill. three's Lambert term divides by
 * π, so intensities are scaled by π: a face's brightness is `ambient + sun × toonStep` (plus
 * the fill), and faces towards the sun show about their palette colour.
 */
export function createLights(theme: Theme): Light[] {
  const { ambient, sun, sunDirection, hemisphere } = theme.lighting;
  const a = new AmbientLight(0xffffff, ambient * Math.PI);
  const d = new DirectionalLight(0xffffff, sun * Math.PI);
  d.position.set(sunDirection[0], sunDirection[1], sunDirection[2]).normalize();
  d.target.position.set(0, 0, 0);
  const lights: Light[] = [a, d];
  if (hemisphere) {
    const h = new HemisphereLight(
      rgb(hemisphere.sky),
      rgb(hemisphere.ground),
      hemisphere.intensity * Math.PI,
    );
    h.position.set(0, 0, 1); // the scene is z-up
    lights.push(h);
  }
  return lights;
}

/**
 * Toon material for hero models and props: vertex colours (baked from the theme palette). Parts
 * whose palette key is in `theme.models.glow` (e.g. windows at night) carry `aGlow = 1` and show
 * their colour unlit.
 */
export function createModelMaterial(theme: Theme): MeshToonMaterial {
  const m = new MeshToonMaterial({
    vertexColors: true,
    gradientMap: gradientMap(theme.lighting.toonSteps),
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aGlow;\nvarying float vGlow;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb, vGlow);',
      );
  };
  return m;
}

/** Inverted-hull outline: back faces pushed out along smooth normals, in the ink colour. */
export function createHullMaterial(theme: Theme): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: rgb(theme.outline.color), side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHull = { value: theme.outline.hullWidth };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHull;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += normalize(normal) * uHull;',
      );
  };
  return m;
}

/**
 * Wall detail for procedural buildings, from per-vertex wall coordinates and window style (see
 * `ChunkMesh.windows`). Returns the wall colour with windows, frames, sills, a front door, a
 * shopfront or church windows drawn in; sets `glass` to 1 on window glass (for night glow).
 */
const wallDetail = /* glsl */ `
vec3 wallDetail(vec3 wall, out float glass) {
  glass = 0.0;
  float len = vWall.z;
  if (len < 1.2) return wall;
  float u = vWall.x;
  float v = vWall.y;
  float eave = vWall.w;
  float spacing = max(1.5, vWin.x * 10.0);
  float wf = vWin.y;
  float hf = vWin.z;
  int flags = int(vWin.w * 255.0 + 0.5);
  bool framed = (flags & 1) != 0;
  bool shopfront = (flags & 2) != 0;
  bool front = (flags & 4) != 0;
  bool tall = (flags & 8) != 0;
  bool strip = (flags & 16) != 0;
  bool door = (flags & 32) != 0 && front;
  const float fr = 0.12; // frame width, m

  // Front door, centred on the street-facing wall.
  if (door) {
    float dx = abs(u - len * 0.5);
    if (v < 2.1 && dx < 0.5) return uDoor;
    if (v < 2.22 && dx < 0.62) return uFrame;
  }

  // Shopfront: glass with mullions and a fascia across the street-facing ground floor.
  if (shopfront && front && v < uFloor) {
    if (v > 2.6 && v < 3.05 && u > 0.2 && u < len - 0.2) return wall * 0.62;
    if (v > 0.3 && v < 2.45 && u > 0.5 && u < len - 0.5) {
      if (abs(fract(u / 1.6 + 0.5) - 0.5) * 1.6 < 0.05) return uFrame;
      glass = 1.0;
      return uWindow;
    }
    if (v > 0.2 && v < 2.55 && u > 0.38 && u < len - 0.38) return uFrame;
    return wall;
  }

  // High window strip (warehouses, factories).
  if (strip) {
    if (v > eave - 1.7 && v < eave - 0.7 && u > 0.6 && u < len - 0.6) {
      if (abs(fract(u / 2.0 + 0.5) - 0.5) * 2.0 < 0.06) return uFrame * 0.9;
      glass = 1.0;
      return uWindow;
    }
    return wall;
  }

  float n = max(1.0, floor(len / spacing));
  float cell = len / n;
  float x = (fract(u / cell) - 0.5) * cell; // metres from the window's centre line
  float halfW = wf * cell * 0.5;
  if (door && v < uFloor && abs(u - len * 0.5) < 1.1) return wall; // no window over the door

  // Tall arched windows (churches): one per bay, most of the wall's height.
  if (tall) {
    float bottom = 1.4;
    float top = max(bottom + 2.0, eave - 1.2);
    float r = halfW;
    vec2 arch = vec2(x, v - (top - r));
    bool inGlass = abs(x) < halfW && v > bottom && (v < top - r || length(arch) < r);
    bool inFrame = abs(x) < halfW + fr && v > bottom - fr && (v < top - r || length(arch) < r + fr);
    if (inGlass) {
      glass = 1.0;
      return uWindow;
    }
    return inFrame ? uFrame : wall;
  }

  // A grid of windows, one row per storey, with frames and sills.
  float y = (fract(v / uFloor) - 0.55) * uFloor; // metres from the window's middle
  float halfH = hf * uFloor * 0.5;
  float windowTop = floor(v / uFloor) * uFloor + 0.55 * uFloor + halfH;
  if (v < 0.4 || windowTop > eave - 0.25) return wall;
  if (abs(x) < halfW && abs(y) < halfH) {
    glass = 1.0;
    return uWindow;
  }
  if (framed && abs(x) < halfW + fr && abs(y) < halfH + fr) return uFrame;
  if (framed && abs(x) < halfW + fr + 0.1 && y < -halfH - fr && y > -halfH - fr - 0.14) return wall * 0.8;
  return wall;
}
`;

/**
 * Toon material for procedural buildings, with:
 * - wall detail from the building's window style: windows with frames and sills, front doors,
 *   shopfronts, arched church windows or high strips; no window geometry;
 * - faint panel lines on flat roofs;
 * - ink edges on face borders, a constant width in pixels, tinted from each face's own colour.
 * Detail and ink fade out as ground resolution drops (metres per pixel), avoiding moiré.
 */
export function createBuildingMaterial(theme: Theme): MeshToonMaterial {
  const b = theme.buildings;
  const o = theme.outline;
  const m = new MeshToonMaterial({
    vertexColors: true,
    gradientMap: gradientMap(theme.lighting.toonSteps),
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uWindow: { value: vec(b.windows) },
      uFrame: { value: vec(b.frame) },
      uDoor: { value: vec(b.door) },
      uInk: { value: vec(o.color) },
      uFloor: { value: b.floorHeight },
      uEdgeWidth: { value: o.edgeWidth },
      uInkTone: { value: [o.inkShade ?? 0.45, o.inkMix ?? 0.35] },
      uFade: { value: [o.fadeStart, o.fadeEnd] },
      uWindowGlow: { value: b.windowGlow },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aWall;
attribute vec4 aEdge;
attribute vec4 aWin;
varying vec4 vWall;
varying vec4 vEdge;
varying vec4 vWin;
varying vec3 vLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWall = aWall;
vEdge = aEdge;
vWin = aWin;
vLocal = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uWindow;
uniform vec3 uFrame;
uniform vec3 uDoor;
uniform vec3 uInk;
uniform float uFloor;
uniform float uEdgeWidth;
uniform vec2 uInkTone; // face shade, mix towards uInk
uniform vec2 uFade;
uniform float uWindowGlow;
varying vec4 vWall; // u along edge, height, edge length (0 = no windows), eave height
varying vec4 vEdge;
varying vec4 vWin;
varying vec3 vLocal;
${wallDetail}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float mpp = length(fwidth(vLocal)); // metres per pixel, roughly
float detail = 1.0 - smoothstep(uFade.x, uFade.y, mpp);
float glass = 0.0;
if (vWall.z > 1.2) {
  vec3 near = wallDetail(diffuseColor.rgb, glass);
  // Far away, blend towards the windows' average coverage instead of aliasing.
  vec3 far = mix(diffuseColor.rgb, uWindow, 0.12);
  diffuseColor.rgb = mix(far, near, detail);
  glass *= detail;
}
// Flat roof decks (faces with no ink edges): faint panel lines.
if (vEdge.x > 0.99 && vEdge.y > 0.99 && vEdge.z > 0.99) {
  vec2 g = abs(fract(vLocal.xy / 4.5 + 0.5) - 0.5) * 4.5;
  float line = 1.0 - smoothstep(0.03, 0.07, min(g.x, g.y));
  diffuseColor.rgb *= 1.0 - 0.035 * line * detail;
}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
// Night: window glass glows at full colour, whatever the light.
gl_FragColor.rgb = mix(gl_FragColor.rgb, uWindow, glass * uWindowGlow);
vec3 bc = vEdge.xyz;
if (vEdge.w < 0.5) bc.y = 1.0; // quad: skip the diagonal
// smoothstep is undefined when both edges are equal: constant channels (decks, the quad's
// ignored y) have fwidth 0, so keep the upper edge above zero.
vec3 aa = smoothstep(vec3(0.0), max(fwidth(bc) * uEdgeWidth, vec3(1e-5)), bc);
float ink = uEdgeWidth > 0.0 ? (1.0 - min(min(aa.x, aa.y), aa.z)) * detail : 0.0;
// Ink is a darker tone of the face itself, nudged towards the theme's ink colour.
gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(gl_FragColor.rgb * uInkTone.x, uInk, uInkTone.y), ink);`,
      );
  };
  return m;
}

export function disposeMaterial(m: Material | Material[]) {
  for (const x of Array.isArray(m) ? m : [m]) {
    const g = (x as MeshToonMaterial).gradientMap;
    g?.dispose();
    x.dispose();
  }
}
