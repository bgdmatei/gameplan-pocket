import { NOTE_ITEM_TYPES } from '@gameplan/domain';
import type { NoteItem, NoteItemType } from '@gameplan/domain';
import {
  LIBRARY_ENTRY_TABLES,
  NOTE_ITEM_TABLES,
  countOpenNotes,
  getLibraryEntryByGame,
  listNoteItems,
} from '@gameplan/storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@/data/use-query';
import { Chip } from '@/ui/components/chip';
import { LoadFailed } from '@/ui/components/load-failed';
import { PressableScale } from '@/ui/components/pressable-scale';
import { PrimaryButton } from '@/ui/components/primary-button';
import { SkeletonBlock } from '@/ui/components/skeleton';
import { NOTE_TYPE_LABEL } from '@/ui/labels';
import { radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Shown = 'open' | 'all' | 'resolved';

const SHOWN: readonly { value: Shown; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'resolved', label: 'Resolved' },
];

const RESOLVED: Record<Shown, boolean | undefined> = {
  open: false,
  all: undefined,
  resolved: true,
};

/** A game's notes in reading order (by location, then oldest first), open ones by default. */
const NotesScreen = () => {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = Number(id);
  const [shown, setShown] = useState<Shown>('open');
  const [noteType, setNoteType] = useState<NoteItemType | undefined>(undefined);

  const state = useQuery(
    async (db) => {
      const entry = await getLibraryEntryByGame(db, gameId);
      if (entry === null) return null;
      const resolved = RESOLVED[shown];
      return {
        entryId: entry.id,
        open: await countOpenNotes(db, entry.id),
        notes: await listNoteItems(db, entry.id, {
          ...(resolved === undefined ? {} : { resolved }),
          ...(noteType === undefined ? {} : { type: noteType }),
        }),
      };
    },
    [...LIBRARY_ENTRY_TABLES, ...NOTE_ITEM_TABLES],
    [gameId, shown, noteType],
  );

  if (state.status === 'loading') {
    return (
      <View
        style={styles.page}
        accessible
        accessibilityLabel="Loading notes"
        accessibilityState={{ busy: true }}
      >
        <SkeletonBlock width="30%" height={20} />
        <SkeletonBlock width="100%" height={72} round={radius.card} />
        <SkeletonBlock width="100%" height={72} round={radius.card} />
      </View>
    );
  }
  if (state.status === 'failed') {
    return <LoadFailed message="These notes couldn’t be read." onRetry={state.retry} />;
  }
  if (state.data === null) {
    return (
      <View style={styles.page}>
        <Text style={[type.body, { color: colors.muted }]}>This game isn’t in your library.</Text>
      </View>
    );
  }
  const { entryId, open, notes } = state.data;

  return (
    <FlatList
      data={notes}
      keyExtractor={(note) => note.id}
      contentContainerStyle={styles.page}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={[type.headline, { color: colors.text }]} accessibilityRole="header">
            {open === 0 ? 'Nothing open' : `${String(open)} open`}
          </Text>
          <PrimaryButton
            label="Add note"
            onPress={() => router.push({ pathname: '/note/new', params: { entryId } })}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {SHOWN.map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                selected={shown === value}
                onPress={() => setShown(value)}
              />
            ))}
            {NOTE_ITEM_TYPES.map((value) => (
              <Chip
                key={value}
                label={NOTE_TYPE_LABEL[value]}
                selected={noteType === value}
                onPress={() => setNoteType(noteType === value ? undefined : value)}
              />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <Text style={[type.body, { color: colors.muted }]}>
          {shown === 'open' && noteType === undefined
            ? 'No open notes. Add a puzzle, a secret or a hint you want to remember.'
            : 'No notes match.'}
        </Text>
      }
      renderItem={({ item }) => <NoteRow note={item} />}
    />
  );
};

const NoteRow = ({ note }: { note: NoteItem }) => {
  const { colors } = useTheme();
  const label = `${NOTE_TYPE_LABEL[note.type]} · ${note.resolved ? 'resolved' : 'open'}`;

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
      accessibilityRole="button"
      accessibilityHint="Opens the note"
      style={[
        styles.note,
        note.resolved
          ? { backgroundColor: colors.surface, borderColor: colors.line }
          : { backgroundColor: colors.noteFill, borderColor: colors.noteFill },
      ]}
    >
      <Text style={[type.label, { color: note.resolved ? colors.muted : colors.noteLabel }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[type.body, { color: colors.text }]} numberOfLines={4}>
        {note.text}
      </Text>
      {note.location === null ? null : (
        <Text style={[type.subhead, { color: colors.muted }]}>{note.location}</Text>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md },
  header: { gap: space.md, marginBottom: space.sm },
  row: { gap: space.sm },
  note: { padding: space.md, gap: space.xs, borderRadius: radius.card, borderWidth: 1 },
});

export default NotesScreen;
