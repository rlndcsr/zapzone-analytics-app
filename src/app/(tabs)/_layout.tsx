import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { useEffect, type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TAB_BAR_HEIGHT,
  TAB_BAR_TOP_INSET,
  tabBarBottomPadding,
} from "../../components/navigation/fabLayout";
import { getRoleTabs } from "../../lib/navigation/navConfig";
import { getCurrentUser } from "../../lib/session";

const ACTIVE_COLOR = "#0644C7";
const INACTIVE_COLOR = "#9AA0A6";

// The center "navigation" slot is left empty here: the elevated Quick Navigation
// FAB that fills it is mounted app-wide in app/_layout.tsx (QuickNavFab), which
// positions itself over this notch from the shared fabLayout geometry.
const CENTER_ROUTE = "navigation";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  /** Base (filled) Ionicons name; the outline variant is `${name}-outline`. */
  name: IoniconName;
  focused: boolean;
};

const TabIcon = ({ name, focused }: TabIconProps) => {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.1 }],
  }));

  // Filled icon when active, outline when inactive — one consistent language
  // across every tab (Ionicons provides both variants for each name).
  const iconName = (focused ? name : `${name}-outline`) as IoniconName;

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons
        name={iconName}
        size={22}
        color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
      />
    </Animated.View>
  );
};

const FloatingTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  if (__DEV__) console.count("[render] FloatingTabBar");
  const insets = useSafeAreaInsets();

  const createPressHandlers = (
    route: BottomTabBarProps["state"]["routes"][number],
    isFocused: boolean,
  ) => ({
    onPress: () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    },
    onLongPress: () => {
      navigation.emit({ type: "tabLongPress", target: route.key });
    },
  });

  // Which tabs this role sees, and in what order — driven by navConfig, not
  // hardcoded here. All screens stay registered; we simply render the subset.
  const tabOrder = getRoleTabs(getCurrentUser()?.role);
  const focusedKey = state.routes[state.index]?.key;
  const visibleRoutes = tabOrder
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => !!r);

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 px-4"
      style={{
        // Top inset is the strip the app-wide FAB overhangs into; it stays
        // reserved (and touch-transparent) even though the FAB is no longer a
        // child here.
        paddingTop: TAB_BAR_TOP_INSET,
        paddingBottom: tabBarBottomPadding(insets.bottom),
      }}
    >
      <View
        className="flex-row items-center rounded-3xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2"
        style={{
          height: TAB_BAR_HEIGHT,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const isFocused = route.key === focusedKey;
          const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;
          const label =
            typeof options.title === "string" ? options.title : route.name;

          if (route.name === CENTER_ROUTE) {
            return <View key={route.key} className="flex-1" />;
          }

          const { onPress, onLongPress } = createPressHandlers(
            route,
            isFocused,
          );

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              className="flex-1 items-center justify-center gap-1"
            >
              {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
              <Text
                numberOfLines={1}
                className="text-[11px]"
                style={{ color, fontWeight: isFocused ? "600" : "400" }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const TabLayout = () => {
  if (__DEV__) console.count("[render] TabLayout");
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Location",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="location" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="receipt" focused={focused} />
          ),
        }}
      />
      {/* Registered so the tab bar can reserve its center slot; the app-wide
          QuickNavFab draws over it, so this screen has no icon or label. */}
      <Tabs.Screen name="navigation" options={{ title: "" }} />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="calendar" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
};

export default TabLayout;
