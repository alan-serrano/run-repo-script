import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSafeEnvironment } from './env.js';
import type { FetchResult, ResolvedRepoTarget } from './types.js';

const SHORTHAND_REGEX =
  /^(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)(?:#(?<ref>.+))?$/;
const HTTPS_PATH_REGEX =
  /^(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/;
const SSH_STYLE_REGEX = /^(git@|ssh:\/\/)/i;

export const SAFE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  GCM_INTERACTIVE: 'never'
} as const;

const GIT_AUTH_ENV_ALLOWLIST = ['GH_TOKEN', 'GITHUB_TOKEN'] as const;

export function resolveGitHubTarget(input: string): ResolvedRepoTarget {
  const target = input.trim();
  if (!target) {
    throw new Error('Repository target is required.');
  }

  if (SSH_STYLE_REGEX.test(target)) {
    throw new Error(
      'Unsupported repository target: SSH syntax is not supported in v1. Use owner/repo or https://github.com/...'
    );
  }

  const shorthandMatch = SHORTHAND_REGEX.exec(target);
  if (shorthandMatch?.groups) {
    const { owner, repo, ref } = shorthandMatch.groups;
    return {
      owner,
      repo,
      ref,
      cloneUrl: `https://github.com/${owner}/${repo}.git`
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error(
      'Unsupported repository target. Use owner/repo[#ref] or https://github.com/owner/repo[.git][#ref].'
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      'Unsupported repository target: only HTTPS GitHub URLs are supported in v1.'
    );
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error(
      'Unsupported repository host. Only github.com is supported in v1.'
    );
  }

  const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '');
  const pathMatch = HTTPS_PATH_REGEX.exec(pathname);
  if (!pathMatch?.groups) {
    throw new Error(
      'Unsupported GitHub URL format. Expected https://github.com/owner/repo[.git][#ref].'
    );
  }

  const { owner, repo } = pathMatch.groups;
  const ref = parsed.hash
    ? decodeURIComponent(parsed.hash.slice(1))
    : undefined;

  return {
    owner,
    repo,
    ref,
    cloneUrl: `https://github.com/${owner}/${repo}.git`
  };
}

export function createGitCloneCommand(
  resolvedTarget: ResolvedRepoTarget,
  destinationDir: string
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const args = ['clone', '--depth', '1'];

  if (resolvedTarget.ref) {
    args.push('--branch', resolvedTarget.ref, '--single-branch');
  }

  args.push(resolvedTarget.cloneUrl, destinationDir);

  return {
    command: 'git',
    args,
    env: {
      ...createSafeEnvironment(process.env, {
        allowSensitiveKeys: GIT_AUTH_ENV_ALLOWLIST
      }),
      ...SAFE_GIT_ENV
    }
  };
}

export async function cloneIntoDirectory(
  resolvedTarget: ResolvedRepoTarget,
  destinationDir: string
): Promise<void> {
  const command = createGitCloneCommand(resolvedTarget, destinationDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: command.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to launch git clone: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderrLine = stderr.trim();
      reject(
        new Error(
          `git clone failed with exit code ${code ?? 'unknown'}${stderrLine ? `: ${stderrLine}` : ''}`
        )
      );
    });
  });
}

export async function fetchRepository(target: string): Promise<FetchResult> {
  const resolvedTarget = resolveGitHubTarget(target);
  const workspaceDir = await mkdtemp(join(tmpdir(), 'run-repo-'));

  try {
    await cloneIntoDirectory(resolvedTarget, workspaceDir);
    return { workspaceDir, resolvedTarget };
  } catch (error) {
    await rm(workspaceDir, { recursive: true, force: true });
    throw error;
  }
}
