import { NOTE_ITEM_TABLES, countOpenNotes } from '@gameplan/storage';
import { router } from 'expo-router';
import { useQuery } from '@/data/use-query';
import { PillButton } from '@/ui/components/pill-button';

/** The way from a game to its notes, with how many are still open: the game's bottom bar. */
export const NotesLink = ({ gameId, entryId }: { gameId: number; entryId: string }) => {
  const open = useQuery((db) => countOpenNotes(db, entryId), NOTE_ITEM_TABLES, [entryId]);
  const count = open.status === 'ready' ? open.data : 0;

  return (
    <PillButton
      label={count === 0 ? 'Notes' : `Notes · ${String(count)} open`}
      icon="document-text-outline"
      variant="filled"
      onPress={() => router.push({ pathname: '/game/[id]/notes', params: { id: String(gameId) } })}
    />
  );
};
