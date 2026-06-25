import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('createGitCloneCommand builds shallow clone command with safe env', () => {
  const command = createGitCloneCommand(
    {
      owner: 'owner',
      repo: 'repo',
      ref: 'release/v1',
      cloneUrl: 'https://github.com/owner/repo.git'
    },
    '/tmp/run-repo-abc'
  );

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
});
