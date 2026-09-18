import config from '@gameplan/config/eslint';

// db-schema ships to the phone, so it stays free of Node built-ins and
// frameworks: migrations are TypeScript strings, never files read at runtime.
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
              message: 'db-schema must not depend on React.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'db-schema must not depend on Expo.',
            },
            {
              group: ['hono', 'hono/*'],
              message: 'db-schema must not depend on the API framework.',
            },
            {
              group: ['node:*'],
              message: 'db-schema runs on the phone: keep migrations as strings, not files.',
            },
            { group: ['@gameplan/*'], message: 'db-schema depends on no workspace package.' },
          ],
        },
      ],
    },
  },
];
