import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveryResult } from './types.js';

export const DEFAULT_INSTALLER_PATHS = [
  'install.mjs',
  'install.js',
  'install.sh',
  'scripts/install.mjs',
  'scripts/install.js',
  'scripts/install.sh'
] as const;

function normalizeRelativeScriptPath(inputPath: string): string {
  const normalized = path.posix
    .normalize(inputPath.replaceAll('\\', '/'))
    .replace(/^\.\//, '');

  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(
      'Explicit --script must point to a file inside the fetched repository.'
    );
  }

  return normalized;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const info = await stat(absolutePath);
    return info.isFile();
  } catch {
    return false;
  }
}

export async function resolveInstaller(
  repoRoot: string,
  explicitScript?: string
): Promise<DiscoveryResult> {
  const searchedPaths = [...DEFAULT_INSTALLER_PATHS];

  if (explicitScript) {
    const relativePath = normalizeRelativeScriptPath(explicitScript);
    const absolutePath = path.join(repoRoot, relativePath);

    if (!(await fileExists(absolutePath))) {
      throw new Error(`Explicit script not found: ${relativePath}`);
    }

    return {
      absolutePath,
      relativePath
    };
  }

  const foundDefaults: DiscoveryResult[] = [];

  for (const relativePath of searchedPaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (await fileExists(absolutePath)) {
      foundDefaults.push({ absolutePath, relativePath });
    }
  }

  if (foundDefaults.length === 1) {
    return foundDefaults[0];
  }

  if (foundDefaults.length === 0) {
    throw new Error(
      `No installer script found. Searched: ${searchedPaths.join(', ')}`
    );
  }

  const matched = foundDefaults.map((result) => result.relativePath).join(', ');
  throw new Error(
    `Multiple installer scripts found (${matched}). Pass --script to choose exactly one.`
  );
}
