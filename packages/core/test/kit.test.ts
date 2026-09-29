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

function glbFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return glbFiles(p);
    return f.endsWith('.glb') ? [relative(MODELS, p)] : [];
  });
}

interface Gltf {
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
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

  it('lists every GLB on disk, and nothing else', () => {
    const listed = entries.map(([, m]) => m.file).sort();
    expect(glbFiles(MODELS).sort()).toEqual(listed);
  });

  describe.each(entries)('%s', (_name, model) => {
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
