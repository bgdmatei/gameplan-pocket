import config from '@gameplan/config/eslint';

// Domain is pure: no frameworks, no Node, no workspace packages, no clock or
// randomness. Time and IDs are passed in (SPEC-domain-model.md §Code style).
const nodeBuiltins = [
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'os',
  'path',
  'process',
  'stream',
  'url',
  'util',
  'worker_threads',
];

export default [
  ...config,
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-native', 'react-native/*'],
              message: 'domain must not depend on React.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'domain must not depend on Expo.',
            },
            { group: ['hono', 'hono/*'], message: 'domain must not depend on the API framework.' },
            { group: ['node:*', ...nodeBuiltins], message: 'domain must not use Node built-ins.' },
            { group: ['@gameplan/*'], message: 'domain must not import workspace packages.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass time in as a parameter.' },
        { object: 'Math', property: 'random', message: 'Pass randomness/IDs in as a parameter.' },
        { object: 'performance', property: 'now', message: 'Pass time in as a parameter.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() reads the clock. Pass time in as a parameter.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Date() reads the clock. Pass time in as a parameter.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'Pass IDs/randomness in as a parameter.' },
        { name: 'performance', message: 'Pass time in as a parameter.' },
      ],
    },
  },
];
