import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  // Long enough that guessing it is not worth trying; see AppDependencies.apiKey.
  CATALOG_API_KEY: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3000),
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
