import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const forbiddenPrefixes = ['src/', 'test/', '.atl/', '.husky/', 'dist/test/'];
const requiredCliPath = 'dist/cli.js';
const requiredPaths = [requiredCliPath];
const requiredCliShebang = '#!/usr/bin/env node';

const result = spawnSync(
  'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  {
    encoding: 'utf8'
  }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack failed\n');
  process.exit(result.status ?? 1);
}

const output = result.stdout.trim();

if (!output) {
  process.stderr.write('npm pack --dry-run returned empty output\n');
  process.exit(1);
}

let parsed;

try {
  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error('Missing JSON payload');
  }

  parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
} catch {
  process.stderr.write('Unable to parse npm pack --dry-run JSON output\n');
  process.exit(1);
}

const fileEntries = Array.isArray(parsed) ? parsed[0]?.files : parsed?.files;

if (!Array.isArray(fileEntries)) {
  process.stderr.write('npm pack output did not include a files list\n');
  process.exit(1);
}

const packagePaths = fileEntries
  .map((entry) => entry?.path)
  .filter((pathValue) => typeof pathValue === 'string');

const forbiddenMatches = packagePaths.filter((pathValue) =>
  forbiddenPrefixes.some(
    (prefix) => pathValue === prefix || pathValue.startsWith(prefix)
  )
);

if (forbiddenMatches.length > 0) {
  process.stderr.write(
    `Forbidden paths in package: ${forbiddenMatches.join(', ')}\n`
  );
  process.exit(1);
}

const missingRequired = requiredPaths.filter(
  (requiredPath) => !packagePaths.includes(requiredPath)
);

if (missingRequired.length > 0) {
  process.stderr.write(
    `Missing required paths in package: ${missingRequired.join(', ')}\n`
  );
  process.exit(1);
}

let cliContent;

try {
  cliContent = await readFile(requiredCliPath, 'utf8');
} catch {
  process.stderr.write(`Unable to read required CLI bin: ${requiredCliPath}\n`);
  process.exit(1);
}

const firstLine = cliContent.split('\n', 1)[0]?.replace(/\r$/, '');

if (firstLine !== requiredCliShebang) {
  process.stderr.write(
    `CLI bin is missing required shebang (${requiredCliShebang}): ${requiredCliPath}\n`
  );
  process.exit(1);
}

const allowedPath = (pathValue) =>
  pathValue === 'package.json' ||
  pathValue === 'README.md' ||
  pathValue.startsWith('dist/');

const unexpectedPaths = packagePaths.filter(
  (pathValue) => !allowedPath(pathValue)
);

if (unexpectedPaths.length > 0) {
  process.stderr.write(
    `Unexpected paths in package: ${unexpectedPaths.join(', ')}\n`
  );
  process.exit(1);
}

process.stdout.write(
  `Package validation passed. Files: ${packagePaths.join(', ')}\n`
);
