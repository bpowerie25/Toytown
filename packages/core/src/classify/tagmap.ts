import { ConditionError, parseCondition, type Condition } from './conditions';

/** A rule as written in tag-map.json. */
export interface TagRuleSpec {
  category: string;
  /** Higher wins. Ties go to the rule listed first. */
  priority: number;
  /** All conditions must hold. See conditions.ts for the syntax. */
  when: string[];
  /** Weak rules only apply if no POI inside the building gives a better answer. */
  weak?: boolean;
  /** Free-text explanation, ignored by the classifier. */
  note?: string;
}

export interface TagMapSpec {
  version: 1;
  /** Category for anything no rule matches. */
  fallback: string;
  /** Matched against the building's own tags, then against POI nodes inside it. */
  rules: TagRuleSpec[];
  /** Matched against the building's tags and measures when nothing else applied. */
  heuristics: TagRuleSpec[];
  /** Metres per level, for heights from building:levels and levels from height. */
  level_height_m: number;
  /** Height in metres when a building has neither height nor building:levels. */
  default_height_m: Record<string, number>;
}

export interface TagRule extends TagRuleSpec {
  index: number;
  conditions: Condition[];
}

export interface TagMap {
  spec: TagMapSpec;
  fallback: string;
  rules: TagRule[];
  heuristics: TagRule[];
  categories: Set<string>;
}

export class TagMapError extends Error {
  override name = 'TagMapError';
}

function compile(rules: TagRuleSpec[], where: string): TagRule[] {
  return rules.map((r, index) => {
    if (typeof r.category !== 'string' || !r.category)
      throw new TagMapError(`${where}[${index}]: missing category`);
    if (typeof r.priority !== 'number')
      throw new TagMapError(`${where}[${index}]: priority must be a number`);
    if (!Array.isArray(r.when) || r.when.length === 0) {
      throw new TagMapError(`${where}[${index}] (${r.category}): "when" must be a non-empty array`);
    }
    try {
      return { ...r, index, conditions: r.when.map(parseCondition) };
    } catch (e) {
      if (e instanceof ConditionError)
        throw new TagMapError(`${where}[${index}] (${r.category}): ${e.message}`);
      throw e;
    }
  });
}

/**
 * Validate and compile a tag map. If `categories` is given (the model manifest's model names),
 * every rule must point at one of them, or at the fallback.
 */
export function parseTagMap(input: unknown, categories?: Iterable<string>): TagMap {
  const spec = input as TagMapSpec;
  if (!spec || typeof spec !== 'object') throw new TagMapError('tag map must be an object');
  if (spec.version !== 1)
    throw new TagMapError(`unsupported tag map version ${String(spec.version)}`);
  if (typeof spec.fallback !== 'string') throw new TagMapError('fallback must be a string');
  if (!(spec.level_height_m > 0)) throw new TagMapError('level_height_m must be positive');
  if (!spec.default_height_m || typeof spec.default_height_m[spec.fallback] !== 'number') {
    throw new TagMapError(`default_height_m must include the fallback "${spec.fallback}"`);
  }

  const rules = compile(spec.rules ?? [], 'rules');
  const heuristics = compile(spec.heuristics ?? [], 'heuristics');
  const used = new Set([
    spec.fallback,
    ...rules.map((r) => r.category),
    ...heuristics.map((r) => r.category),
  ]);

  if (categories) {
    const known = new Set([spec.fallback, ...categories]);
    for (const c of used) {
      if (!known.has(c)) throw new TagMapError(`category "${c}" is not a model in the manifest`);
    }
    for (const c of Object.keys(spec.default_height_m)) {
      if (!known.has(c))
        throw new TagMapError(`default_height_m: "${c}" is not a model in the manifest`);
    }
  }
  return { spec, fallback: spec.fallback, rules, heuristics, categories: used };
}
