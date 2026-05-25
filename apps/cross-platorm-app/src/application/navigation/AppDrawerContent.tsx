import { DrawerContentScrollView } from '@react-navigation/drawer';
import { DrawerContentComponentProps } from '@react-navigation/drawer';

import { AppDrawerMenu } from './AppDrawerMenu';
import { AppDrawerRoute } from './appDrawerItems';

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const activeRoute = props.state.routeNames[
    props.state.index
  ] as AppDrawerRoute;

  return (
    <DrawerContentScrollView {...props}>
      <AppDrawerMenu activeRoute={activeRoute} />
    </DrawerContentScrollView>
  );
}
