import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
import { resolveInstaller } from '../../src/discovery.js';

const tempRepos: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRepos
      .splice(0)
      .map((repoRoot) => rm(repoRoot, { recursive: true, force: true }))
  );
  vi.clearAllMocks();
});

async function withTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-test-')
  );
  tempRepos.push(repoRoot);
  return repoRoot;
}

test('resolveInstaller finds the only default installer', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/install.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveInstaller(repoRoot);

  assert.equal(result.relativePath, 'scripts/install.sh');
  assert.equal(
    result.absolutePath,
    await realpath(path.join(repoRoot, 'scripts/install.sh'))
  );
});

test('resolveInstaller fails when no installer is found', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveInstaller(repoRoot),
    /No installer script found/
  );
});

test('resolveInstaller fails when multiple defaults are found', async () => {
  const repoRoot = await withTempRepo();
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

test('resolveInstaller resolves explicit script path', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/install.js'),
    'console.log("ok")\n'
  );

  const result = await resolveInstaller(repoRoot, 'scripts/install.js');

  assert.equal(result.relativePath, 'scripts/install.js');
});

test('resolveInstaller rejects explicit script traversal', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveInstaller(repoRoot, '../outside.sh'),
    /must point to a file inside the fetched repository/
  );
});

test('resolveInstaller rejects explicit script that resolves outside repo via symlink', async () => {
  const repoRoot = await withTempRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-outside-test-')
  );

  tempRepos.push(outsideRoot);

  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });

  const outsideScriptPath = path.join(outsideRoot, 'outside-install.sh');
  await writeFile(outsideScriptPath, '#!/usr/bin/env bash\n');
  await symlink(outsideScriptPath, path.join(repoRoot, 'scripts/install.sh'));

  await assert.rejects(
    () => resolveInstaller(repoRoot, 'scripts/install.sh'),
    /must resolve to a file inside the fetched repository/
  );
});

test('resolveInstaller ignores default scripts that resolve outside repo via symlink', async () => {
  const repoRoot = await withTempRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-outside-test-')
  );

  tempRepos.push(outsideRoot);

  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });

  const outsideScriptPath = path.join(outsideRoot, 'outside-install.sh');
  await writeFile(outsideScriptPath, '#!/usr/bin/env bash\n');
  await symlink(outsideScriptPath, path.join(repoRoot, 'install.sh'));
  await writeFile(
    path.join(repoRoot, 'scripts/install.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveInstaller(repoRoot);

  assert.equal(result.relativePath, 'scripts/install.sh');
  assert.equal(
    result.absolutePath,
    await realpath(path.join(repoRoot, 'scripts/install.sh'))
  );
});
