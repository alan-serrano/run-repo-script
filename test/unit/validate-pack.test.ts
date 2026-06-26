import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'vitest';

const tempDirs: string[] = [];

const validatePackScript = fileURLToPath(
  new URL('../../scripts/validate-pack.mjs', import.meta.url)
);

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createMockNpm(dryRunOutput: string): Promise<string> {
  const binDir = await mkdtemp(path.join(tmpdir(), 'run-repo-mock-npm-'));
  tempDirs.push(binDir);

  const npmPath = path.join(binDir, 'npm');
  await writeFile(
    npmPath,
    `#!/bin/sh
if [ "$1" = "pack" ]; then
  cat <<'EOF'
${dryRunOutput}
EOF
  exit 0
fi
echo "unexpected npm args: $@" >&2
exit 2
`
  );
  await chmod(npmPath, 0o755);

  return binDir;
}

async function createWorkspace(cliContent: string): Promise<string> {
  const workspaceDir = await mkdtemp(
    path.join(tmpdir(), 'run-repo-pack-workspace-')
  );
  tempDirs.push(workspaceDir);

  await mkdir(path.join(workspaceDir, 'dist'), { recursive: true });
  await writeFile(path.join(workspaceDir, 'dist/cli.js'), cliContent);

  return workspaceDir;
}

function runValidatePack(mockBinDir: string, cwd: string) {
  return spawnSync(process.execPath, [validatePackScript], {
    cwd,
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${process.env.PATH ?? ''}`
    },
    encoding: 'utf8'
  });
}

test('pack:check fails when dry-run includes forbidden package paths', async () => {
  const dryRunOutput = JSON.stringify([
    {
      files: [
        { path: 'README.md' },
        { path: 'dist/cli.js' },
        { path: 'src/index.ts' }
      ]
    }
  ]);

  const workspaceDir = await createWorkspace(
    '#!/usr/bin/env node\nconsole.log("ok")\n'
  );
  const mockBinDir = await createMockNpm(dryRunOutput);
  const result = runValidatePack(mockBinDir, workspaceDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Forbidden paths in package: src\/index\.ts/);
});

test('pack:check fails when dist/cli.js is missing the node shebang', async () => {
  const dryRunOutput = JSON.stringify([
    {
      files: [
        { path: 'README.md' },
        { path: 'package.json' },
        { path: 'dist/cli.js' }
      ]
    }
  ]);

  const workspaceDir = await createWorkspace(
    'console.log("missing shebang")\n'
  );
  const mockBinDir = await createMockNpm(dryRunOutput);
  const result = runValidatePack(mockBinDir, workspaceDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLI bin is missing required shebang/);
});

test('pack:check passes when dist/cli.js starts with the node shebang', async () => {
  const dryRunOutput = JSON.stringify([
    {
      files: [
        { path: 'README.md' },
        { path: 'package.json' },
        { path: 'dist/cli.js' }
      ]
    }
  ]);

  const workspaceDir = await createWorkspace(
    '#!/usr/bin/env node\nconsole.log("ok")\n'
  );
  const mockBinDir = await createMockNpm(dryRunOutput);
  const result = runValidatePack(mockBinDir, workspaceDir);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Package validation passed\./);
});
