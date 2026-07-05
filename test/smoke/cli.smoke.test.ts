import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntrypoint = fileURLToPath(
  new URL('../../dist/cli.js', import.meta.url)
);
const executeEntrypoint = fileURLToPath(
  new URL('../../dist/execute.js', import.meta.url)
);
function runBuiltCli(args: string[], options?: { cwd?: string }) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: options?.cwd ?? repoRoot,
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
  const buildResult = spawnSync('pnpm', ['build'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  expect(buildResult.status).toBe(0);
});

test('smoke: built CLI --help exits successfully', () => {
  const result = runBuiltCli(['--help']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage: run-repo');
});

test('smoke: installed npm bin executes direct --help path', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const packResult = spawnSync(
      'npm',
      ['pack', '--json', '--ignore-scripts'],
      {
        cwd: repoRoot,
        encoding: 'utf8'
      }
    );

    expect(packResult.status).toBe(0);

    const packOutput = packResult.stdout.trim();
    const jsonStart = packOutput.indexOf('[');
    const jsonEnd = packOutput.lastIndexOf(']');

    expect(jsonStart).toBeGreaterThanOrEqual(0);
    expect(jsonEnd).toBeGreaterThanOrEqual(jsonStart);

    const parsed = JSON.parse(
      packOutput.slice(jsonStart, jsonEnd + 1)
    ) as Array<{
      filename?: string;
    }>;

    expect(parsed[0]?.filename).toBeTruthy();

    const tarballPath = path.join(repoRoot, parsed[0].filename as string);

    const initResult = spawnSync('npm', ['init', '-y'], {
      cwd: workspaceDir,
      encoding: 'utf8'
    });

    expect(initResult.status).toBe(0);

    const installResult = spawnSync('npm', ['install', tarballPath], {
      cwd: workspaceDir,
      encoding: 'utf8'
    });

    expect(installResult.status).toBe(0);

    const binPath = path.join(workspaceDir, 'node_modules', '.bin', 'run-repo');

    const result = spawnSync(binPath, ['--help'], {
      cwd: workspaceDir,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: run-repo');
  });
});

test('contract: built CLI without target enters local mode and surfaces the resolver diagnostic', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const result = runBuiltCli([], { cwd: workspaceDir });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No script found/);
    expect(result.stderr).toMatch(/--script/);
  });
});

test('smoke: built CLI runs local default entry index.js in cwd', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const markerPath = path.join(workspaceDir, 'local-default-marker.txt');
    await writeFile(
      path.join(workspaceDir, 'index.js'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, 'ok');\n`
    );

    const result = runBuiltCli(['--dangerously-skip-confirmation'], {
      cwd: workspaceDir
    });

    expect(result.status).toBe(0);
    expect(await readFile(markerPath, 'utf8')).toBe('ok');
  });
});

test('smoke: built CLI runs local subcommand deploy.mjs in cwd', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const markerPath = path.join(workspaceDir, 'local-sub-marker.txt');
    await writeFile(
      path.join(workspaceDir, 'deploy.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, 'ok');\n`
    );

    const result = runBuiltCli(['deploy', '--dangerously-skip-confirmation'], {
      cwd: workspaceDir
    });

    expect(result.status).toBe(0);
    expect(await readFile(markerPath, 'utf8')).toBe('ok');
  });
});

test('smoke: built CLI honors --script escape in local mode', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const markerPath = path.join(workspaceDir, 'local-script-marker.txt');
    await mkdir(path.join(workspaceDir, 'scripts'), { recursive: true });
    await writeFile(
      path.join(workspaceDir, 'scripts', 'setup.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, 'ok');\n`
    );

    const result = runBuiltCli(
      ['--script', 'scripts/setup.mjs', '--dangerously-skip-confirmation'],
      { cwd: workspaceDir }
    );

    expect(result.status).toBe(0);
    expect(await readFile(markerPath, 'utf8')).toBe('ok');
  });
});

test('smoke: built CLI fetch mode fails deterministically for an unknown repo', () => {
  const result = runBuiltCli(['this-org-does-not-exist-xyz123/no-such-repo']);

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/git clone failed|Repository target|fetch/);
});

test('smoke: built CLI fetch mode with subcommand fails deterministically for an unknown repo', () => {
  const result = runBuiltCli([
    'this-org-does-not-exist-xyz123/no-such-repo',
    'deploy'
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/git clone failed|Repository target|fetch/);
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
