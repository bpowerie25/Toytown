# Rendering: toon shading, hero models and trees

```ts
const toy = new ToyTown({
  data: '/data/waterford.geojson',
  models: '/models/manifest.json', // optional: without it, only procedural buildings are drawn
  theme, // optional, defaults to the built-in theme
}).addTo(map);
await toy.ready; // buildings meshed and the models in view drawn
```

| Waterford z17               | Waterford z18.3               |
| --------------------------- | ----------------------------- |
| ![](toon/waterford-z17.png) | ![](toon/waterford-z18.3.png) |
| **Tramore z17**             | **Tramore z18.3**             |
| ![](toon/tramore-z17.png)   | ![](toon/tramore-z18.3.png)   |

## The layer

`ToyTownLayer` is a MapLibre custom layer (`renderingMode: '3d'`) that renders one three.js scene
in MapLibre's WebGL context, sharing its depth buffer. It sits under the first symbol layer and
hides the style's flat `toytown-base-buildings` layer while it draws.

- **Scene frame** (`SceneFrame`): everything is in metres east/north/up from the data's centre, on
  MapLibre's spherical earth. Float32 keeps about 1 mm of precision across a whole city in this
  frame.
- **Camera**: each frame, the camera's projection matrix is MapLibre's
  `defaultProjectionData.mainMatrix` (mercator [0, 1] to clip space) × the frame's
  scene-to-mercator transform, multiplied on the CPU in float64. The camera's world matrix is the
  identity. This means standard three.js materials, lights, `InstancedMesh` and frustum culling
  (per chunk) all work unchanged.
- **Chunks** are meshed in their own local metres and placed in the frame with a tiny uniform
  scale for the latitude difference.
- **Globe projection**: 3D only draws in mercator. With `projection: globe`, MapLibre blends to
  mercator as you zoom in (`projectionTransition` reaches 0 at around z12). Until then the layer
  draws nothing and turns the flat base buildings back on.

## Toon shading

- **Materials**: `MeshToonMaterial` with a 3-step gradient map (`lighting.toonSteps`, default 0,
  0.5, 1), one directional sun and ambient light. three's Lambert term divides by π, so the lights
  are scaled by π. A face's brightness is then `ambient + sun × step`: 0.7, 0.85 or 1.0 with the
  defaults. Faces towards the sun show the exact palette hex, because colours are sRGB used as-is
  and the renderer does no output colour-space conversion.
- **Procedural buildings** use the same toon material, extended in `onBeforeCompile`:
  - **Windows**: the phase 3 window strips, drawn from per-vertex wall coordinates.
  - **Ink edges** (`#2B2D42`): each face carries barycentric edge coordinates. Quads flag their
    diagonal (the `y` channel, shared by both ends of the diagonal) so it's skipped. The line width
    comes from `fwidth`, so it's constant in pixels (`outline.edgeWidth`). The `smoothstep` upper
    edge is clamped above 0, because constant channels have `fwidth` 0 and GLSL's smoothstep is
    undefined for equal edges.
  - **Distance fade**: from `outline.fadeStart` to `fadeEnd` (metres per pixel), ink fades out and
    windows blend into their average coverage. This removes the z16 moiré from phase 3.
- **Hero models, props and trees**: `MeshToonMaterial` with vertex colours. Each GLB material is
  named by a palette key, and its colour comes from `theme.models.palette`, then the manifest
  palette, so a theme recolours the whole kit without new GLBs. The GLBs have no normals; the
  loader de-indexes them and computes flat normals for crisp faces.
- **Model outlines**: an inverted hull. A second `InstancedMesh` shares the instance matrices and
  draws back faces pushed out `outline.hullWidth` (0.12 m) along smooth, welded normals, in the
  ink colour.

## Placement: fit, decorate, point

Planning is pure and runs in the chunk workers, before meshing (`packages/core/src/placement.ts`).

- **fit**: a building gets its category's hero model instead of procedural geometry when all of
  these hold:
  - the category has a model and isn't in `models.exclude`;
  - the building has a `front`, and is a single part without holes;
  - it fills at least `fit.minRectangularity` (0.75) of its minimum rectangle;
  - its frontage:depth ratio matches the model's width:depth within `fit.aspectTolerance`
    (0.4, a natural-log ratio). Frontage is measured across the front, so a long building facing
    its short side doesn't get a wide model;
  - the uniform scale `√(footprint area ÷ model area)` is within `fit.minScale`–`fit.maxScale`
    (0.6–1.6).

  The model sits at the footprint centroid, scaled uniformly and turned so its +Z front faces the
  building's `front` bearing. For categories with variants (house, shop and apartment), a stable
  hash of the OSM id picks the base model or one of its variants first, and fit uses that look's
  footprint, so neighbouring houses differ. Categories named `landmark_*` always fit, with the scale clamped.

- **decorate**: otherwise the procedural building stays and gets its category's props from the
  manifest's `props`:

  | Prop        | For            | Attaches                                                        |
  | ----------- | -------------- | --------------------------------------------------------------- |
  | `awning`    | shop, cafe     | front wall at 2.4 m, scaled to 70% of the frontage              |
  | `red_cross` | hospital       | front wall, just under the eaves                                |
  | `spire`     | church         | tower and spire centred on the front wall line, from the ground |
  | `canopy`    | petrol_station | on the ground, 6 m in front of the front wall                   |

  Eave heights come from the same roof decision the mesher makes.

- **point**: POI nodes outside any footprint (from build-data, with a street-facing `front`) get
  their model when its footprint circle is clear of every building and every other point model.
- **Trees**: every tree point gets the tree model, rotated and sized (0.8–1.25×) by a hash of its
  id, or sized from a tagged `height`.

In Waterford, 9,561 of the 26,870 buildings fit a hero model (mostly houses), 296 buildings get
awnings and 27 get spires, and there are 3,839 trees.

## Instancing, lazy loading and levels of detail

There is one `InstancedMesh` per model, variant or prop (plus its hull), filled only with the
instances in visible, loaded chunks. Models load lazily, the first time one of their instances is
in view. Chunks are meshed lazily and freed when out of view; what's drawn depends on zoom. See
[performance.md](performance.md) for the levels, culling and measurements.

Chunks are added and instances filled in a fixed order (chunk key, then model name and id), so
overlapping geometry always draws the same way, whatever order the workers finish in.
