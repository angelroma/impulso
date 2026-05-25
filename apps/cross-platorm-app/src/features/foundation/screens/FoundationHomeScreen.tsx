import { Card, Separator, XStack, YStack } from 'tamagui';

import { BodyText, PageTitle, Screen, SectionTitle } from '../../../shared/ui';
import { FoundationFeedbackForm } from '../forms';

const foundationItems = [
  'Expo Router stack layout',
  'Tamagui default provider',
  'Composition-first shared UI',
  'React Hook Form with Zod validation',
];

export function FoundationHomeScreen() {
  return (
    <Screen testID="foundation-screen">
      <YStack gap="$3" pt="$6">
        <PageTitle testID="foundation-heading">Impulso</PageTitle>
        <BodyText>
          A clean app foundation for modular Expo features, reusable Tamagui
          components, and typed forms.
        </BodyText>
      </YStack>

      <Card borderWidth={1} p="$4">
        <YStack gap="$4">
          <SectionTitle>Foundation layers</SectionTitle>
          <Separator />
          {foundationItems.map((item) => (
            <XStack gap="$3" items="center" key={item}>
              <YStack
                bg="$accentBackground"
                rounded="$10"
                height="$1"
                width="$1"
              />
              <BodyText>{item}</BodyText>
            </XStack>
          ))}
        </YStack>
      </Card>

      <FoundationFeedbackForm />
    </Screen>
  );
}
