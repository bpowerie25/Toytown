import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { geojson as fgb } from 'flatgeobuf';
import type { Feature, ToyTownCollection } from './pipeline';

async function write(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/** Compact GeoJSON: one line, no whitespace. */
export async function writeGeoJson(path: string, fc: ToyTownCollection): Promise<number> {
  const text = JSON.stringify(fc);
  await write(path, text);
  return Buffer.byteLength(text);
}

/**
 * FlatGeobuf. It needs one fixed column schema, taken from the first feature, and has no nulls:
 * unknown numbers are written as -1 and a missing name as "".
 */
export function toFlatGeobuf(fc: ToyTownCollection): Uint8Array {
  const features = fc.features.map((f: Feature) => {
    const p = f.properties as unknown as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' ? v : -1);
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: p.id as string,
        category: p.category as string,
        height: num(p.height),
        levels: num(p.levels),
        orientation: num(p.orientation),
        front: num(p.front),
        name: typeof p.name === 'string' ? p.name : '',
      },
    };
  });
  return fgb.serialize({ type: 'FeatureCollection', features } as never);
}

export async function writeFlatGeobuf(path: string, fc: ToyTownCollection): Promise<number> {
  const bytes = toFlatGeobuf(fc);
  await write(path, bytes);
  return bytes.length;
}
