import { describe, expect, it } from 'vitest';
import { parseBBox, parseBuildDataArgs, parseCommand } from '../src/args';

const defaults = { manifest: 'm.json', tagMap: 't.json', packs: ['p.json'] };

describe('parseCommand', () => {
  it('defaults to help', () => expect(parseCommand([])).toEqual({ name: 'help' }));
  it('parses --version', () => expect(parseCommand(['--version'])).toEqual({ name: 'version' }));
  it('passes subcommand args through', () => {
    expect(parseCommand(['build-data', '--bbox', '1,2,3,4'])).toEqual({
      name: 'build-data',
      argv: ['--bbox', '1,2,3,4'],
    });
    expect(parseCommand(['report', 'A=a.json'])).toEqual({ name: 'report', argv: ['A=a.json'] });
  });
  it('rejects unknown commands', () =>
    expect(() => parseCommand(['nope'])).toThrow(/Unknown command/));
});

describe('parseBBox', () => {
  it('parses w,s,e,n', () =>
    expect(parseBBox('-7.17, 52.22,-7.05,52.28')).toEqual([-7.17, 52.22, -7.05, 52.28]));
  it.each(['1,2,3', '3,2,1,4', '1,4,3,2', '-200,0,0,1', 'a,b,c,d'])('rejects %s', (s) => {
    expect(() => parseBBox(s)).toThrow(/--bbox/);
  });
});

describe('parseBuildDataArgs', () => {
  it('defaults to Overpass and the bundled kit', () => {
    const a = parseBuildDataArgs(['--bbox', '0,0,1,1', '--out', 'o.geojson'], defaults);
    expect(a).toMatchObject({
      source: { kind: 'overpass', refresh: false },
      manifest: 'm.json',
      tagMap: 't.json',
      packs: ['p.json'],
      cacheDir: '.cache',
      seed: 1,
    });
  });

  it('accepts a bbox starting with a minus sign', () => {
    const a = parseBuildDataArgs(['--bbox', '-7.18,52.135,-7.12,52.18', '--out', 'o'], defaults);
    expect(a.bbox).toEqual([-7.18, 52.135, -7.12, 52.18]);
  });

  it('accepts "--source pbf <file>"', () => {
    const a = parseBuildDataArgs(
      ['--bbox', '0,0,1,1', '--source', 'pbf', 'ie.osm.pbf', '--out', 'o.geojson'],
      defaults,
    );
    expect(a.source).toEqual({ kind: 'pbf', file: 'ie.osm.pbf' });
  });

  it('adds packs and can drop the defaults', () => {
    const a = parseBuildDataArgs(
      ['--bbox', '0,0,1,1', '--out', 'o', '--no-default-packs', '--pack', 'x.json'],
      defaults,
    );
    expect(a.packs).toEqual(['x.json']);
  });

  it('requires bbox and out', () => {
    expect(() => parseBuildDataArgs(['--out', 'o'], defaults)).toThrow(/--bbox/);
    expect(() => parseBuildDataArgs(['--bbox', '0,0,1,1'], defaults)).toThrow(/--out/);
  });
});
