import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import vitestPlugin from '@vitest/eslint-plugin';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest'
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-undef': 'off',
      ...tsPlugin.configs.recommended.rules
    }
  },
  {
    files: ['test/**/*.{test,spec}.{js,mjs,cjs,ts}'],
    plugins: {
      vitest: vitestPlugin
    },
    rules: {
      'vitest/no-focused-tests': 'error'
    }
  },
  eslintConfigPrettier
];
