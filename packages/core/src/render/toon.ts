import {
  AmbientLight,
  BackSide,
  Color,
  DataTexture,
  DirectionalLight,
  LinearSRGBColorSpace,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  Vector3,
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

/** The 3-step toon ramp. */
export function gradientMap(steps: [number, number, number]): DataTexture {
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
 * One sun plus ambient. three's Lambert term divides by π, so intensities are scaled by π:
 * a face's brightness is then `ambient + sun × toonStep`.
 */
export function createLights(theme: Theme): [AmbientLight, DirectionalLight] {
  const { ambient, sun, sunDirection } = theme.lighting;
  const a = new AmbientLight(0xffffff, ambient * Math.PI);
  const d = new DirectionalLight(0xffffff, sun * Math.PI);
  d.position.set(...sunDirection).normalize();
  d.target.position.set(0, 0, 0);
  return [a, d];
}

/** Toon material for hero models and props: vertex colours (baked from the theme palette). */
export function createModelMaterial(theme: Theme): MeshToonMaterial {
  return new MeshToonMaterial({
    vertexColors: true,
    gradientMap: gradientMap(theme.lighting.toonSteps),
  });
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
 * Toon material for procedural buildings, with two additions:
 * - window strips from per-vertex wall coordinates (no window geometry), and
 * - ink edges on face borders from per-vertex edge coordinates, a constant width in pixels.
 * Both fade out as ground resolution drops (metres per pixel), which also avoids moiré.
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
      uInk: { value: vec(o.color) },
      uFloor: { value: b.floorHeight },
      uSpacing: { value: b.windowSpacing },
      uEdgeWidth: { value: o.edgeWidth },
      uFade: { value: [o.fadeStart, o.fadeEnd] },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aWall;
attribute vec4 aEdge;
varying vec4 vWall;
varying vec4 vEdge;
varying vec3 vLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWall = aWall;
vEdge = aEdge;
vLocal = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uWindow;
uniform vec3 uInk;
uniform float uFloor;
uniform float uSpacing;
uniform float uEdgeWidth;
uniform vec2 uFade;
varying vec4 vWall; // u along edge, height, edge length (0 = no windows), eave height
varying vec4 vEdge;
varying vec3 vLocal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float mpp = length(fwidth(vLocal)); // metres per pixel, roughly
float detail = 1.0 - smoothstep(uFade.x, uFade.y, mpp);
if (vWall.z > 1.8) {
  float n = max(1.0, floor(vWall.z / uSpacing));
  float fu = fract(vWall.x / (vWall.z / n));
  float fv = fract(vWall.y / uFloor);
  bool storey = vWall.y > 0.6 && vWall.y < vWall.w - 0.5;
  float win = (storey && fu > 0.3 && fu < 0.7 && fv > 0.3 && fv < 0.75) ? 1.0 : 0.0;
  // Far away, blend towards the windows' average coverage instead of aliasing.
  float amount = mix(storey ? 0.18 : 0.0, win, detail);
  diffuseColor.rgb = mix(diffuseColor.rgb, uWindow, amount);
}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
vec3 bc = vEdge.xyz;
if (vEdge.w < 0.5) bc.y = 1.0; // quad: skip the diagonal
// smoothstep is undefined when both edges are equal: constant channels (decks, the quad's
// ignored y) have fwidth 0, so keep the upper edge above zero.
vec3 aa = smoothstep(vec3(0.0), max(fwidth(bc) * uEdgeWidth, vec3(1e-5)), bc);
float ink = (1.0 - min(min(aa.x, aa.y), aa.z)) * detail;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uInk, ink);`,
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
