import { ENTRY_STATUSES } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import type { LibrarySort, SortDirection } from '@gameplan/storage';
import { ScrollView, StyleSheet } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { space } from '../theme';
import { Chip } from './chip';

/**
 * What the library asks storage for. Only `status` has a control on screen
 * for now; the rest stay so sorting and other filters can come back
 * (`library-options.tsx`).
 */
export type LibraryFilters = {
  status?: EntryStatus;
  favourite?: boolean;
  genreId?: number;
  sort: LibrarySort;
  /** Absent means the sort's natural order. */
  direction?: SortDirection;
};

/** Whether anything narrows the library; sorting alone doesn't. */
export const isFiltered = (filters: LibraryFilters): boolean =>
  filters.status !== undefined || filters.favourite !== undefined || filters.genreId !== undefined;

type Props = { filters: LibraryFilters; onChange: (filters: LibraryFilters) => void };

/**
 * One row of small status chips, All first, scrolling sideways when it runs
 * past the screen. Filtering happens in SQL (plan §12.2); this only says what
 * to ask for.
 */
export const FilterBar = ({ filters, onChange }: Props) => {
  const choose = (status: EntryStatus | undefined) => {
    const next = { ...filters };
    if (status === undefined) delete next.status;
    else next.status = status;
    onChange(next);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
      accessibilityLabel="Status"
    >
      <Chip
        label="All"
        size="small"
        selected={filters.status === undefined}
        onPress={() => choose(undefined)}
      />
      {ENTRY_STATUSES.map((status) => (
        <Chip
          key={status}
          label={STATUS_LABEL[status]}
          size="small"
          selected={filters.status === status}
          onPress={() => choose(filters.status === status ? undefined : status)}
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
