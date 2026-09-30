import Ionicons from '@expo/vector-icons/Ionicons';
import { NOTE_ITEM_TABLES, countOpenNotes } from '@gameplan/storage';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useQuery } from '@/data/use-query';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** The way from a game to its notes, with how many are still open. */
export const NotesLink = ({ gameId, entryId }: { gameId: number; entryId: string }) => {
  const { colors } = useTheme();
  const open = useQuery((db) => countOpenNotes(db, entryId), NOTE_ITEM_TABLES, [entryId]);
  const count = open.status === 'ready' ? open.data : 0;
  const label = count === 0 ? 'Notes' : `Notes · ${String(count)} open`;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[id]/notes', params: { id: String(gameId) } })}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <Ionicons name="document-text-outline" size={20} color={colors.accent} />
      <Text style={[type.headline, styles.label, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget + 8,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  label: { flex: 1 },
});
