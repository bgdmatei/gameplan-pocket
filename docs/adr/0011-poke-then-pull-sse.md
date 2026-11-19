# ADR-011: Poke, then pull, over Server-Sent Events

Status: Accepted (2026-11-19, module `realtime-pokes`).

## Context

Since module 8, an edit made on one device reaches the others only on their next sync trigger: coming to the foreground, the network returning, a tap, or the 5-minute timer. With two devices in use at once, the other one looks stale for up to five minutes.

Every change already has one way onto a device: pull, which reads the server's op log after the device's position and applies each op through the merge (ADR-008, ADR-023). It is idempotent, ordered by the per-user `seq`, and survives anything the network does. Whatever makes updates faster should not add a second way.

A phone can't hold a connection in the background: iOS suspends the app within seconds, and fighting that (background fetch, silent pushes) brings in a push service and its own failure modes.

## Options considered

1. **Push data over a WebSocket.** The server sends the ops themselves. Fastest, but it is a second data path: ordering, gaps and duplicates would need handling again, beside pull, and every bug fixed twice. A WebSocket is also two-way, which we don't need, and some proxies handle it worse than plain HTTP.
2. **Push data over Server-Sent Events.** One-way and plain HTTP, but still a second data path, and it would put op payloads (note text included) on a long-lived stream.
3. **A poke over Server-Sent Events, then a normal pull.** The server sends only `{ seq }`, the account's latest log position. The device compares it with its own position and, if it is behind, runs its ordinary sync.
4. **Poll faster.** A pull every few seconds. No new endpoint, but constant requests from every open app for changes that are rare, and still seconds of delay.

## Decision

Option 3.

- **`GET /sync/events`**, signed in and behind the version gate like every sync route. Events are `poke` with data `{"seq":N}`, validated by a strict schema on both sides, so nothing else can ride along. A poke is sent as soon as the stream opens, carrying the current position, so a device that missed pokes while disconnected catches up without guessing. A comment line every 25 s keeps proxies from closing an idle response and lets the phone notice a dead connection.
- **The device decides.** A poke at or below its pulled position is dropped. A device's own push, echoed back, is usually already pulled by the same sync, so it costs nothing, without the server tracking which device pushed; if that sync's pull failed, the echo brings one more sync, which is harmless. A poke arriving during a sync is remembered, and one more sync runs after it if needed.
- **Foreground only on mobile.** The stream opens in the foreground and closes in the background. Coming back already syncs, and the poke on connect covers the rest. It follows sync's own rules otherwise: open only while the local database belongs to the signed-in account, closed on sign-out, erase and "Update needed", and reconnected when no bytes arrive for 60 s.
- **The stream ends with its token.** The server closes it when the access token expires (15 minutes), and the phone reconnects with a fresh one. A revoked device stops hearing pokes within one token's lifetime.
- **On the phone, `expo/fetch`** (owner, 2026-11-17). React Native has no `EventSource`. Expo's fetch streams the response body, so a small SSE parser of our own does the rest, and the stream uses the same token and headers as every other request. The alternatives were `react-native-sse` (a new dependency, with a reconnect loop of its own beside the scheduler's backoff) and `XMLHttpRequest` progress events (the response accumulates in memory for as long as the stream stays open).
- The existing triggers, the 5-minute timer included, stay as the fallback.

## Consequences

- Data still has one path. The stream changes when a device syncs, never what it receives, so a lost, duplicated or out-of-order poke can only delay an edit, never corrupt one.
- A poke costs one extra pull per other device. At one user's edit rate, that is negligible.
- An edit made while a device is in the background arrives when it comes back, not before.
- Each open app holds one HTTP connection to the API. The server bounds them: one per device, ten per account, the oldest closed past ten. An account with more than ten devices open at once would keep evicting its own streams, each reconnect closing another; one person never gets there, and a shared library would revisit this.
- The web app (module 14) can't use the browser's `EventSource` as is, since it can't send an `Authorization` header. That module decides how its stream authenticates.

## Revisit if

- Devices need edits while in the background (push notifications).
- Pull per poke becomes expensive, for example several people sharing one library.
