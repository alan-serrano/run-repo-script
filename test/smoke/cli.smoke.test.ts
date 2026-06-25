import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntrypoint = fileURLToPath(
  new URL('../../dist/src/cli.js', import.meta.url)
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
