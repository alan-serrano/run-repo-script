import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { resolveExplicitScript, resolveScript } from '../../src/discovery.js';

const tempRepos: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRepos
      .splice(0)
      .map((repoRoot) => rm(repoRoot, { recursive: true, force: true }))
  );
});

async function withTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-test-')
  );
  tempRepos.push(repoRoot);
  return repoRoot;
}

// ---------------------------------------------------------------------------
// resolveScript — default entry (no subcommand)
// ---------------------------------------------------------------------------

test('resolveScript default entry returns package.json#main when no extensions match', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'demo', main: 'lib/run.js' })
  );
  await mkdir(path.join(repoRoot, 'lib'), { recursive: true });
  await writeFile(path.join(repoRoot, 'lib/run.js'), 'console.log("hi")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('lib', 'run.js'));
});

test('resolveScript default entry returns root index.js before scripts/ fallback', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'index.js'), 'console.log("root")\n');
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/main.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.js');
});

test('resolveScript default entry falls through to scripts/main.sh when root is empty', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/main.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'main.sh'));
});

test('resolveScript default entry returns root main.js when no index.js', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'main.js'), 'console.log("main")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'main.js');
});

test('resolveScript default entry returns root index.mjs when no index/main.js', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'index.mjs'), 'export {}\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.mjs');
});

test('resolveScript default entry returns root main.sh when no .js variants', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'main.sh'), '#!/usr/bin/env bash\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'main.sh');
});

test('resolveScript default entry returns scripts/index.js when only scripts/ has it', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts/index.js'),
    'console.log("scripts/index")\n'
  );

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'index.js'));
});

test('resolveScript default entry throws with searched list and --script hint on empty repo', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveScript(repoRoot),
    (error: Error) => {
      assert.match(error.message, /--script/);
      assert.match(error.message, /package\.json/);
      assert.match(error.message, /scripts\/main\.sh/);
      return true;
    }
  );
});

test('resolveScript default entry ignores malformed package.json and falls through', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'package.json'), '{ not valid json');
  await writeFile(path.join(repoRoot, 'index.js'), 'console.log("hi")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.js');
});

test('resolveScript default entry returns root main.mjs when no .js/.index.mjs', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'main.mjs'), 'export {}\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'main.mjs');
});

test('resolveScript default entry returns root index.sh when no .js variants', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'index.sh'), '#!/usr/bin/env bash\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.sh');
});

test('resolveScript default entry falls through to scripts/main.js when root is empty', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts', 'main.js'),
    'console.log("scripts/main")\n'
  );

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'main.js'));
});

test('resolveScript default entry falls through to scripts/index.mjs when root is empty', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(path.join(repoRoot, 'scripts', 'index.mjs'), 'export {}\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'index.mjs'));
});

test('resolveScript default entry falls through to scripts/main.mjs when root is empty', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(path.join(repoRoot, 'scripts', 'main.mjs'), 'export {}\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'main.mjs'));
});

test('resolveScript default entry falls through to scripts/index.sh when root is empty', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts', 'index.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, path.join('scripts', 'index.sh'));
});

test('resolveScript default entry falls through to index.js when package.json main points to nonexistent file', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'demo', main: 'missing.js' })
  );
  await writeFile(path.join(repoRoot, 'index.js'), 'console.log("hi")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.js');
});

test('resolveScript default entry falls through to index.js when package.json main is a non-string value', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'demo', main: 123 })
  );
  await writeFile(path.join(repoRoot, 'index.js'), 'console.log("hi")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.js');
});

test('resolveScript default entry falls through to index.js when package.json main is empty string', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'demo', main: '' })
  );
  await writeFile(path.join(repoRoot, 'index.js'), 'console.log("hi")\n');

  const result = await resolveScript(repoRoot);

  assert.equal(result.relativePath, 'index.js');
});

// ---------------------------------------------------------------------------
// resolveScript — named subcommand
// ---------------------------------------------------------------------------

test('resolveScript subcommand returns root <name>.mjs', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'deploy.mjs'), 'export {}\n');

  const result = await resolveScript(repoRoot, 'deploy');

  assert.equal(result.relativePath, 'deploy.mjs');
});

test('resolveScript subcommand returns root <name>.cjs before .js', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'build.cjs'), 'module.exports = {}\n');
  await writeFile(path.join(repoRoot, 'build.js'), 'console.log("js")\n');

  const result = await resolveScript(repoRoot, 'build');

  assert.equal(result.relativePath, 'build.cjs');
});

test('resolveScript subcommand returns root <name>.json when no .cjs/.js', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(
    path.join(repoRoot, 'manifest.json'),
    JSON.stringify({ ok: true })
  );

  const result = await resolveScript(repoRoot, 'manifest');

  assert.equal(result.relativePath, 'manifest.json');
});

test('resolveScript subcommand recurses into folder via <name>/package.json#main', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'someScript'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'someScript', 'package.json'),
    JSON.stringify({ main: 'index.js' })
  );
  await writeFile(
    path.join(repoRoot, 'someScript', 'index.js'),
    'console.log("hi")\n'
  );

  const result = await resolveScript(repoRoot, 'someScript');

  assert.equal(result.relativePath, path.join('someScript', 'index.js'));
});

