import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { Platform, Pressable } from 'react-native';
import { Card, Text, YStack } from 'tamagui';
import { z } from 'zod';

import {
  AppButton,
  BodyText,
  PageTitle,
  Screen,
  SectionTitle,
} from '../../../shared/ui';
import { ControlledTextField } from '../../../shared/forms';
import { useDatabase } from '../../../shared/database';
import {
  createTrackerRepository,
  createWebTrackerRepository,
  CreateHabitSetupInput,
  TrackerRepository,
  trackingMethods,
  TrackingMethod,
} from '../data';
import { HabitSetupScreen } from './HabitSetupScreen';

type TrackingMethodOption = {
  description: string;
  label: string;
  testID: string;
  value: TrackingMethod;
};

const trackingMethodOptions: TrackingMethodOption[] = [
  {
    description: 'repeating action',
    label: 'Habit',
    testID: 'tracker-method-habit',
    value: 'habit',
  },
  {
    description: 'repeating number',
    label: 'Average',
    testID: 'tracker-method-average',
    value: 'average',
  },
  {
    description: 'actions by date',
    label: 'Project',
    testID: 'tracker-method-project',
    value: 'project',
  },
  {
    description: 'number by date',
    label: 'Target',
    testID: 'tracker-method-target',
    value: 'target',
  },
];

type CustomGoalStarterValues = {
  method?: TrackingMethod;
  name: string;
};

const customGoalStarterSchema = z.object({
  method: z
    .enum(trackingMethods)
    .optional()
    .refine((value) => value !== undefined, 'Choose a tracking method.'),
  name: z.string().trim().min(1, 'Name your goal or habit.'),
});

type AddTrackerScreenProps = {
  trackerRepository?: TrackerRepository;
};

export function AddTrackerScreen({ trackerRepository }: AddTrackerScreenProps) {
  if (trackerRepository) {
    return <AddTrackerScreenContent trackerRepository={trackerRepository} />;
  }

  if (Platform.OS === 'web') {
    return <AsyncSqliteBackedAddTrackerScreen />;
  }

  return <DatabaseBackedAddTrackerScreen />;
}

function AsyncSqliteBackedAddTrackerScreen() {
  const trackerRepository = useMemo(() => createWebTrackerRepository(), []);

  return <AddTrackerScreenContent trackerRepository={trackerRepository} />;
}

function DatabaseBackedAddTrackerScreen() {
  const database = useDatabase();
  const trackerRepository = useMemo(
    () => createTrackerRepository(database),
    [database],
  );

  return <AddTrackerScreenContent trackerRepository={trackerRepository} />;
}

function AddTrackerScreenContent({
  trackerRepository,
}: {
  trackerRepository: TrackerRepository;
}) {
  const [isCustomGoalFormVisible, setIsCustomGoalFormVisible] = useState(false);
  const [createdTrackerName, setCreatedTrackerName] = useState<string>();
  const [habitSetupName, setHabitSetupName] = useState<string>();
  const {
    control,
    formState: { errors },
    reset,
    getValues,
    setValue,
    trigger,
    watch,
  } = useForm<CustomGoalStarterValues>({
    defaultValues: {
      method: undefined,
      name: '',
    },
    resolver: zodResolver(customGoalStarterSchema),
  });
  useController({ control, name: 'method' });

  const selectedMethod = watch('method');
  const [isCreatingHabit, setIsCreatingHabit] = useState(false);

  const openHabitSetup = async () => {
    const isNameValid = await trigger('name');

    if (!isNameValid) {
      return;
    }

    setValue('method', 'habit', {
      shouldDirty: true,
      shouldValidate: true,
    });
    setCreatedTrackerName(undefined);
    setHabitSetupName(getValues('name').trim());
  };

  const finishHabitSetup = async (habitSetup: CreateHabitSetupInput) => {
    if (!habitSetupName) {
      return;
    }

    setIsCreatingHabit(true);

    try {
      const result = await trackerRepository.createHabitTracker({
        habitSetup,
        name: habitSetupName,
      });

      setCreatedTrackerName(result.tracker.name);
      setHabitSetupName(undefined);
      reset({ method: undefined, name: '' });
    } finally {
      setIsCreatingHabit(false);
    }
  };

  if (habitSetupName) {
    return (
      <Screen testID="habit-setup-route-screen">
        <HabitSetupScreen
          habitName={habitSetupName}
          isSubmitting={isCreatingHabit}
          onBack={() => setHabitSetupName(undefined)}
          onFinish={finishHabitSetup}
        />
      </Screen>
    );
  }

  if (isCustomGoalFormVisible) {
    return (
      <Screen testID="custom-goal-starter-screen">
        <YStack gap="$3" pt="$6">
          <PageTitle>Custom goal</PageTitle>
          <BodyText>Name what you want to build, repeat, or measure.</BodyText>
        </YStack>

        <YStack gap="$4">
          <ControlledTextField
            autoCapitalize="sentences"
            control={control}
            label="Name your goal or habit"
            name="name"
            placeholder="Read for 20 minutes"
            testID="custom-goal-name-input"
          />

          <YStack gap="$3">
            <SectionTitle>How do you want to track this?</SectionTitle>
            <YStack gap="$2">
              {trackingMethodOptions.map((method) => (
                <Pressable
                  key={method.value}
                  onPress={() => {
                    if (method.value === 'habit') {
                      void openHabitSetup();
                      return;
                    }

                    setValue('method', method.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setCreatedTrackerName(undefined);
                  }}
                  testID={method.testID}
                >
                  <Card
                    bg={
                      selectedMethod === method.value
                        ? '$backgroundFocus'
                        : '$background'
                    }
                    borderColor={
                      selectedMethod === method.value
                        ? '$color8'
                        : '$borderColor'
                    }
                    borderWidth={1}
                    p="$3"
                  >
                    <YStack gap="$1">
                      <SectionTitle fontSize="$5">{method.label}</SectionTitle>
                      <BodyText>{method.description}</BodyText>
                    </YStack>
                  </Card>
                </Pressable>
              ))}
            </YStack>
            {errors.method?.message ? (
              <Text color="$red10" fontSize="$3" role="alert">
                {errors.method.message}
              </Text>
            ) : null}
          </YStack>

          {selectedMethod && selectedMethod !== 'habit' ? (
            <BodyText>
              {getMethodLabel(selectedMethod)} setup is coming soon.
            </BodyText>
          ) : null}

          {createdTrackerName ? (
            <BodyText>Created tracker "{createdTrackerName}".</BodyText>
          ) : null}
        </YStack>
      </Screen>
    );
  }

  return (
    <Screen testID="add-tracker-screen">
      <YStack gap="$3" pt="$6">
        <PageTitle>Add tracker</PageTitle>
        <BodyText>Start with the kind of goal you want to shape.</BodyText>
      </YStack>

      <Card borderWidth={1} p="$4">
        <YStack gap="$3">
          <YStack gap="$1">
            <SectionTitle>Custom goal</SectionTitle>
            <BodyText>Habit, number, or project</BodyText>
          </YStack>
          <AppButton
            onPress={() => setIsCustomGoalFormVisible(true)}
            testID="custom-goal-option"
            theme="accent"
          >
            Custom goal
          </AppButton>
        </YStack>
      </Card>
    </Screen>
  );
}

function getMethodLabel(method: TrackingMethod) {
  return (
    trackingMethodOptions.find((option) => option.value === method)?.label ??
    'Tracker'
  );
}
