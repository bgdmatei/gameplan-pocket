import Ionicons from '@expo/vector-icons/Ionicons';
import { DomainValidationError, createEntryTag, displayTag } from '@gameplan/domain';
import {
  ENTRY_TAG_TABLES,
  LIBRARY_ENTRY_TABLES,
  listEntryTags,
  listTagsInUse,
} from '@gameplan/storage';
import { commitLocalCreate, commitLocalDelete, tagId } from '@gameplan/sync';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { useQuery } from '@/data/use-query';
import { Chip } from '@/ui/components/chip';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const MAX_SUGGESTIONS = 8;

/**
 * A game's tags: tap one to remove it, type or pick a suggestion to add one.
 *
 * A tag's id comes from the entry and the normalised tag (`tagId`), so adding
 * one that was removed revives the same row, and the same tag added on two
 * offline devices becomes one row.
 */
export const TagEditor = ({ entryId }: { entryId: string }) => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const state = useQuery(
    async (db) => ({
      tags: await listEntryTags(db, entryId),
      inUse: await listTagsInUse(db),
    }),
    [...ENTRY_TAG_TABLES, ...LIBRARY_ENTRY_TABLES],
    [entryId],
  );
  const tags = state.status === 'ready' ? state.data.tags : [];
  const inUse = state.status === 'ready' ? state.data.inUse : [];

  const typed = draft.trim().toLowerCase();
  const suggestions = inUse
    .filter(({ tag }) => !tags.some((own) => own.tag === tag) && tag.startsWith(typed))
    .slice(0, MAX_SUGGESTIONS);

  const add = async (raw: string): Promise<void> => {
    try {
      const next = createEntryTag({ id: tagId(entryId, raw), entryId, tag: raw });
      setDraft('');
      if (tags.some((own) => own.tag === next.tag)) return;
      await commitLocalCreate(adapter, syncEnv, { entity: 'entry_tag', next });
    } catch (error) {
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The tag couldn’t be added. Try again.');
    }
  };

  const remove = async (id: string): Promise<void> => {
    try {
      await commitLocalDelete(adapter, syncEnv, { entity: 'entry_tag', entityId: id });
    } catch {
      toast.show('The tag couldn’t be removed. Try again.');
    }
  };

  return (
    <View style={styles.editor}>
      {tags.length === 0 ? null : (
        <View style={styles.wrap}>
          {tags.map((tag) => (
            <Pressable
              key={tag.id}
              onPress={() => void remove(tag.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${displayTag(tag.tag)}`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.tag, { backgroundColor: colors.accentFill }]}
            >
              <Text style={[type.subhead, styles.bold, { color: colors.onAccent }]}>
                #{displayTag(tag.tag)}
              </Text>
              <Ionicons name="close" size={14} color={colors.onAccent} />
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => {
          if (typed !== '') void add(draft);
        }}
        placeholder="Add a tag"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        submitBehavior="submit"
        accessibilityLabel="Add a tag"
        style={[
          type.body,
          styles.input,
          { color: colors.text, borderColor: colors.line, backgroundColor: colors.raised },
        ]}
      />

      {suggestions.length === 0 ? null : (
        <View style={styles.wrap}>
          {suggestions.map(({ tag }) => (
            <Chip
              key={tag}
              label={`+ ${displayTag(tag)}`}
              accessibilityLabel={`Add tag ${displayTag(tag)}`}
              selected={false}
              onPress={() => void add(tag)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  editor: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget - 12,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  bold: { fontWeight: '700' },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.small,
  },
});
