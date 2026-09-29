import { FrontSide, GLSL3, Matrix4, RawShaderMaterial, Vector3 } from 'three';
import { hexToRgb } from '../geometry';
import type { BuildingTheme } from '../themes';

const vertexShader = /* glsl */ `
precision highp float;
uniform mat4 uMVP;
in vec3 position;
in vec3 normal;
in vec3 color;
in vec4 aWall;
out vec3 vColor;
out vec3 vNormal;
out vec4 vWall;
void main() {
  vColor = color;
  vNormal = normal;
  vWall = aWall;
  gl_Position = uMVP * vec4(position, 1.0);
}
`;

// Colours are used as-is (sRGB hex from the theme) so lit faces show exact palette colours.
const fragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uWindow;
uniform float uAmbient;
uniform float uSun;
uniform vec3 uSunDir;
uniform float uFloor;
uniform float uSpacing;
in vec3 vColor;
in vec3 vNormal;
in vec4 vWall; // u along edge, height, edge length (0 = no windows), eave height
out vec4 fragColor;
void main() {
  vec3 base = vColor;
  float len = vWall.z;
  if (len > 1.8) {
    float n = max(1.0, floor(len / uSpacing));
    float fu = fract(vWall.x / (len / n));
    float fv = fract(vWall.y / uFloor);
    bool storey = vWall.y > 0.6 && vWall.y < vWall.w - 0.5;
    if (storey && fu > 0.3 && fu < 0.7 && fv > 0.3 && fv < 0.75) base = uWindow;
  }
  float light = uAmbient + uSun * max(dot(normalize(vNormal), uSunDir), 0.0);
  fragColor = vec4(base * light, 1.0);
}
`;

const rgb = (hex: string) => new Vector3(...hexToRgb(hex).map((c) => c / 255));

/**
 * The procedural building material. Each chunk gets its own instance, because `uMVP` is the
 * map's view-projection matrix combined on the CPU (in float64) with the chunk's transform.
 */
export function createBuildingMaterial(theme: BuildingTheme): RawShaderMaterial {
  const { ambient, sun, sunDirection } = theme.lighting;
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      uMVP: { value: new Matrix4() },
      uWindow: { value: rgb(theme.windows) },
      uAmbient: { value: ambient },
      uSun: { value: sun },
      uSunDir: { value: new Vector3(...sunDirection).normalize() },
      uFloor: { value: theme.floorHeight },
      uSpacing: { value: theme.windowSpacing },
    },
    // The chunk transform flips y (mercator y points south) and MapLibre's mercator matrix flips
    // it back, so outward (CCW) faces stay front-facing.
    side: FrontSide,
  });
}
