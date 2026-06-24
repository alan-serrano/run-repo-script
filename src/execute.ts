import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createSafeEnvironment } from './env.js';
import type { ExecuteOptions, SupportedRunner } from './types.js';

const SUPPORTED_RUNNERS: Record<SupportedRunner, true> = {
  node: true,
  bash: true,
  zx: true
};

function toSupportedRunner(
  candidate: string | undefined
): SupportedRunner | undefined {
  if (!candidate) {
    return undefined;
  }

  if (candidate in SUPPORTED_RUNNERS) {
    return candidate as SupportedRunner;
  }

  if (candidate === 'sh') {
    return 'bash';
  }

  return undefined;
}

function parseShebangRunner(shebangLine: string): SupportedRunner | undefined {
  const line = shebangLine.trim();
  if (!line.startsWith('#!')) {
    return undefined;
  }

  const tokens = line.slice(2).trim().split(/\s+/);
  if (tokens.length === 0) {
    return undefined;
  }

  if (tokens[0].endsWith('/env')) {
    if (tokens[1] === '-S') {
      return toSupportedRunner(tokens[2]);
    }

    return toSupportedRunner(tokens[1]);
  }

  return toSupportedRunner(path.basename(tokens[0]));
}

async function readShebang(
  scriptAbsolutePath: string
): Promise<string | undefined> {
  const content = await readFile(scriptAbsolutePath, 'utf8');
  const firstLine = content.split(/\r?\n/, 1)[0];
  return firstLine.startsWith('#!') ? firstLine : undefined;
}

function fallbackRunner(
  scriptRelativePath: string
): SupportedRunner | undefined {
  const extension = path.extname(scriptRelativePath);

  if (extension === '.js' || extension === '.mjs') {
    return 'node';
  }

  if (extension === '.sh') {
    return 'bash';
  }

  return undefined;
}

export async function resolveRunner(
  scriptAbsolutePath: string,
  scriptRelativePath: string,
  runnerOverride?: string
): Promise<SupportedRunner> {
  const override = toSupportedRunner(runnerOverride);

  if (runnerOverride && !override) {
    throw new Error(
      `Unsupported --runner value: ${runnerOverride}. Supported values: node, bash, zx.`
    );
  }

  if (override) {
    return override;
  }

  const shebang = await readShebang(scriptAbsolutePath);
  const shebangRunner = shebang ? parseShebangRunner(shebang) : undefined;
  if (shebangRunner) {
    return shebangRunner;
  }

  const fallback = fallbackRunner(scriptRelativePath);
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `Unable to determine runner for script: ${scriptRelativePath}. Use --runner <node|bash|zx>.`
  );
}

export async function isRunnerAvailable(
  runner: SupportedRunner
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(runner, ['--version'], { stdio: 'ignore' });

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function confirmExecution(
  runner: SupportedRunner,
  scriptRelativePath: string,
  forwardArgs: string[]
): Promise<boolean> {
  const argsText = forwardArgs.length > 0 ? ` ${forwardArgs.join(' ')}` : '';
  const question = `About to run: ${runner} ${scriptRelativePath}${argsText}\nContinue? [Y/n] `;

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await readline.question(question);
    return isConfirmationAccepted(answer);
  } finally {
    readline.close();
  }
}

export function isConfirmationAccepted(answer: string): boolean {
  const normalizedAnswer = answer.trim().toLowerCase();
  return (
    normalizedAnswer === '' ||
    normalizedAnswer === 'y' ||
    normalizedAnswer === 'yes'
  );
}

function toRunnerScriptPath(scriptRelativePath: string): string {
  if (scriptRelativePath.startsWith('./')) {
    return scriptRelativePath;
  }

  return `./${scriptRelativePath}`;
}

async function runInstaller(
  runner: SupportedRunner,
  options: ExecuteOptions
): Promise<number> {
  const args = [
    toRunnerScriptPath(options.script.relativePath),
    ...options.forwardArgs
  ];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(runner, args, {
      cwd: options.repoRoot,
      stdio: 'inherit',
      env: createSafeEnvironment()
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start installer process: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Installer process terminated by signal: ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

export interface ExecuteInstallerDependencies {
  resolveRunner: (
    scriptAbsolutePath: string,
    scriptRelativePath: string,
    runnerOverride?: string
  ) => Promise<SupportedRunner>;
  isRunnerAvailable: (runner: SupportedRunner) => Promise<boolean>;
  confirmExecution: (
    runner: SupportedRunner,
    scriptRelativePath: string,
    forwardArgs: string[]
  ) => Promise<boolean>;
  runInstaller: (
    runner: SupportedRunner,
    options: ExecuteOptions
  ) => Promise<number>;
}

const defaultDependencies: ExecuteInstallerDependencies = {
  resolveRunner,
  isRunnerAvailable,
  confirmExecution,
  runInstaller
};

export async function executeInstaller(
  options: ExecuteOptions,
  dependencyOverrides: Partial<ExecuteInstallerDependencies> = {}
): Promise<number> {
  const dependencies: ExecuteInstallerDependencies = {
    ...defaultDependencies,
    ...dependencyOverrides
  };

  const runner = await dependencies.resolveRunner(
    options.script.absolutePath,
    options.script.relativePath,
    options.runnerOverride
  );

  const available = await dependencies.isRunnerAvailable(runner);
  if (!available) {
    throw new Error(
      `Runner "${runner}" is not available on this host. Install it or use --runner with an available runtime.`
    );
  }

  if (!options.yes) {
    const confirmed = await dependencies.confirmExecution(
      runner,
      options.script.relativePath,
      options.forwardArgs
    );

    if (!confirmed) {
      throw new Error('Execution cancelled by user.');
    }
  }

  return await dependencies.runInstaller(runner, options);
}
