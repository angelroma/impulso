import { createElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Modal, Pressable, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card, Text, XStack, YStack } from 'tamagui';

import {
  AppButton,
  BodyText,
  SectionTitle,
  TextField,
} from '../../../shared/ui';
import {
  CreateHabitSetupInput,
  HabitRoutine,
  HabitTimePeriod,
  HabitWeekday,
} from '../data';

const timePeriodOptions: { label: string; value: HabitTimePeriod }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Year', value: 'year' },
];

const weekdayOptions: { label: string; value: HabitWeekday }[] = [
  { label: 'Su', value: 'su' },
  { label: 'M', value: 'm' },
  { label: 'T', value: 't' },
  { label: 'W', value: 'w' },
  { label: 'Th', value: 'th' },
  { label: 'F', value: 'f' },
  { label: 'S', value: 's' },
];

const routineOptions: { label: string; value: HabitRoutine }[] = [
  { label: 'Any Time', value: 'anytime' },
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
];

const helpText = {
  badHabit:
    'Turning this ON reverses colors for logs and charts for habits you want to break, setting your goal as the limit (e.g. Do the habit 5 times per week, or less).',
  logWithNotes:
    "Automatically show the Notes field when logging so you don't have to swipe left to add a note after.",
  setGoalStreak:
    'Turning this ON lets you set a goal for your streak to stay motivated while you build the habit.',
};

type HelpKey = keyof typeof helpText;
type WizardStep = 'basics' | 'preferences';

type HabitSetupScreenProps = {
  habitName: string;
  isSubmitting?: boolean;
  onBack: () => void;
  onFinish: (habitSetup: CreateHabitSetupInput) => Promise<void> | void;
};

