import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import {
  createGitCloneEnvironment,
  createInstallerEnvironment
} from '../../src/env.js';

afterEach(() => {
  vi.clearAllMocks();
});

test('createInstallerEnvironment drops proxy vars with embedded credentials', () => {
  const installerEnv = createInstallerEnvironment({
    PATH: '/usr/bin',
    HTTP_PROXY: 'demo-user:demo-pass@proxy.internal:8080',
    HTTPS_PROXY: 'http://demo-user@proxy.internal:8443',
    ALL_PROXY: 'socks5://demo-token:demo-secret@proxy.internal:1080',
    NO_PROXY: 'localhost,127.0.0.1'
  });

  assert.equal(installerEnv.PATH, '/usr/bin');
  assert.equal(installerEnv.HTTP_PROXY, undefined);
  assert.equal(installerEnv.HTTPS_PROXY, undefined);
  assert.equal(installerEnv.ALL_PROXY, undefined);
  assert.equal(installerEnv.NO_PROXY, 'localhost,127.0.0.1');
});

test('createInstallerEnvironment keeps proxy vars without credentials', () => {
  const installerEnv = createInstallerEnvironment({
    HTTP_PROXY: 'proxy.internal:8080',
    HTTPS_PROXY: 'http://proxy.internal:8443',
    ALL_PROXY: 'socks5://proxy.internal:1080',
    NO_PROXY: 'localhost,127.0.0.1'
  });

  assert.equal(installerEnv.HTTP_PROXY, 'proxy.internal:8080');
  assert.equal(installerEnv.HTTPS_PROXY, 'http://proxy.internal:8443');
  assert.equal(installerEnv.ALL_PROXY, 'socks5://proxy.internal:1080');
  assert.equal(installerEnv.NO_PROXY, 'localhost,127.0.0.1');
});

test('createGitCloneEnvironment drops only credential-bearing proxy vars and keeps clone auth tokens', () => {
  const cloneEnv = createGitCloneEnvironment({
    PATH: '/usr/bin',
    HTTP_PROXY: 'http://demo-user:demo-pass@proxy.internal:8080',
    HTTPS_PROXY: 'http://proxy.internal:8443',
    ALL_PROXY: 'socks5://demo-token:demo-secret@proxy.internal:1080',
    NO_PROXY: 'localhost,127.0.0.1',
    GH_TOKEN: 'fixture-gh-token',
    GITHUB_TOKEN: 'fixture-github-token'
  });

  assert.equal(cloneEnv.PATH, '/usr/bin');
  assert.equal(cloneEnv.HTTP_PROXY, undefined);
  assert.equal(cloneEnv.HTTPS_PROXY, 'http://proxy.internal:8443');
  assert.equal(cloneEnv.ALL_PROXY, undefined);
  assert.equal(cloneEnv.NO_PROXY, 'localhost,127.0.0.1');
  assert.equal(cloneEnv.GH_TOKEN, 'fixture-gh-token');
  assert.equal(cloneEnv.GITHUB_TOKEN, 'fixture-github-token');
});
