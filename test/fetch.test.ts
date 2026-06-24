import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cloneIntoDirectory,
  createGitCloneCommand,
  resolveGitHubTarget,
  SAFE_GIT_ENV
} from '../src/fetch.js';

test('resolveGitHubTarget accepts shorthand with ref', () => {
  const resolved = resolveGitHubTarget('owner/repo#v1.2.3');

  assert.equal(resolved.owner, 'owner');
  assert.equal(resolved.repo, 'repo');
  assert.equal(resolved.ref, 'v1.2.3');
  assert.equal(resolved.cloneUrl, 'https://github.com/owner/repo.git');
});

test('resolveGitHubTarget accepts GitHub HTTPS url', () => {
  const resolved = resolveGitHubTarget(
    'https://github.com/octo/project.git#main'
  );

  assert.equal(resolved.owner, 'octo');
  assert.equal(resolved.repo, 'project');
  assert.equal(resolved.ref, 'main');
  assert.equal(resolved.cloneUrl, 'https://github.com/octo/project.git');
});

test('resolveGitHubTarget rejects SSH syntax', () => {
  assert.throws(
    () => resolveGitHubTarget('git@github.com:octo/project.git'),
    /SSH syntax is not supported in v1/
  );
});

test('resolveGitHubTarget rejects non-GitHub host', () => {
  assert.throws(
    () => resolveGitHubTarget('https://gitlab.com/octo/project.git'),
    /Only github.com is supported/
  );
});

test('createGitCloneCommand builds shallow clone command with minimal clone env', () => {
  const previousSecret = process.env.RUN_REPO_TEST_SECRET_TOKEN;
  const previousPlain = process.env.RUN_REPO_TEST_PLAIN;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousGhToken = process.env.GH_TOKEN;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  const previousAllProxy = process.env.ALL_PROXY;
  const previousNoProxy = process.env.NO_PROXY;
  process.env.RUN_REPO_TEST_SECRET_TOKEN = 'fixture-sensitive';
  process.env.RUN_REPO_TEST_PLAIN = 'safe';
  process.env.DATABASE_URL = 'fixture-db-url';
  process.env.GH_TOKEN = 'fixture-gh-token';
  process.env.GITHUB_TOKEN = 'fixture-github-token';
  process.env.HTTP_PROXY = 'http://demo-user:demo-pass@proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://proxy.internal:8443';
  process.env.ALL_PROXY = 'socks5://demo-token:demo-secret@proxy.internal:1080';
  process.env.NO_PROXY = 'localhost,127.0.0.1';

  const command = createGitCloneCommand(
    {
      owner: 'owner',
      repo: 'repo',
      ref: 'release/v1',
      cloneUrl: 'https://github.com/owner/repo.git'
    },
    '/tmp/run-repo-abc'
  );

  try {
    assert.equal(command.command, 'git');
    assert.deepEqual(command.args, [
      'clone',
      '--depth',
      '1',
      '--branch',
      'release/v1',
      '--single-branch',
      'https://github.com/owner/repo.git',
      '/tmp/run-repo-abc'
    ]);
    assert.equal(
      command.env.GIT_TERMINAL_PROMPT,
      SAFE_GIT_ENV.GIT_TERMINAL_PROMPT
    );
    assert.equal(command.env.GIT_SSH_COMMAND, SAFE_GIT_ENV.GIT_SSH_COMMAND);
    assert.equal(command.env.RUN_REPO_TEST_SECRET_TOKEN, undefined);
    assert.equal(command.env.RUN_REPO_TEST_PLAIN, undefined);
    assert.equal(command.env.DATABASE_URL, undefined);
    assert.equal(command.env.GH_TOKEN, 'fixture-gh-token');
    assert.equal(command.env.GITHUB_TOKEN, 'fixture-github-token');
    assert.equal(command.env.HTTP_PROXY, undefined);
    assert.equal(command.env.HTTPS_PROXY, 'http://proxy.internal:8443');
    assert.equal(command.env.ALL_PROXY, undefined);
    assert.equal(command.env.NO_PROXY, 'localhost,127.0.0.1');
  } finally {
    if (previousSecret === undefined) {
      delete process.env.RUN_REPO_TEST_SECRET_TOKEN;
    } else {
      process.env.RUN_REPO_TEST_SECRET_TOKEN = previousSecret;
    }

    if (previousPlain === undefined) {
      delete process.env.RUN_REPO_TEST_PLAIN;
    } else {
      process.env.RUN_REPO_TEST_PLAIN = previousPlain;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = previousGhToken;
    }

    if (previousGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGithubToken;
    }

    if (previousHttpProxy === undefined) {
      delete process.env.HTTP_PROXY;
    } else {
      process.env.HTTP_PROXY = previousHttpProxy;
    }

    if (previousHttpsProxy === undefined) {
      delete process.env.HTTPS_PROXY;
    } else {
      process.env.HTTPS_PROXY = previousHttpsProxy;
    }

    if (previousAllProxy === undefined) {
      delete process.env.ALL_PROXY;
    } else {
      process.env.ALL_PROXY = previousAllProxy;
    }

    if (previousNoProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = previousNoProxy;
    }
  }
});

