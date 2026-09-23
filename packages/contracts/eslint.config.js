import config from '@gameplan/config/eslint';

// Contracts are read by the API, the phone and later the browser, so they hold
// schemas and constants only: no frameworks, no Node, no clock.
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
              message: 'contracts must not depend on React.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'contracts must not depend on Expo.',
            },
            {
              group: ['hono', 'hono/*'],
              message: 'contracts must not depend on the API framework.',
            },
            { group: ['node:*'], message: 'contracts must not use Node built-ins.' },
          ],
        },
      ],
    },
  },
];
