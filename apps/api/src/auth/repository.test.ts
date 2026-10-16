import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/database';
import { createAuthRepository } from './repository';
import type { AuthRepository } from './repository';

describe('auth repository', () => {
  let repository: AuthRepository;

  beforeAll(async () => {
    repository = createAuthRepository(await createTestDb());
  });

  // A first sign-in on two devices at once must make one account, not fail
  // on the unique email or make two.
  it('two racing first sign-ins with one email get the same user', async () => {
    const users = await Promise.all(
      Array.from({ length: 5 }, () => repository.findOrCreateUser('racer@example.com')),
    );

    expect(new Set(users.map((user) => user.id)).size).toBe(1);
  });
});
