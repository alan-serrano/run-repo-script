import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveryResult } from './types.js';

const DEFAULT_ENTRY_EXPLICIT_NAMES = [
  'main.js',
  'index.mjs',
  'main.mjs',
  'index.sh',
  'main.sh'
] as const;

const SUBCOMMAND_EXPLICIT_EXTENSIONS = ['.js', '.mjs', '.sh'] as const;

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
      'Explicit --script must point to a file inside the repository or working directory.'
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

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

async function resolveContainedFilePath(
  repoRootRealPath: string,
  absolutePath: string,
  rejectOutsideRoot: boolean
): Promise<string | undefined> {
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(absolutePath);
  } catch {
    return undefined;
  }

  if (!isPathInsideRoot(repoRootRealPath, resolvedPath)) {
    if (rejectOutsideRoot) {
      throw new Error(
        'Explicit --script must resolve to a file inside the repository or working directory.'
      );
    }

    return undefined;
  }

  if (!(await fileExists(resolvedPath))) {
    return undefined;
  }

  return resolvedPath;
}

async function resolveDefaultEntry(
  dir: string,
  repoRoot: string,
  searchedPaths?: string[]
): Promise<DiscoveryResult | undefined> {
  const packageJsonAbsolute = path.join(dir, 'package.json');
  searchedPaths?.push(path.relative(repoRoot, packageJsonAbsolute));
  if (await fileExists(packageJsonAbsolute)) {
    let pkgMain: string | undefined;
    try {
      const pkg = JSON.parse(await readFile(packageJsonAbsolute, 'utf8')) as {
        main?: unknown;
      };
      if (typeof pkg.main === 'string' && pkg.main.length > 0) {
        pkgMain = pkg.main;
      }
    } catch {
      // malformed package.json — fall through to index.js
    }

    if (pkgMain !== undefined) {
      const mainAbsolute = path.join(dir, pkgMain);
      if (await fileExists(mainAbsolute)) {
        const mainRealPath = await realpath(mainAbsolute);
        if (!isPathInsideRoot(repoRoot, mainRealPath)) {
          throw new Error(
            `Script entry resolves outside repo: ${path.relative(repoRoot, mainAbsolute)}`
          );
        }
        return {
          absolutePath: mainRealPath,
          relativePath: path.relative(repoRoot, mainAbsolute)
        };
      }
    }
  }

  const indexAbsolute = path.join(dir, 'index.js');
  searchedPaths?.push(path.relative(repoRoot, indexAbsolute));
  if (await fileExists(indexAbsolute)) {
    const indexRealPath = await realpath(indexAbsolute);
    if (!isPathInsideRoot(repoRoot, indexRealPath)) {
      throw new Error(
        `Script entry resolves outside repo: ${path.relative(repoRoot, indexAbsolute)}`
      );
    }
    return {
      absolutePath: indexRealPath,
      relativePath: path.relative(repoRoot, indexAbsolute)
    };
  }

  return undefined;
}

async function resolveSubcommandInDirectory(
  dir: string,
  name: string,
  repoRoot: string,
  searchedPaths: string[]
): Promise<DiscoveryResult | undefined> {
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(
      `Invalid subcommand name '${name}': must not contain '..' or path separators.`
    );
  }

  const cjsAbsolute = path.join(dir, `${name}.cjs`);
  searchedPaths.push(path.relative(repoRoot, cjsAbsolute));
  if (await fileExists(cjsAbsolute)) {
    return {
      absolutePath: await realpath(cjsAbsolute),
      relativePath: path.relative(repoRoot, cjsAbsolute)
    };
  }

  const jsonAbsolute = path.join(dir, `${name}.json`);
  searchedPaths.push(path.relative(repoRoot, jsonAbsolute));
  if (await fileExists(jsonAbsolute)) {
    return {
      absolutePath: await realpath(jsonAbsolute),
      relativePath: path.relative(repoRoot, jsonAbsolute)
    };
  }

  const folderAbsolute = path.join(dir, name);
  let isDirectory = false;
  try {
    const folderStat = await stat(folderAbsolute);
    if (folderStat.isDirectory()) {
      isDirectory = true;
    }
  } catch {
    // folder does not exist — fall through to explicit extensions
  }

  if (isDirectory) {
    const folderEntry = await resolveDefaultEntry(
      folderAbsolute,
      repoRoot,
      searchedPaths
    );
    if (folderEntry) {
      return folderEntry;
    }
  }

  for (const extension of SUBCOMMAND_EXPLICIT_EXTENSIONS) {
    const absolute = path.join(dir, `${name}${extension}`);
    const relative = path.relative(repoRoot, absolute);
    searchedPaths.push(relative);
    if (await fileExists(absolute)) {
      return {
        absolutePath: await realpath(absolute),
        relativePath: relative
      };
    }
  }

  return undefined;
}

export async function resolveScript(
  repoRoot: string,
  name?: string
): Promise<DiscoveryResult> {
  const repoRootRealPath = await realpath(repoRoot);
  const directories = [
    repoRootRealPath,
    path.join(repoRootRealPath, 'scripts')
  ];
  const searchedPaths: string[] = [];

  for (const directory of directories) {
    if (name) {
      const subcommandResult = await resolveSubcommandInDirectory(
        directory,
        name,
        repoRootRealPath,
        searchedPaths
      );
      if (subcommandResult) {
        return subcommandResult;
      }
    } else {
      const defaultEntry = await resolveDefaultEntry(
        directory,
        repoRootRealPath,
        searchedPaths
      );
      if (defaultEntry) {
        return defaultEntry;
      }

      for (const filename of DEFAULT_ENTRY_EXPLICIT_NAMES) {
        const absolute = path.join(directory, filename);
        const relative = path.relative(repoRootRealPath, absolute);
        searchedPaths.push(relative);
        if (await fileExists(absolute)) {
          return {
            absolutePath: await realpath(absolute),
            relativePath: relative
          };
        }
      }
    }
  }

  throw new Error(
    `No script found. Searched: ${searchedPaths.join(', ')}. Use --script <path> to specify an exact path.`
  );
}

export async function resolveExplicitScript(
  repoRoot: string,
  explicitScript: string
): Promise<DiscoveryResult> {
  const repoRootRealPath = await realpath(repoRoot);
  const relativePath = normalizeRelativeScriptPath(explicitScript);
  const absolutePath = path.join(repoRoot, relativePath);
  const resolvedPath = await resolveContainedFilePath(
    repoRootRealPath,
    absolutePath,
    true
  );

  if (!resolvedPath) {
    throw new Error(`Explicit script not found: ${relativePath}`);
  }

  return {
    absolutePath: resolvedPath,
    relativePath
  };
}
