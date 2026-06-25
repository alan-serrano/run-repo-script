import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntrypoint = fileURLToPath(
  new URL('../../dist/src/cli.js', import.meta.url)
);
const executeEntrypoint = fileURLToPath(
  new URL('../../dist/src/execute.js', import.meta.url)
);
const tscEntrypoint = fileURLToPath(
  new URL('../../node_modules/typescript/bin/tsc', import.meta.url)
);

function runBuiltCli(args: string[]) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

async function withTempWorkspace<T>(
  run: (workspaceDir: string) => Promise<T>
): Promise<T> {
  const workspaceDir = await mkdtemp(
    path.join(tmpdir(), 'run-repo-smoke-test-')
  );
  try {
    return await run(workspaceDir);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

async function importBuiltExecuteInstaller(): Promise<
  (options: {
    repoRoot: string;
    script: {
      absolutePath: string;
      relativePath: string;
    };
    runnerOverride?: string;
    dangerouslySkipConfirmation: boolean;
    forwardArgs: string[];
  }) => Promise<number>
> {
  const executeModule = (await import(
    pathToFileURL(executeEntrypoint).href
  )) as {
    executeInstaller: (options: {
      repoRoot: string;
      script: {
        absolutePath: string;
        relativePath: string;
      };
      runnerOverride?: string;
      dangerouslySkipConfirmation: boolean;
      forwardArgs: string[];
    }) => Promise<number>;
  };
  return executeModule.executeInstaller;
}

beforeAll(() => {
  const buildResult = spawnSync(
    process.execPath,
    [tscEntrypoint, '-p', 'tsconfig.json'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );

  expect(buildResult.status).toBe(0);
});

test('smoke: built CLI --help exits successfully', () => {
  const result = runBuiltCli(['--help']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage: run-repo');
});

test('contract: built CLI without target exits with deterministic guidance', () => {
  const result = runBuiltCli([]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Repository target is required.');
  expect(result.stdout).toContain('Usage: run-repo');
});

test('contract: built executeInstaller uses bundled zx for explicit --runner zx intent', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const markerPath = path.join(workspaceDir, 'zx-explicit-marker.txt');
    const scriptPath = path.join(workspaceDir, 'install.mjs');
    const executeInstaller = await importBuiltExecuteInstaller();

    await writeFile(
      scriptPath,
      "import { writeFileSync } from 'node:fs';\nif (typeof $ !== 'function') {\n  throw new Error('zx runtime was not injected');\n}\nawait $`${process.execPath} --version`;\nwriteFileSync('zx-explicit-marker.txt', 'ok');\n"
    );

    const exitCode = await executeInstaller({
      repoRoot: workspaceDir,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.mjs'
      },
      runnerOverride: 'zx',
      dangerouslySkipConfirmation: true,
      forwardArgs: []
    });

    expect(exitCode).toBe(0);
    expect(await readFile(markerPath, 'utf8')).toBe('ok');
  });
});

test('contract: built executeInstaller honors zx shebang path end-to-end', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const markerPath = path.join(workspaceDir, 'zx-shebang-marker.txt');
    const scriptPath = path.join(workspaceDir, 'install.mjs');
    const executeInstaller = await importBuiltExecuteInstaller();

    await writeFile(
      scriptPath,
      "#!/usr/bin/env zx\nimport { writeFileSync } from 'node:fs';\nif (typeof $ !== 'function') {\n  throw new Error('zx runtime was not injected');\n}\nawait $`${process.execPath} --version`;\nwriteFileSync('zx-shebang-marker.txt', 'ok');\n"
    );

    const exitCode = await executeInstaller({
      repoRoot: workspaceDir,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.mjs'
      },
      runnerOverride: undefined,
      dangerouslySkipConfirmation: true,
      forwardArgs: []
    });

    expect(exitCode).toBe(0);
    expect(await readFile(markerPath, 'utf8')).toBe('ok');
  });
});
