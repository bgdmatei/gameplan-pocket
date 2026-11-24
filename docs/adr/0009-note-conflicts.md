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
- **Resolve automatically** (append, or merge lines). Guesses at intent, and two devices guessing differently diverge.

## Decision

A list of note items (option 2), each its own synced row with `text`, `type` (`puzzle`, `secret`, `npc_hint`, `other`), an optional `location` and a `resolved` flag. `type`, `location` and `resolved` stay plain per-field LWW.

**No note text is ever lost to a merge.** Concurrent edits to one item's text keep the later text as today, and the losing text becomes a **note conflict** until the user decides.

- **Concurrent** means neither edit was made on top of the other. A text edit carries `baseHlc`, the text clock it started from, when one existed. An incoming edit races the held text when its base is older than the held text's clock, the held text was not built on the incoming edit (its base is missing or older than the incoming clock), and the two clocks differ. An incoming edit with no base (the first text, or an old client) is never concurrent: guessing would invent conflicts.
- **An open editor counts as offline.** The note session keeps the `baseHlc` read when the editor opened, and its text box is never replaced while open, so a save after another device's edit arrived is concurrent with it, and that edit's text becomes the conflict.
- **The merge records the winning text's base** under `$base:text` in the row's field clocks, beside `$delete`. Phone and server share the merge, so snapshot rows carry it and detection is exact on every path. Every key starting with `$` is reserved, never a field clock, and read through one helper, so no code mistakes it for a field.
- **Detection runs on the phone, on pull**, inside the merge that already reads the stored row. The conflict is written in the same transaction and queued as an ordinary `note_conflict` op, so it reaches the server and devices that never saw both edits. Its text is note text: it leaves the device only through sync, never in a log or error report.
- **A conflict's id is derived** (UUIDv5) from the note id and the losing edit's clock, so two devices spotting the same race write the same row, and the copies merge as one.
- **The user resolves, one conflict at a time, oldest first:** keep current, keep other, or keep both (the two texts joined by a blank line, refused if past the 5,000-character note limit). A resolution's text edit carries a base like any edit, so it can race and conflict too.
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
