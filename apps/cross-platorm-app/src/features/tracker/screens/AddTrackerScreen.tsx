import { useState } from 'react';
import { Pressable } from 'react-native';
import { Card, YStack } from 'tamagui';

import {
  AppButton,
  BodyText,
  PageTitle,
  Screen,
  SectionTitle,
  TextField,
} from '../../../shared/ui';

type TrackingMethod = {
  description: string;
  label: string;
  testID: string;
  value: string;
};

const trackingMethods: TrackingMethod[] = [
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

export function AddTrackerScreen() {
  const [isCustomGoalFormVisible, setIsCustomGoalFormVisible] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>();

  if (isCustomGoalFormVisible) {
    return (
      <Screen testID="custom-goal-starter-screen">
        <YStack gap="$3" pt="$6">
          <PageTitle>Custom goal</PageTitle>
          <BodyText>Name what you want to build, repeat, or measure.</BodyText>
        </YStack>

        <YStack gap="$4">
          <TextField
            autoCapitalize="sentences"
            label="Name your goal or habit"
            placeholder="Read for 20 minutes"
            testID="custom-goal-name-input"
          />

          <YStack gap="$3">
            <SectionTitle>How do you want to track this?</SectionTitle>
            <YStack gap="$2">
              {trackingMethods.map((method) => (
                <Pressable
                  key={method.value}
                  onPress={() => setSelectedMethod(method.value)}
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
          </YStack>
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
