import { describe, expect, it } from 'vitest';
import { ManifestError, parseManifest } from '../src/manifest';

const valid = () => ({
  version: 1,
  units: 'metres',
  up: '+Y',
  front: '+Z',
  palette: { wall: '#F4E9D8', roof: '#D9644A' },
  models: {
    house: {
      file: 'generic/house.glb',
      pack: 'generic',
      osm_tags: ['building=house'],
      materials: ['wall', 'roof'],
      footprint_m: [8.6, 7.8],
      height_m: 8.7,
    },
  },
});

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const m = parseManifest(valid());
    expect(m.models.house?.footprint_m).toEqual([8.6, 7.8]);
  });

  it.each([
    ['wrong version', (m: ReturnType<typeof valid>) => Object.assign(m, { version: 2 })],
    ['wrong up axis', (m: ReturnType<typeof valid>) => Object.assign(m, { up: '+Z' })],
    ['non-hex palette colour', (m: ReturnType<typeof valid>) => (m.palette.wall = 'cream')],
    ['unknown material', (m: ReturnType<typeof valid>) => m.models.house.materials.push('gold')],
    ['bad footprint', (m: ReturnType<typeof valid>) => (m.models.house.footprint_m = [8, -1])],
    ['non-glb file', (m: ReturnType<typeof valid>) => (m.models.house.file = 'house.obj')],
  ])('rejects %s', (_, mutate) => {
    const m = valid();
    mutate(m);
    expect(() => parseManifest(m)).toThrow(ManifestError);
  });
});
