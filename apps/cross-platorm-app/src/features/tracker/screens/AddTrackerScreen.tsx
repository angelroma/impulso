import { YStack } from 'tamagui';

import { BodyText, PageTitle, Screen, SectionTitle } from '../../../shared/ui';

export function AddTrackerScreen() {
  return (
    <Screen testID="add-tracker-screen">
      <YStack gap="$3" pt="$6">
        <PageTitle>Add tracker</PageTitle>
        <BodyText>Start a new goal tracker.</BodyText>
      </YStack>

      <YStack gap="$2">
        <SectionTitle>Tracker setup</SectionTitle>
        <BodyText>Tracker creation will be added in a future workflow.</BodyText>
      </YStack>
    </Screen>
  );
}
