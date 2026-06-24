import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const TEST_FILE_PATTERN = /\.test\.(ts|js|mjs|cjs)$/;
const EXCLUSIVE_TEST_PATTERN = /\b(?:test|it|describe)\.only\s*\(/;

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walk(absolutePath);
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      yield absolutePath;
    }
  }
}

const testRoot = path.resolve('test');
const failures = [];

for await (const filePath of walk(testRoot)) {
  const content = await readFile(filePath, 'utf8');
  if (!EXCLUSIVE_TEST_PATTERN.test(content)) {
    continue;
  }

  failures.push(path.relative(process.cwd(), filePath));
}

if (failures.length > 0) {
  console.error('Exclusive tests are not allowed in committed code:');
  for (const filePath of failures) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}
