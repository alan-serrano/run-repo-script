import { test, expect } from 'vitest';
import { parseRunConfig } from '../../src/cli.js';

test('parseRunConfig classifies owner/repo shorthand as fetch mode', () => {
  const config = parseRunConfig(['owner/repo']);

  expect(config.mode).toBe('fetch');
  expect(config.repoTarget).toBe('owner/repo');
  expect(config.subcommand).toBeUndefined();
});

test('parseRunConfig classifies owner/repo#ref as fetch mode', () => {
  const config = parseRunConfig(['owner/repo#v1.2.3']);

  expect(config.mode).toBe('fetch');
  expect(config.repoTarget).toBe('owner/repo#v1.2.3');
});

test('parseRunConfig classifies GitHub HTTPS URL as fetch mode', () => {
  const config = parseRunConfig(['https://github.com/owner/repo.git']);

  expect(config.mode).toBe('fetch');
  expect(config.repoTarget).toBe('https://github.com/owner/repo.git');
});

test('parseRunConfig classifies GitHub HTTPS URL with ref as fetch mode', () => {
  const config = parseRunConfig(['https://github.com/owner/repo#main']);

  expect(config.mode).toBe('fetch');
});

test('parseRunConfig classifies plain word as local mode and treats it as subcommand', () => {
  const config = parseRunConfig(['install']);

  expect(config.mode).toBe('local');
  expect(config.repoTarget).toBe('install');
  expect(config.subcommand).toBe('install');
});

test('parseRunConfig classifies empty argv as local mode', () => {
  const config = parseRunConfig([]);

  expect(config.mode).toBe('local');
  expect(config.repoTarget).toBe('');
});

test('parseRunConfig captures second positional as subcommand in fetch mode', () => {
  const config = parseRunConfig(['owner/repo', 'deploy']);

  expect(config.mode).toBe('fetch');
  expect(config.repoTarget).toBe('owner/repo');
  expect(config.subcommand).toBe('deploy');
});

test('parseRunConfig captures --script in both modes', () => {
  const fetchConfig = parseRunConfig([
    'owner/repo',
    '--script',
    'scripts/setup.mjs'
  ]);
  expect(fetchConfig.mode).toBe('fetch');
  expect(fetchConfig.script).toBe('scripts/setup.mjs');

  const localConfig = parseRunConfig(['--script', 'scripts/setup.mjs']);
  expect(localConfig.mode).toBe('local');
  expect(localConfig.script).toBe('scripts/setup.mjs');
});

test('parseRunConfig preserves forward args after --', () => {
  const config = parseRunConfig(['owner/repo', '--', '--target', 'local']);

  expect(config.mode).toBe('fetch');
  expect(config.forwardArgs).toEqual(['--target', 'local']);
});
