import type { NoteItem } from '@gameplan/domain';
import { NOTE_ITEM_TABLES, getNoteItem, listOpenConflicts } from '@gameplan/storage';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { ConflictDrawer, conflictDrawerSpace } from '@/features/notes/conflict-drawer';
import { NoteForm } from '@/features/notes/note-form';
import { deleteNote } from '@/features/notes/note-session';
import { useNoteConflict } from '@/features/notes/use-note-conflict';
import { useNoteDraft } from '@/features/notes/use-note-draft';
import { HeaderIconButton } from '@/ui/components/header-button';
import { LoadFailed } from '@/ui/components/load-failed';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const NoteScreen = () => {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const note = useQuery((db) => getNoteItem(db, id), NOTE_ITEM_TABLES, [id]);
  // One local row: it arrives within a frame, before a placeholder could be read.
  if (note.status === 'loading') return null;
  if (note.status === 'failed') {
    return <LoadFailed message="This note couldn’t be read." onRetry={note.retry} />;
  }
  if (note.data === null) {
    return (
      <View style={styles.page}>
        <Text style={[type.body, { color: colors.muted }]}>This note was deleted.</Text>
      </View>
    );
  }
  return <NoteEditor note={note.data} />;
};

/**
 * Edits one note: a draft until Save, which writes the typed fields as one
 * op (`useNoteDraft`), and the note's open conflicts in a drawer
 * (`useNoteConflict`). Leaving with unsaved changes asks first, as adding a
 * note does. Resolved is a toggle and saves at once.
 */
const NoteEditor = ({ note }: { note: NoteItem }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const navigation = useNavigation();
  const form = useNoteDraft(note);
  const { conflict, view, blocked, ready, choose, formText } = useNoteConflict(note, form);
  // Saving or deleting leaves the page on purpose, without the discard question.
  const [leaving, setLeaving] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(0);

  usePreventRemove(form.dirty && !leaving, ({ data }) => {
    Alert.alert('Discard your changes?', 'What you changed isn’t saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const saveDraft = async (): Promise<void> => {
    // A save now would race the choice still waiting below.
    if (leaving || blocked) return;
    setLeaving(true);
    if (!(await form.save(form.typedChanges()))) {
      setLeaving(false);
      return;
    }
    // A save that raced a text pulled while typing made a conflict: stay, so
    // the drawer opens now rather than on the next visit.
    try {
      if ((await listOpenConflicts(adapter, note.id)).length > 0) {
        // A fresh session: a later save builds on this one, not the old base.
        // A note gone meanwhile has nothing to stay for.
        if ((await form.refreshFrozen(form.draft.text)) === null) {
          router.back();
          return;
        }
        setLeaving(false);
        return;
      }
    } catch {
      // The save went through; the badge still leads back to any conflict.
    }
    router.back();
  };

  const confirmDelete = () =>
    Alert.alert('Delete this note?', 'It is removed from every device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          deleteNote(adapter, syncEnv, note.id).then(
            () => router.back(),
            () => {
              setLeaving(false);
              toast.show('The note couldn’t be deleted. Try again.');
            },
          );
        },
      },
    ]);

  // Room to scroll the whole note above the drawer while it is up.
  const below =
    conflict === undefined ? insets.bottom : conflictDrawerSpace(drawerHeight, insets.bottom);

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.page, { paddingBottom: space.xl + below }]}
        bottomOffset={space.lg}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen
          options={{
            // iOS 26 groups `headerRight` into one glass pill; as native bar
            // items that don't share a background, delete and save get a pill each.
            unstable_headerRightItems: () => [
              {
                type: 'button',
                label: 'Delete note',
                icon: { type: 'sfSymbol', name: 'trash' },
                tintColor: colors.danger,
                sharesBackground: false,
                onPress: confirmDelete,
              },
              {
                type: 'button',
                label: 'Save note',
                icon: { type: 'sfSymbol', name: 'checkmark' },
                tintColor: colors.success,
                sharesBackground: false,
                disabled: !form.dirty || blocked,
                onPress: () => void saveDraft(),
              },
            ],
            // Android and older iOS.
            headerRight: () => (
              <View style={styles.headerActions}>
                <HeaderIconButton
                  icon="trash-outline"
                  label="Delete note"
                  danger
                  onPress={confirmDelete}
                />
                <HeaderIconButton
                  icon="checkmark"
                  label="Save note"
                  success
                  disabled={!form.dirty || blocked}
                  onPress={() => void saveDraft()}
                />
              </View>
            ),
          }}
        />
        <View
          pointerEvents={!blocked && form.frozenText === null ? 'auto' : 'none'}
          style={styles.form}
        >
          <NoteForm draft={{ ...form.draft, text: formText }} onChange={form.setDraft} />

          <View
            style={[
              styles.switchRow,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
          >
            <Text style={[type.body, { color: colors.text }]}>Resolved</Text>
            <Switch
              value={form.resolved}
              onValueChange={(next) => {
                form.setResolved(next);
                void form.save({ resolved: next });
              }}
              trackColor={{ true: colors.accentFill, false: colors.line }}
              accessibilityLabel="Resolved"
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
      {conflict === undefined || view === undefined ? null : (
        <ConflictDrawer
          other={view.other}
          ready={ready}
          onChoose={choose}
          onHeight={setDrawerHeight}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { padding: space.lg, gap: space.xl },
  form: { gap: space.xl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // A soft card row, like Favourite on the game.
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export default NoteScreen;
