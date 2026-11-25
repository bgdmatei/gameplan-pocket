import type { ConflictChoice, NoteConflict } from '@gameplan/domain';

/** A conflict as this device shows it: its own text as current, the other device's as other. */
export type ConflictView = {
  /** This device wrote the losing text, so the stored sides are swapped for display. */
  swapped: boolean;
  /** Shown in the form above the drawer. */
  current: string;
  /** Shown in the drawer. */
  other: string;
  /** The stored choice that does what the button under this view says. */
  choice: (picked: ConflictChoice) => ConflictChoice;
};

const SWAPPED: Record<ConflictChoice, ConflictChoice> = {
  keep_current: 'keep_other',
  keep_other: 'keep_current',
  keep_both: 'keep_both',
};

/**
 * A conflict stores the losing text and the note keeps the winner, the same
 * on every device. On the device that wrote the losing text, that read as its
 * own words offered back as "the other version". There the two swap, and so
 * do the choices, so each device keeps "mine" or "theirs". A device that
 * wrote neither side, or both, sees the stored sides.
 * Nothing stored changes, so every device still converges on one row.
 */
export const conflictView = (
  note: { text: string; nodeId: string | null },
  conflict: NoteConflict,
  ownNodeId: string | null,
): ConflictView =>
  conflict.fromNodeId === ownNodeId && note.nodeId !== ownNodeId
    ? {
        swapped: true,
        current: conflict.text,
        other: note.text,
        choice: (picked) => SWAPPED[picked],
      }
    : { swapped: false, current: note.text, other: conflict.text, choice: (picked) => picked };
