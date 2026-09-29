import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToRgb } from '../geometry';
import type { Manifest } from '../manifest';
import type { Theme } from '../themes';

export interface LoadedModel {
  /** Z-up, front on -Y (south), metres; vertex colours from the theme palette. */
  geometry: BufferGeometry;
  /** Positions with smooth normals, for the outline hull. */
  hull: BufferGeometry;
}

// Kit models are Y-up with the front on +Z. Rotate +90° about X: up becomes +Z and the front -Y.
const Y_UP_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2);

/**
 * Load a kit GLB and turn it into one geometry with vertex colours. Each material is named by a
 * palette key and coloured through the theme (theme.models.palette, then the manifest palette),
 * so themes recolour the kit without new GLBs.
 */
export async function loadModel(
  url: string,
  manifest: Manifest,
  theme: Theme,
): Promise<LoadedModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const name = material?.name ?? '';
    // Kit materials are palette keys, coloured through the theme. Other GLBs (e.g. a model set
    // with setCategoryModel) keep their own material colour.
    const hex = theme.models.palette[name] ?? manifest.palette[name] ?? ownColour(material);
    // Kit GLBs carry no normals. De-index so every face gets its own flat normal (crisp toy
    // faces), rather than normals smoothed across shared corners.
    const src = new BufferGeometry();
    src.setAttribute('position', mesh.geometry.getAttribute('position'));
    if (mesh.geometry.index) src.setIndex(mesh.geometry.index);
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(mesh.matrixWorld);
    g.computeVertexNormals();
    const count = g.getAttribute('position').count;
    const colors = new Uint8Array(count * 3);
    const [r, gg, b] = hexToRgb(hex);
    for (let i = 0; i < count; i++) colors.set([r, gg, b], i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3, true));
    const glow = new Uint8Array(count).fill(theme.models.glow.includes(name) ? 255 : 0);
    g.setAttribute('aGlow', new BufferAttribute(glow, 1, true));
    parts.push(g);
  });
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error(`could not merge ${url}`);
  geometry.applyMatrix4(Y_UP_TO_Z_UP);
  geometry.computeBoundingSphere();

  // The hull welds coincident corners back together so its normals are smooth; pushed out
  // along them, the hull has no cracks at edges.
  const positionsOnly = new BufferGeometry();
  positionsOnly.setAttribute('position', geometry.getAttribute('position'));
  const hull = mergeVertices(positionsOnly, 1e-4);
  hull.computeVertexNormals();
  for (const p of parts) p.dispose();
  return { geometry, hull };
}

/** A glTF material's base colour as sRGB hex, or magenta if it has none. */
function ownColour(material: Material | undefined): string {
  const c = (material as MeshStandardMaterial | undefined)?.color;
  return c ? `#${c.getHexString(SRGBColorSpace).toUpperCase()}` : '#FF00FF';
}
