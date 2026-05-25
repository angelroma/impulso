import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, XStack, YStack } from 'tamagui';

import { ControlledTextField } from '../../../shared/forms';
import { AppButton, BodyText, SectionTitle } from '../../../shared/ui';
import {
  foundationFeedbackDefaults,
  foundationFeedbackSchema,
  FoundationFeedbackValues,
} from './foundationFeedbackSchema';

export function FoundationFeedbackForm() {
  const [submittedName, setSubmittedName] = useState<string>();
  const { control, handleSubmit, reset } = useForm<FoundationFeedbackValues>({
    defaultValues: foundationFeedbackDefaults,
    resolver: zodResolver(foundationFeedbackSchema),
  });

  const submitForm = handleSubmit((values) => {
    setSubmittedName(values.name.trim());
    reset(foundationFeedbackDefaults);
  });

  return (
    <Card borderWidth={1} p="$4">
      <YStack gap="$4">
        <YStack gap="$2">
          <SectionTitle>Form foundation</SectionTitle>
          <BodyText>
            This small form proves React Hook Form, Zod validation, and
            Tamagui inputs can stay reusable.
          </BodyText>
        </YStack>

        <ControlledTextField
          autoCapitalize="words"
          control={control}
          label="Name"
          name="name"
          placeholder="A future teammate"
        />

        <ControlledTextField
          control={control}
          label="First product goal"
          name="goal"
          placeholder="Set up the app foundation"
        />

        <XStack gap="$3">
          <AppButton
            flex={1}
            onPress={() => {
              void submitForm();
            }}
            theme="accent"
          >
            Validate
          </AppButton>
          <AppButton
            flex={1}
            onPress={() => {
              reset(foundationFeedbackDefaults);
              setSubmittedName(undefined);
            }}
            variant="outlined"
          >
            Reset
          </AppButton>
        </XStack>

        {submittedName ? (
          <BodyText testID="foundation-form-success">
            Foundation form validated for {submittedName}.
          </BodyText>
        ) : null}
      </YStack>
    </Card>
  );
}