export function HabitSetupScreen({
  habitName,
  isSubmitting = false,
  onBack,
  onFinish,
}: HabitSetupScreenProps) {
  const [goalCount, setGoalCount] = useState('1');
  const [timePeriod, setTimePeriod] = useState<HabitTimePeriod>('day');
  const [startDate, setStartDate] = useState(() =>
    createDateFromValue(todayDateValue),
  );
  const [weekdays, setWeekdays] = useState<HabitWeekday[]>([
    'su',
    'm',
    't',
    'w',
    'th',
    'f',
    's',
  ]);
  const [routine, setRoutine] = useState<HabitRoutine>('anytime');
  const [isBadHabit, setIsBadHabit] = useState(false);
  const [hasGoalStreak, setHasGoalStreak] = useState(false);
  const [logsWithNotes, setLogsWithNotes] = useState(false);
  const [error, setError] = useState<string>();
  const [visibleHelp, setVisibleHelp] = useState<HelpKey>();
  const [wizardStep, setWizardStep] = useState<WizardStep>('basics');
  const [isDueScheduleModalVisible, setIsDueScheduleModalVisible] =
    useState(false);

  const dueSummary = useMemo(
    () => formatDueSummary(weekdays, routine),
    [routine, weekdays],
  );

  const validateBasics = () => {
    const parsedGoalCount = Number.parseInt(goalCount, 10);

    if (!Number.isFinite(parsedGoalCount) || parsedGoalCount < 1) {
      setError('Goal must be at least 1 time.');
      return undefined;
    }

    setError(undefined);
    return parsedGoalCount;
  };

  const continueToPreferences = () => {
    if (validateBasics()) {
      setWizardStep('preferences');
    }
  };

  const finishHabitSetup = async () => {
    const parsedGoalCount = validateBasics();

    if (!parsedGoalCount) {
      return;
    }

    if (weekdays.length === 0) {
      setError('Choose at least one due day.');
      return;
    }

    setError(undefined);
    await onFinish({
      goalCount: parsedGoalCount,
      hasGoalStreak,
      isBadHabit,
      logsWithNotes,
      routine,
      startDate: formatDateValue(startDate),
      timePeriod,
      weekdays,
    });
  };

  const isBasicsStep = wizardStep === 'basics';

  return (
    <YStack gap="$6" testID="habit-setup-screen">
      <XStack style={styles.spaceBetweenRow}>
        <AppButton
          chromeless
          color="$blue10"
          onPress={isBasicsStep ? onBack : () => setWizardStep('basics')}
          testID="habit-setup-back-button"
        >
          Back
        </AppButton>
      </XStack>

      <YStack gap="$2">
        <ScreenTitle>{habitName}</ScreenTitle>
        <BodyText fontSize={16}>
          {isBasicsStep
            ? 'Set the goal, period, and start date.'
            : 'Set schedule and logging preferences.'}
        </BodyText>
        <BodyText fontSize={14}>
          {isBasicsStep ? 'Step 1 of 2' : 'Step 2 of 2'}
        </BodyText>
        {error ? (
          <Text color="$red10" fontSize="$3" role="alert" selectable>
            {error}
          </Text>
        ) : null}
      </YStack>

      {isBasicsStep ? (
        <SettingsCard>
          <YStack gap="$4" p="$4">
            <XStack gap="$4" style={styles.goalRow}>
              <YStack flex={1} gap="$2">
                <TextField
                  keyboardType="number-pad"
                  label="Goal"
                  onChangeText={setGoalCount}
                  testID="habit-goal-input"
                  value={goalCount}
                />
              </YStack>
              <YStack gap="$1" style={styles.goalUnit}>
                <RowTitle>Times</RowTitle>
                <BodyText fontSize={16}>
                  per {formatPeriodLabel(timePeriod).toLowerCase()}
                </BodyText>
              </YStack>
            </XStack>
            <YStack gap="$3">
              <RowTitle>Time Period</RowTitle>
              <XStack flexWrap="wrap" gap="$2">
                {timePeriodOptions.map((option) => (
                  <SelectablePill
                    isSelected={timePeriod === option.value}
                    key={option.value}
                    label={option.label}
                    onPress={() => setTimePeriod(option.value)}
                    testID={`habit-time-period-${option.value}`}
                  />
                ))}
              </XStack>
            </YStack>

            <YStack gap="$3">
              <RowTitle>Start Date</RowTitle>
              <NativeDatePicker
                onChange={setStartDate}
                testID="habit-start-date-picker"
                value={startDate}
              />
            </YStack>
          </YStack>
        </SettingsCard>
      ) : (
        <>
          <YStack gap="$3">
            <SectionLabel>Schedule</SectionLabel>
            <SettingsCard>
              <SettingsRow
                label="Due"
                onPress={() => setIsDueScheduleModalVisible(true)}
                showChevron
                testID="habit-due-row"
                value={dueSummary}
              />
              <SettingsRow
                disabled
                label="Reminders"
                testID="habit-reminders-row"
                value="Soon"
              />
            </SettingsCard>
          </YStack>

          <YStack gap="$3">
            <SectionLabel>Logging</SectionLabel>
            <SettingsCard>
              <ToggleRow
                isEnabled={isBadHabit}
                label="Bad Habit"
                onHelp={() => setVisibleHelp('badHabit')}
                onToggle={() => setIsBadHabit((value) => !value)}
                testID="habit-bad-habit-toggle"
              />
              <ToggleRow
                isEnabled={hasGoalStreak}
                label="Set Goal Streak"
                onHelp={() => setVisibleHelp('setGoalStreak')}
                onToggle={() => setHasGoalStreak((value) => !value)}
                testID="habit-goal-streak-toggle"
              />
              <ToggleRow
                isEnabled={logsWithNotes}
                label="Log with Notes"
                onHelp={() => setVisibleHelp('logWithNotes')}
                onToggle={() => setLogsWithNotes((value) => !value)}
                testID="habit-log-with-notes-toggle"
              />
              <SettingsRow
                disabled
                label="Tags"
                testID="habit-tags-row"
                value="Coming soon"
              />
            </SettingsCard>
          </YStack>
        </>
      )}

      <DueScheduleModal
        habitName={habitName}
        isVisible={isDueScheduleModalVisible}
        onClose={() => setIsDueScheduleModalVisible(false)}
        routine={routine}
        setRoutine={setRoutine}
        setWeekdays={setWeekdays}
        weekdays={weekdays}
      />

      <HelpModal
        helpKey={visibleHelp}
        onClose={() => setVisibleHelp(undefined)}
      />

      <WizardPrimaryButton
        disabled={isSubmitting}
        isBasicsStep={isBasicsStep}
        isSubmitting={isSubmitting}
        onFinish={finishHabitSetup}
        onNext={continueToPreferences}
      />
    </YStack>
  );
}

