import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveInstaller } from '../src/discovery.js';

async function withTempRepo(t: test.TestContext): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-test-')
  );
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

test('resolveInstaller finds the only default installer', async (t) => {
  const repoRoot = await withTempRepo(t);
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/install.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveInstaller(repoRoot);

  assert.equal(result.relativePath, 'scripts/install.sh');
  assert.equal(result.absolutePath, path.join(repoRoot, 'scripts/install.sh'));
});

test('resolveInstaller fails when no installer is found', async (t) => {
  const repoRoot = await withTempRepo(t);

  await assert.rejects(
    () => resolveInstaller(repoRoot),
    /No installer script found/
  );
});

test('resolveInstaller fails when multiple defaults are found', async (t) => {
  const repoRoot = await withTempRepo(t);
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'install.js'),
    'console.log("install")\n'
  );
  await writeFile(
    path.join(repoRoot, 'scripts/install.sh'),
    '#!/usr/bin/env bash\n'
  );

  await assert.rejects(
    () => resolveInstaller(repoRoot),
    /Multiple installer scripts found/
  );
});

test('resolveInstaller resolves explicit script path', async (t) => {
  const repoRoot = await withTempRepo(t);
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/install.js'),
    'console.log("ok")\n'
  );

  const result = await resolveInstaller(repoRoot, 'scripts/install.js');

  assert.equal(result.relativePath, 'scripts/install.js');
});

test('resolveInstaller rejects explicit script traversal', async (t) => {
  const repoRoot = await withTempRepo(t);

  await assert.rejects(
    () => resolveInstaller(repoRoot, '../outside.sh'),
    /must point to a file inside the fetched repository/
  );
});
