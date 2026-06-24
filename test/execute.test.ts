import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  executeInstaller,
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
