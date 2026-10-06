import type { EntryStatus } from '@gameplan/domain';
import type { LibrarySort, SortDirection } from '@gameplan/storage';
import { ScrollView, StyleSheet } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { space } from '../theme';
import { Chip } from './chip';

/** A status the grid shows: Playing games live on the Now Playing shelf (spec decision 20). */
export type GridStatus = Exclude<EntryStatus, 'playing'>;

/**
 * The status chips, in the order players reach for them, and the one the
 * library opens on: always one status, never All (spec decision 21).
 */
export const GRID_STATUSES: readonly GridStatus[] = [
  'completed',
  'wishlist',
  'backlog',
  'paused',
  'dropped',
];
export const DEFAULT_GRID_STATUS: GridStatus = 'completed';

/**
 * What the library asks storage for. Only `status` has a control on screen
 * for now; the rest stay so sorting and other filters can come back
 * (`library-options.tsx`).
 */
export type LibraryFilters = {
  status: GridStatus;
  favourite?: boolean;
  genreId?: number;
  sort: LibrarySort;
  /** Absent means the sort's natural order. */
  direction?: SortDirection;
};

type Props = { filters: LibraryFilters; onChange: (filters: LibraryFilters) => void };

/**
 * One row of small status chips, one always selected, scrolling sideways when
 * it runs past the screen. Filtering happens in SQL (plan §12.2); this only says what
 * to ask for.
 */
export const FilterBar = ({ filters, onChange }: Props) => {
  const choose = (status: GridStatus) => {
    if (status !== filters.status) onChange({ ...filters, status });
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
      accessibilityLabel="Status"
    >
      {GRID_STATUSES.map((status) => (
        <Chip
          key={status}
          label={STATUS_LABEL[status]}
          size="small"
          selected={filters.status === status}
          onPress={() => choose(status)}
        />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  // A horizontal ScrollView in a column otherwise grows to fill the height.
  bar: { flexGrow: 0 },
  row: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
