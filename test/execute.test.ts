import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createRunnerEnvironment,
  executeInstaller,
  isConfirmationAccepted,
  isRunnerAvailable,
  resolveRunner
} from '../src/execute.js';

async function withTempRepo(t: test.TestContext): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'run-repo-execute-test-'));
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

async function withNonInteractiveTty<T>(action: () => Promise<T>): Promise<T> {
  const hadStdinIsTTY = Object.prototype.hasOwnProperty.call(
    process.stdin,
    'isTTY'
  );
  const hadStdoutIsTTY = Object.prototype.hasOwnProperty.call(
    process.stdout,
    'isTTY'
  );
  const previousStdinIsTTY = process.stdin.isTTY;
  const previousStdoutIsTTY = process.stdout.isTTY;

  Object.defineProperty(process.stdin, 'isTTY', {
    value: false,
    configurable: true,
    writable: true
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: false,
    configurable: true,
    writable: true
  });

  try {
    return await action();
  } finally {
    if (hadStdinIsTTY) {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: previousStdinIsTTY,
        configurable: true,
        writable: true
      });
    } else {
      delete (process.stdin as unknown as { isTTY?: boolean }).isTTY;
    }

    if (hadStdoutIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: previousStdoutIsTTY,
        configurable: true,
        writable: true
      });
    } else {
      delete (process.stdout as unknown as { isTTY?: boolean }).isTTY;
    }
  }
}

test('resolveRunner prefers --runner override', async (t) => {
  const repoRoot = await withTempRepo(t);
  const scriptPath = path.join(repoRoot, 'install.sh');
  await writeFile(scriptPath, '#!/usr/bin/env bash\necho ok\n');

  const runner = await resolveRunner(scriptPath, 'install.sh', 'node');
  assert.equal(runner, 'node');
});

test('resolveRunner reads zx from shebang', async (t) => {
  const repoRoot = await withTempRepo(t);
  const scriptPath = path.join(repoRoot, 'install.mjs');
  await writeFile(scriptPath, '#!/usr/bin/env zx\nconsole.log("ok")\n');

  const runner = await resolveRunner(scriptPath, 'install.mjs');
  assert.equal(runner, 'zx');
});

test('resolveRunner falls back by extension', async (t) => {
  const repoRoot = await withTempRepo(t);
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });
  const shellScriptPath = path.join(repoRoot, 'scripts/install.sh');
  await writeFile(shellScriptPath, 'echo ok\n');

  const shellRunner = await resolveRunner(
    shellScriptPath,
    'scripts/install.sh'
  );
  assert.equal(shellRunner, 'bash');

  const nodeScriptPath = path.join(repoRoot, 'install.js');
  await writeFile(nodeScriptPath, 'console.log("ok")\n');

  const nodeRunner = await resolveRunner(nodeScriptPath, 'install.js');
  assert.equal(nodeRunner, 'node');
});

test('isRunnerAvailable detects known and unknown runtimes', async () => {
  assert.equal(await isRunnerAvailable('node'), true);
  const zxAvailable = await isRunnerAvailable('zx');
  assert.equal(typeof zxAvailable, 'boolean');
});

test('isConfirmationAccepted treats empty answer as yes by default', () => {
  assert.equal(isConfirmationAccepted(''), true);
  assert.equal(isConfirmationAccepted('   '), true);
  assert.equal(isConfirmationAccepted('y'), true);
  assert.equal(isConfirmationAccepted('yes'), true);
  assert.equal(isConfirmationAccepted('n'), false);
});

