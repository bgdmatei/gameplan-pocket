# ADR-012: Fan-out of pokes through Postgres `LISTEN/NOTIFY`

Status: Accepted (2026-11-19, module `realtime-pokes`).

## Context

A push is handled by whichever API process received it, but the other devices' streams (ADR-011) may be held by a different process. Staging runs one instance today; nothing should break when there are two, during a deploy or later. The push therefore has to reach every process holding a stream for that account.

The poke must also never get ahead of the data: a device that pulls on a poke must find the op it was poked about.

## Options considered

1. **In-process only.** The push tells the streams in its own process. Correct with one instance, silently wrong with two: half the devices hear nothing.
2. **Redis pub/sub.** The usual answer, but a new service to run, pay for, secure and monitor, for one small message per push.
3. **Postgres `LISTEN/NOTIFY`.** The database we already have relays a message to every connection listening on a channel.

## Decision

Option 3.

- **Notify inside the push transaction.** The push calls `pg_notify('sync_poke', json_build_object('u', user_id, 's', seq)::text)` before it commits, and only when `seq` advanced. Postgres delivers a notification only on commit, so a poke never names a `seq` that isn't readable yet, and a rolled-back or fully rejected push pokes no one.
- **One listener per process.** Each API process holds one dedicated connection that `LISTEN`s on `sync_poke` and hands each notification to an in-memory hub mapping an account to its open streams. A malformed notification is dropped and counted.
- **A direct connection** (owner, 2026-11-17). Neon's pooled URL runs PgBouncer in transaction mode, which hands a different server connection to each transaction, so `LISTEN` can't work through it. The listener uses `LISTEN_DATABASE_URL`, Neon's direct URL as `gameplan_app`; everything else stays pooled. Locally and in tests it falls back to `DATABASE_URL`.
- **A stream registers before it reads.** On open, the stream joins the hub first, then reads the account's `seq` for its opening poke. In the other order, a push committing between the two would be heard by no one.
- **Lost notifications are covered by a re-poke.** Notifications sent while the listener is disconnected are gone, and Postgres doesn't replay them. Once it is listening again, the process pokes every open stream with its account's current `seq`. Since a poke carries a position, not a change, one late poke covers any number of missed ones.

## Consequences

- Each API process holds one extra database connection.
- The payload carries an account id and a number, never op data. It stays far under the 8,000-byte limit on a notification.
- A transaction that notifies takes a database-wide lock on the notification queue while it commits, so every push that advances `seq`, across all accounts, commits one at a time. Negligible at our size; it is the first thing to watch as pushes grow.
- The direct URL is one more secret in Render.

## Revisit if

- Pushes grow enough that notifications show up in commit latency, or the number of processes makes one listening connection each a burden. Then a broker (Redis, or a managed pub/sub) replaces the listener, behind the same hub.
