/**
 * The condition language used in `tag-map.json`. One condition per string:
 *
 *   building=house            tag equals a value
 *   building=house|detached   tag equals any of the values
 *   shop=*                    tag present (and not "no")
 *   building!=roof|garage     tag absent, or equal to none of the values
 *   !historic                 tag absent (or "no")
 *   building:levels>=8        numeric comparison on a tag: >=, <=, >, <
 *   @area>=2500               numeric comparison on a derived measure:
 *                             @area (footprint m²), @levels, @height (m)
 *
 * Multi-valued tags ("a;b") match if any value matches.
 */
export type Tags = Record<string, string>;

export interface Measures {
  area: number;
  levels: number | null;
  height: number | null;
}

export type Condition = (tags: Tags, measures: Measures) => boolean;

const NUMERIC = /^(@?[^<>=!]+?)(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/;
const EQUALS = /^([^<>=!]+?)(!=|=)(.+)$/;

export class ConditionError extends Error {
  override name = 'ConditionError';
}

function values(tags: Tags, key: string): string[] {
  const v = tags[key];
  if (v === undefined || v === 'no') return [];
  return v.split(';').map((s) => s.trim());
}

/** Parse a number from a tag like "12", "12.5 m", "3;4" (first value). */
export function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(v.split(';')[0]!);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

export function parseCondition(src: string): Condition {
  const s = src.trim();

  if (s.startsWith('!') && !s.includes('=')) {
    const key = s.slice(1);
    return (tags) => values(tags, key).length === 0;
  }

  const num = NUMERIC.exec(s);
  if (num) {
    const [, key, op, raw] = num as unknown as [string, string, string, string];
    const n = Number(raw);
    const cmp: (x: number) => boolean =
      op === '>='
        ? (x) => x >= n
        : op === '<='
          ? (x) => x <= n
          : op === '>'
            ? (x) => x > n
            : (x) => x < n;
    if (key.startsWith('@')) {
      const m = key.slice(1);
      if (m !== 'area' && m !== 'levels' && m !== 'height') {
        throw new ConditionError(
          `unknown measure "${key}" in "${src}" (use @area, @levels or @height)`,
        );
      }
      return (_, measures) => {
        const x = measures[m];
        return x !== null && cmp(x);
      };
    }
    return (tags) => {
      const x = parseNumber(tags[key]);
      return x !== null && cmp(x);
    };
  }

  const eq = EQUALS.exec(s);
  if (eq) {
    const [, key, op, rhs] = eq as unknown as [string, string, string, string];
    if (key.startsWith('@'))
      throw new ConditionError(`measures only support <, <=, >, >=: "${src}"`);
    const wanted = rhs.split('|').map((v) => v.trim());
    const matches = (tags: Tags) => {
      const vs = values(tags, key);
      return wanted.includes('*') ? vs.length > 0 : vs.some((v) => wanted.includes(v));
    };
    return op === '=' ? matches : (tags) => !matches(tags);
  }

  throw new ConditionError(`cannot parse condition "${src}"`);
}
