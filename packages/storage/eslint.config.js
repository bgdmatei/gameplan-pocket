import config from '@gameplan/config/eslint';

// storage runs on the phone and in plain Node tests, so it stays free of React,
// Expo and the API framework. Node built-ins are confined to src/node/, the
// test-only implementation, so nothing Node-specific reaches the device bundle.
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
              message: 'storage must not depend on React; the hook lives in mobile-library.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
              message: 'storage must not depend on Expo.',
            },
            { group: ['hono', 'hono/*'], message: 'storage must not depend on the API framework.' },
            {
              group: ['node:*'],
              message: 'Node built-ins belong in src/node/, the test-only implementation.',
            },
          ],
        },
      ],
    },
  },
  {
    // The test-only implementation is the one place node:sqlite is allowed.
    files: ['src/node/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests never ship to the phone, so they may use a real filesystem to prove
    // that data survives a relaunch. Same exception as db-schema's tests.
    files: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
