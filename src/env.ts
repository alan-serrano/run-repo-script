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

function isSensitiveEnvironmentKey(key: string): boolean {
  return SENSITIVE_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function createSafeEnvironment(
  sourceEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined || isSensitiveEnvironmentKey(key)) {
      continue;
    }

    safeEnv[key] = value;
  }

  return safeEnv;
}
