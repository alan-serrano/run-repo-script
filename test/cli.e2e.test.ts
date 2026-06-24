import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/cli.js';

async function createWorkspace(t: test.TestContext): Promise<string> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'run-repo-cli-e2e-'));
  t.after(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });
  return workspaceDir;
}

async function runNodeScript(
  scriptPath: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

test('e2e happy path: runCli executes installer and cleans workspace', async (t) => {
  const workspaceDir = await createWorkspace(t);
  const markerPath = path.join(tmpdir(), 'run-repo-cli-marker.txt');
  await rm(markerPath, { force: true });

  await writeFile(
    path.join(workspaceDir, 'install.js'),
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, process.argv.slice(2).join(' '));\n`
  );

  const stderrMessages: string[] = [];
  const exitCode = await runCli(
    ['owner/repo', '--yes', '--', '--target', 'local'],
    {
      fetchRepository: async () => ({
        workspaceDir,
        resolvedTarget: {
          owner: 'owner',
          repo: 'repo',
          cloneUrl: 'https://github.com/owner/repo.git'
        }
      }),
      stderr: {
        write(chunk: string) {
          stderrMessages.push(chunk);
          return true;
        }
      }
    }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(stderrMessages, []);
  assert.equal(await readFile(markerPath, 'utf8'), '--target local');
  await assert.rejects(() => readFile(path.join(workspaceDir, 'install.js')));
});

test('e2e error path: missing installer returns failure and cleanup', async (t) => {
  const workspaceDir = await createWorkspace(t);
  const stderrMessages: string[] = [];

  const exitCode = await runCli(['owner/repo', '--yes'], {
    fetchRepository: async () => ({
      workspaceDir,
      resolvedTarget: {
        owner: 'owner',
        repo: 'repo',
        cloneUrl: 'https://github.com/owner/repo.git'
      }
    }),
    stderr: {
      write(chunk: string) {
        stderrMessages.push(chunk);
        return true;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderrMessages.join(''), /No installer script found/);
  await assert.rejects(() => readFile(path.join(workspaceDir, 'install.js')));
});

test('e2e error path: unavailable runner returns deterministic failure', async (t) => {
  const workspaceDir = await createWorkspace(t);
  await writeFile(path.join(workspaceDir, 'install.js'), 'console.log("ok")\n');

  const stderrMessages: string[] = [];
  const exitCode = await runCli(['owner/repo', '--yes'], {
    fetchRepository: async () => ({
      workspaceDir,
      resolvedTarget: {
        owner: 'owner',
        repo: 'repo',
        cloneUrl: 'https://github.com/owner/repo.git'
      }
    }),
    executeInstaller: async () => {
      throw new Error(
        'Runner "zx" is not available on this host. Install it or use --runner with an available runtime.'
      );
    },
    stderr: {
      write(chunk: string) {
        stderrMessages.push(chunk);
        return true;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderrMessages.join(''), /Runner "zx" is not available/);
});

test('e2e confirmation contract: decline returns exit code 1', async (t) => {
  const workspaceDir = await createWorkspace(t);
  await writeFile(path.join(workspaceDir, 'install.js'), 'console.log("ok")\n');

  const stderrMessages: string[] = [];
  const exitCode = await runCli(['owner/repo'], {
    fetchRepository: async () => ({
      workspaceDir,
      resolvedTarget: {
        owner: 'owner',
        repo: 'repo',
        cloneUrl: 'https://github.com/owner/repo.git'
      }
    }),
    executeInstaller: async () => {
      throw new Error('Execution cancelled by user.');
    },
    stderr: {
      write(chunk: string) {
        stderrMessages.push(chunk);
        return true;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderrMessages.join(''), /Execution cancelled by user/);
});

test('e2e exit code propagation: runCli forwards non-zero child code', async (t) => {
  const workspaceDir = await createWorkspace(t);
  await writeFile(path.join(workspaceDir, 'install.js'), 'console.log("ok")\n');

  const exitCode = await runCli(['owner/repo', '--yes'], {
    fetchRepository: async () => ({
      workspaceDir,
      resolvedTarget: {
        owner: 'owner',
        repo: 'repo',
        cloneUrl: 'https://github.com/owner/repo.git'
      }
    }),
    executeInstaller: async () => 42
  });

  assert.equal(exitCode, 42);
});

test('e2e error path: rejected SSH input returns failure', async () => {
  const stderrMessages: string[] = [];
  const exitCode = await runCli(['git@github.com:owner/repo.git', '--yes'], {
    stderr: {
      write(chunk: string) {
        stderrMessages.push(chunk);
        return true;
      }
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderrMessages.join(''), /SSH syntax is not supported in v1/);
});

test('e2e build entrypoint: compiled cli responds to --help', async () => {
  const currentTestPath = fileURLToPath(import.meta.url);
  const distRoot = path.resolve(path.dirname(currentTestPath), '..');
  const cliPath = path.join(distRoot, 'src/cli.js');

  const result = await runNodeScript(cliPath, ['--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: run-repo/);
});
