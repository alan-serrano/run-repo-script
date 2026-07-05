#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveExplicitScript, resolveScript } from './discovery.js';
import { executeInstaller } from './execute.js';
import { fetchRepository, looksLikeGitHubTarget } from './fetch.js';
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
  const secondPositional = parsed.positionals[1];
  const secondPositionalIsPreTerminator =
    secondPositional !== undefined &&
    (optionTerminatorIndex === -1 ||
      argv.indexOf(secondPositional) < optionTerminatorIndex);
  const mode: 'fetch' | 'local' = looksLikeGitHubTarget(repoTarget)
    ? 'fetch'
    : 'local';
  // In local mode, a single positional doubles as the script name so
  // `run-repo install` resolves install.mjs in the cwd.
  const subcommand = secondPositionalIsPreTerminator
    ? secondPositional
    : mode === 'local' && repoTarget !== ''
      ? repoTarget
      : undefined;

  return {
    mode,
    repoTarget,
    subcommand,
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

  let workspaceDir: string | undefined;
  let repoRoot: string;

  try {
    if (config.mode === 'fetch') {
      const fetched = await fetchRepository(config.repoTarget);
      workspaceDir = fetched.workspaceDir;
      repoRoot = fetched.workspaceDir;
    } else {
      repoRoot = realpathSync(process.cwd());
    }

    const script = config.script
      ? await resolveExplicitScript(repoRoot, config.script)
      : await resolveScript(repoRoot, config.subcommand);

    return await executeInstaller({
      repoRoot,
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
