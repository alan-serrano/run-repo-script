import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { RunConfig } from './types.js';

export function parseRunConfig(argv: string[]): RunConfig {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      script: {
        type: 'string'
      },
      runner: {
        type: 'string'
      },
      yes: {
        type: 'boolean',
        default: false
      },
      help: {
        type: 'boolean',
        default: false
      }
    }
  });

  const optionTerminatorIndex = argv.indexOf('--');
  const forwardArgs =
    optionTerminatorIndex === -1 ? [] : argv.slice(optionTerminatorIndex + 1);
  const repoTarget = parsed.positionals[0] ?? '';

  return {
    repoTarget,
    script: parsed.values.script,
    runner: parsed.values.runner,
    yes: parsed.values.yes,
    forwardArgs
  };
}

function printUsage(): void {
  console.log(
    'Usage: run-repo <owner/repo[#ref]|https://github.com/owner/repo[.git][#ref]> [--script <path>] [--runner <runner>] [--yes] [-- <args...>]'
  );
}

function isDirectExecution(): boolean {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isDirectExecution()) {
  const args = parseRunConfig(process.argv.slice(2));
  if (!args.repoTarget) {
    printUsage();
    process.exitCode = 1;
  } else {
    console.error(
      'run-repo foundation slice complete: execution wiring is not implemented yet.'
    );
    process.exitCode = 1;
  }
}
