import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import type { ChunkMesh } from '../geometry';
import type { Manifest } from '../manifest';
import type { Placement } from '../placement';
import { setBaseBuildingsVisible } from '../style';
import type { Theme } from '../themes';
import { SceneFrame } from './frame';
import { loadModel } from './models';
import {
  createBuildingMaterial,
  createHullMaterial,
  createLights,
  createModelMaterial,
  disposeMaterial,
} from './toon';

const Z = new Vector3(0, 0, 1);

/** Instance transform: position, then yaw so the model's front (-Y after loading) faces `front`, then scale. */
export function instanceMatrix(frame: SceneFrame, p: Placement, out = new Matrix4()): Matrix4 {
  const k = frame.localScale(p.position[1]);
  const pos = frame.toScene(p.position, p.z);
  const q = new Quaternion().setFromAxisAngle(Z, Math.PI - (p.front * Math.PI) / 180);
  const s = p.scale * k;
  return out.compose(pos, q, new Vector3(s, s, s));
}

/**
 * 3D is drawn only in mercator. In globe projection MapLibre blends towards mercator as you zoom
 * in; until that blend is complete (transition 0) the layer draws nothing and the flat base
 * buildings show instead.
 */
export function shouldDraw3D(projectionTransition: number | undefined): boolean {
  return !projectionTransition || projectionTransition <= 1e-4;
}

interface Group {
  placements: Placement[];
  state: 'idle' | 'loading' | 'ready' | 'failed';
  meshes: InstancedMesh[];
  /** The in-flight or finished load, so every caller can wait for it. */
  loading?: Promise<void>;
}

/**
 * MapLibre custom layer drawing the toy town with three.js in MapLibre's WebGL context (shared
 * depth buffer): procedural building chunks plus instanced hero models, props and trees.
 */
export class ToyTownLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map?: MaplibreMap;
  private renderer?: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly chunks = new Map<string, Mesh>();
  private readonly groups = new Map<string, Group>();
  private readonly buildingMaterial: Material;
  private readonly modelMaterial: Material;
  private readonly hullMaterial: Material;
  private frame?: SceneFrame;
  private manifest?: Manifest;
  private modelsBase = '';
  private drawing = true;
  private readonly onMoveEnd = () => void this.loadVisible();

  constructor(
    readonly id: string,
    private readonly theme: Theme,
  ) {
    this.buildingMaterial = createBuildingMaterial(theme);
    this.modelMaterial = createModelMaterial(theme);
    this.hullMaterial = createHullMaterial(theme);
    this.camera.matrixAutoUpdate = false;
    for (const light of createLights(theme)) {
      this.scene.add(light);
      if ('target' in light) this.scene.add(light.target);
    }
  }

  onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
    });
    this.renderer.autoClear = false;
    // Theme colours are sRGB already; don't convert on output.
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    map.on('moveend', this.onMoveEnd);
  }

  onRemove(): void {
    this.map?.off('moveend', this.onMoveEnd);
    for (const m of this.chunks.values()) m.geometry.dispose();
    for (const g of this.groups.values()) for (const m of g.meshes) m.dispose();
    for (const m of [this.buildingMaterial, this.modelMaterial, this.hullMaterial])
      disposeMaterial(m);
    this.chunks.clear();
    this.groups.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.map = undefined;
  }

  setFrame(frame: SceneFrame): void {
    this.frame = frame;
  }

  addChunk(key: string, m: ChunkMesh): void {
    if (!m.indices.length || !this.frame) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new BufferAttribute(m.normals, 3, true));
    g.setAttribute('color', new BufferAttribute(m.colors, 3, true));
    g.setAttribute('aWall', new BufferAttribute(m.walls, 4));
    g.setAttribute('aEdge', new BufferAttribute(m.edges, 4, true));
    g.setAttribute('aBuilding', new BufferAttribute(m.buildings, 1));
    g.setIndex(new BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.buildingMaterial);
    this.frame.toScene(m.origin, 0, mesh.position);
    mesh.scale.setScalar(this.frame.localScale(m.origin[1]));
    mesh.name = `chunk ${key}`;
    this.chunks.set(key, mesh);
    this.scene.add(mesh);
    this.map?.triggerRepaint();
  }

  /** Hero models, props and trees. Models load lazily when a placement is in view. */
  setPlacements(placements: Placement[], manifest: Manifest, modelsBase: string): void {
    this.manifest = manifest;
    this.modelsBase = modelsBase;
    for (const p of placements) {
      let g = this.groups.get(p.name);
      if (!g) this.groups.set(p.name, (g = { placements: [], state: 'idle', meshes: [] }));
      g.placements.push(p);
    }
  }

  /**
   * Load models for the placements inside the current view. Resolves when they're drawn,
   * including loads another caller (e.g. a moveend) already started.
   */
  async loadVisible(): Promise<void> {
    const map = this.map;
    if (!map || !this.manifest) return;
    const b = map.getBounds();
    const inView = [...this.groups.entries()].filter(([, g]) =>
      g.placements.some((p) => b.contains(p.position as [number, number])),
    );
    await Promise.all(inView.map(([name, g]) => (g.loading ??= this.loadGroup(name, g))));
  }

  private async loadGroup(name: string, g: Group): Promise<void> {
    const manifest = this.manifest!;
    const entry = manifest.models[name] ?? manifest.props?.[name];
    if (!entry || !this.frame) return;
    g.state = 'loading';
    try {
      const model = await loadModel(
        new URL(entry.file, this.modelsBase).href,
        manifest,
        this.theme,
      );
      const mesh = new InstancedMesh(model.geometry, this.modelMaterial, g.placements.length);
      const hull = new InstancedMesh(model.hull, this.hullMaterial, g.placements.length);
      const m = new Matrix4();
      g.placements.forEach((p, i) => mesh.setMatrixAt(i, instanceMatrix(this.frame!, p, m)));
      hull.instanceMatrix = mesh.instanceMatrix; // same transforms, shared buffer
      mesh.computeBoundingSphere();
      hull.computeBoundingSphere();
      mesh.name = hull.name = `model ${name}`;
      g.meshes = [hull, mesh];
      this.scene.add(hull, mesh);
      g.state = 'ready';
      this.map?.triggerRepaint();
    } catch (e) {
      g.state = 'failed';
      console.error(`[toytown-gl] failed to load model "${name}"`, e);
    }
  }

  /** Counts for debugging and tests. */
  stats() {
    const instances: Record<string, { placed: number; state: string }> = {};
    for (const [k, g] of this.groups)
      instances[k] = { placed: g.placements.length, state: g.state };
    return {
      chunks: this.chunks.size,
      instances,
      calls: this.renderer?.info.render.calls ?? 0,
      drawing: this.drawing,
    };
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.renderer || !this.frame || !this.map) return;
    const draw = shouldDraw3D(args.defaultProjectionData.projectionTransition);
    if (draw !== this.drawing) {
      this.drawing = draw;
      // Don't change the style mid-frame.
      const map = this.map;
      setTimeout(() => setBaseBuildingsVisible(map, !draw), 0);
    }
    if (!draw) return;
    this.frame.projection(args.defaultProjectionData.mainMatrix, this.camera.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
