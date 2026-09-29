import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/args';

describe('parseCommand', () => {
  it('defaults to help', () => expect(parseCommand([])).toEqual({ name: 'help' }));
  it('parses --version', () => expect(parseCommand(['--version'])).toEqual({ name: 'version' }));
  it('passes build-data args through', () =>
    expect(parseCommand(['build-data', '--bbox', '1,2,3,4'])).toEqual({
      name: 'build-data',
      argv: ['--bbox', '1,2,3,4'],
    }));
  it('rejects unknown commands', () =>
    expect(() => parseCommand(['nope'])).toThrow(/Unknown command/));
});
