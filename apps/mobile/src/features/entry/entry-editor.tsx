import {
  DomainValidationError,
  ENTRY_STATUSES,
  TRANSITIONS,
  hoursMinutesToMinutes,
  minutesToHoursMinutes,
} from '@gameplan/domain';
import type { EntryPatch, LibraryEntry, Platform, Progress } from '@gameplan/domain';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { Chip } from '@/ui/components/chip';
import { StarRating } from '@/ui/components/star-rating';
import { StatusChips } from '@/ui/components/status-chips';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { editEntry } from './edit-entry';
import { TagEditor } from './tag-editor';

type ProgressKind = Progress['type'] | 'none';

const PROGRESS_KINDS: readonly { kind: ProgressKind; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'percentage', label: 'Percent' },
  { kind: 'chapter', label: 'Chapter' },
  { kind: 'achievements', label: 'Achievements' },
  { kind: 'freeform', label: 'Other' },
];

type Props = {
  entry: LibraryEntry;
  /** Only the game's own platforms are offered. */
  platforms: readonly Platform[];
};

/**
 * Edits an entry one field at a time: each control saves its own change as
 * one op. A control shows the new value at once from `pending`, and the next
 * entry from `useQuery` replaces it; a refused change drops it again and the
 * toast says why.
 */
export const EntryEditor = ({ entry, platforms }: Props) => {
  const { colors } = useTheme();
  const adapter = useDatabase();
  const toast = useToast();
  const [pending, setPending] = useState<EntryPatch>({});
  const [progressKind, setProgressKind] = useState<ProgressKind>(entry.progress?.type ?? 'none');

  useEffect(() => setPending({}), [entry]);

  const shown = { ...entry, ...pending };
  const statuses = ENTRY_STATUSES.filter(
    (status) => status === shown.status || TRANSITIONS[shown.status].includes(status),
  );

  /** Resolves `false` when the change was refused or failed, after saying so. */
  const save = async (patch: EntryPatch): Promise<boolean> => {
    setPending((current) => ({ ...current, ...patch }));
    try {
      await editEntry(adapter, syncEnv, {
        entryId: entry.id,
        patch,
        today: today(),
        gamePlatformIds: platforms.map((platform) => platform.id),
      });
      return true;
    } catch (error) {
      setPending((current) => {
        const next = { ...current };
        for (const field of Object.keys(patch)) delete next[field as keyof EntryPatch];
        return next;
      });
      if (error instanceof DomainValidationError) toast.showRejected(error);
      else toast.show('The change couldn’t be saved. Try again.');
      return false;
    }
  };

  const chooseProgressKind = (kind: ProgressKind) => {
    setProgressKind(kind);
    if (kind === 'none') void save({ progress: null });
  };

  const archive = async () => {
    if (await save({ archived: true }))
      toast.show('Archived. It’s in the Archive, with its rating and notes.');
  };

  return (
    <View style={styles.editor}>
      <Section label="STATUS">
        <StatusChips
          options={statuses}
          selected={shown.status}
          onSelect={(status) => void save({ status })}
        />
        <Dates entry={entry} />
      </Section>

      <Section label="RATING">
        <StarRating rating={shown.rating} onChange={(rating) => void save({ rating })} />
      </Section>

      {platforms.length === 0 ? null : (
        <Section label="PLATFORM">
          <View style={styles.wrap}>
            {platforms.map((platform) => (
              <Chip
                key={platform.id}
                label={platform.abbreviation ?? platform.name}
                accessibilityLabel={platform.name}
                selected={shown.platformId === platform.id}
                onPress={() =>
                  void save({
                    platformId: shown.platformId === platform.id ? null : platform.id,
                  })
                }
              />
            ))}
          </View>
        </Section>
      )}

      <Section label="PROGRESS">
        <View style={styles.wrap}>
          {PROGRESS_KINDS.map(({ kind, label }) => (
            <Chip
              key={kind}
              label={label}
              selected={progressKind === kind}
              onPress={() => chooseProgressKind(kind)}
            />
          ))}
        </View>
        <ProgressFields
          kind={progressKind}
          progress={shown.progress}
          onSave={(progress) => void save({ progress })}
        />
      </Section>

      <Section label="PLAYTIME">
        <Playtime
          minutes={shown.playtimeMinutes}
          onSave={(hoursMinutes) => {
            try {
              void save({ playtimeMinutes: hoursMinutesToMinutes(hoursMinutes) });
            } catch (error) {
              toast.showRejected(error);
            }
          }}
        />
      </Section>

      <Section label="TAGS">
        <TagEditor entryId={entry.id} />
      </Section>

      <View style={styles.switchRow}>
        <Text style={[type.body, { color: colors.text }]}>Favourite</Text>
        <Switch
          value={shown.favourite}
          onValueChange={(favourite) => void save({ favourite })}
          trackColor={{ true: colors.accentFill, false: colors.line }}
          accessibilityLabel="Favourite"
        />
      </View>

      <Pressable
        onPress={() => void archive()}
        accessibilityRole="button"
        style={styles.textButton}
      >
        <Text style={[type.callout, { color: colors.muted }]}>Archive this game</Text>
      </Pressable>
    </View>
  );
};