test('executeInstaller bypasses prompt with dangerous skip confirmation and forwards args', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'argv.txt');
  const scriptPath = path.join(repoRoot, 'install.js');

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync('argv.txt', process.argv.slice(2).join(' '));\n`
  );

  const exitCode = await executeInstaller({
    repoRoot,
    script: {
      absolutePath: scriptPath,
      relativePath: 'install.js'
    },
    dangerouslySkipConfirmation: true,
    forwardArgs: ['--target', 'local'],
    runnerOverride: undefined
  });

  assert.equal(exitCode, 0);
  assert.equal(await readFile(markerPath, 'utf8'), '--target local');
});

test('executeInstaller prevents option injection for leading-dash script names', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'safe-marker.txt');
  const scriptPath = path.join(repoRoot, '-c');
  const scriptContent = [
    '#!/usr/bin/env bash',
    `echo safe > ${JSON.stringify(markerPath)}`,
    ''
  ].join('\n');

  await writeFile(scriptPath, scriptContent);

  const exitCode = await executeInstaller({
    repoRoot,
    script: {
      absolutePath: scriptPath,
      relativePath: '-c'
    },
    dangerouslySkipConfirmation: true,
    forwardArgs: [],
    runnerOverride: 'bash'
  });

  assert.equal(exitCode, 0);
  assert.equal((await readFile(markerPath, 'utf8')).trim(), 'safe');
});

test('executeInstaller strips obvious secret variables from child environment', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'env-check.txt');
  const scriptPath = path.join(repoRoot, 'install.js');
  const previousSecret = process.env.RUN_REPO_TEST_SECRET_TOKEN;
  process.env.RUN_REPO_TEST_SECRET_TOKEN = 'fixture-sensitive';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const value = process.env.RUN_REPO_TEST_SECRET_TOKEN ?? '';
writeFileSync('env-check.txt', value);
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);
    assert.equal(await readFile(markerPath, 'utf8'), '');
  } finally {
    if (previousSecret === undefined) {
      delete process.env.RUN_REPO_TEST_SECRET_TOKEN;
    } else {
      process.env.RUN_REPO_TEST_SECRET_TOKEN = previousSecret;
    }
  }
});

test('executeInstaller preserves non-credential proxy and cert vars while still stripping secrets', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'env-network-check.json');
  const scriptPath = path.join(repoRoot, 'install.js');

  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  const previousAllProxy = process.env.ALL_PROXY;
  const previousNoProxy = process.env.NO_PROXY;
  const previousSslCertFile = process.env.SSL_CERT_FILE;
  const previousSslCertDir = process.env.SSL_CERT_DIR;
  const previousNodeExtraCaCerts = process.env.NODE_EXTRA_CA_CERTS;
  const previousSecret = process.env.RUN_REPO_TEST_SECRET_TOKEN;

  process.env.HTTP_PROXY = 'http://proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://proxy.internal:8443';
  process.env.ALL_PROXY = 'socks5://proxy.internal:1080';
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  process.env.SSL_CERT_FILE = '/etc/ssl/certs/corp.pem';
  process.env.SSL_CERT_DIR = '/etc/ssl/certs';
  process.env.NODE_EXTRA_CA_CERTS = '/etc/ssl/certs/corp-node.pem';
  process.env.RUN_REPO_TEST_SECRET_TOKEN = 'fixture-sensitive';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const values = {
  httpProxy: process.env.HTTP_PROXY ?? '',
  httpsProxy: process.env.HTTPS_PROXY ?? '',
  allProxy: process.env.ALL_PROXY ?? '',
  noProxy: process.env.NO_PROXY ?? '',
  sslCertFile: process.env.SSL_CERT_FILE ?? '',
  sslCertDir: process.env.SSL_CERT_DIR ?? '',
  nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? '',
  secret: process.env.RUN_REPO_TEST_SECRET_TOKEN ?? ''
};
writeFileSync('env-network-check.json', JSON.stringify(values));
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);

    const values = JSON.parse(await readFile(markerPath, 'utf8')) as {
      httpProxy: string;
      httpsProxy: string;
      allProxy: string;
      noProxy: string;
      sslCertFile: string;
      sslCertDir: string;
      nodeExtraCaCerts: string;
      secret: string;
    };

    assert.equal(values.httpProxy, 'http://proxy.internal:8080');
    assert.equal(values.httpsProxy, 'http://proxy.internal:8443');
    assert.equal(values.allProxy, 'socks5://proxy.internal:1080');
    assert.equal(values.noProxy, 'localhost,127.0.0.1');
    assert.equal(values.sslCertFile, '/etc/ssl/certs/corp.pem');
    assert.equal(values.sslCertDir, '/etc/ssl/certs');
    assert.equal(values.nodeExtraCaCerts, '/etc/ssl/certs/corp-node.pem');
    assert.equal(values.secret, '');
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

    if (previousSslCertFile === undefined) {
      delete process.env.SSL_CERT_FILE;
    } else {
      process.env.SSL_CERT_FILE = previousSslCertFile;
    }

    if (previousSslCertDir === undefined) {
      delete process.env.SSL_CERT_DIR;
    } else {
      process.env.SSL_CERT_DIR = previousSslCertDir;
    }

    if (previousNodeExtraCaCerts === undefined) {
      delete process.env.NODE_EXTRA_CA_CERTS;
    } else {
      process.env.NODE_EXTRA_CA_CERTS = previousNodeExtraCaCerts;
    }

    if (previousSecret === undefined) {
      delete process.env.RUN_REPO_TEST_SECRET_TOKEN;
    } else {
      process.env.RUN_REPO_TEST_SECRET_TOKEN = previousSecret;
    }
  }
});

test('executeInstaller drops credential-bearing proxy vars while preserving NO_PROXY and cert vars', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(
    repoRoot,
    'env-network-credential-proxy-check.json'
  );
  const scriptPath = path.join(repoRoot, 'install.js');

  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  const previousAllProxy = process.env.ALL_PROXY;
  const previousNoProxy = process.env.NO_PROXY;
  const previousSslCertFile = process.env.SSL_CERT_FILE;
  const previousNodeExtraCaCerts = process.env.NODE_EXTRA_CA_CERTS;

  process.env.HTTP_PROXY = 'http://demo-user:demo-pass@proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://demo-user@proxy.internal:8443';
  process.env.ALL_PROXY = 'socks5://demo-token:demo-secret@proxy.internal:1080';
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  process.env.SSL_CERT_FILE = '/etc/ssl/certs/corp.pem';
  process.env.NODE_EXTRA_CA_CERTS = '/etc/ssl/certs/corp-node.pem';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const values = {
  httpProxy: process.env.HTTP_PROXY ?? '',
  httpsProxy: process.env.HTTPS_PROXY ?? '',
  allProxy: process.env.ALL_PROXY ?? '',
  noProxy: process.env.NO_PROXY ?? '',
  sslCertFile: process.env.SSL_CERT_FILE ?? '',
  nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? ''
};
writeFileSync('env-network-credential-proxy-check.json', JSON.stringify(values));
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);

    const values = JSON.parse(await readFile(markerPath, 'utf8')) as {
      httpProxy: string;
      httpsProxy: string;
      allProxy: string;
      noProxy: string;
      sslCertFile: string;
      nodeExtraCaCerts: string;
    };

    assert.equal(values.httpProxy, '');
    assert.equal(values.httpsProxy, '');
    assert.equal(values.allProxy, '');
    assert.equal(values.noProxy, 'localhost,127.0.0.1');
    assert.equal(values.sslCertFile, '/etc/ssl/certs/corp.pem');
    assert.equal(values.nodeExtraCaCerts, '/etc/ssl/certs/corp-node.pem');
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

    if (previousSslCertFile === undefined) {
      delete process.env.SSL_CERT_FILE;
    } else {
      process.env.SSL_CERT_FILE = previousSslCertFile;
    }

    if (previousNodeExtraCaCerts === undefined) {
      delete process.env.NODE_EXTRA_CA_CERTS;
    } else {
      process.env.NODE_EXTRA_CA_CERTS = previousNodeExtraCaCerts;
    }
  }
});

test('executeInstaller drops bare credential-bearing proxy values in execution path', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'env-bare-proxy-check.json');
  const scriptPath = path.join(repoRoot, 'install.js');

  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;

  process.env.HTTP_PROXY = 'demo-user:demo-pass@proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://proxy.internal:8443';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const values = {
  httpProxy: process.env.HTTP_PROXY ?? '',
  httpsProxy: process.env.HTTPS_PROXY ?? ''
};
writeFileSync('env-bare-proxy-check.json', JSON.stringify(values));
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);

    const values = JSON.parse(await readFile(markerPath, 'utf8')) as {
      httpProxy: string;
      httpsProxy: string;
    };

    assert.equal(values.httpProxy, '');
    assert.equal(values.httpsProxy, 'http://proxy.internal:8443');
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
  }
});

test('executeInstaller still strips GitHub auth tokens from child environment', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'github-token-check.txt');
  const scriptPath = path.join(repoRoot, 'install.js');
  const previousGithubToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'fixture-github-token';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const value = process.env.GITHUB_TOKEN ?? '';
writeFileSync('github-token-check.txt', value);
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);
    assert.equal(await readFile(markerPath, 'utf8'), '');
  } finally {
    if (previousGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGithubToken;
    }
  }
});

test('executeInstaller strips DATABASE_URL from child environment', async (t) => {
  const repoRoot = await withTempRepo(t);
  const markerPath = path.join(repoRoot, 'database-url-check.txt');
  const scriptPath = path.join(repoRoot, 'install.js');
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'fixture-database-url';

  await writeFile(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const value = process.env.DATABASE_URL ?? '';
writeFileSync('database-url-check.txt', value);
`
  );

  try {
    const exitCode = await executeInstaller({
      repoRoot,
      script: {
        absolutePath: scriptPath,
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: 'node'
    });

    assert.equal(exitCode, 0);
    assert.equal(await readFile(markerPath, 'utf8'), '');
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});