test('createGitCloneCommand drops bare credential-bearing proxy values while preserving safe clone env values', () => {
  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  const previousAllProxy = process.env.ALL_PROXY;
  const previousNoProxy = process.env.NO_PROXY;
  const previousGhToken = process.env.GH_TOKEN;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  process.env.HTTP_PROXY = 'demo-user:demo-pass@proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://proxy.internal:8443';
  process.env.ALL_PROXY = 'socks5://proxy.internal:1080';
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  process.env.GH_TOKEN = 'fixture-gh-token';
  process.env.GITHUB_TOKEN = 'fixture-github-token';

  const command = createGitCloneCommand(
    {
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      cloneUrl: 'https://github.com/owner/repo.git'
    },
    '/tmp/run-repo-bare-proxy'
  );

  try {
    assert.equal(command.env.HTTP_PROXY, undefined);
    assert.equal(command.env.HTTPS_PROXY, 'http://proxy.internal:8443');
    assert.equal(command.env.ALL_PROXY, 'socks5://proxy.internal:1080');
    assert.equal(command.env.NO_PROXY, 'localhost,127.0.0.1');
    assert.equal(command.env.GH_TOKEN, 'fixture-gh-token');
    assert.equal(command.env.GITHUB_TOKEN, 'fixture-github-token');
  } finally {
    if (previousHttpProxy === undefined) {
      delete process.env.HTTP_PROXY;
    } else {
      process.env.HTTP_PROXY = previousHttpProxy;
    }

    if (previousHttpsProxy === undefined) {
      delete process.env.HTTPS_PROXY;
    } else {
      process.env.HTTPS_PROXY = previousHttpsProxy;
    }

    if (previousAllProxy === undefined) {
      delete process.env.ALL_PROXY;
    } else {
      process.env.ALL_PROXY = previousAllProxy;
    }

    if (previousNoProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = previousNoProxy;
    }

    if (previousGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = previousGhToken;
    }

    if (previousGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGithubToken;
    }
  }
});

test('cloneIntoDirectory forwards only safe clone env values to the spawned clone process', async (t) => {
  const workspaceDir = await mkdtemp(
    path.join(tmpdir(), 'run-repo-fetch-clone-boundary-')
  );
  t.after(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  const binDir = path.join(workspaceDir, 'bin');
  await mkdir(binDir, { recursive: true });

  const envCapturePath = path.join(workspaceDir, 'git-env-capture.json');
  const fakeGitPath = path.join(binDir, 'git');
  const fakeGitScript = `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const missing = '<missing>';
const payload = {
  args: process.argv.slice(2),
  env: {
    GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? missing,
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? missing,
    GCM_INTERACTIVE: process.env.GCM_INTERACTIVE ?? missing,
    HTTP_PROXY: process.env.HTTP_PROXY ?? missing,
    HTTPS_PROXY: process.env.HTTPS_PROXY ?? missing,
    ALL_PROXY: process.env.ALL_PROXY ?? missing,
    NO_PROXY: process.env.NO_PROXY ?? missing,
    GH_TOKEN: process.env.GH_TOKEN ?? missing,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? missing,
    DATABASE_URL: process.env.DATABASE_URL ?? missing
  }
};

writeFileSync(${JSON.stringify(envCapturePath)}, JSON.stringify(payload));
`;

  await writeFile(fakeGitPath, fakeGitScript);
  await chmod(fakeGitPath, 0o755);

  const previousEnv = {
    PATH: process.env.PATH,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    ALL_PROXY: process.env.ALL_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    GH_TOKEN: process.env.GH_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL
  };

  process.env.PATH = previousEnv.PATH
    ? `${binDir}${path.delimiter}${previousEnv.PATH}`
    : binDir;
  process.env.HTTP_PROXY = 'http://demo-user:demo-pass@proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://proxy.internal:8443';
  process.env.ALL_PROXY = 'demo-user:demo-pass@proxy.internal:1080';
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  process.env.GH_TOKEN = 'fixture-gh-token';
  process.env.GITHUB_TOKEN = 'fixture-github-token';
  process.env.DATABASE_URL = 'fixture-db-url';

  const destinationDir = path.join(workspaceDir, 'repo-checkout');

  try {
    await cloneIntoDirectory(
      {
        owner: 'owner',
        repo: 'repo',
        cloneUrl: 'https://github.com/owner/repo.git'
      },
      destinationDir
    );

    const captured = JSON.parse(await readFile(envCapturePath, 'utf8')) as {
      args: string[];
      env: Record<string, string>;
    };

    assert.deepEqual(captured.args, [
      'clone',
      '--depth',
      '1',
      'https://github.com/owner/repo.git',
      destinationDir
    ]);
    assert.equal(
      captured.env.GIT_TERMINAL_PROMPT,
      SAFE_GIT_ENV.GIT_TERMINAL_PROMPT
    );
    assert.equal(captured.env.GIT_SSH_COMMAND, SAFE_GIT_ENV.GIT_SSH_COMMAND);
    assert.equal(captured.env.GCM_INTERACTIVE, SAFE_GIT_ENV.GCM_INTERACTIVE);
    assert.equal(captured.env.HTTP_PROXY, '<missing>');
    assert.equal(captured.env.HTTPS_PROXY, 'http://proxy.internal:8443');
    assert.equal(captured.env.ALL_PROXY, '<missing>');
    assert.equal(captured.env.NO_PROXY, 'localhost,127.0.0.1');
    assert.equal(captured.env.GH_TOKEN, 'fixture-gh-token');
    assert.equal(captured.env.GITHUB_TOKEN, 'fixture-github-token');
    assert.equal(captured.env.DATABASE_URL, '<missing>');
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
