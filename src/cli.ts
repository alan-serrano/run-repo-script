import { parseArgs } from 'node:util';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveInstaller } from './discovery.js';
import { executeInstaller } from './execute.js';
import { fetchRepository } from './fetch.js';
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
    help: parsed.values.help,
    forwardArgs
  };
}

function printUsage(): void {
  console.log(
    'Usage: run-repo <owner/repo[#ref]|https://github.com/owner/repo[.git][#ref]> [--script <path>] [--runner <node|bash|zx>] [--yes] [-- <args...>]'
  );
}

export interface CliDependencies {
  fetchRepository: typeof fetchRepository;
  resolveInstaller: typeof resolveInstaller;
  executeInstaller: typeof executeInstaller;
  cleanupWorkspace: (workspaceDir: string) => Promise<void>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

const defaultDependencies: CliDependencies = {
  fetchRepository,
  resolveInstaller,
  executeInstaller,
  cleanupWorkspace: async (workspaceDir: string) => {
    await rm(workspaceDir, { recursive: true, force: true });
  },
  stderr: process.stderr
};

function mergeDependencies(
  overrides: Partial<CliDependencies>
): CliDependencies {
  return {
    ...defaultDependencies,
    ...overrides
  };
}

export async function runCli(
  argv: string[],
  dependencyOverrides: Partial<CliDependencies> = {}
): Promise<number> {
  const dependencies = mergeDependencies(dependencyOverrides);

  let config: RunConfig;
  try {
    config = parseRunConfig(argv);
  } catch (error) {
    dependencies.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    printUsage();
    return 1;
  }

  if (config.help) {
    printUsage();
    return 0;
  }

  if (!config.repoTarget) {
    dependencies.stderr.write('Repository target is required.\n');
    printUsage();
    return 1;
  }

  let workspaceDir: string | undefined;

  try {
    const fetchedRepo = await dependencies.fetchRepository(config.repoTarget);
    workspaceDir = fetchedRepo.workspaceDir;

    const script = await dependencies.resolveInstaller(
      fetchedRepo.workspaceDir,
      config.script
    );

    return await dependencies.executeInstaller({
      repoRoot: fetchedRepo.workspaceDir,
      script,
      runnerOverride: config.runner,
      yes: config.yes,
      forwardArgs: config.forwardArgs
    });
  } catch (error) {
    dependencies.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  } finally {
    if (workspaceDir) {
      await dependencies.cleanupWorkspace(workspaceDir);
    }
  }
}

function isDirectExecution(): boolean {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isDirectExecution()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
