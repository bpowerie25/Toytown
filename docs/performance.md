# Performance

**Budget (PLAN.md):** 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone, for
full Waterford City (26,870 buildings) at zoom 16, pitch 60.

## Levels of detail

| Zoom  | What's drawn                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| < 14  | The base style only, with its flat 2D buildings. The 3D layer draws nothing.                                                |
| 14–15 | Plain extrusions of every footprint: no windows, bevels, parapets or roof shapes. The top takes the building's roof colour. |
| 15–16 | Full procedural buildings, including those that hero models replace at the next level.                                      |
| ≥ 16  | Full procedural buildings plus hero models, props and trees.                                                                |
| ≥ 17  | Also the inverted-hull outlines on models; below z17 they'd be under a pixel wide.                                          |

The thresholds are `new ToyTown({ lod: { minZoom, fullZoom, modelZoom, outlineZoom, keepMs } })`.

- **Chunks** are z15 tiles, 112 of them for Waterford. They're meshed lazily in Web Workers when
  their bounding sphere enters the view frustum, at all three detail levels at once (plain, full,
  and the buildings models replace).
- **Freeing memory**: a chunk out of view for `keepMs` (20 s) has its GPU buffers disposed, and is
  re-meshed if it comes back.
- **Culling**: procedural chunk meshes are frustum-culled by three.js. Model instances are culled
  per chunk: each model's `InstancedMesh` is rebuilt from the visible, loaded chunks' precomputed
  matrices, and only when the visible set changes.

## Debug overlay

`new ToyTown({ debug: true })`, or `?debug` on the examples, shows FPS, zoom, the detail level,
three.js draw calls and triangles, visible and loaded chunks, visible instances, and the layer's
CPU time per frame.

## How it's measured

```sh
pnpm build
PERF=1 PERF_LABEL=lod npx playwright test perf   # results in .cache/perf/*.json
```

`e2e/perf.spec.ts` drives the installed Google Chrome with the real GPU and **vsync off**
(`--disable-gpu-vsync --disable-frame-rate-limit`), so frame rates show headroom above 60 Hz. It
loads Waterford, moves to z16, pitch 60 over the city centre (-7.1105, 52.2605), waits for
everything in view to load, then rotates the camera continuously for 8 s, measuring frame times
with `requestAnimationFrame`.

- **laptop**: 1440×900 at 2× DPR.
- **phone-cpu4x**: 390×844 at 3× DPR, with Chrome's CPU throttled 4×. The GPU can't be throttled,
  so this approximates a phone's CPU cost, not its GPU.

## Results (2026-09-29)

Machine: **Apple M5** (10-core GPU, ANGLE Metal), Chrome 154. This is well above a mid-range
laptop, so treat the frame rates as an upper bound. The draw calls and triangles are the numbers
that carry over to other hardware.

| Build             | Profile     | fps |    p50 |    p95 | Draw calls | Triangles in view | Instances in view | Chunks loaded / in view |
| ----------------- | ----------- | --: | -----: | -----: | ---------: | ----------------: | ----------------: | ----------------------- |
| Phase 4b (no LOD) | laptop      | 274 | 3.7 ms | 4.9 ms |         73 |                 – |      16,371 (all) | 110 / 110 (all)         |
| Phase 5 (LOD)     | laptop      | 513 | 2.5 ms | 3.2 ms |         46 |            2.02 M |             7,596 | 54 / 18                 |
| Phase 4b (no LOD) | phone-cpu4x | 317 | 3.0 ms | 5.9 ms |         67 |                 – |            16,308 | 110 / 110               |
| Phase 5 (LOD)     | phone-cpu4x | 644 | 1.5 ms | 2.3 ms |         39 |            0.92 M |             3,445 | 33 / 10                 |

Other numbers:

- The toy-town layer's own CPU time per frame is 0.35–0.38 ms (EMA), even with CPU throttled 4×.
- Time to first render with data (`ToyTown.ready`) is about 1.3 s.
- The JS heap is 124 MB (laptop) and 158 MB (phone viewport). It's higher than phase 4b's
  90 MB, because each loaded chunk keeps its three meshes' CPU-side arrays.

### Against the budget

- **Laptop (60 fps): met with a wide margin on this machine.** At about 2.5 ms per frame there is
  6–7× headroom. A mid-range integrated GPU (roughly a third to a fifth of this one's throughput)
  would be expected at about 100–170 fps, but that's an estimate, not a measurement.
- **Phone (30 fps): not measured on a phone.** The phone profile is under 1 M triangles in 39 draw
  calls, and the CPU side stays under 0.5 ms per frame with 4× throttling. Draw calls and CPU
  aren't the risk. A mid-range phone GPU is roughly 10× slower than this one and fill-rate bound
  at 3× DPR, which would put it at about 50–60 fps. **This still needs checking on a real
  device** (e.g. Chrome remote debugging with `?debug`).

## Known issues and next steps

- Chunk meshes keep their CPU-side arrays (heap +34–76 MB). Dropping them after GPU upload would
  save memory on phones, but phase 6's click picking will raycast against them. Revisit after
  picking, e.g. with GPU id-buffer picking.
- There's no distance-based LOD within a level: at pitch 60 the far chunks are as detailed as the
  near ones. Dropping far chunks to `plain` would cut triangles further.
- There's no device-pixel-ratio cap. On 3× phones, capping the canvas DPR at 2 is the simplest
  fill-rate win if real devices fall short.
