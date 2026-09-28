import { ENTRY_STATUSES, displayTag } from '@gameplan/domain';
import type { EntryStatus } from '@gameplan/domain';
import type { LibrarySort } from '@gameplan/storage';
import { ScrollView, StyleSheet } from 'react-native';
import { STATUS_LABEL } from '../labels';
import { space } from '../theme';
import { Chip } from './chip';

export type LibraryFilters = {
  status?: EntryStatus;
  favourite?: boolean;
  tag?: string;
  sort: LibrarySort;
};

const SORTS: readonly LibrarySort[] = ['recent', 'name', 'rating', 'playtime'];
const SORT_LABEL: Record<LibrarySort, string> = {
  recent: 'Recent',
  name: 'Name',
  rating: 'Rating',
  playtime: 'Playtime',
};

type Props = {
  filters: LibraryFilters;
  tags: readonly string[];
  onChange: (filters: LibraryFilters) => void;
};

/**
 * One row of chips: sort, favourites, status, then tags. A second tap on a
 * status or tag clears it, so "All" needs no chip of its own. Filtering and
 * sorting happen in SQL (plan §12.2); this only says what to ask for.
 */
export const FilterBar = ({ filters, tags, onChange }: Props) => {
  const nextSort = SORTS[(SORTS.indexOf(filters.sort) + 1) % SORTS.length] ?? 'recent';

  const toggle = <K extends 'status' | 'tag'>(key: K, value: LibraryFilters[K]) => {
    const next = { ...filters };
    if (filters[key] === value) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
      accessibilityLabel="Filters"
    >
      <Chip
        label={`Sort: ${SORT_LABEL[filters.sort]}`}
        accessibilityLabel={`Sorted by ${SORT_LABEL[filters.sort]}. Changes to ${SORT_LABEL[nextSort]}`}
        selected={false}
        onPress={() => onChange({ ...filters, sort: nextSort })}
      />
      <Chip
        label="★ Favourites"
        selected={filters.favourite === true}
        onPress={() => {
          const next = { ...filters };
          if (next.favourite === true) delete next.favourite;
          else next.favourite = true;
          onChange(next);
        }}
      />
      {ENTRY_STATUSES.map((status) => (
        <Chip
          key={status}
          label={STATUS_LABEL[status]}
          selected={filters.status === status}
          onPress={() => toggle('status', status)}
        />
      ))}
      {tags.map((tag) => (
        <Chip
          key={tag}
          label={`#${displayTag(tag)}`}
          accessibilityLabel={`Tag ${displayTag(tag)}`}
          selected={filters.tag === tag}
          onPress={() => toggle('tag', tag)}
        />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  // A horizontal ScrollView in a column otherwise grows to fill the height.
  bar: { flexGrow: 0 },
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
