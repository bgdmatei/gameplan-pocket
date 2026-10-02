import type { LibrarySort, SortDirection } from '@gameplan/storage';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { Chip } from './chip';
import { Dropdown } from './dropdown';
import type { DropdownOption } from './dropdown';
import type { LibraryFilters } from './filter-bar';
import { Sheet } from './sheet';

/*
 * Sorting and the genre filter, taken off the library screen at the second
 * review (SPEC-mobile-library.md decision 18) and kept ready to place
 * elsewhere. Storage still supports both (`sort`, `direction`, `genreId`,
 * `listGenresInLibrary`).
 */

export type GenreChoice = { id: number; name: string; count: number };

type SortChoice = 'released' | 'name' | 'rating';

/** Each sort's natural order first, then the way it reads reversed. */
const SORTS: Record<
  SortChoice,
  { label: string; natural: SortDirection; order: Record<SortDirection, string> }
> = {
  released: { label: 'Release', natural: 'desc', order: { desc: 'Newest', asc: 'Oldest' } },
  name: { label: 'Name', natural: 'asc', order: { asc: 'A–Z', desc: 'Z–A' } },
  rating: { label: 'Rating', natural: 'desc', order: { desc: 'Highest', asc: 'Lowest' } },
};

const SORT_CHOICES: readonly SortChoice[] = ['released', 'name', 'rating'];

const isChoice = (sort: LibrarySort): sort is SortChoice => sort in SORTS;

const directionOf = (filters: LibraryFilters, sort: SortChoice): SortDirection =>
  filters.sort === sort ? (filters.direction ?? SORTS[sort].natural) : SORTS[sort].natural;

type Props = { filters: LibraryFilters; onChange: (filters: LibraryFilters) => void };

/** Release, Name or Rating; choosing the current sort again reverses it. */
export const SortDropdown = ({ filters, onChange }: Props) => (
  <Dropdown
    label="Sort"
    options={SORT_CHOICES.map((sort): DropdownOption<LibrarySort> => ({
      value: sort,
      label: SORTS[sort].label,
      detail: SORTS[sort].order[directionOf(filters, sort)],
    }))}
    value={filters.sort}
    // A new sort starts in its natural order; choosing it again reverses it.
    onChange={(sort) => {
      const next = { ...filters, sort };
      delete next.direction;
      onChange(next);
    }}
    onReselect={(sort) => {
      if (isChoice(sort))
        onChange({ ...filters, direction: directionOf(filters, sort) === 'asc' ? 'desc' : 'asc' });
    }}
  />
);

/** A Genre chip that opens a sheet of the genres in the library, with counts. */
export const GenreFilter = ({
  filters,
  genres,
  onChange,
}: Props & { genres: readonly GenreChoice[] }) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const genre = genres.find((choice) => choice.id === filters.genreId);

  const without = (): LibraryFilters => {
    const next = { ...filters };
    delete next.genreId;
    return next;
  };

  return (
    <>
      <Chip
        label={genre?.name ?? 'Genre'}
        icon="albums-outline"
        accessibilityLabel={genre === undefined ? 'Genre' : `Genre, ${genre.name}`}
        selected={genre !== undefined}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        title="Genre"
        onClose={() => setOpen(false)}
        action={{ label: 'Clear', onPress: () => onChange(without()) }}
      >
        {genres.length === 0 ? (
          <Text style={[type.body, { color: colors.muted }]}>
            No genres yet: they come with the games in your library.
          </Text>
        ) : (
          <View style={styles.wrap}>
            {genres.map((choice) => (
              <Chip
                key={choice.id}
                label={`${choice.name} · ${String(choice.count)}`}
                accessibilityLabel={`${choice.name}, ${String(choice.count)} games`}
                selected={filters.genreId === choice.id}
                onPress={() => {
                  onChange(
                    filters.genreId === choice.id ? without() : { ...filters, genreId: choice.id },
                  );
                  setOpen(false);
                }}
              />
            ))}
          </View>
        )}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
