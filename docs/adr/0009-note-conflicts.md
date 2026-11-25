# ADR-009: Notes model and conflict strategy

Status: Accepted (2026-11-23, module `notes-conflicts`). First recorded in the original architecture plan; this version replaces it.

## Context

Notes are the user's own playthrough writing: puzzle solutions, hidden areas, NPC hints, unfinished business. They are separate facts that pile up during a playthrough, and the app is offline-first on several devices, so the same note can be edited on two devices before either syncs.

Per-field last-writer-wins (ADR-008) keeps one text and silently drops the other. For a rating that is acceptable; for a paragraph the user wrote, it is data loss. React Native has no mature text editor with CRDT bindings, and WebView editors bring performance and keyboard problems.

## Options considered

For the model:

1. **One plain-text note per game.** Any two edits on different devices collide, however unrelated.
2. **A list of note items per game**, one row per fact. Adds and deletes never collide; only edits to the same item can.
3. **A CRDT text (`Y.Text`) diffed from a plain text box**, or **rich text in a WebView editor with Yjs.** Merges characters, but brings a dependency, a second merge model beside ADR-008, and the editor problems above.

For concurrent text edits:

- **Last-writer-wins only.** Simple; loses writing.
- **Keep the loser as a conflict, resolved by the user.** Nothing lost; the user chooses.
- **Resolve automatically** (append, or merge lines). Guesses at intent, and two devices guessing differently diverge. (Keep both's line merge, below, is not this: the user chooses it, it runs on the resolving device only, and its result syncs as an ordinary text edit.)

## Decision

A list of note items (option 2), each its own synced row with `text`, `type` (`puzzle`, `secret`, `npc_hint`, `other`), an optional `location` and a `resolved` flag. `type`, `location` and `resolved` stay plain per-field LWW.

**No note text is ever lost to a merge.** Concurrent edits to one item's text keep the later text as today, and the losing text becomes a **note conflict** until the user decides.

- **Concurrent** means neither edit was made on top of the other. A text edit carries `baseHlc`, the text clock it started from, when one existed. "Built on" is an exact match: an edit was built on another only when its base _is_ that edit's clock. An incoming edit races the held text when the two clocks differ, the incoming base is not the held clock, and the held base is not the incoming clock (a held text with no base counts as not built on it). An incoming edit with no base (the first text, or an old client) is never concurrent: guessing would invent conflicts.
  - Clock order is not causal order, so it can't stand in for "built on": a device holding the end of a chain (its base newer than the incoming edit) would wave a real race through, and a snapshot carries only the chain's end (found in review, 2026-11-24). The exact match never loses a text; its cost is a rare extra conflict, when a text two or more steps back in a chain arrives late. One tap (keep current) clears it.
  - A device never runs detection on its own edits coming back in a pull: its first save, pulled back after later ones, matches neither base. Their races are found by the devices that held the other text. The rule itself never trusts the node: an editor left open across a "keep both" on the same device saves over the merged text, and only the exact match catches it.
- **An open editor counts as offline.** The note session keeps the `baseHlc` read when the editor opened, and its text box is never replaced while open, so a save after another device's edit arrived is concurrent with it, and that edit's text becomes the conflict. A save sends only the fields typed in the editor, measured against what it loaded, so an untouched `type` or `location` never writes back over one pulled meanwhile (2026-11-25). One exception to never replacing the text box (2026-11-25): when a conflict open on the note is resolved on another device, an untouched form takes the note's current text and a fresh session, read together in one read so the session's base is that text's clock; it stays locked until then, so nothing typed is replaced. A form with typing keeps it, and saving it makes a new conflict with the resolution.
- **The merge records the winning text's base** under `$base:text` in the row's field clocks, beside `$delete`. Phone and server share the merge, so snapshot rows carry it; once the server's op log keeps each op's `baseHlc` (#69, before detection ships), pulled ops carry theirs too. Until then a pulled op has no base, and detection on that path would miss every race. Every key starting with `$` is reserved, never a field clock, and read through one helper, so no code mistakes it for a field.
- **Detection runs on the phone, on pull**, inside the merge that already reads the stored row. Revised 2026-11-25 (owner): **and on every local note text write** (a save, or a resolution that changes the text), so the writing device sees the choice at once rather than a sync later. A write whose base never saw the held text (not its base, nor one of the same editor's earlier saves, by exact match) keeps that text as the conflict, under the same derived id the other device computes on pull, so both write one row. The conflict is queued after the edit that made it: in the log it never precedes its winner, so no device can resolve it while still holding the losing text. The conflict is written in the same transaction and queued as an ordinary `note_conflict` op, so it reaches the server and devices that never saw both edits. Its text is note text: it leaves the device only through sync, never in a log or error report.
- **A conflict's id is derived** (UUIDv5) from the note id and the losing edit's clock, so two devices spotting the same race write the same row, and the copies merge as one. Every other field comes from the losing edit too (`createdAt` from its clock's time), and the conflict's op carries the losing clock rather than a fresh one: every copy is identical at the same clock, so a late copy changes nothing, and a resolution, always made later, can never be reopened by one (found in review, 2026-11-24).
- **The user resolves, one conflict at a time, oldest first:** keep current, keep other, or keep both (merged by line: the note gains each line of the other version it lacks, counting copies, placed where it sits relative to the shared lines; shared lines stay once even reordered, and blank lines alone add nothing; texts sharing no content line are joined whole by a blank line; lines match ignoring spaces at either end; on very long notes new lines go below the differing part instead; refused if past the 5,000-character note limit). Without the text both grew from, a line one side deleted comes back: nothing is lost. A repeated keep both whose other version holds nothing new changes nothing (owner, 2026-11-25: joining whole texts copied the shared part on every round). A resolution's text edit carries a base like any edit, so it can race and conflict too.
- **Each device sees its own text as current** (owner, 2026-11-25). The stored conflict always holds the losing text, so on the device that wrote it the two sides swap for display, and so do keep current and keep other; nothing stored changes, so devices still converge on one row. A device that wrote neither side, or both, sees the stored sides; unsaved typing in the form is never replaced. A save that itself creates a conflict stays on the note, and the choice opens at once.
- **Protocol 3.** Apps on protocol 2 throw on a `note_conflict` op, so the server withholds those ops and rows from them and strips `$` keys they don't know (downcast, ADR-017). The served range becomes `{ min: 2, max: 3 }`, so protocol 1 gets `426`: its only user's devices already run 2.

## Consequences

- No writing is lost, no CRDT dependency, one merge path for every entity, and a plain text box per item.
- Conflicts need the same item edited on two devices without either seeing the other, offline or in an editor left open: rare.
- Which text wins is still per-field LWW; the conflict only keeps the other one. Devices converge exactly as before.
- Conflicts of a deleted note are hidden, not resolved for the user.
- Filtering by type, location and open/resolved is plain SQL. Items are ordered by location, then creation; manual reordering would need fractional sort keys, deferred.
- Items stay plain text: no formatting or images.

## Revisit if

Conflicts turn out common, notes become shared between people, users want manual ordering, or rich text becomes a requirement.
