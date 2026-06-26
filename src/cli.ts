#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
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
      'dangerously-skip-confirmation': {
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
    dangerouslySkipConfirmation: parsed.values['dangerously-skip-confirmation'],
    help: parsed.values.help,
    forwardArgs
  };
}

function printUsage(): void {
  console.log(
    'Usage: run-repo <owner/repo[#ref]|https://github.com/owner/repo[.git][#ref]> [--script <path>] [--runner <node|bash|zx>] [--dangerously-skip-confirmation] [-- <args...>]'
  );
}
export async function runCli(argv: string[]): Promise<number> {
  let config: RunConfig;
  try {
    config = parseRunConfig(argv);
  } catch (error) {
    process.stderr.write(
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
    process.stderr.write('Repository target is required.\n');
    printUsage();
    return 1;
  }

  let workspaceDir: string | undefined;

  try {
    const fetchedRepo = await fetchRepository(config.repoTarget);
    workspaceDir = fetchedRepo.workspaceDir;

    const script = await resolveInstaller(
      fetchedRepo.workspaceDir,
      config.script
    );

    return await executeInstaller({
      repoRoot: fetchedRepo.workspaceDir,
      script,
      runnerOverride: config.runner,
      dangerouslySkipConfirmation: config.dangerouslySkipConfirmation,
      forwardArgs: config.forwardArgs
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  } finally {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];

  if (!entrypoint) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(realpathSync(entrypoint)).href;
  } catch {
    return import.meta.url === pathToFileURL(entrypoint).href;
  }
}

if (isDirectExecution()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
