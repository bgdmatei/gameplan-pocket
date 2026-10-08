import {
  DomainValidationError,
  ENTRY_STATUSES,
  TRANSITIONS,
  hoursMinutesToMinutes,
  minutesToHoursMinutes,
} from '@gameplan/domain';
import type { EntryPatch, LibraryEntry, Platform } from '@gameplan/domain';
import { Stack, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useDatabase } from '@/data/database';
import { syncEnv, today } from '@/data/env';
import { startTimer } from '@/data/perf';
import { Chip } from '@/ui/components/chip';
import { HeaderIconButton } from '@/ui/components/header-button';
import { orderPlatforms, platformLabel } from '@/ui/platforms';
import { StarRating } from '@/ui/components/star-rating';
import { StatusChips } from '@/ui/components/status-chips';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { editEntry } from './edit-entry';

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
  const navigation = useNavigation();
  const [pending, setPending] = useState<EntryPatch>({});

  // Times a change until the database's own copy of it is on screen (T19).
  const writeTimer = useRef<(() => void) | null>(null);
  useEffect(() => {
    setPending({});
    writeTimer.current?.();
    writeTimer.current = null;
  }, [entry]);

  // The header outlives this editor: once the game is archived (or the editor
  // otherwise goes), take the archive button with it until it's restored.
  useEffect(() => () => navigation.setOptions({ headerRight: undefined }), [navigation]);

  const shown = { ...entry, ...pending };
  const statuses = ENTRY_STATUSES.filter(
    (status) => status === shown.status || TRANSITIONS[shown.status].includes(status),
  );

  /** Resolves `false` when the change was refused or failed, after saying so. */
  const save = async (patch: EntryPatch): Promise<boolean> => {
    setPending((current) => ({ ...current, ...patch }));
    writeTimer.current = startTimer('write');
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

  const archive = async () => {
    if (await save({ archived: true }))
      toast.show('Archived. It’s in the Archive, with its rating and notes.');
  };

  return (
    <View style={styles.editor}>
      {/* Archiving is an action on the whole game, so it sits in the header, not mid-page. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderIconButton
              icon="archive-outline"
              label="Archive this game"
              onPress={() => void archive()}
            />
          ),
        }}
      />
      <Section label="STATUS">
        <StatusChips
          options={ENTRY_STATUSES}
          allowed={statuses}
          selected={shown.status}
          onSelect={(status) => void save({ status })}
        />
      </Section>

      <Section label="RATING">
        <StarRating rating={shown.rating} onChange={(rating) => void save({ rating })} />
      </Section>

      {platforms.length === 0 ? null : (
        <Section label="PLATFORM">
          <View style={styles.wrap}>
            {orderPlatforms(platforms).map((platform) => (
              <Chip
                key={platform.id}
                label={platformLabel(platform)}
                accessibilityLabel={platform.name}
                selected={shown.platformId === platform.id}
                // Switches platform; a game in the library always keeps one.
                onPress={() => void save({ platformId: platform.id })}
              />
            ))}
          </View>
        </Section>
      )}

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

      <View style={[styles.switchRow, styles.rule, { borderTopColor: colors.line }]}>
        <Text style={[type.body, { color: colors.text }]}>Favourite</Text>
        <Switch
          value={shown.favourite}
          onValueChange={(favourite) => void save({ favourite })}
          trackColor={{ true: colors.accentFill, false: colors.line }}
          accessibilityLabel="Favourite"
        />
      </View>
    </View>
  );
};

const Section = ({ label, children }: { label: string; children: ReactNode }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, styles.rule, { borderTopColor: colors.line }]}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
};

type FieldProps = {
  label: string;
  /** The saved value. Callers key the field by it, so it starts again when it changes. */
  value: string;
  onSave: (text: string) => void;
  numeric?: boolean;
};

/**
 * A text field that saves when editing ends (blur or return), not on every
 * keystroke, so typing "45" is one op, not two.
 */
const Field = ({ label, value, onSave, numeric = false }: FieldProps) => {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);

  return (
    <View style={styles.field}>
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
          { color: colors.text, borderColor: colors.line, backgroundColor: colors.raised },
        ]}
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
  /** Sections sit on the screen's ground, divided by hairlines rather than boxed. */
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fields: { flexDirection: 'row', gap: space.md },
  field: { width: 128, gap: space.xs },
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
});
