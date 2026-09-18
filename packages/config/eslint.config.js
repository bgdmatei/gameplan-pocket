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
      // Order matters: the first matching pattern wins, so specific packages
      // come before the generic `pkg` pattern.
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'domain', pattern: 'packages/domain' },
        { type: 'db-schema', pattern: 'packages/db-schema' },
        { type: 'storage', pattern: 'packages/storage' },
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
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'db-schema' } } },
                { to: { element: { type: 'storage' } } },
              ],
            },
            {
              from: [{ element: { type: 'pkg' } }],
              allow: [
                { to: { element: { type: 'pkg' } } },
                { to: { element: { type: 'domain' } } },
              ],
            },
            // domain depends on no workspace package (SPEC-domain-model.md §Boundary rules).
            {
              from: [{ element: { type: 'domain' } }],
              allow: [{ to: { element: { type: 'domain' } } }],
            },
            // db-schema is standalone: tables and migrations, nothing else.
            {
              from: [{ element: { type: 'db-schema' } }],
              allow: [{ to: { element: { type: 'db-schema' } } }],
            },
            // storage reads domain types and the schema, and nothing else
            // (SPEC-storage-adapter.md §Boundaries).
            {
              from: [{ element: { type: 'storage' } }],
              allow: [
                { to: { element: { type: 'storage' } } },
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'db-schema' } } },
              ],
            },
          ],
        },
      ],
    },
  },
);
