import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  executeInstaller,
  isConfirmationAccepted,
  isRunnerAvailable,
  resolveRunner
} from '../src/execute.js';

async function withTempRepo(t: test.TestContext): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'run-repo-execute-test-'));
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

test('resolveRunner prefers --runner override', async (t) => {
  const repoRoot = await withTempRepo(t);
  const scriptPath = path.join(repoRoot, 'install.sh');
  await writeFile(scriptPath, '#!/usr/bin/env bash\necho ok\n');

  const runner = await resolveRunner(scriptPath, 'install.sh', 'node');
  assert.equal(runner, 'node');
});

test('resolveRunner reads zx from shebang', async (t) => {
  const repoRoot = await withTempRepo(t);
  const scriptPath = path.join(repoRoot, 'install.mjs');
  await writeFile(scriptPath, '#!/usr/bin/env zx\nconsole.log("ok")\n');

  const runner = await resolveRunner(scriptPath, 'install.mjs');
  assert.equal(runner, 'zx');
});

test('resolveRunner falls back by extension', async (t) => {
  const repoRoot = await withTempRepo(t);
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  const shellScriptPath = path.join(repoRoot, 'scripts/install.sh');
  await writeFile(shellScriptPath, 'echo ok\n');

  const shellRunner = await resolveRunner(
    shellScriptPath,
    'scripts/install.sh'
  );
  assert.equal(shellRunner, 'bash');

  const nodeScriptPath = path.join(repoRoot, 'install.js');
  await writeFile(nodeScriptPath, 'console.log("ok")\n');

  const nodeRunner = await resolveRunner(nodeScriptPath, 'install.js');
  assert.equal(nodeRunner, 'node');
});

test('isRunnerAvailable detects known and unknown runtimes', async () => {
  assert.equal(await isRunnerAvailable('node'), true);
  const zxAvailable = await isRunnerAvailable('zx');
  assert.equal(typeof zxAvailable, 'boolean');
});

test('isConfirmationAccepted treats empty answer as yes by default', () => {
  assert.equal(isConfirmationAccepted(''), true);
  assert.equal(isConfirmationAccepted('   '), true);
  assert.equal(isConfirmationAccepted('y'), true);
  assert.equal(isConfirmationAccepted('yes'), true);
  assert.equal(isConfirmationAccepted('n'), false);
});

test('executeInstaller bypasses prompt with --yes and forwards args', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'argv.txt');
  const scriptPath = path.join(repoRoot, 'install.js');

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync('argv.txt', process.argv.slice(2).join(' '));\n`
  );

  const exitCode = await executeInstaller({
    repoRoot,
    script: {
      absolutePath: scriptPath,
      relativePath: 'install.js'
    },
    yes: true,
    forwardArgs: ['--target', 'local'],
    runnerOverride: undefined
  });

  assert.equal(exitCode, 0);
  assert.equal(await readFile(markerPath, 'utf8'), '--target local');
});

test('executeInstaller prevents option injection for leading-dash script names', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'safe-marker.txt');
  const scriptPath = path.join(repoRoot, '-c');
  const scriptContent = [
    '#!/usr/bin/env bash',
    `echo safe > ${JSON.stringify(markerPath)}`,
    ''
  ].join('\n');

  await writeFile(scriptPath, scriptContent);

  const exitCode = await executeInstaller({
    repoRoot,
    script: {
      absolutePath: scriptPath,
      relativePath: '-c'
    },
    yes: true,
    forwardArgs: [],
    runnerOverride: 'bash'
  });

  assert.equal(exitCode, 0);
  assert.equal((await readFile(markerPath, 'utf8')).trim(), 'safe');
});

test('executeInstaller strips obvious secret variables from child environment', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'env-check.txt');
  const scriptPath = path.join(repoRoot, 'install.js');
  const previousSecret = process.env.RUN_REPO_TEST_SECRET_TOKEN;
  process.env.RUN_REPO_TEST_SECRET_TOKEN = 'do-not-leak';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const value = process.env.RUN_REPO_TEST_SECRET_TOKEN ?? '';
writeFileSync('env-check.txt', value);
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      yes: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);
    assert.equal(await readFile(markerPath, 'utf8'), '');
  } finally {
    if (previousSecret === undefined) {
      delete process.env.RUN_REPO_TEST_SECRET_TOKEN;
    } else {
      process.env.RUN_REPO_TEST_SECRET_TOKEN = previousSecret;
    }
  }
});

test('executeInstaller uses confirmation path when --yes is not passed', async () => {
  let confirmationCalled = false;

  const exitCode = await executeInstaller(
    {
      repoRoot: '/repo',
      script: {
        absolutePath: '/repo/install.js',
        relativePath: 'install.js'
      },
      yes: false,
      forwardArgs: ['--target', 'local'],
      runnerOverride: undefined
    },
    {
      resolveRunner: async () => 'node',
      isRunnerAvailable: async () => true,
      confirmExecution: async (runner, scriptRelativePath, forwardArgs) => {
        confirmationCalled = true;
        assert.equal(runner, 'node');
        assert.equal(scriptRelativePath, 'install.js');
        assert.deepEqual(forwardArgs, ['--target', 'local']);
        return true;
      },
      runInstaller: async () => 0
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(confirmationCalled, true);
});

test('executeInstaller fails deterministically when runner is unavailable', async () => {
  await assert.rejects(
    () =>
      executeInstaller(
        {
          repoRoot: '/repo',
          script: {
            absolutePath: '/repo/install.mjs',
            relativePath: 'install.mjs'
          },
          yes: true,
          forwardArgs: [],
          runnerOverride: undefined
        },
        {
          resolveRunner: async () => 'zx',
          isRunnerAvailable: async () => false,
          confirmExecution: async () => true,
          runInstaller: async () => 0
        }
      ),
    /Runner "zx" is not available/
  );
});

test('executeInstaller rejects when user declines confirmation', async () => {
  let installerCalled = false;

  await assert.rejects(
    () =>
      executeInstaller(
        {
          repoRoot: '/repo',
          script: {
            absolutePath: '/repo/install.js',
            relativePath: 'install.js'
          },
          yes: false,
          forwardArgs: [],
          runnerOverride: undefined
        },
        {
          resolveRunner: async () => 'node',
          isRunnerAvailable: async () => true,
          confirmExecution: async () => false,
          runInstaller: async () => {
            installerCalled = true;
            return 0;
          }
        }
      ),
    /Execution cancelled by user/
  );

  assert.equal(installerCalled, false);
});

test('executeInstaller returns non-zero child exit codes', async () => {
  const exitCode = await executeInstaller(
    {
      repoRoot: '/repo',
      script: {
        absolutePath: '/repo/install.js',
        relativePath: 'install.js'
      },
      yes: true,
      forwardArgs: [],
      runnerOverride: undefined
    },
    {
      resolveRunner: async () => 'node',
      isRunnerAvailable: async () => true,
      confirmExecution: async () => true,
      runInstaller: async () => 37
    }
  );

  assert.equal(exitCode, 37);
});
