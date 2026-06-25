import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, test, vi, type MockedFunction } from 'vitest';
import { withNonInteractiveTty } from '../helpers/tty.js';
import { runCli } from '../../src/cli.js';
import { fetchRepository } from '../../src/fetch.js';

vi.mock('../../src/fetch.js', () => ({
  fetchRepository: vi.fn()
}));

const fetchRepositoryMock = fetchRepository as MockedFunction<
  typeof fetchRepository
>;

const tempWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempWorkspaces
      .splice(0)
      .map((workspaceDir) => rm(workspaceDir, { recursive: true, force: true }))
  );
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function createWorkspace(): Promise<string> {
  const workspaceDir = await mkdtemp(
    path.join(tmpdir(), 'run-repo-cli-mocked-')
  );
  tempWorkspaces.push(workspaceDir);
  return workspaceDir;
}

function captureStderr(): string[] {
  const stderrMessages: string[] = [];

  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrMessages.push(String(chunk));
    return true;
  });

  return stderrMessages;
}

test('mocked CLI happy path: runCli executes installer and cleans workspace', async () => {
  const workspaceDir = await createWorkspace();
  const markerPath = path.join(tmpdir(), 'run-repo-cli-marker.txt');
  await rm(markerPath, { force: true });

  await writeFile(
    path.join(workspaceDir, 'install.js'),
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, process.argv.slice(2).join(' '));\n`
  );

  fetchRepositoryMock.mockResolvedValue({
    workspaceDir,
    resolvedTarget: {
      owner: 'owner',
      repo: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git'
    }
  });

  const stderrMessages = captureStderr();

  const exitCode = await runCli([
    'owner/repo',
    '--dangerously-skip-confirmation',
    '--',
    '--target',
    'local'
  ]);

  expect(exitCode).toBe(0);
  expect(stderrMessages).toEqual([]);
  expect(await readFile(markerPath, 'utf8')).toBe('--target local');
  await expect(
    readFile(path.join(workspaceDir, 'install.js'))
  ).rejects.toThrow();
});

test('mocked CLI error path: missing installer returns failure and cleanup', async () => {
  const workspaceDir = await createWorkspace();
  const stderrMessages = captureStderr();

  fetchRepositoryMock.mockResolvedValue({
    workspaceDir,
    resolvedTarget: {
      owner: 'owner',
      repo: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git'
    }
  });

  const exitCode = await runCli([
    'owner/repo',
    '--dangerously-skip-confirmation'
  ]);

  expect(exitCode).toBe(1);
  expect(stderrMessages.join('')).toMatch(/No installer script found/);
  await expect(
    readFile(path.join(workspaceDir, 'install.js'))
  ).rejects.toThrow();
});

test('mocked CLI error path: unavailable runner returns deterministic failure', async () => {
  const workspaceDir = await createWorkspace();
  await writeFile(path.join(workspaceDir, 'install.js'), 'console.log("ok")\n');

  fetchRepositoryMock.mockResolvedValue({
    workspaceDir,
    resolvedTarget: {
      owner: 'owner',
      repo: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git'
    }
  });

  const stderrMessages = captureStderr();

  const exitCode = await runCli([
    'owner/repo',
    '--dangerously-skip-confirmation',
    '--runner',
    'definitely-not-supported'
  ]);

  expect(exitCode).toBe(1);
  expect(stderrMessages.join('')).toMatch(/Unsupported --runner value/);
});

test('mocked CLI confirmation contract: non-interactive mode fails fast with dangerous flag guidance', async () => {
  const workspaceDir = await createWorkspace();
  await writeFile(path.join(workspaceDir, 'install.js'), 'console.log("ok")\n');

  fetchRepositoryMock.mockResolvedValue({
    workspaceDir,
    resolvedTarget: {
      owner: 'owner',
      repo: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git'
    }
  });

  const stderrMessages = captureStderr();

  await withNonInteractiveTty(async () => {
    const exitCode = await runCli(['owner/repo']);
    expect(exitCode).toBe(1);
  });

  const stderrText = stderrMessages.join('');
  expect(stderrText).toMatch(/Confirmation requires an interactive terminal/);
  expect(stderrText).toMatch(/--dangerously-skip-confirmation/);
});

test('mocked CLI exit code propagation: runCli forwards non-zero child code', async () => {
  const workspaceDir = await createWorkspace();
  await writeFile(path.join(workspaceDir, 'install.js'), 'process.exit(42)\n');

  fetchRepositoryMock.mockResolvedValue({
    workspaceDir,
    resolvedTarget: {
      owner: 'owner',
      repo: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git'
    }
  });

  const exitCode = await runCli([
    'owner/repo',
    '--dangerously-skip-confirmation',
    '--runner',
    'node'
  ]);

  expect(exitCode).toBe(42);
});

test('mocked CLI error path: rejected SSH input returns failure', async () => {
  const stderrMessages = captureStderr();

  fetchRepositoryMock.mockRejectedValue(
    new Error(
      'Unsupported repository target: SSH syntax is not supported in v1. Use owner/repo or https://github.com/...'
    )
  );

  const exitCode = await runCli(['git@github.com:owner/repo.git']);

  expect(exitCode).toBe(1);
  expect(stderrMessages.join('')).toMatch(/SSH syntax is not supported in v1/);
});

test('mocked CLI contract: legacy --yes flag is rejected', async () => {
  const stderrMessages = captureStderr();

  const exitCode = await runCli(['owner/repo', '--yes']);

  expect(exitCode).toBe(1);
  expect(stderrMessages.join('')).toMatch(/Unknown option '--yes'/);
});

it('mocked CLI help path: runCli responds to --help', async () => {
  const stdoutSpy = vi
    .spyOn(console, 'log')
    .mockImplementation(() => undefined);

  const exitCode = await runCli(['--help']);

  expect(exitCode).toBe(0);
  expect(stdoutSpy).toHaveBeenCalledWith(
    expect.stringMatching(/Usage: run-repo/)
  );
});