test('executeInstaller uses confirmation path when dangerous skip confirmation is not passed', async () => {
  let confirmationCalled = false;

  const exitCode = await executeInstaller(
    {
      repoRoot: '/repo',
      script: {
        absolutePath: '/repo/install.js',
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: false,
      forwardArgs: ['--target', 'local'],
      runnerOverride: undefined
    },
    {
      resolveRunner: async () => 'node',
      isRunnerAvailable: async () => true,
      confirmExecution: async (runner, scriptRelativePath, forwardArgs) => {
        confirmationCalled = true;
        assert.equal(runner, 'node');
        assert.equal(scriptRelativePath, 'install.js');
        assert.deepEqual(forwardArgs, ['--target', 'local']);
        return true;
      },
      runInstaller: async () => 0
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(confirmationCalled, true);
});

test('executeInstaller fails fast with clear error in non-interactive confirmation path', async () => {
  await withNonInteractiveTty(async () => {
    await assert.rejects(
      () =>
        executeInstaller(
          {
            repoRoot: '/repo',
            script: {
              absolutePath: '/repo/install.js',
              relativePath: 'install.js'
            },
            dangerouslySkipConfirmation: false,
            forwardArgs: [],
            runnerOverride: undefined
          },
          {
            resolveRunner: async () => 'node',
            isRunnerAvailable: async () => true,
            runInstaller: async () => 0
          }
        ),
      /Confirmation requires an interactive terminal\. Re-run with --dangerously-skip-confirmation/
    );
  });
});

test('createRunnerEnvironment enables documented zx verbosity via ZX_VERBOSE=true', () => {
  const nodeEnv = createRunnerEnvironment('node', { PATH: '/usr/bin' });
  assert.equal(nodeEnv.ZX_VERBOSE, undefined);

  const zxEnv = createRunnerEnvironment('zx', { PATH: '/usr/bin' });
  assert.equal(zxEnv.ZX_VERBOSE, 'true');
});

test('executeInstaller fails deterministically when runner is unavailable', async () => {
  await assert.rejects(
    () =>
      executeInstaller(
        {
          repoRoot: '/repo',
          script: {
            absolutePath: '/repo/install.mjs',
            relativePath: 'install.mjs'
          },
          dangerouslySkipConfirmation: true,
          forwardArgs: [],
          runnerOverride: undefined
        },
        {
          resolveRunner: async () => 'zx',
          isRunnerAvailable: async () => false,
          confirmExecution: async () => true,
          runInstaller: async () => 0
        }
      ),
    /Runner "zx" is not available/
  );
});

test('executeInstaller rejects when user declines confirmation', async () => {
  let installerCalled = false;

  await assert.rejects(
    () =>
      executeInstaller(
        {
          repoRoot: '/repo',
          script: {
            absolutePath: '/repo/install.js',
            relativePath: 'install.js'
          },
          dangerouslySkipConfirmation: false,
          forwardArgs: [],
          runnerOverride: undefined
        },
        {
          resolveRunner: async () => 'node',
          isRunnerAvailable: async () => true,
          confirmExecution: async () => false,
          runInstaller: async () => {
            installerCalled = true;
            return 0;
          }
        }
      ),
    /Execution cancelled by user/
  );

  assert.equal(installerCalled, false);
});

test('executeInstaller returns non-zero child exit codes', async () => {
  const exitCode = await executeInstaller(
    {
      repoRoot: '/repo',
      script: {
        absolutePath: '/repo/install.js',
        relativePath: 'install.js'
      },
      dangerouslySkipConfirmation: true,
      forwardArgs: [],
      runnerOverride: undefined
    },
    {
      resolveRunner: async () => 'node',
      isRunnerAvailable: async () => true,
      confirmExecution: async () => true,
      runInstaller: async () => 37
    }
  );

  assert.equal(exitCode, 37);
});
