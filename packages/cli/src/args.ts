export type Command =
  { name: 'help' } | { name: 'version' } | { name: 'build-data'; argv: string[] };

export function parseCommand(argv: string[]): Command {
  const [first, ...rest] = argv;
  if (!first || first === '-h' || first === '--help' || first === 'help') return { name: 'help' };
  if (first === '-v' || first === '--version') return { name: 'version' };
  if (first === 'build-data') return { name: 'build-data', argv: rest };
  throw new Error(`Unknown command "${first}". Run "toytown --help".`);
}
