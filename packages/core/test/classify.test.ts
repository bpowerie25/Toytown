import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createClassifier,
  measure,
  parseCondition,
  parseNumber,
  parseTagMap,
  TagMapError,
  type BuildingInput,
  type LandmarkPack,
  type TagMapSpec,
} from '../src/classify';
import { parseManifest } from '../src/manifest';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../assets/models');
const read = (f: string) => JSON.parse(readFileSync(join(ASSETS, f), 'utf8')) as unknown;
const manifest = parseManifest(read('manifest.json'));
const tagMapSpec = read('tag-map.json') as TagMapSpec;
const ireland = read('ireland/landmarks.json') as LandmarkPack;

describe('conditions', () => {
  const m = { area: 100, levels: 2, height: 6 };
  it.each([
    ['building=house', { building: 'house' }, true],
    ['building=house', { building: 'yes' }, false],
    ['building=house|detached', { building: 'detached' }, true],
    ['shop=*', { shop: 'bakery' }, true],
    ['shop=*', { shop: 'no' }, false],
    ['shop=*', {}, false],
    ['building!=roof|garage', { building: 'roof' }, false],
    ['building!=roof|garage', { building: 'yes' }, true],
    ['!historic', {}, true],
    ['!historic', { historic: 'monument' }, false],
    ['building:levels>=8', { 'building:levels': '8' }, true],
    ['building:levels>=8', { 'building:levels': '7' }, false],
    ['building:levels<=1', { 'building:levels': '1' }, true],
    ['building:levels>=8', {}, false],
    ['amenity=cafe', { amenity: 'restaurant;cafe' }, true],
    ['@area>=50', {}, true],
    ['@area<50', {}, false],
    ['@levels>2', {}, false],
  ])('%s on %j is %s', (cond, tags, expected) => {
    expect(parseCondition(cond)(tags as Record<string, string>, m)).toBe(expected);
  });

  it('never matches a measure that is unknown', () => {
    expect(parseCondition('@levels>=1')({}, { area: 10, levels: null, height: null })).toBe(false);
  });

  it('rejects bad conditions', () => {
    expect(() => parseCondition('@volume>3')).toThrow(/unknown measure/);
    expect(() => parseCondition('@area=3')).toThrow(/measures only/);
    expect(() => parseCondition('what')).toThrow(/cannot parse/);
  });

  it('parses numbers from tag values', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber('12.5 m')).toBe(12.5);
    expect(parseNumber('7,5')).toBe(7.5);
    expect(parseNumber('3;4')).toBe(3);
    expect(parseNumber('tall')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe('tag-map.json', () => {
  it('only uses categories from the model manifest', () => {
    const tm = parseTagMap(tagMapSpec, Object.keys(manifest.models));
    expect(tm.rules.length).toBeGreaterThan(30);
  });

  it('has a rule for every building model in the manifest', () => {
    const tm = parseTagMap(tagMapSpec);
    const notBuildings = new Set(['tree', 'landmark_metal_man']);
    for (const name of Object.keys(manifest.models)) {
      if (notBuildings.has(name)) continue;
      expect(tm.categories.has(name), name).toBe(true);
    }
  });

  it('rejects categories missing from the manifest', () => {
    const bad = {
      ...tagMapSpec,
      rules: [{ category: 'spaceport', priority: 1, when: ['building=yes'] }],
    };
    expect(() => parseTagMap(bad, Object.keys(manifest.models))).toThrow(TagMapError);
  });

  it('reports which rule has a broken condition', () => {
    const bad = { ...tagMapSpec, rules: [{ category: 'house', priority: 1, when: ['@floors>2'] }] };
    expect(() => parseTagMap(bad)).toThrow(/rules\[0\] \(house\)/);
  });

  it('landmark packs point at manifest models', () => {
    for (const l of ireland.landmarks) {
      expect(manifest.models, l.osm).toHaveProperty(l.category);
      expect(l.osm).toMatch(/^(node|way|relation)\/\d+$/);
    }
  });
});

describe('classifier', () => {
  const classify = createClassifier(parseTagMap(tagMapSpec), [ireland]);
  const b = (tags: Record<string, string>, extra: Partial<BuildingInput> = {}): BuildingInput => ({
    id: 'way/1',
    tags,
    area: 120,
    pois: [],
    ...extra,
  });
  const cat = (input: BuildingInput) => classify(input).category;

  it('uses the building’s own tags first', () => {
    expect(classify(b({ building: 'house' }))).toMatchObject({ category: 'house', via: 'tags' });
    expect(cat(b({ building: 'church' }))).toBe('church');
    expect(cat(b({ building: 'yes', amenity: 'pub' }))).toBe('pub');
    expect(cat(b({ building: 'yes', shop: 'supermarket' }))).toBe('supermarket');
    expect(cat(b({ building: 'yes', shop: 'bakery' }))).toBe('shop');
  });

  it('prefers higher-priority rules', () => {
    expect(cat(b({ building: 'apartments', 'building:levels': '10' }))).toBe('tower_block');
    expect(cat(b({ building: 'apartments', 'building:levels': '4' }))).toBe('apartment');
    expect(cat(b({ building: 'house', 'building:levels': '1' }))).toBe('bungalow');
    expect(cat(b({ building: 'tower', historic: 'monument' }))).toBe('round_tower');
  });

  it('falls back to POIs inside the footprint', () => {
    const r = classify(b({ building: 'yes' }, { pois: [{ amenity: 'cafe', name: 'X' }] }));
    expect(r).toMatchObject({ category: 'cafe', via: 'poi' });
  });

  it('picks the highest-priority POI when several are inside', () => {
    expect(
      cat(b({ building: 'yes' }, { pois: [{ shop: 'clothes' }, { amenity: 'pharmacy' }] })),
    ).toBe('pharmacy');
  });

  it('lets a POI override a weak building type', () => {
    expect(cat(b({ building: 'retail' }))).toBe('shop');
    expect(cat(b({ building: 'retail' }, { pois: [{ amenity: 'bank' }] }))).toBe('bank');
    expect(cat(b({ building: 'commercial' }, { pois: [{ amenity: 'pub' }] }))).toBe('pub');
  });

  it('does not let a POI override a strong building type', () => {
    expect(cat(b({ building: 'church' }, { pois: [{ amenity: 'cafe' }] }))).toBe('church');
  });

  it('uses footprint area in weak rules', () => {
    expect(cat(b({ building: 'retail' }, { area: 4000 }))).toBe('warehouse');
  });

  it('applies heuristics when no tags or POIs match', () => {
    expect(classify(b({ building: 'yes' }))).toMatchObject({ category: 'house', via: 'heuristic' });
    expect(cat(b({ building: 'yes', 'building:levels': '9' }, { area: 900 }))).toBe('office');
    expect(cat(b({ building: 'yes' }, { area: 5000 }))).toBe('warehouse');
  });

  it('keeps small structures generic instead of guessing', () => {
    expect(classify(b({ building: 'garage' }))).toMatchObject({ category: 'generic', via: 'tags' });
    expect(cat(b({ building: 'roof' }, { pois: [{ amenity: 'fuel' }] }))).toBe('petrol_station');
  });

  it('falls back to generic', () => {
    expect(classify(b({ building: 'yes' }, { area: 20 }))).toMatchObject({
      category: 'generic',
      via: 'fallback',
    });
  });

  it('applies landmark overrides by OSM id, before anything else', () => {
    const r = classify(b({ building: 'tower', historic: 'monument' }, { id: 'way/46694890' }));
    expect(r).toMatchObject({ category: 'landmark_metal_man', via: 'landmark' });
  });
});

describe('heights', () => {
  const classify = createClassifier(parseTagMap(tagMapSpec));
  const input = (tags: Record<string, string>): BuildingInput => ({
    id: 'way/1',
    tags,
    area: 120,
    pois: [],
  });

  it('uses height, then levels × 3 m, then the category default', () => {
    expect(classify(input({ building: 'house', height: '9.5' }))).toMatchObject({
      height: 9.5,
      levels: 3,
    });
    expect(classify(input({ building: 'house', 'building:levels': '2' }))).toMatchObject({
      height: 6,
      levels: 2,
    });
    expect(classify(input({ building: 'house' }))).toMatchObject({ height: 7, levels: 2 });
    expect(classify(input({ building: 'yes', amenity: 'hospital' }))).toMatchObject({
      height: 15,
      levels: 5,
    });
  });

  it('keeps both tags when present', () => {
    expect(measure({ height: '20 m', 'building:levels': '5' }, 0, 3)).toEqual({
      area: 0,
      height: 20,
      levels: 5,
    });
  });
});