const Section = ({ label, children }: { label: string; children: ReactNode }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
};

const Dates = ({ entry }: { entry: LibraryEntry }) => {
  const { colors } = useTheme();
  const parts = [
    entry.startedOn === null ? null : `Started ${entry.startedOn}`,
    entry.finishedOn === null ? null : `Finished ${entry.finishedOn}`,
  ].filter((part) => part !== null);
  if (parts.length === 0) return null;
  return (
    <Text style={[type.caption, tabularNumbers, { color: colors.muted }]}>{parts.join(' · ')}</Text>
  );
};

type FieldProps = {
  label: string;
  /** The saved value. Callers key the field by it, so it starts again when it changes. */
  value: string;
  onSave: (text: string) => void;
  numeric?: boolean;
  wide?: boolean;
};

/**
 * A text field that saves when editing ends (blur or return), not on every
 * keystroke, so typing "45" is one op, not two.
 */
const Field = ({ label, value, onSave, numeric = false, wide = false }: FieldProps) => {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);

  return (
    <View style={wide ? styles.wideField : styles.field}>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onEndEditing={() => {
          if (draft.trim() === '') setDraft(value);
          else if (draft !== value) onSave(draft);
        }}
        keyboardType={numeric ? 'number-pad' : 'default'}
        returnKeyType="done"
        accessibilityLabel={label}
        style={[
          type.body,
          numeric && tabularNumbers,
          styles.input,
          { color: colors.text, borderColor: colors.line, backgroundColor: colors.background },
        ]}
      />
    </View>
  );
};

type ProgressFieldsProps = {
  kind: ProgressKind;
  progress: Progress | null;
  onSave: (progress: Progress) => void;
};

const ProgressFields = ({ kind, progress, onSave }: ProgressFieldsProps) => {
  const same = progress?.type === kind ? progress : null;

  switch (kind) {
    case 'none':
      return null;
    case 'percentage': {
      const value = same?.type === 'percentage' ? String(same.value) : '';
      return (
        <Field
          key={value}
          label="Percent complete"
          value={value}
          numeric
          onSave={(text) => onSave({ type: 'percentage', value: Number(text) })}
        />
      );
    }
    case 'chapter':
    case 'freeform': {
      const value = same?.type === kind ? same.value : '';
      return (
        <Field
          key={value}
          label={kind === 'chapter' ? 'Chapter or act' : 'Where you are'}
          value={value}
          wide
          onSave={(text) => onSave({ type: kind, value: text })}
        />
      );
    }
    case 'achievements': {
      const achievements = same?.type === 'achievements' ? same : null;
      return (
        <Achievements
          key={
            achievements === null
              ? ''
              : `${String(achievements.earned)}/${String(achievements.total)}`
          }
          progress={achievements}
          onSave={onSave}
        />
      );
    }
  }
};

const Achievements = ({
  progress,
  onSave,
}: {
  progress: Extract<Progress, { type: 'achievements' }> | null;
  onSave: (progress: Progress) => void;
}) => {
  const earned = progress === null ? '' : String(progress.earned);
  const total = progress === null ? '' : String(progress.total);
  const [draft, setDraft] = useState({ earned, total });

  const saveWith = (next: { earned: string; total: string }) => {
    setDraft(next);
    if (next.earned === '' || next.total === '') return;
    onSave({ type: 'achievements', earned: Number(next.earned), total: Number(next.total) });
  };

  return (
    <View style={styles.fields}>
      <Field
        label="Earned"
        value={draft.earned}
        numeric
        onSave={(text) => saveWith({ ...draft, earned: text })}
      />
      <Field
        label="Total"
        value={draft.total}
        numeric
        onSave={(text) => saveWith({ ...draft, total: text })}
      />
    </View>
  );
};

const Playtime = ({
  minutes,
  onSave,
}: {
  minutes: number;
  onSave: (value: { hours: number; minutes: number }) => void;
}) => {
  const current = minutesToHoursMinutes(minutes);
  const hours = String(current.hours);
  const mins = String(current.minutes);

  return (
    <View style={styles.fields} key={minutes}>
      <Field
        label="Hours"
        value={hours}
        numeric
        onSave={(text) => onSave({ hours: Number(text), minutes: current.minutes })}
      />
      <Field
        label="Minutes"
        value={mins}
        numeric
        onSave={(text) => onSave({ hours: current.hours, minutes: Number(text) })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  editor: { gap: space.lg },
  section: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fields: { flexDirection: 'row', gap: space.md },
  field: { width: 128, gap: space.xs },
  wideField: { flex: 1, gap: space.xs },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.small,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
  },
  textButton: { minHeight: minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
});
