import { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type AppDrawerRoute = 'index' | 'add-tracker' | 'settings';

export type AppDrawerItem = {
  href: '/' | '/add-tracker' | '/settings';
  iconName: ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconTestID: string;
  label: string;
  route: AppDrawerRoute;
};

export type AppDrawerSection = {
  items: AppDrawerItem[];
  title: string;
};

export const appDrawerSections: AppDrawerSection[] = [
  {
    title: 'Goal settings',
    items: [
      {
        href: '/add-tracker',
        iconName: 'target',
        iconTestID: 'drawer-add-tracker-icon',
        label: 'Add tracker',
        route: 'add-tracker',
      },
    ],
  },
  {
    title: 'Options',
    items: [
      {
        href: '/settings',
        iconName: 'cog-outline',
        iconTestID: 'drawer-settings-icon',
        label: 'Settings',
        route: 'settings',
      },
    ],
  },
];
