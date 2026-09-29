import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Matrix4,
  Mesh,
  Scene,
  WebGLRenderer,
  type RawShaderMaterial,
} from 'three';
import type { ChunkMesh } from '../geometry';
import type { BuildingTheme } from '../themes';
import { createBuildingMaterial } from './material';

interface ChunkObject {
  key: string;
  mesh: Mesh<BufferGeometry, RawShaderMaterial>;
  /** Local metres → mercator world units. */
  transform: Matrix4;
}

/** Convert a mesher chunk to a three.js mesh and its local→mercator transform. */
export function chunkObject(key: string, m: ChunkMesh, theme: BuildingTheme): ChunkObject {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals, 3, true));
  g.setAttribute('color', new BufferAttribute(m.colors, 3, true));
  g.setAttribute('aWall', new BufferAttribute(m.walls, 4));
  g.setAttribute('aBuilding', new BufferAttribute(m.buildings, 1));
  g.setIndex(new BufferAttribute(m.indices, 1));
  const mesh = new Mesh(g, createBuildingMaterial(theme));
  mesh.frustumCulled = false; // three's camera isn't a real camera here; MapLibre drives clipping
  mesh.matrixAutoUpdate = false;

  const mc = MercatorCoordinate.fromLngLat(m.origin, 0);
  const s = mc.meterInMercatorCoordinateUnits();
  const transform = new Matrix4()
    .makeTranslation(mc.x, mc.y, mc.z)
    .scale({ x: s, y: -s, z: s } as never);
  return { key, mesh, transform };
}

/**
 * MapLibre custom layer that draws the procedural buildings with three.js, sharing MapLibre's
 * WebGL context and depth buffer.
 */
export class BuildingLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map?: MaplibreMap;
  private renderer?: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly chunks = new Map<string, ChunkObject>();
  private readonly mvp = new Matrix4();

  constructor(
    readonly id: string,
    private readonly theme: BuildingTheme,
  ) {}

  onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
    });
    this.renderer.autoClear = false;
  }

  onRemove(): void {
    for (const c of this.chunks.values()) {
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
    }
    this.chunks.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.map = undefined;
  }

  addChunk(key: string, m: ChunkMesh): void {
    if (!m.indices.length) return;
    const c = chunkObject(key, m, this.theme);
    this.chunks.set(key, c);
    this.scene.add(c.mesh);
    this.map?.triggerRepaint();
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.renderer) return;
    // mainMatrix maps mercator [0, 1] coordinates to clip space (modelViewProjectionMatrix uses
    // pixel-sized world units). Globe projection is handled in phase 4.
    this.mvp.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    for (const c of this.chunks.values()) {
      // Combine in float64 on the CPU; only the final local-metres → clip matrix goes to the GPU.
      c.mesh.material.uniforms.uMVP!.value.multiplyMatrices(this.mvp, c.transform);
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
