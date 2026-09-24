import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Filled when selected, outlined otherwise: the state reads from shape, not colour alone. */
const tabIcon =
  (selected: IconName, idle: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? selected : idle} color={color} size={size} />
  );

/** Two tabs: the library, where the app opens, and search. */
const TabsLayout = () => {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: type.caption,
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
