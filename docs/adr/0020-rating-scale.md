# ADR-020: Rating stored as an integer 0–10

Status: Accepted (2026-09-18, module `domain-model`, decision 3). Written up 2026-10-06, at the close of Phase 1.

## Context

A player rates a game once and may change it on any device. The rating syncs as one field under per-field last-writer-wins (ADR-008), shows as stars, and later feeds stats (module 13). Plan §4 suggests storing an integer 0–100 and choosing the display separately, so the display can change without touching data.

## Options considered

1. **Integer 0–100,** as the plan says. Fine-grained, display-independent, and finer than any star display would use.
2. **Integer 0–10, shown as five stars in half steps.** Exactly the precision the display offers, so every stored value is one the user could have picked. Integers, so no float comparison in merges.
3. **Float 0–5.** Matches the stars directly, but floats compare badly and invite values no control can produce.

## Decision

Option 2: `rating` is an integer 0–10 or null (unrated), validated by the domain. `ratingToStars` and `starsToRating` convert for display, and a property test checks `starsToRating(ratingToStars(r)) === r` for every value.

This deviates from plan §4 on purpose. `schema-evolution` (module 11) needs one real breaking change to prove protocol and schema versioning (upcasting old ops, an N-1 client test); migrating the rating from 0–10 to 0–100 is that change, and it is the one the plan itself suggests for the exercise.

## Consequences

- Each star has two halves, so a tap sets one of ten values; tapping the current value clears the rating (back to unrated). VoiceOver treats the whole row as one adjustable control: swipe up or down to change it.
- Stats and any import (Steam, module 12) must map their scales onto 0–10 until `schema-evolution` lands, then onto 0–100.
- Changing the scale before then is an ask-first data-contract change (`CLAUDE.md`): rows already stored on devices and in ops would have to be migrated.
