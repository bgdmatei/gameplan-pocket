import Ionicons from '@expo/vector-icons/Ionicons';
import type { EntryStatus } from '@gameplan/domain';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Each status's glyph, outlined and filled. Chosen by the owner at Checkpoint B. */
const ICONS: Record<EntryStatus, { outline: IconName; filled: IconName }> = {
  wishlist: { outline: 'heart-outline', filled: 'heart' },
  backlog: { outline: 'layers-outline', filled: 'layers' },
  playing: { outline: 'game-controller-outline', filled: 'game-controller' },
  paused: { outline: 'pause-outline', filled: 'pause' },
  completed: { outline: 'trophy-outline', filled: 'trophy' },
  dropped: { outline: 'ban-outline', filled: 'ban' },
};

type Props = {
  status: EntryStatus;
  color: string;
  /** Filled when the status is the one chosen; outlined otherwise. */
  filled?: boolean;
  size?: number;
};

/**
 * A status's icon, wherever a status is shown with its label. Decorative: the
 * label beside it is what VoiceOver reads.
 */
export const StatusIcon = ({ status, color, filled = false, size = 16 }: Props) => (
  <Ionicons
    name={filled ? ICONS[status].filled : ICONS[status].outline}
    size={size}
    color={color}
    accessibilityElementsHidden
    importantForAccessibility="no"
  />
);
