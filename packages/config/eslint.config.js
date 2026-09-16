// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default tseslint.config(
  {
    ignores: ['dist/**', 'build/**', '.turbo/**', 'node_modules/**', '.expo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/root-path': workspaceRoot,
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'pkg', pattern: 'packages/*' },
      ],
      'boundaries/include': ['apps/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{js,jsx,ts,tsx}'],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: [{ element: { type: 'app' } }],
              allow: [
                { to: { element: { type: 'app' } } },
                { to: { element: { type: 'pkg' } } },
              ],
            },
            {
              from: [{ element: { type: 'pkg' } }],
              allow: [{ to: { element: { type: 'pkg' } } }],
            },
          ],
        },
      ],
    },
  },
);
