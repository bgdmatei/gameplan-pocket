# ADR-008: Per-field last-writer-wins, and delete semantics

Status: Accepted (2026-09-23, module `sync-core`)

## Context

Devices edit offline and exchange ops later, in any order, sometimes twice. Every device must end with identical data from the same set of ops (convergence), and a merge must never refuse a state: two edits valid on their own devices can merge into a combination no single edit could reach (`dropped` with a finish date), and rejecting it would leave devices disagreeing forever.

Deletes need a rule of their own: what happens when one device deletes a row and another edits it?

## Options considered

For edits:

1. **Whole-row last-writer-wins.** Loses concurrent edits to different fields: rating on the phone and status on the tablet, one vanishes.
2. **Per-field last-writer-wins by HLC.** Each field keeps the value with the newest clock.
3. **CRDTs per field or document.** Merges more cleverly (text, counters) but brings a dependency and complexity the data does not need; notes are plain short items (ADR-009).

For deletes:

- **Delete is sticky**: a delete is final unless explicitly re-created.
- **Newer edit brings it back**: a delete wins over every edit before it; an edit made after it restores the row.

## Decision

Per-field LWW (option 2). Ops carry changed fields only. Each row stores a clock per field (`field_hlc`), plus a reserved `$delete` clock.

**A row is deleted when its `$delete` clock is newer than every field's clock.** An edit made after the delete brings the row back: it was deliberate, and silently dropping it would lose a user action. Edits made before the delete never do.

Two refinements, both found while applying the rule to real data:

- **Library entries are archived, never deleted** (`SPEC-domain-model.md` decision 12). `archived` is an ordinary field. The op schema accepts no delete for a library entry.
- **Deletes never cascade.** A delete touches one row and emits one op. Deleting a list hides its items because item queries require a live list. A local cascade would set `deleted` on children with no op and no clock, and after a bring-back devices would disagree.

Merge is pure and shared by client and server. Derived fields (`startedOn`, `finishedOn`) are computed by the device that made the change and synced as ordinary fields, never recomputed during a merge.

## Consequences

- Concurrent edits to different fields both survive; to the same field, the later one wins.
- Merged rows can break domain rules; the next local write validates from whatever state exists.
- A property test runs three simulated devices through random edits, deletes, reordering, duplication and delay, and asserts identical state. Breaking the clock comparison makes it fail within milliseconds.
- Deleted data stays as tombstones until garbage collection (`stats-and-portability`).

## Revisit if

Conflicts on the same field are common enough to need user resolution beyond note text (ADR-009), or a permanent delete for games is requested.
