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
