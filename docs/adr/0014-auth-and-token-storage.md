# ADR-014: Email codes, rotating refresh tokens, and the Keychain

Status: Accepted (2026-10-09, module `auth-identity`). Written 2026-10-14, at the end of the module's build.

## Context

Module 8 syncs a player's library between devices, so the server has to know who a request is for. The app is offline-first and works fully signed out (`SPEC-auth-identity.md`, decision 3), so an account only prepares sync; it must never get in the way. A phone can be offline for days, and must not lose its sign-in for that. Three questions follow: how a player proves who they are, what the phone holds afterwards, and where it keeps it.

Constraints: one maintainer, no paid Apple Developer Program yet, privacy rules that keep emails, codes and tokens out of every log (`CLAUDE.md` §Privacy), and a web app later (module 14) that must reuse the same server.

## Options considered

**Sign-in**

1. **Email code.** Enter an email, receive six digits, type them. No password to store, leak or reset.
2. **Password.** Familiar, but means hashing, resets, breach exposure, and a reset flow that is an email code anyway.
3. **Sign in with Apple / Google.** The smoothest, but Apple needs the paid program, and an iOS app offering Google must also offer Apple.
4. **Magic link.** Like the code, but a link opening the app needs universal links, which need the paid program too.

**Tokens**

1. **Short JWT access token plus a rotating opaque refresh token** (plan §7.2). The access token is checked without a database read; the refresh token is stored hashed and replaced on every use, so a stolen one is detected when either party uses it twice.
2. **One long-lived session token** checked against the database on every request. Simpler, but a stolen token works until it expires, and every request costs a lookup.

**Storage on the phone**

1. **`expo-secure-store`**: the iOS Keychain and the Android Keystore.
2. **SQLite or AsyncStorage.** Already there, but readable from a device backup and by anything that can read the app's files.

## Decision

- **Email code** now (decision 1). `auth_identities` keys sign-in by (provider, subject), so Apple and Google later link to the same account as new rows, without a migration.
- **Tokens:** a 15-minute HS256 access token (`hono/jwt`, algorithm and issuer pinned on verify) and a 60-day refresh token, 32 random bytes stored as SHA-256, rotated on every use within a family. Reuse revokes the whole family, except a lost response's retry: back within 30 seconds and while the token it was rotated into is still unused (decision 5, narrowed during the build). Codes are stored as an HMAC keyed with `CODE_SECRET` over the email and the code, and refused after five wrong guesses or twenty failures for the email in a day (decision 7).
- **Storage:** `expo-secure-store`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: readable after the first unlock so a restart keeps the session, and never copied into iCloud or a backup.
- **The library has an owner** (`sync_state.owner_user_id`, decisions 6 and 12). The first sign-in claims it; another account is refused until the phone is erased, which the server already enforces because the phone's node id is registered to the owner. Signing out erases the whole database.

## Consequences

- A player is never signed out for being offline: a refresh that cannot reach the server keeps the session, and only a `401` ends it, after which the library stays and the same account signing in keeps it.
- Concurrent requests share one refresh on the phone, and the server locks the presented token's row, so two refreshes with one token never look like theft by accident. A race test runs eight at once: with two it passed even without the lock.
- The answer to `/auth/code` is identical for known and unknown emails, and the code goes out after the response, so the endpoint does not reveal who has an account. Every refused code is the same `401 invalid_code`.
- Until sync (module 8), signing out loses the library: the Account screen says so before it erases anything.
- Resend's sandbox only delivers to the operator's own address. Production needs a verified domain (decision 9).
- The daily cap lets anyone lock an email out of signing in for a day by guessing badly; accepted at this scale.
- The web app (module 14) reuses the server unchanged except for how the refresh token travels: an `httpOnly`, `Secure`, `SameSite` cookie instead of a JSON body, since a browser cannot keep it safely in JavaScript. The service takes a plain token string, so only the routes change. CORS is an allowlist, empty until then.
- `JWT_SECRET`, `CODE_SECRET` and `RESEND_API_KEY` are checked for in every exported app bundle by CI.
