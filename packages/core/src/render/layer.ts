import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  DirectionalLight,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  Quaternion,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Sphere,
} from 'three';
import { parseChunkKey, type ChunkMesh, type LngLat } from '../geometry';
import { kitFiles, type Manifest } from '../manifest';
import type { Placement, PlannedBuilding } from '../placement';
import { setBaseBuildingsVisible } from '../style';
import type { Theme } from '../themes';
import { SceneFrame } from './frame';
import {
  chunkSphere,
  chunksToDispose,
  DEFAULT_LOD,
  lodLevel,
  type LodLevel,
  type LodOptions,
} from './lod';
import { loadModel, type LoadedModel } from './models';
import type { ChunkResult } from './protocol';
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

/** A chunk of the town: its buildings, and the other placements (points, trees) in its tile. */
export interface ChunkInput {
  key: string;
  origin: LngLat;
  buildings: PlannedBuilding[];
  /** Placements not planned by the chunk worker (points, trees) that belong to this chunk. */
  extras: Placement[];
}

interface ChunkSlot extends ChunkInput {
  sphere: Sphere;
  state: 'idle' | 'loading' | 'ready';
  meshes: { full?: Mesh; fitted?: Mesh; plain?: Mesh };
  /** Instance matrices per model name, 16 floats each, precomputed at load. */
  matrices: Map<string, Float32Array>;
  /** The placements behind those matrices, in the same order (for picking). */
  placed: Map<string, Placement[]>;
  lastSeen: number;
}

interface ModelGroup {
  state: 'idle' | 'loading' | 'ready' | 'failed';
  loading?: Promise<void>;
  model?: LoadedModel;
  mesh?: InstancedMesh;
  hull?: InstancedMesh;
  capacity: number;
  count: number;
  /** Placements of the instances currently in the buffer, by instance index (for picking). */
  placed: Placement[];
}

/** What's under a point on the map. */
export interface PickHit {
  /** OSM id of the building or node (`way/123`), or a `scatter/…` id for scattered trees. */
  id: string;
  /** A procedural building, a hero model, a prop on a building, or a tree. */
  kind: 'building' | 'model' | 'prop' | 'tree';
  /** For models, props and trees: the model or prop name. */
  model?: string;
}

export type ChunkLoader = (chunk: ChunkInput) => Promise<ChunkResult>;

/**
 * MapLibre custom layer drawing the toy town with three.js in MapLibre's WebGL context (shared
 * depth buffer). Chunks load lazily as they come into view and are freed after being out of view
 * for a while. What's drawn depends on zoom (see `LodOptions`). Hero models, props and trees are
 * one `InstancedMesh` per model, holding only the instances in visible chunks.
 */
