import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { FloatingTabBar } from '@/ui/components/tab-bar';
import { useTheme } from '@/ui/use-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Filled when selected, outlined otherwise: the state reads from shape, not colour alone. */
const tabIcon =
  (selected: IconName, idle: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? selected : idle} color={color} size={size} />
  );

/** Two tabs: the library, where the app opens, and search, in the floating bar. */
const TabsLayout = () => {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Library', tabBarIcon: tabIcon('library', 'library-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: tabIcon('search', 'search-outline') }}
      />
    </Tabs>
  );
};

export default TabsLayout;
