import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Separator, Text, XStack, YStack } from 'tamagui';

import { AppDrawerRoute, appDrawerSections } from './appDrawerItems';

type AppDrawerMenuProps = {
  activeRoute?: AppDrawerRoute;
};

export function AppDrawerMenu({ activeRoute }: AppDrawerMenuProps) {
  return (
    <YStack bg="$background" gap="$5" p="$4" testID="app-drawer-menu">
      <YStack gap="$1" pb="$2">
        <Text color="$color" fontSize="$8" fontWeight="800">
          Impulso
        </Text>
        <Text color="$color10" fontSize="$3">
          Goal planning
        </Text>
      </YStack>

      {appDrawerSections.map((section) => (
        <YStack gap="$2" key={section.title}>
          <Text
            color="$color10"
            fontSize="$2"
            fontWeight="800"
            textTransform="uppercase"
          >
            {section.title}
          </Text>

          <YStack gap="$1">
            {section.items.map((item) => {
              const isActive = activeRoute === item.route;

              return (
                <Link asChild href={item.href} key={item.route}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      backgroundColor: isActive
                        ? '#e7f4ee'
                        : pressed
                          ? '#f2f4f7'
                          : 'transparent',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    })}
                    testID={`drawer-item-${item.route}`}
                  >
                    <XStack gap="$3" items="center">
                      <MaterialCommunityIcons
                        color={isActive ? '#246b4b' : '#667085'}
                        name={item.iconName}
                        size={22}
                        testID={item.iconTestID}
                      />
                      <Text
                        color={isActive ? '$color' : '$color11'}
                        fontSize="$4"
                        fontWeight={isActive ? '700' : '600'}
                      >
                        {item.label}
                      </Text>
                    </XStack>
                  </Pressable>
                </Link>
              );
            })}
          </YStack>

          <Separator />
        </YStack>
      ))}
    </YStack>
  );
}
