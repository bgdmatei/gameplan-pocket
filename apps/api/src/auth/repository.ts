import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export type CodeRow = {
  id: string;
  codeHmac: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
};

export type RefreshTokenRow = {
  id: string;
  userId: string;
  deviceId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  replacedBy: string | null;
  revokedAt: Date | null;
};

export type UserRow = { id: string; email: string };
export type DeviceRow = { id: string; userId: string };

/**
 * Every SQL statement auth runs. The rules (limits, rotation, the grace
 * window) live in the service; times come from the service's clock, so
 * tests can move it.
 */
const statements = (db: Kysely<Database>) => ({
  // Codes

  countCodesSince: async (email: string, since: Date): Promise<number> => {
    const row = await db
      .selectFrom('auth_codes')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('email', '=', email)
      .where('created_at', '>=', since)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  },

  insertCode: async (code: { email: string; codeHmac: string; expiresAt: Date }) => {
    await db
      .insertInto('auth_codes')
      .values({ email: code.email, code_hmac: code.codeHmac, expires_at: code.expiresAt })
      .execute();
  },

  /**
   * The email's newest code, locked until the transaction ends, so two
   * guesses at once cannot both slip under the attempt limit. Only the newest
   * counts: asking again replaces the code that came before.
   */
  latestCodeForUpdate: async (email: string): Promise<CodeRow | undefined> => {
    const row = await db
      .selectFrom('auth_codes')
      .select(['id', 'code_hmac', 'expires_at', 'attempts', 'used_at'])
      .where('email', '=', email)
      .orderBy('created_at', 'desc')
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : {
          id: row.id,
          codeHmac: row.code_hmac,
          expiresAt: row.expires_at,
          attempts: row.attempts,
          usedAt: row.used_at,
        };
  },

  countCodeAttempt: async (id: string): Promise<void> => {
    await db
      .updateTable('auth_codes')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', id)
      .execute();
  },

  markCodeUsed: async (id: string, at: Date): Promise<void> => {
    await db.updateTable('auth_codes').set({ used_at: at }).where('id', '=', id).execute();
  },

  // Failures (the daily cap)

  countFailuresSince: async (email: string, since: Date): Promise<number> => {
    const row = await db
      .selectFrom('auth_failures')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('email', '=', email)
      .where('failed_at', '>=', since)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  },

  recordFailure: async (email: string, at: Date): Promise<void> => {
    await db.insertInto('auth_failures').values({ email, failed_at: at }).execute();
  },

  deleteFailuresBefore: async (cutoff: Date): Promise<void> => {
    await db.deleteFrom('auth_failures').where('failed_at', '<', cutoff).execute();
  },

  // Users

  /**
   * The user for this email, created with its `email` identity on first use.
   * Safe when two sign-ins race: the unique email makes the second insert a
   * no-op, and both read back the same row.
   */
  findOrCreateUser: async (email: string): Promise<UserRow> => {
    await db
      .insertInto('users')
      .values({ email })
      .onConflict((conflict) => conflict.column('email').doNothing())
      .execute();
    const user = await db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('email', '=', email)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('auth_identities')
      .values({ provider: 'email', subject: email, user_id: user.id })
      .onConflict((conflict) => conflict.columns(['provider', 'subject']).doNothing())
      .execute();
    return user;
  },

  getUser: async (id: string): Promise<UserRow | undefined> =>
    db.selectFrom('users').select(['id', 'email']).where('id', '=', id).executeTakeFirst(),

  // Devices

  findDeviceByNodeId: async (nodeId: string): Promise<DeviceRow | undefined> =>
    db
      .selectFrom('devices')
      .select(['id', 'user_id as userId'])
      .where('node_id', '=', nodeId)
      .executeTakeFirst(),

  insertDevice: async (device: {
    userId: string;
    nodeId: string;
    platform: string;
    appVersion: string;
  }): Promise<string> => {
    const row = await db
      .insertInto('devices')
      .values({
        user_id: device.userId,
        node_id: device.nodeId,
        platform: device.platform,
        app_version: device.appVersion,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  },

  touchDevice: async (id: string, appVersion: string, at: Date): Promise<void> => {
    await db
      .updateTable('devices')
      .set({ app_version: appVersion, last_seen_at: at })
      .where('id', '=', id)
      .execute();
  },

  /** The device, only if it belongs to this user. */
  getDevice: async (id: string, userId: string): Promise<DeviceRow | undefined> =>
    db
      .selectFrom('devices')
      .select(['id', 'user_id as userId'])
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst(),

  // Refresh tokens

  insertRefreshToken: async (token: {
    userId: string;
    deviceId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<string> => {
    const row = await db
      .insertInto('refresh_tokens')
      .values({
        user_id: token.userId,
        device_id: token.deviceId,
        family_id: token.familyId,
        token_hash: token.tokenHash,
        expires_at: token.expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  },

  /**
   * The token with this hash, locked until the transaction ends, so two
   * refreshes with one token are decided one after the other.
   */
  refreshTokenForUpdate: async (tokenHash: string): Promise<RefreshTokenRow | undefined> => {
    const row = await db
      .selectFrom('refresh_tokens')
      .select([
        'id',
        'user_id',
        'device_id',
        'family_id',
        'expires_at',
        'used_at',
        'replaced_by',
        'revoked_at',
      ])
      .where('token_hash', '=', tokenHash)
      .forUpdate()
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : {
          id: row.id,
          userId: row.user_id,
          deviceId: row.device_id,
          familyId: row.family_id,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
          replacedBy: row.replaced_by,
          revokedAt: row.revoked_at,
        };
  },

  /** Marks a token rotated into `replacedBy`; keeps the first use's time on a replay. */
  markRefreshTokenUsed: async (id: string, replacedBy: string, at: Date): Promise<void> => {
    await db
      .updateTable('refresh_tokens')
      .set((eb) => ({ used_at: eb.fn.coalesce('used_at', eb.val(at)), replaced_by: replacedBy }))
      .where('id', '=', id)
      .execute();
  },

  revokeRefreshToken: async (id: string, at: Date): Promise<void> => {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: at })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .execute();
  },

  revokeFamily: async (familyId: string, at: Date): Promise<void> => {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: at })
      .where('family_id', '=', familyId)
      .where('revoked_at', 'is', null)
      .execute();
  },
});

export type AuthStatements = ReturnType<typeof statements>;

export type AuthRepository = AuthStatements & {
  /**
   * Runs `work` in one transaction with the statements bound to it, so a
   * sign-in or a rotation either happens whole or not at all.
   */
  transaction: <T>(work: (statements: AuthStatements) => Promise<T>) => Promise<T>;
};

export const createAuthRepository = (db: Kysely<Database>): AuthRepository => ({
  ...statements(db),
  transaction: (work) => db.transaction().execute((trx) => work(statements(trx))),
});
