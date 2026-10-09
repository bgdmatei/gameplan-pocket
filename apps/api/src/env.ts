import { z } from 'zod';

/** `CORS_ORIGINS`: comma-separated origins; empty until the web app exists. */
const originsSchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
  )
  .pipe(z.array(z.url()));

/** A line left blank in `.env` (`RESEND_API_KEY=`) means unset, not invalid. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    TWITCH_CLIENT_ID: z.string().min(1),
    TWITCH_CLIENT_SECRET: z.string().min(1),
    // Long enough that guessing it is not worth trying; see AppDependencies.apiKey.
    CATALOG_API_KEY: z.string().min(16),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.string().optional(),
    // HS256 keys: at least 32 bytes, as the spec requires (openssl rand -hex 32).
    JWT_SECRET: z.string().min(32),
    CODE_SECRET: z.string().min(32),
    // `console` prints codes to the terminal, for local dev and tests only.
    EMAIL_TRANSPORT: z.enum(['resend', 'console']).default('resend'),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    CORS_ORIGINS: originsSchema,
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === 'console' && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_TRANSPORT'], message: 'console in production' });
    }
    if (env.EMAIL_TRANSPORT === 'resend') {
      for (const name of ['RESEND_API_KEY', 'EMAIL_FROM'] as const) {
        if (env[name] === undefined) ctx.addIssue({ code: 'custom', path: [name], message: name });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * The only place the API reads its configuration, secrets included. Fails
 * naming the variables that are missing or invalid, never their values: an
 * error message ends up in logs, and a value here may be a secret.
 */
export const readEnv = (source: Readonly<Record<string, string | undefined>>): Env => {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
  throw new Error(
    `Missing or invalid environment variables: ${names.join(', ')}. See apps/api/.env.example.`,
  );
};

/** Loads `apps/api/.env` when it exists; deployed environments set real variables instead. */
export const loadDotEnv = (): void => {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
