# ADR-021: Progress as one discriminated-union field

Status: Accepted (2026-09-18, module `domain-model`). Written up 2026-10-06, at the close of Phase 1.

## Context

Games measure progress differently: a percentage, a chapter name, achievements earned out of a total, or something only the player can describe. Progress is edited on any device and merged with per-field last-writer-wins (ADR-008). Plan §4 models it as a `progress_type` enum plus a value column, with playtime as its own field.

## Options considered

1. **Two fields, `progress_type` and `progress_value`,** as plan §4 sketches. Merged independently, one device's type can be paired with another device's value: "percentage" with "Act II".
2. **One field holding a discriminated union.** Type and value always travel together, so a merge picks one device's whole progress.
3. **One free-text field.** Simple, but nothing can be computed from it (stats, sorting by completion).

## Decision

Option 2. `progress` is `Progress | null`, where

```ts
type Progress =
  | { type: 'percentage'; value: number } //              integer 0–100
  | { type: 'chapter'; value: string } //                 1–100 characters
  | { type: 'achievements'; earned: number; total: number } // 0 ≤ earned ≤ total, total ≥ 1
  | { type: 'freeform'; value: string }; //               1–200 characters
```

It is a single field for sync, stored as JSON in one column, so `sync-core` never merges a `type` from one device with a `value` from another. Playtime is a separate field (`playtimeMinutes`), entered as hours and minutes.

## Consequences

- Validation is per variant (the domain's zod schema), and the type system makes impossible combinations unrepresentable.
- Adding a progress kind later is additive: a new variant, accepted by new clients; old clients must be handled by `schema-evolution` (module 11).
- **Progress is not on screen yet.** The Checkpoint C review took it off the entry editor to keep the screen focused (`SPEC-mobile-library.md`, decision 16). It stays in the domain, storage and op allowlist, so bringing it back needs UI only, no migration.
