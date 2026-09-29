import { parseNumber, type Measures, type Tags } from './conditions';
import type { TagMap, TagRule } from './tagmap';

export interface Landmark {
  /** OSM element, e.g. "way/46694890". */
  osm: string;
  category: string;
  name?: string;
  /** How the id was verified, e.g. "Nominatim 2026-09-29". */
  verified?: string;
}

export interface LandmarkPack {
  pack: string;
  landmarks: Landmark[];
}

export interface BuildingInput {
  /** OSM element, e.g. "way/123" or "relation/456". */
  id: string;
  tags: Tags;
  /** Footprint area in m². */
  area: number;
  /** Tags of POI nodes that fall inside the footprint. */
  pois: Tags[];
}

export type ClassifiedVia = 'landmark' | 'tags' | 'poi' | 'heuristic' | 'fallback';

export interface Classification {
  category: string;
  via: ClassifiedVia;
  height: number;
  levels: number;
}

/** Height and levels from tags: `height`, else `building:levels` × level height, else unknown. */
export function measure(tags: Tags, area: number, levelHeight: number): Measures {
  const levelsTag = parseNumber(tags['building:levels']);
  const heightTag = parseNumber(tags.height) ?? parseNumber(tags['building:height']);
  const height =
    heightTag !== null && heightTag > 0
      ? heightTag
      : levelsTag !== null && levelsTag > 0
        ? levelsTag * levelHeight
        : null;
  const levels =
    levelsTag !== null && levelsTag > 0
      ? levelsTag
      : height !== null
        ? Math.max(1, Math.round(height / levelHeight))
        : null;
  return { area, levels, height };
}

function best(rules: TagRule[], tags: Tags, m: Measures, weak: boolean | null): TagRule | null {
  let found: TagRule | null = null;
  for (const r of rules) {
    if (weak !== null && Boolean(r.weak) !== weak) continue;
    if (found && r.priority <= found.priority) continue;
    if (r.conditions.every((c) => c(tags, m))) found = r;
  }
  return found;
}

export type Classifier = (b: BuildingInput) => Classification;

/**
 * Build a classifier. The order is:
 * 1. landmark override by OSM id (from packs),
 * 2. strong rules on the building's own tags,
 * 3. rules on POI nodes inside the footprint (highest priority wins),
 * 4. weak rules on the building's own tags,
 * 5. heuristics on tags and measures (levels, height, area),
 * 6. the fallback category.
 */
export function createClassifier(tagMap: TagMap, packs: LandmarkPack[] = []): Classifier {
  const landmarks = new Map<string, Landmark>();
  for (const p of packs) for (const l of p.landmarks) landmarks.set(l.osm, l);
  const { level_height_m: lh, default_height_m: defaults } = tagMap.spec;

  const withHeight = (category: string, via: ClassifiedVia, m: Measures): Classification => {
    const height = m.height ?? defaults[category] ?? defaults[tagMap.fallback]!;
    const levels = m.levels ?? Math.max(1, Math.round(height / lh));
    return { category, via, height: Math.round(height * 10) / 10, levels };
  };

  return (b) => {
    const m = measure(b.tags, b.area, lh);

    const landmark = landmarks.get(b.id);
    if (landmark) return withHeight(landmark.category, 'landmark', m);

    const strong = best(tagMap.rules, b.tags, m, false);
    if (strong) return withHeight(strong.category, 'tags', m);

    let poiRule: TagRule | null = null;
    for (const poi of b.pois) {
      const r = best(tagMap.rules, poi, m, false);
      if (
        r &&
        (!poiRule ||
          r.priority > poiRule.priority ||
          (r.priority === poiRule.priority && r.index < poiRule.index))
      ) {
        poiRule = r;
      }
    }
    if (poiRule) return withHeight(poiRule.category, 'poi', m);

    const weak = best(tagMap.rules, b.tags, m, true);
    if (weak) return withHeight(weak.category, 'tags', m);

    const h = best(tagMap.heuristics, b.tags, m, null);
    if (h) return withHeight(h.category, 'heuristic', m);

    return withHeight(tagMap.fallback, 'fallback', m);
  };
}
