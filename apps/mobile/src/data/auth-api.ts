import {
  HEADERS,
  PROTOCOL_VERSION,
  errorResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
  verifyResponseSchema,
} from '@gameplan/contracts';
import type { VerifyRequest } from '@gameplan/contracts';

/**
 * Every outcome is a value, never a throw. `offline` means the server could
 * not be reached, or failed on its side; a session must survive it
 * (SPEC-auth-identity.md: never signed out for being offline). `failed` is
 * any other unusable answer.
 */
export type AuthResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'offline' }
  | { kind: 'unauthorized' }
  | { kind: 'invalid_code' }
  | { kind: 'device_conflict' }
  | { kind: 'failed' };

type Failure = Exclude<AuthResult<never>, { kind: 'ok' }>;

export type AuthApiConfig = {
  baseUrl: string;
  appVersion: string;
  fetch?: typeof fetch;
};

type Schema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

type Init = { method: 'GET' | 'POST'; body?: unknown; accessToken?: string };

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The auth routes. Bodies hold emails, codes and tokens: none are ever logged here. */
export const createAuthApi = ({ baseUrl, appVersion, fetch = globalThis.fetch }: AuthApiConfig) => {
  /** The answer's text, or which way it failed. */
  const send = async (
    path: string,
    init: Init,
  ): Promise<{ kind: 'ok'; text: string } | Failure> => {
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          [HEADERS.appVersion]: appVersion,
          [HEADERS.protocolVersion]: String(PROTOCOL_VERSION),
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.accessToken === undefined
            ? {}
            : { Authorization: `Bearer ${init.accessToken}` }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      text = await response.text();
    } catch {
      return { kind: 'offline' };
    }
    if (response.ok) return { kind: 'ok', text };

    const error = errorResponseSchema.safeParse(parseJson(text));
    const code = error.success ? error.data.error : null;
    if (response.status === 401) {
      return code === 'invalid_code' ? { kind: 'invalid_code' } : { kind: 'unauthorized' };
    }
    if (response.status === 409 && code === 'device_conflict') return { kind: 'device_conflict' };
    // A 5xx is the server's trouble, not the session's: treated like offline.
    return response.status >= 500 ? { kind: 'offline' } : { kind: 'failed' };
  };

  const parsed = async <T>(path: string, init: Init, schema: Schema<T>): Promise<AuthResult<T>> => {
    const result = await send(path, init);
    if (result.kind !== 'ok') return result;
    const body = schema.safeParse(parseJson(result.text));
    return body.success ? { kind: 'ok', value: body.data } : { kind: 'failed' };
  };

  const bodiless = async (path: string, init: Init): Promise<AuthResult<void>> => {
    const result = await send(path, init);
    return result.kind === 'ok' ? { kind: 'ok', value: undefined } : result;
  };

  return {
    requestCode: (email: string) => bodiless('/auth/code', { method: 'POST', body: { email } }),
    verify: (request: VerifyRequest) =>
      parsed('/auth/verify', { method: 'POST', body: request }, verifyResponseSchema),
    refresh: (refreshToken: string) =>
      parsed('/auth/refresh', { method: 'POST', body: { refreshToken } }, refreshResponseSchema),
    logout: (refreshToken: string) =>
      bodiless('/auth/logout', { method: 'POST', body: { refreshToken } }),
    me: (accessToken: string) => parsed('/me', { method: 'GET', accessToken }, meResponseSchema),
  };
};

export type AuthApi = ReturnType<typeof createAuthApi>;