function WizardPrimaryButton({
  disabled,
  isBasicsStep,
  isSubmitting,
  onFinish,
  onNext,
}: {
  disabled: boolean;
  isBasicsStep: boolean;
  isSubmitting: boolean;
  onFinish: () => void;
  onNext: () => void;
}) {
  return (
    <AppButton
      bg="$blue10"
      color="white"
      disabled={disabled}
      fontSize={16}
      onPress={isBasicsStep ? onNext : onFinish}
      rounded="$5"
      size="$5"
      testID={isBasicsStep ? 'habit-next-button' : 'habit-finish-button'}
    >
      {isBasicsStep ? 'Next' : isSubmitting ? 'Saving...' : 'Finish'}
    </AppButton>
  );
}

function NativeDatePicker({
  onChange,
  testID,
  value,
}: {
  onChange: (date: Date) => void;
  testID: string;
  value: Date;
}) {
  if (process.env.EXPO_OS === 'web') {
    return (
      <Card borderColor="$borderColor" borderRadius="$4" borderWidth={1} p="$3">
        {createElement('input', {
          'data-testid': testID,
          onChange: (event: { target: { value: string } }) => {
            onChange(createDateFromValue(event.target.value));
          },
          style: {
            background: 'transparent',
            border: 0,
            color: 'inherit',
            font: 'inherit',
            fontSize: 16,
            outline: 'none',
            width: '100%',
          },
          type: 'date',
          value: formatDateValue(value),
        })}
      </Card>
    );
  }

  return (
    <DateTimePicker
      display="compact"
      mode="date"
      onChange={(_event, selectedDate) => {
        if (selectedDate) {
          onChange(selectedDate);
        }
      }}
      testID={testID}
      value={value}
    />
  );
}

function DueScheduleModal({
  habitName,
  isVisible,
  onClose,
  routine,
  setRoutine,
  setWeekdays,
  weekdays,
}: {
  habitName: string;
  isVisible: boolean;
  onClose: () => void;
  routine: HabitRoutine;
  setRoutine: (routine: HabitRoutine) => void;
  setWeekdays: (weekdays: HabitWeekday[]) => void;
  weekdays: HabitWeekday[];
}) {
  const toggleWeekday = (weekday: HabitWeekday) => {
    setWeekdays(
      weekdays.includes(weekday)
        ? weekdays.filter((selectedWeekday) => selectedWeekday !== weekday)
        : [...weekdays, weekday],
    );
  };

  return (
    <Modal transparent visible={isVisible}>
      <YStack
        bg="rgba(12, 17, 24, 0.44)"
        flex={1}
        style={styles.bottomSheetOverlay}
        testID="habit-due-schedule-screen"
      >
        <Card
          bg="$background"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          maxH="88%"
          p="$4"
          style={styles.sheetShadow}
        >
          <YStack gap="$5">
            <XStack style={styles.spaceBetweenRow}>
              <AppButton
                chromeless
                color="$blue10"
                onPress={onClose}
                testID="habit-due-back-button"
              >
                Close
              </AppButton>
              <AppButton chromeless color="$blue10" onPress={onClose}>
                Done
              </AppButton>
            </XStack>

            <YStack gap="$2">
              <ScreenTitle>{habitName}</ScreenTitle>
              <BodyText fontSize={16}>
                Choose when this habit should be available to log.
              </BodyText>
            </YStack>

            <YStack gap="$3">
              <SectionLabel>Frequency</SectionLabel>
              <SettingsCard>
                <YStack gap="$4" p="$4">
                  <XStack style={styles.spaceBetweenRow}>
                    <RowTitle>Due Every</RowTitle>
                    <BodyText fontSize={16}>
                      {formatFrequencyLabel(weekdays)}
                    </BodyText>
                  </XStack>

                  <XStack flexWrap="wrap" gap="$3" style={styles.weekdayGrid}>
                    {weekdayOptions.map((weekday) => (
                      <SelectableCircle
                        isSelected={weekdays.includes(weekday.value)}
                        key={weekday.value}
                        label={weekday.label}
                        onPress={() => toggleWeekday(weekday.value)}
                        testID={`habit-weekday-${weekday.value}`}
                      />
                    ))}
                  </XStack>
                </YStack>
              </SettingsCard>
            </YStack>

            <YStack gap="$3">
              <SectionLabel>Routine</SectionLabel>
              <SettingsCard>
                {routineOptions.map((option) => (
                  <SettingsRow
                    key={option.value}
                    label={option.label}
                    onPress={() => setRoutine(option.value)}
                    testID={`habit-routine-${option.value}`}
                    value={routine === option.value ? '✓' : ''}
                  />
                ))}
              </SettingsCard>
            </YStack>
          </YStack>
        </Card>
      </YStack>
    </Modal>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <Card
      bg="$background"
      borderColor="$borderColor"
      borderRadius="$5"
      borderWidth={1}
      overflow="hidden"
      style={styles.cardShadow}
    >
      <YStack>{children}</YStack>
    </Card>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text color="$color10" fontSize={13} fontWeight="700" selectable>
      {children}
    </Text>
  );
}

