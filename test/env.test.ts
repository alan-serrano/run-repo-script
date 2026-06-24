import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstallerEnvironment } from '../src/env.js';

test('createInstallerEnvironment drops proxy vars with embedded credentials', () => {
  const installerEnv = createInstallerEnvironment({
    PATH: '/usr/bin',
    HTTP_PROXY: 'user:pass@proxy.internal:8080',
    HTTPS_PROXY: 'http://user@proxy.internal:8443',
    ALL_PROXY: 'socks5://token:secret@proxy.internal:1080',
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
