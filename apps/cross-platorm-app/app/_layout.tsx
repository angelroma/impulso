import 'react-native-gesture-handler';

import { Drawer } from 'expo-router/drawer';

import { AppProviders } from '../src/application/providers/AppProviders';
import { AppDrawerContent } from '../src/application/navigation';

export default function RootLayout() {
  return (
    <AppProviders>
      <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          drawerType: 'front',
          headerTitleAlign: 'center',
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Home',
            title: 'Impulso',
          }}
        />
        <Drawer.Screen
          name="add-tracker"
          options={{
            drawerLabel: 'Add tracker',
            title: 'Add tracker',
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            drawerLabel: 'Settings',
            title: 'Settings',
          }}
        />
      </Drawer>
    </AppProviders>
  );
}
