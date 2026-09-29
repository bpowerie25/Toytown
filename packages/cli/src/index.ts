import { VERSION } from 'toytown-gl';
import { parseCommand } from './args';

const HELP = `toytown ${VERSION}

Usage:
  toytown build-data --bbox <w,s,e,n> --out <file>   (coming in phase 2)
  toytown --version
  toytown --help
`;

try {
  const cmd = parseCommand(process.argv.slice(2));
  switch (cmd.name) {
    case 'help':
      process.stdout.write(HELP);
      break;
    case 'version':
      process.stdout.write(`${VERSION}\n`);
      break;
    case 'build-data':
      process.stderr.write('build-data is not implemented yet (phase 2).\n');
      process.exitCode = 1;
      break;
  }
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exitCode = 2;
}
