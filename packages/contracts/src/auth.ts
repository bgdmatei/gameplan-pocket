import { z } from 'zod';

/** Request bounds the API enforces, so a client never sends what it would refuse. */
export const AUTH_LIMITS = {
  codeLength: 6,
  // RFC 5321's longest deliverable address.
  emailMaxLength: 254,
  appVersionMaxLength: 32,
} as const;

/**
 * Trimmed and lowercased here, so the phone and the server agree on one
 * spelling and `users.email` stays unique per person.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(AUTH_LIMITS.emailMaxLength)
  .pipe(z.email());

const codeSchema = z.string().regex(new RegExp(`^\\d{${AUTH_LIMITS.codeLength}}$`));

/** The device's own clock name (ADR-006): 16 lowercase hex characters, as `newNodeId` makes. */
const nodeIdSchema = z.string().regex(/^[0-9a-f]{16}$/);

const refreshTokenSchema = z.string().min(1).max(256);

/** `POST /auth/code`. Always answered `202`, whether or not the email has an account. */
export const codeRequestSchema = z.object({ email: emailSchema });
export type CodeRequest = z.infer<typeof codeRequestSchema>;

/** `POST /auth/verify`. Signs in, creating the account on first use, and registers the device. */
export const verifyRequestSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  device: z.object({
    nodeId: nodeIdSchema,
    platform: z.enum(['ios', 'android']),
    appVersion: z.string().min(1).max(AUTH_LIMITS.appVersionMaxLength),
  }),
});
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

/** `POST /auth/refresh` and `POST /auth/logout`. */
export const refreshRequestSchema = z.object({ refreshToken: refreshTokenSchema });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

const userSchema = z.object({ id: z.uuid(), email: z.string() });
const deviceSchema = z.object({ id: z.uuid() });

/** `accessExpiresAt` lets the phone refresh before a request rather than after a `401`. */
const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.iso.datetime(),
});

/** `POST /auth/refresh` */
export const refreshResponseSchema = tokenPairSchema;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

/** `POST /auth/verify` */
export const verifyResponseSchema = tokenPairSchema.extend({
  user: userSchema,
  device: deviceSchema,
});
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

/** `GET /me` */
export const meResponseSchema = z.object({ user: userSchema, device: deviceSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;
