import { PropsWithChildren } from 'react';
import { ScrollView, YStack, YStackProps } from 'tamagui';

type ScreenProps = PropsWithChildren<
  YStackProps & {
    scroll?: boolean;
  }
>;

export function Screen({ children, scroll = true, ...props }: ScreenProps) {
  const content = (
    <YStack
      bg="$background"
      gap="$5"
      minH="100%"
      p="$4"
      {...props}
    >
      {children}
    </YStack>
  );

  if (!scroll) {
    return content;
  }

  return (
    <ScrollView bg="$background" flex={1}>
      {content}
    </ScrollView>
  );
}
