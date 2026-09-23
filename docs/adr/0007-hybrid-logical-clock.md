# ADR-007: Hybrid logical clocks for ordering edits

Status: Accepted (2026-09-23, module `sync-core`)

## Context

Merging edits made offline on several devices needs a total order: for any two edits to the same field, every device must agree which came later. Device wall clocks disagree, jump backwards, and can be set wrong on purpose.

## Options considered

1. **Wall-clock timestamps.** Simple and roughly meaningful, but a device whose clock runs behind loses every conflict, and two edits in one millisecond tie.
2. **Lamport clocks or version vectors.** Correct causal order, but a Lamport counter has no relation to real time ("the later edit wins" stops meaning later), and version vectors grow with the number of devices.
3. **Hybrid logical clock (HLC).** Wall time when clocks agree, a counter when they do not, and a node id to break ties.

## Decision

Option 3. A clock is `wallMs:counter:nodeId`, serialised fixed-width (15 digits, 5 digits, 16 hex) so string comparison is clock comparison, in SQLite, JSON and JavaScript alike.

- `tick` (local edit) always returns a value later than the last one issued, even if the device clock went backwards.
- `receive` (op from elsewhere) moves the local clock past the remote one, so this device's next edit sorts after everything it has seen.
- A counter overflow moves the wall on by 1 ms.
- The clock is persisted in the same transaction as the write that used it.
- **The client never rejects or clamps a pulled op**, however far ahead its clock: that would split devices apart. `isTooFarAhead` (default 60 s) is for the server to apply at push time, the one point where refusing an op is safe because it has not entered the log.

## Consequences

- A device with a fast clock can win conflicts it "should" lose, bounded by the server's drift guard.
- Clock values are opaque, sortable strings everywhere; nothing outside `packages/sync` parses them.
- A property test checks that clocks only move forward and that text order matches logical order.

## Revisit if

Conflicts need causal ("happened before") semantics rather than a total order, for example true concurrent-edit detection beyond note text.
