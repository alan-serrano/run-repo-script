import assert from 'node:assert/strict';
import { test } from 'vitest';
import { looksLikeGitHubTarget } from '../../src/fetch.js';

test('looksLikeGitHubTarget accepts shorthand owner/repo', () => {
  assert.equal(looksLikeGitHubTarget('owner/repo'), true);
});

test('looksLikeGitHubTarget accepts shorthand with ref', () => {
  assert.equal(looksLikeGitHubTarget('owner/repo#main'), true);
});

test('looksLikeGitHubTarget accepts GitHub HTTPS URL', () => {
  assert.equal(looksLikeGitHubTarget('https://github.com/owner/repo'), true);
});

test('looksLikeGitHubTarget accepts GitHub HTTPS URL with ref', () => {
  assert.equal(
    looksLikeGitHubTarget('https://github.com/owner/repo#main'),
    true
  );
});

test('looksLikeGitHubTarget rejects empty string', () => {
  assert.equal(looksLikeGitHubTarget(''), false);
});

test('looksLikeGitHubTarget rejects plain word', () => {
  assert.equal(looksLikeGitHubTarget('install'), false);
});

test('looksLikeGitHubTarget rejects non-GitHub URL', () => {
  assert.equal(looksLikeGitHubTarget('https://gitlab.com/owner/repo'), false);
});

test('looksLikeGitHubTarget throws on SSH syntax', () => {
  assert.throws(
    () => looksLikeGitHubTarget('git@github.com:owner/repo.git'),
    /SSH syntax is not supported in v1/
  );
});
