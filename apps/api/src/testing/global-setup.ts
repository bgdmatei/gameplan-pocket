import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * One throwaway Postgres per test run, shared by every test file; each file
 * makes its own database inside it (`createTestDb`). Needs Docker running.
 */
export const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (error) {
    throw new Error('The API tests need Docker. Start OrbStack, then run them again.', {
      cause: error,
    });
  }

  project.provide('databaseUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
};
