import config from '@gameplan/config/eslint';

// sync runs on the phone, in plain Node tests and later on the server, so it
// stays free of React, Expo, the API framework and Node built-ins. Time and
// randomness arrive as parameters (SPEC-sync-core.md §Tech stack).
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
              message: 'sync must not depend on React.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'sync must not depend on Expo; the app passes platform crypto in.',
            },
            { group: ['hono', 'hono/*'], message: 'sync must not depend on the API framework.' },
            {
              group: ['node:*'],
              message: 'sync must not use Node built-ins; time and randomness are parameters.',
            },
          ],
        },
      ],
    },
  },
];