function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <Text color="$color" fontSize={34} fontWeight="800" selectable>
      {children}
    </Text>
  );
}

function RowTitle({ children }: { children: ReactNode }) {
  return (
    <Text color="$color" fontSize={17} fontWeight="700" selectable>
      {children}
    </Text>
  );
}

function SettingsRow({
  disabled = false,
  label,
  onPress,
  showChevron = false,
  testID,
  value,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  testID: string;
  value: string;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} testID={testID}>
      <XStack
        borderBottomColor="$borderColor"
        borderBottomWidth={1}
        minH={56}
        p="$3"
        style={styles.spaceBetweenRow}
      >
        <Text
          color={disabled ? '$color10' : '$color'}
          fontSize={17}
          fontWeight="700"
          selectable
        >
          {label}
        </Text>
        <XStack gap="$2" style={styles.centeredRow}>
          <BodyText color={disabled ? '$color9' : '$color11'} fontSize={16}>
            {value}
          </BodyText>
          {showChevron ? (
            <Text color="$color9" fontSize="$6">
              ›
            </Text>
          ) : null}
        </XStack>
      </XStack>
    </Pressable>
  );
}

function ToggleRow({
  isEnabled,
  label,
  onHelp,
  onToggle,
  testID,
}: {
  isEnabled: boolean;
  label: string;
  onHelp: () => void;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <XStack
      borderBottomColor="$borderColor"
      borderBottomWidth={1}
      minH={56}
      p="$3"
      style={styles.spaceBetweenRow}
    >
      <XStack gap="$2" style={styles.centeredRow}>
        <RowTitle>{label}</RowTitle>
        <Pressable onPress={onHelp} testID={`${testID}-help`}>
          <Card
            borderColor="$borderColor"
            borderRadius="$10"
            borderWidth={1}
            height={24}
            px="$2"
            style={styles.helpIcon}
            width={24}
          >
            <Text color="$color10" fontSize="$3" fontWeight="700">
              ?
            </Text>
          </Card>
        </Pressable>
      </XStack>
      <Pressable onPress={onToggle} testID={testID}>
        <Switch
          onValueChange={onToggle}
          thumbColor="white"
          trackColor={{ false: '#D5D9DF', true: '#0B8F4D' }}
          value={isEnabled}
        />
      </Pressable>
    </XStack>
  );
}