export class ToyTownLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map?: MaplibreMap;
  private renderer?: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly frustum = new Frustum();
  private readonly chunks = new Map<string, ChunkSlot>();
  private readonly groups = new Map<string, ModelGroup>();
  private readonly buildingMaterial: Material;
  private readonly modelMaterial: Material;
  private readonly hullMaterial: Material;
  private readonly lod: LodOptions;
  private frame?: SceneFrame;
  private manifest?: Manifest;
  private modelsBase = '';
  private loader?: ChunkLoader;
  private visible = new Set<string>();
  private visibleKey = '';
  private instancesDirty = true;
  private level: LodLevel = 0;
  private drawing = true;
  private baseVisible: boolean | null = null;
  private lastSweep = 0;
  private waiters: (() => void)[] = [];
  /** Exponential moving average of this layer's CPU time per frame, in ms. */
  private renderMs = 0;

  constructor(
    readonly id: string,
    private readonly theme: Theme,
    lod: Partial<LodOptions> = {},
  ) {
    this.lod = { ...DEFAULT_LOD, ...lod };
    this.buildingMaterial = createBuildingMaterial(theme);
    this.modelMaterial = createModelMaterial(theme);
    this.hullMaterial = createHullMaterial(theme);
    this.camera.matrixAutoUpdate = false;
    for (const light of createLights(theme)) {
      this.scene.add(light);
      if (light instanceof DirectionalLight) this.scene.add(light.target);
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
  }

  onRemove(): void {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    for (const g of this.groups.values()) {
      g.mesh?.dispose();
      g.hull?.dispose();
      g.model?.geometry.dispose();
      g.model?.hull.dispose();
    }
    for (const m of [this.buildingMaterial, this.modelMaterial, this.hullMaterial])
      disposeMaterial(m);
    this.chunks.clear();
    this.groups.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.map = undefined;
    this.resolveWaiters();
  }

  /** The town's chunks and how to load one. Nothing is meshed until it comes into view. */
  setData(
    frame: SceneFrame,
    chunks: ChunkInput[],
    loader: ChunkLoader,
    manifest?: Manifest,
    modelsBase = '',
  ): void {
    this.frame = frame;
    this.loader = loader;
    this.manifest = manifest;
    this.modelsBase = modelsBase;
    for (const c of chunks) {
      this.chunks.set(c.key, {
        ...c,
        sphere: chunkSphere(frame, parseChunkKey(c.key)),
        state: 'idle',
        meshes: {},
        matrices: new Map(),
        placed: new Map(),
        lastSeen: 0,
      });
    }
    this.map?.triggerRepaint();
  }

  /**
   * Resolves after a frame where everything the current view needs is loaded: visible chunks,
   * and at model zoom, the models they use.
   */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.map?.triggerRepaint();
    });
  }

  private resolveWaiters() {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private isSettled(): boolean {
    if (!this.drawing || this.level === 0) return true;
    for (const k of this.visible) if (this.chunks.get(k)!.state !== 'ready') return false;
    if (this.level === 3) {
      if (this.instancesDirty) return false;
      for (const g of this.groups.values()) if (g.count > 0 && g.state === 'loading') return false;
    }
    return true;
  }

  private readonly raycaster = new Raycaster();

  /**
   * What's drawn under a point, in CSS pixels from the map canvas's top-left corner. Uses the
   * camera of the last frame. Null if nothing (or only the base map) is there.
   */
  pick(x: number, y: number): PickHit | null {
    if (!this.map || !this.drawing || this.level === 0) return null;
    const canvas = this.map.getCanvas();
    const nx = (x / canvas.clientWidth) * 2 - 1;
    const ny = 1 - (y / canvas.clientHeight) * 2;
    const inv = this.camera.projectionMatrixInverse;
    const near = new Vector3(nx, ny, -1).applyMatrix4(inv);
    const far = new Vector3(nx, ny, 1).applyMatrix4(inv);
    this.raycaster.ray.set(near, far.sub(near).normalize());
    const targets: (Mesh | InstancedMesh)[] = [];
    for (const k of this.visible) {
      for (const m of Object.values(this.chunks.get(k)!.meshes)) if (m?.visible) targets.push(m);
    }
    for (const g of this.groups.values()) if (g.mesh?.visible && g.count) targets.push(g.mesh);
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      const obj = hit.object as Mesh;
      if ((obj as InstancedMesh).isInstancedMesh) {
        const g = [...this.groups.values()].find((x) => x.mesh === obj);
        const p = g?.placed[hit.instanceId ?? -1];
        if (p) return { id: p.id, kind: p.kind === 'model' ? 'model' : p.kind, model: p.name };
      } else if (hit.face) {
        const index = (obj.geometry.getAttribute('aBuilding') as BufferAttribute).getX(hit.face.a);
        const id = (obj.userData.ids as string[])[index];
        if (id) return { id, kind: 'building' };
      }
    }
    return null;
  }

  /** Forget every chunk and model (e.g. after the kit or theme changes); they reload lazily. */
  clear(): void {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    for (const g of this.groups.values()) {
      if (g.mesh) this.scene.remove(g.mesh, g.hull!);
      g.mesh?.dispose();
      g.hull?.dispose();
      g.model?.geometry.dispose();
      g.model?.hull.dispose();
    }
    this.groups.clear();
    this.visible = new Set();
    this.visibleKey = '';
    this.instancesDirty = true;
  }

  private meshFrom(m: ChunkMesh, name: string): Mesh | undefined {
    if (!m.indices.length || !this.frame) return undefined;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new BufferAttribute(m.normals, 3, true));
    g.setAttribute('color', new BufferAttribute(m.colors, 3, true));
    g.setAttribute('aWall', new BufferAttribute(m.walls, 4));
    g.setAttribute('aEdge', new BufferAttribute(m.edges, 4, true));
    g.setAttribute('aWin', new BufferAttribute(m.windows, 4, true));
    g.setAttribute('aBuilding', new BufferAttribute(m.buildings, 1));
    g.setIndex(new BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.buildingMaterial);
    this.frame.toScene(m.origin, 0, mesh.position);
    mesh.scale.setScalar(this.frame.localScale(m.origin[1]));
    mesh.name = name;
    mesh.userData.ids = m.ids;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  private loadChunk(c: ChunkSlot): void {
    if (!this.loader || c.state !== 'idle') return;
    c.state = 'loading';
    this.loader(c).then(
      (r) => {
        if (!this.renderer || c.state !== 'loading') return; // removed meanwhile
        c.meshes = {
          full: this.meshFrom(r.full, `full ${c.key}`),
          fitted: this.meshFrom(r.fitted, `fitted ${c.key}`),
          plain: this.meshFrom(r.plain, `plain ${c.key}`),
        };
        const byName = new Map<string, Placement[]>();
        for (const p of [...r.placements, ...c.extras]) {
          const list = byName.get(p.name);
          if (list) list.push(p);
          else byName.set(p.name, [p]);
        }
        const m = new Matrix4();
        for (const [name, list] of byName) {
          const arr = new Float32Array(list.length * 16);
          list.forEach((p, i) => instanceMatrix(this.frame!, p, m).toArray(arr, i * 16));
          c.matrices.set(name, arr);
          c.placed.set(name, list);
        }
        c.state = 'ready';
        this.instancesDirty = true;
        this.map?.triggerRepaint();
      },
      (e: unknown) => {
        c.state = 'idle';
        console.error(`[toytown-gl] failed to load chunk ${c.key}`, e);
      },
    );
  }

  private disposeChunk(c: ChunkSlot): void {
    for (const m of Object.values(c.meshes)) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
    }
    c.meshes = {};
    c.matrices.clear();
    c.placed.clear();
    c.state = 'idle';
  }

  private loadGroup(name: string, g: ModelGroup): void {
    const entry = this.manifest && kitFiles(this.manifest).get(name);
    if (!entry || g.loading) return;
    g.state = 'loading';
    g.loading = loadModel(
      new URL(entry.file, this.modelsBase).href,
      this.manifest!,
      this.theme,
    ).then(
      (model) => {
        g.model = model;
        g.state = 'ready';
        this.instancesDirty = true;
        this.map?.triggerRepaint();
      },
      (e: unknown) => {
        g.state = 'failed';
        console.error(`[toytown-gl] failed to load model "${name}"`, e);
        this.map?.triggerRepaint();
      },
    );
  }

  /** Grow (or create) a group's instanced meshes to hold at least `count` instances. */
  private ensureCapacity(name: string, g: ModelGroup, count: number): void {
    if (!g.model || (g.mesh && g.capacity >= count)) return;
    const capacity = Math.max(16, Math.ceil(count * 1.25));
    if (g.mesh) {
      this.scene.remove(g.mesh, g.hull!);
      g.mesh.dispose();
      g.hull!.dispose();
    }
    const mesh = new InstancedMesh(g.model.geometry, this.modelMaterial, capacity);
    const hull = new InstancedMesh(g.model.hull, this.hullMaterial, capacity);
    hull.instanceMatrix = mesh.instanceMatrix; // same transforms, shared buffer
    // Instances are culled per chunk before upload; three's whole-mesh culling doesn't apply.
    mesh.frustumCulled = hull.frustumCulled = false;
    mesh.name = hull.name = `model ${name}`;
    g.mesh = mesh;
    g.hull = hull;
    g.capacity = capacity;
    this.scene.add(hull, mesh);
  }

  /** Rebuild every model's instance buffer from the visible, loaded chunks. */
  private rebuildInstances(): void {
    const counts = new Map<string, number>();
    for (const k of this.visible) {
      const c = this.chunks.get(k)!;
      if (c.state !== 'ready') continue;
      for (const [name, arr] of c.matrices)
        counts.set(name, (counts.get(name) ?? 0) + arr.length / 16);
    }
    for (const name of counts.keys()) {
      if (!this.groups.has(name))
        this.groups.set(name, { state: 'idle', capacity: 0, count: 0, placed: [] });
    }
    for (const [name, g] of this.groups) {
      const count = counts.get(name) ?? 0;
      g.count = count;
      if (count && g.state === 'idle') this.loadGroup(name, g);
      if (g.state !== 'ready') continue;
      this.ensureCapacity(name, g, count);
      const mesh = g.mesh!;
      const dst = mesh.instanceMatrix.array as Float32Array;
      let offset = 0;
      g.placed = [];
      for (const k of this.visible) {
        const c = this.chunks.get(k)!;
        const arr = c.state === 'ready' ? c.matrices.get(name) : undefined;
        if (!arr) continue;
        dst.set(arr, offset);
        offset += arr.length;
        g.placed.push(...c.placed.get(name)!);
      }
      mesh.count = g.hull!.count = count;
      (mesh.instanceMatrix as InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /** Counts for the debug overlay and tests. */
  stats() {
    let ready = 0;
    for (const c of this.chunks.values()) if (c.state === 'ready') ready++;
    const instances: Record<string, { visible: number; state: string }> = {};
    let visibleInstances = 0;
    for (const [k, g] of this.groups) {
      instances[k] = { visible: g.count, state: g.state };
      if (g.state === 'ready' && this.level === 3) visibleInstances += g.count;
    }
    return {
      level: this.level,
      drawing: this.drawing,
      chunks: { total: this.chunks.size, ready, visible: this.visible.size },
      visibleInstances,
      instances,
      calls: this.renderer?.info.render.calls ?? 0,
      triangles: this.renderer?.info.render.triangles ?? 0,
      renderMs: Math.round(this.renderMs * 100) / 100,
    };
  }

  private setBaseVisible(visible: boolean) {
    if (visible === this.baseVisible || !this.map) return;
    this.baseVisible = visible;
    const map = this.map;
    setTimeout(() => setBaseBuildingsVisible(map, visible), 0); // don't change the style mid-frame
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.renderer || !this.frame || !this.map) return;
    const t0 = performance.now();
    this.drawing = shouldDraw3D(args.defaultProjectionData.projectionTransition);
    const zoom = this.map.getZoom();
    this.level = lodLevel(zoom, this.lod);
    this.setBaseVisible(!this.drawing || this.level === 0);
    if (!this.drawing || this.level === 0) {
      this.resolveWaiters();
      return;
    }

    this.frame.projection(args.defaultProjectionData.mainMatrix, this.camera.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.frustum.setFromProjectionMatrix(this.camera.projectionMatrix);

    // Which chunks are in view; start loading the ones that aren't yet.
    const now = performance.now();
    const visible = new Set<string>();
    for (const c of this.chunks.values()) {
      if (!this.frustum.intersectsSphere(c.sphere)) continue;
      visible.add(c.key);
      c.lastSeen = now;
      if (c.state === 'idle') this.loadChunk(c);
    }
    const visibleKey = [...visible].sort().join(',');
    if (visibleKey !== this.visibleKey) {
      this.visible = visible;
      this.visibleKey = visibleKey;
      this.instancesDirty = true;
    }

    // Free chunks that have been out of view for a while.
    if (now - this.lastSweep > 2000) {
      this.lastSweep = now;
      for (const k of chunksToDispose(this.chunks.values(), this.visible, now, this.lod.keepMs)) {
        this.disposeChunk(this.chunks.get(k)!);
        this.instancesDirty = true;
      }
    }

    // Level of detail.
    const models = this.level === 3;
    for (const c of this.chunks.values()) {
      const { full, fitted, plain } = c.meshes;
      if (plain) plain.visible = this.level === 1;
      if (full) full.visible = this.level >= 2;
      if (fitted) fitted.visible = this.level === 2;
    }
    if (models && this.instancesDirty) {
      this.instancesDirty = false;
      this.rebuildInstances();
    }
    for (const g of this.groups.values()) {
      if (g.mesh) g.mesh.visible = models;
      if (g.hull) g.hull.visible = models && zoom >= this.lod.outlineZoom;
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderMs = this.renderMs * 0.9 + (performance.now() - t0) * 0.1;
    if (this.waiters.length && this.isSettled()) this.resolveWaiters();
  }
}
