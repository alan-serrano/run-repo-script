const SENSITIVE_ENV_KEY_PATTERNS = [
  /^AWS_/i,
  /^AZURE_/i,
  /^GCP_/i,
  /^GOOGLE_/i,
  /^GITHUB_/i,
  /^GH_/i,
  /^NPM_TOKEN$/i,
  /^NODE_AUTH_TOKEN$/i,
  /^CI_JOB_TOKEN$/i,
  /^SSH_AUTH_SOCK$/i,
  /^SSH_AGENT_PID$/i,
  /(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|AUTH)(_|$)/i
] as const;

const INSTALLER_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'LANG',
  'TZ',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA'
] as const;

const INSTALLER_ENV_ALLOWLIST_PREFIXES = ['LC_'] as const;
const INSTALLER_ENV_ALLOWLIST_SET = normalizeKeySet(INSTALLER_ENV_ALLOWLIST);
const INSTALLER_PROXY_URL_ENV_KEYS = normalizeKeySet([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY'
]);

function normalizeKeySet(keys: readonly string[]): Set<string> {
  return new Set(keys.map((key) => key.toUpperCase()));
}

function isSensitiveEnvironmentKey(
  key: string,
  allowSensitiveKeys: Set<string>
): boolean {
  if (allowSensitiveKeys.has(key.toUpperCase())) {
    return false;
  }

  return SENSITIVE_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export interface SafeEnvironmentOptions {
  allowSensitiveKeys?: readonly string[];
}

export function createSafeEnvironment(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  options: SafeEnvironmentOptions = {}
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {};
  const allowSensitiveKeys = normalizeKeySet(options.allowSensitiveKeys ?? []);

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (
      value === undefined ||
      isSensitiveEnvironmentKey(key, allowSensitiveKeys)
    ) {
      continue;
    }

    safeEnv[key] = value;
  }

  return safeEnv;
}

function isInstallerEnvironmentKeyAllowed(key: string): boolean {
  const normalizedKey = key.toUpperCase();

  if (INSTALLER_ENV_ALLOWLIST_SET.has(normalizedKey)) {
    return true;
  }

  return INSTALLER_ENV_ALLOWLIST_PREFIXES.some((prefix) =>
    normalizedKey.startsWith(prefix)
  );
}

function hasEmbeddedProxyCredentials(proxyValue: string): boolean {
  const trimmedProxyValue = proxyValue.trim();
  const proxyUrlToParse = trimmedProxyValue.includes('://')
    ? trimmedProxyValue
    : `http://${trimmedProxyValue}`;

  try {
    const parsedProxyUrl = new URL(proxyUrlToParse);
    return parsedProxyUrl.username !== '' || parsedProxyUrl.password !== '';
  } catch {
    return trimmedProxyValue.includes('@');
  }
}

function shouldDropInstallerProxyEnvironmentKey(
  key: string,
  value: string
): boolean {
  if (!INSTALLER_PROXY_URL_ENV_KEYS.has(key.toUpperCase())) {
    return false;
  }

  return hasEmbeddedProxyCredentials(value);
}

export function createInstallerEnvironment(
  sourceEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (
      value === undefined ||
      !isInstallerEnvironmentKeyAllowed(key) ||
      shouldDropInstallerProxyEnvironmentKey(key, value)
    ) {
      continue;
    }

    safeEnv[key] = value;
  }

  return safeEnv;
}
