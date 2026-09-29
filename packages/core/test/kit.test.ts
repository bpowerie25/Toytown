/**
 * Checks the bundled model kit in assets/models: the manifest parses, every GLB
 * exists, passes the Khronos glTF validator, and follows the kit conventions.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateBytes } from 'gltf-validator';
import { parseManifest } from '../src/manifest';

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const manifest = parseManifest(JSON.parse(readFileSync(join(MODELS, 'manifest.json'), 'utf8')));
const entries = Object.entries(manifest.models);
const props = Object.entries(manifest.props ?? {});
const variants = entries.flatMap(([base, m]) =>
  (m.variants ?? []).map((v) => [v.name, { ...v, base }] as const),
);
/** Every model and variant, with its manifest data. */
const looks = [...entries.map(([n, m]) => [n, m] as const), ...variants];

function glbFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return glbFiles(p);
    return f.endsWith('.glb') ? [relative(MODELS, p)] : [];
  });
}

function triangles(gltf: Gltf): number {
  return gltf.meshes.reduce(
    (n, m) =>
      n + m.primitives.reduce((k, p) => k + (gltf.accessors[p.indices!]!.count ?? 0) / 3, 0),
    0,
  );
}

/** Mean Z of the vertices of the mesh whose material is "door", or null if there's none. */
function doorCentreZ(gltf: Gltf, bytes: Uint8Array): number | null {
  const doc = gltf as Gltf & {
    nodes?: { mesh?: number }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
    meshes: { primitives: { attributes: { POSITION: number }; material?: number }[] }[];
  };
  const doorIndex = (doc.materials ?? []).findIndex((m) => m.name === 'door');
  if (doorIndex < 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.getUint32(12, true);
  const binStart = 20 + jsonLen + 8;
  let sum = 0;
  let n = 0;
  for (const mesh of doc.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.material !== doorIndex) continue;
      const acc = doc.accessors[prim.attributes.POSITION]! as {
        bufferView?: number;
        byteOffset?: number;
        count?: number;
      };
      const bv = doc.bufferViews[acc.bufferView!]!;
      const base = binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      for (let i = 0; i < acc.count!; i++) {
        sum += view.getFloat32(base + i * 12 + 8, true);
        n++;
      }
    }
  }
  return n ? sum / n : null;
}

interface Gltf {
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
  accessors: { min?: number[]; max?: number[]; count?: number }[];
}

function readGlbJson(bytes: Uint8Array): Gltf {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as Gltf;
}

describe('model kit', () => {
  it('has the starter set of 31 models', () => {
    expect(entries).toHaveLength(31);
  });

  it('has the four decorate props, each for categories that have models', () => {
    expect(props.map(([n]) => n).sort()).toEqual(['awning', 'canopy', 'red_cross', 'spire']);
    for (const [, p] of props)
      for (const c of p.categories) expect(manifest.models).toHaveProperty(c);
  });

  it('lists every GLB on disk, and nothing else', () => {
    const listed = [...looks, ...props].map(([, m]) => m.file).sort();
    expect(glbFiles(MODELS).sort()).toEqual(listed);
  });

  describe.each(props)('prop %s', (_name, prop) => {
    const bytes = new Uint8Array(readFileSync(join(MODELS, prop.file)));
    const gltf = readGlbJson(bytes);

    it('passes the glTF validator with no errors', async () => {
      const report = await validateBytes(bytes, { uri: prop.file, maxIssues: 50 });
      expect(report.issues.messages.filter((m) => m.severity === 0)).toEqual([]);
    });

    it('stays within the 300-triangle prop budget', () => {
      expect(triangles(gltf)).toBeLessThanOrEqual(300);
    });

    it('has one material per palette key, matching the manifest', () => {
      const names = (gltf.materials ?? []).map((m) => m.name ?? '');
      expect(names.sort()).toEqual([...prop.materials].sort());
    });
  });

  it('records the provenance and licence of every GLB in LICENSES.md', () => {
    const licences = readFileSync(join(MODELS, 'LICENSES.md'), 'utf8');
    const rows = new Map(
      [...licences.matchAll(/^\|\s*`([^`]+)`\s*\|.*\|\s*([\w.-]+)\s*\|\s*$/gm)].map((m) => [
        m[1]!,
        m[2]!,
      ]),
    );
    for (const f of glbFiles(MODELS)) expect(['CC0-1.0', 'CC-BY-4.0'], f).toContain(rows.get(f));
  });

  it('has 2 extra variants for house, shop and apartment', () => {
    for (const c of ['house', 'shop', 'apartment'])
      expect(manifest.models[c]!.variants, c).toHaveLength(2);
  });

  describe.each(looks)('%s', (_name, model) => {
    const bytes = new Uint8Array(readFileSync(join(MODELS, model.file)));

    it('passes the glTF validator with no errors', async () => {
      const report = await validateBytes(bytes, { uri: model.file, maxIssues: 50 });
      const errors = report.issues.messages.filter((m) => m.severity === 0);
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    });

    it('has one material per palette key, matching the manifest', () => {
      const names = (readGlbJson(bytes).materials ?? []).map((m) => m.name ?? '');
      expect(names.sort()).toEqual([...model.materials].sort());
      for (const n of names) expect(manifest.palette).toHaveProperty(n);
    });

    it('stores palette colours as linear baseColorFactor (glTF spec)', () => {
      const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      for (const m of readGlbJson(bytes).materials ?? []) {
        const hex = manifest.palette[m.name ?? '']!;
        const expected = [1, 3, 5].map((i) =>
          srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255),
        );
        const factor = m.pbrMetallicRoughness?.baseColorFactor ?? [];
        expected.forEach((e, i) => expect(factor[i], `${m.name} channel ${i}`).toBeCloseTo(e, 4));
      }
    });

    it('stays within the 2,000-triangle model budget', () => {
      expect(triangles(readGlbJson(bytes))).toBeLessThanOrEqual(2000);
    });

    it('is in metres: a plausible building size', () => {
      const [w, d] = model.footprint_m;
      expect(model.height_m).toBeGreaterThan(2);
      expect(model.height_m).toBeLessThan(60);
      for (const v of [w, d]) {
        expect(v).toBeGreaterThan(1);
        expect(v).toBeLessThan(60);
      }
    });

    it('faces +Z: any door is on the front half', () => {
      const z = doorCentreZ(readGlbJson(bytes), bytes);
      if (z !== null) expect(z).toBeGreaterThan(0);
    });

    it('sits on the ground (min Y = 0) with its origin at the base centre', () => {
      const gltf = readGlbJson(bytes);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
          const acc = gltf.accessors[prim.attributes.POSITION]!;
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i]!, acc.min![i]!);
            max[i] = Math.max(max[i]!, acc.max![i]!);
          }
        }
      }
      expect(min[1]).toBeCloseTo(0, 3);
      expect(max[1]).toBeCloseTo(model.height_m, 0);
      // Origin at base centre: bounding box roughly centred on x and z.
      // Tolerance is a fraction of the footprint because asymmetric details (chimneys, signs) shift the bounds.
      const [w, d] = model.footprint_m;
      expect(Math.abs((min[0]! + max[0]!) / 2)).toBeLessThanOrEqual(w * 0.25);
      expect(Math.abs((min[2]! + max[2]!) / 2)).toBeLessThanOrEqual(d * 0.25);
    });
  });
});
