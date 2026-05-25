import { YStack } from 'tamagui';

import { BodyText, PageTitle, Screen, SectionTitle } from '../../../shared/ui';

export function SettingsScreen() {
  return (
    <Screen testID="settings-screen">
      <YStack gap="$3" pt="$6">
        <PageTitle>Settings</PageTitle>
        <BodyText>Manage app options.</BodyText>
      </YStack>

      <YStack gap="$2">
        <SectionTitle>Options</SectionTitle>
        <BodyText>Settings controls will be added in a future workflow.</BodyText>
      </YStack>
    </Screen>
  );
}