test('resolveScript subcommand recurses into scripts/<name>/index.js folder', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts', 'integration'), {
    recursive: true
  });
  await writeFile(
    path.join(repoRoot, 'scripts', 'integration', 'index.js'),
    'console.log("hi")\n'
  );

  const result = await resolveScript(repoRoot, 'integration');

  assert.equal(
    result.relativePath,
    path.join('scripts', 'integration', 'index.js')
  );
});

test('resolveScript subcommand falls through to scripts/ when root misses', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts', 'deploy.sh'),
    '#!/usr/bin/env bash\n'
  );

  const result = await resolveScript(repoRoot, 'deploy');

  assert.equal(result.relativePath, path.join('scripts', 'deploy.sh'));
});

test('resolveScript subcommand returns root <name>.js when no .cjs/.json/folder', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'lint.js'), 'console.log("lint")\n');

  const result = await resolveScript(repoRoot, 'lint');

  assert.equal(result.relativePath, 'lint.js');
});

test('resolveScript subcommand throws with searched list and --script hint on miss', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveScript(repoRoot, 'nope'),
    (error: Error) => {
      assert.match(error.message, /--script/);
      assert.match(error.message, /nope\.cjs/);
      assert.match(error.message, /scripts\/nope\.sh/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// resolveExplicitScript
// ---------------------------------------------------------------------------

test('resolveExplicitScript resolves script at repo root', async () => {
  const repoRoot = await withTempRepo();
  await writeFile(path.join(repoRoot, 'install.js'), 'console.log("ok")\n');

  const result = await resolveExplicitScript(repoRoot, 'install.js');

  assert.equal(result.relativePath, 'install.js');
  assert.equal(
    result.absolutePath,
    await realpath(path.join(repoRoot, 'install.js'))
  );
});

test('resolveExplicitScript resolves script inside scripts/', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(path.join(repoRoot, 'scripts', 'setup.mjs'), 'export {}\n');

  const result = await resolveExplicitScript(repoRoot, 'scripts/setup.mjs');

  assert.equal(result.relativePath, path.join('scripts', 'setup.mjs'));
});

test('resolveExplicitScript rejects traversal via ..', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveExplicitScript(repoRoot, '../outside.sh'),
    /must point to a file inside the (fetched repository|cwd|repo)/
  );
});

test('resolveExplicitScript rejects traversal via symlink that escapes repo', async () => {
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
    () => resolveExplicitScript(repoRoot, 'scripts/install.sh'),
    /must resolve to a file inside the (fetched repository|cwd|repo)/
  );
});

// ---------------------------------------------------------------------------
// resolveScript — containment + traversal rejection
// ---------------------------------------------------------------------------

test('resolveScript default entry rejects package.json#main that resolves outside repo via symlink', async () => {
  const repoRoot = await withTempRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-outside-')
  );
  tempRepos.push(outsideRoot);

  const outsideScript = path.join(outsideRoot, 'evil.js');
  await writeFile(outsideScript, 'console.log("evil")\n');
  await symlink(outsideScript, path.join(repoRoot, 'evil.js'));

  await writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'demo', main: 'evil.js' })
  );

  await assert.rejects(
    () => resolveScript(repoRoot),
    (error: Error) => {
      assert.match(error.message, /outside repo/);
      return true;
    }
  );
});

test('resolveScript default entry rejects index.js symlink that escapes repo', async () => {
  const repoRoot = await withTempRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-index-outside-')
  );
  tempRepos.push(outsideRoot);

  const outsideScript = path.join(outsideRoot, 'evil.js');
  await writeFile(outsideScript, 'console.log("evil")\n');
  await symlink(outsideScript, path.join(repoRoot, 'index.js'));

  await assert.rejects(
    () => resolveScript(repoRoot),
    (error: Error) => {
      assert.match(error.message, /outside repo/);
      return true;
    }
  );
});

test('resolveScript subcommand rejects .. in name', async () => {
  const repoRoot = await withTempRepo();
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'scripts', 'install.js'),
    'console.log("hi")\n'
  );

  await assert.rejects(
    () => resolveScript(repoRoot, '../install'),
    (error: Error) => {
      assert.match(error.message, /must not contain '\.\.'|path separator/i);
      return true;
    }
  );
});

test('resolveScript subcommand rejects name containing path separator', async () => {
  const repoRoot = await withTempRepo();

  await assert.rejects(
    () => resolveScript(repoRoot, 'sub/install'),
    (error: Error) => {
      assert.match(error.message, /must not contain|path separator/i);
      return true;
    }
  );
});

test('resolveScript subcommand rejects folder whose package.json main escapes repo', async () => {
  const repoRoot = await withTempRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'run-repo-discovery-folder-outside-')
  );
  tempRepos.push(outsideRoot);

  const outsideScript = path.join(outsideRoot, 'payload.js');
  await writeFile(outsideScript, 'console.log("evil")\n');

  await mkdir(path.join(repoRoot, 'attack'), { recursive: true });
  await symlink(outsideScript, path.join(repoRoot, 'attack', 'payload.js'));
  await writeFile(
    path.join(repoRoot, 'attack', 'package.json'),
    JSON.stringify({ name: 'attack', main: 'payload.js' })
  );

  await assert.rejects(
    () => resolveScript(repoRoot, 'attack'),
    (error: Error) => {
      assert.match(error.message, /outside repo/);
      return true;
    }
  );
});
