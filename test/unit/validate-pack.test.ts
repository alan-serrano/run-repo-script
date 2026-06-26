import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'vitest';

const tempDirs: string[] = [];

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
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

  const mockBinDir = await createMockNpm(dryRunOutput);

  const result = spawnSync(process.execPath, [validatePackScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PATH: `${mockBinDir}:${process.env.PATH ?? ''}`
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Forbidden paths in package: src\/index\.ts/);
});