function SelectablePill({
  isSelected,
  label,
  onPress,
  testID,
}: {
  isSelected: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID}>
      <Card
        bg={isSelected ? '$blue10' : '$color2'}
        borderColor={isSelected ? '$blue10' : '$borderColor'}
        borderRadius="$10"
        borderWidth={1}
        minW={84}
        px="$3"
        py="$2"
      >
        <Text
          color={isSelected ? 'white' : '$color'}
          fontSize={16}
          fontWeight="700"
        >
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}

function SelectableCircle({
  isSelected,
  label,
  onPress,
  testID,
}: {
  isSelected: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID}>
      <Card
        bg={isSelected ? '$green9' : '$color2'}
        borderColor={isSelected ? '$green9' : '$borderColor'}
        borderRadius="$10"
        borderWidth={1}
        height={56}
        minW={56}
        px="$3"
        py="$3"
      >
        <Text
          color={isSelected ? 'white' : '$color'}
          fontSize={17}
          fontWeight="700"
        >
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}

function HelpModal({
  helpKey,
  onClose,
}: {
  helpKey?: HelpKey;
  onClose: () => void;
}) {
  if (!helpKey) {
    return null;
  }

  const titleByKey: Record<HelpKey, string> = {
    badHabit: 'Bad Habit',
    logWithNotes: 'Log with Notes',
    setGoalStreak: 'Set Goal Streak',
  };

  return (
    <Modal transparent visible>
      <YStack
        bg="rgba(12, 17, 24, 0.56)"
        flex={1}
        p="$5"
        style={styles.centeredOverlay}
        testID="habit-help-modal"
      >
        <Card borderRadius="$6" overflow="hidden" style={styles.modalShadow}>
          <XStack bg="$blue10" gap="$4" p="$4" style={styles.centeredRow}>
            <Pressable onPress={onClose} testID="habit-help-close">
              <Text color="white" fontSize="$8" lineHeight="$8">
                ×
              </Text>
            </Pressable>
            <SectionTitle color="white">{titleByKey[helpKey]}</SectionTitle>
          </XStack>
          <BodyText color="$blue11" fontSize="$6" p="$5">
            {helpText[helpKey]}
          </BodyText>
        </Card>
      </YStack>
    </Modal>
  );
}

function formatDueSummary(weekdays: HabitWeekday[], routine: HabitRoutine) {
  return `${formatFrequencyLabel(weekdays)}, ${formatRoutineLabel(routine)}`;
}

function formatFrequencyLabel(weekdays: HabitWeekday[]) {
  if (weekdays.length === 7) {
    return 'Every Day';
  }

  if (weekdays.length === 0) {
    return 'No Days';
  }

  return weekdayOptions
    .filter((weekday) => weekdays.includes(weekday.value))
    .map((weekday) => weekday.label)
    .join(', ');
}

function formatRoutineLabel(routine: HabitRoutine) {
  return (
    routineOptions.find((option) => option.value === routine)?.label ??
    'Any Time'
  );
}

function formatPeriodLabel(timePeriod: HabitTimePeriod) {
  return (
    timePeriodOptions.find((option) => option.value === timePeriod)?.label ??
    'Day'
  );
}

function createDateFromValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

const todayDateValue = getTodayDateValue();

const styles = {
  bottomSheetOverlay: {
    justifyContent: 'flex-end',
  },
  cardShadow: {
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  },
  centeredOverlay: {
    justifyContent: 'center',
  },
  centeredRow: {
    alignItems: 'center',
  },
  spaceBetweenRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalRow: {
    alignItems: 'flex-end',
  },
  goalUnit: {
    alignItems: 'flex-end',
    paddingBottom: 8,
  },
  helpIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalShadow: {
    boxShadow: '0 18px 60px rgba(15, 23, 42, 0.22)',
  },
  sheetShadow: {
    boxShadow: '0 -18px 60px rgba(15, 23, 42, 0.18)',
  },
  weekdayGrid: {
    justifyContent: 'space-between',
  },
} as const;
