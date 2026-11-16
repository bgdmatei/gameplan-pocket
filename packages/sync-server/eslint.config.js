import config from '@gameplan/config/eslint';

// The server's door checks and merge, run by the API inside its transaction
// and by an in-memory server in tests (ADR-023). Pure: no framework, no
// database driver, no Node built-ins, no clock. Time arrives as a parameter.
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
              message: 'sync-server must not depend on React.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'sync-server must not depend on Expo.',
            },
            {
              group: ['hono', 'hono/*'],
              message: 'sync-server must not depend on the API framework.',
            },
            {
              group: ['kysely', 'kysely/*', 'pg', 'pg/*', 'postgres'],
              message:
                'sync-server must not touch the database; the API runs it in its transaction.',
            },
            { group: ['node:*'], message: 'sync-server must not use Node built-ins.' },
          ],
        },
      ],
    },
  },
];
