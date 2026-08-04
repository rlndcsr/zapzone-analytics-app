import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { useEffect, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TAB_BAR_HEIGHT,
  TAB_BAR_TOP_INSET,
  tabBarBottomPadding,
} from "../../components/navigation/fabLayout";
import {
  TAB_ICON_FOCUS_SCALE,
  TAB_PRESS_IN_TIMING,
  TAB_PRESS_OUT_SPRING,
  TAB_PRESS_SCALE,
  TAB_SCREEN_OPTIONS,
  TAB_STATE_TIMING,
} from "../../components/navigation/navMotion";
import { getRoleTabs } from "../../lib/navigation/navConfig";
import { getCurrentUser } from "../../lib/session";

const ACTIVE_COLOR = "#0644C7";
const INACTIVE_COLOR = "#9AA0A6";

const ICON_SIZE = 22;

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
    progress.value = withTiming(focused ? 1 : 0, TAB_STATE_TIMING);
  }, [focused, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * TAB_ICON_FOCUS_SCALE }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // Both variants are rendered and cross-faded on the UI thread rather than
  // swapping the icon name on focus — a name swap changes the glyph and its
  // colour in a single frame, which reads as a flicker next to the smooth scale.
  return (
    <Animated.View style={[styles.icon, containerStyle]}>
      <Animated.View style={[styles.iconLayer, outlineStyle]}>
        <Ionicons
          name={`${name}-outline` as IoniconName}
          size={ICON_SIZE}
          color={INACTIVE_COLOR}
        />
      </Animated.View>
      <Animated.View style={[styles.iconLayer, filledStyle]}>
        <Ionicons name={name} size={ICON_SIZE} color={ACTIVE_COLOR} />
      </Animated.View>
    </Animated.View>
  );
};

type TabButtonProps = {
  route: BottomTabBarProps["state"]["routes"][number];
  descriptor: BottomTabBarProps["descriptors"][string];
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

const TabButton = ({
  route,
  descriptor,
  isFocused,
  onPress,
  onLongPress,
}: TabButtonProps) => {
  const { options } = descriptor;
  const label =
    typeof options.title === "string" ? options.title : route.name;

  // Two separate drivers: `focus` follows selection state, `press` follows the
  // finger. Keeping them apart means a tap reacts instantly even while the
  // selection animation is still settling.
  const focus = useSharedValue(isFocused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, TAB_STATE_TIMING);
  }, [isFocused, focus]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focus.value,
      [0, 1],
      [INACTIVE_COLOR, ACTIVE_COLOR],
    ),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel}
      testID={options.tabBarButtonTestID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.value = withTiming(TAB_PRESS_SCALE, TAB_PRESS_IN_TIMING);
      }}
      onPressOut={() => {
        press.value = withSpring(1, TAB_PRESS_OUT_SPRING);
      }}
      className="flex-1 items-center justify-center"
    >
      <Animated.View style={[styles.tabContent, pressStyle]}>
        {options.tabBarIcon?.({
          focused: isFocused,
          color: isFocused ? ACTIVE_COLOR : INACTIVE_COLOR,
          size: ICON_SIZE,
        })}
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            { fontWeight: isFocused ? "600" : "400" },
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
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
          if (route.name === CENTER_ROUTE) {
            return <View key={route.key} className="flex-1" />;
          }

          const { onPress, onLongPress } = createPressHandlers(
            route,
            route.key === focusedKey,
          );

          return (
            <TabButton
              key={route.key}
              route={route}
              descriptor={descriptors[route.key]}
              isFocused={route.key === focusedKey}
              onPress={onPress}
              onLongPress={onLongPress}
            />
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
      screenOptions={TAB_SCREEN_OPTIONS}
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

const styles = StyleSheet.create({
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  // Both glyph layers centre on the same point, so the outline and filled
  // variants sit exactly on top of one another through the cross-fade — their
  // natural advance widths differ slightly and would otherwise drift.
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: { alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { fontSize: 11 },
});
