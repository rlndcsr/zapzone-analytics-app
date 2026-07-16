import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ImageSourcePropType, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FAB_PRESS_IN,
  FAB_PRESS_OUT_SPRING,
  FAB_PRESS_SCALE,
} from "../../components/navigation/fabMenuMotion";
import {
  FabRect,
  MorphingFabMenu,
} from "../../components/navigation/MorphingFabMenu";
import { getRoleTabs } from "../../lib/navigation/navConfig";
import { getCurrentUser } from "../../lib/session";

const ACTIVE_COLOR = "#0644C7";
const INACTIVE_COLOR = "#9AA0A6";

// The center "navigation" route is rendered as the elevated action button.
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

const CenterTabIcon = ({ source }: { source: ImageSourcePropType }) => (
  <Image
    source={source}
    style={{ width: 22, height: 22, tintColor: "#FFFFFF" }}
    contentFit="contain"
  />
);

const FloatingTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [fabRect, setFabRect] = useState<FabRect | null>(null);
  const fabRef = useRef<View>(null);

  const measureFab = () => {
    fabRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;

      setFabRect((prev) =>
        prev &&
        prev.x === x &&
        prev.y === y &&
        prev.width === width &&
        prev.height === height
          ? prev
          : { x, y, width, height },
      );
    });
  };

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (fabRect) {
      // Cached rect → open immediately so the sheet reacts on the same frame
      // as the tap (no measure round-trip in the critical path).
      setMenuMounted(true);
      setMenuOpen(true);
    } else {
      // First open before layout settled: measure once, then open.
      fabRef.current?.measureInWindow((x, y, width, height) => {
        setFabRect({ x, y, width, height });
        setMenuMounted(true);
        setMenuOpen(true);
      });
    }
  };

  const fabScale = useSharedValue(1);
  const fabPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));
  const onFabPressIn = () => {
    fabScale.value = withTiming(FAB_PRESS_SCALE, FAB_PRESS_IN);
  };
  const onFabPressOut = () => {
    fabScale.value = withSpring(1, FAB_PRESS_OUT_SPRING);
  };

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

  const centerIndex = state.routes.findIndex((r) => r.name === CENTER_ROUTE);
  const centerRoute = centerIndex >= 0 ? state.routes[centerIndex] : null;
  const centerOptions = centerRoute && descriptors[centerRoute.key].options;
  const centerFocused = centerIndex === state.index;

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
        paddingTop: 28,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
      }}
    >
      <View
        className="flex-row items-center rounded-3xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2"
        style={{
          height: 64,
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

      {centerRoute && centerOptions && (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 items-center"
          style={{ top: 10 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={menuOpen ? { expanded: true } : {}}
            accessibilityLabel={centerOptions.tabBarAccessibilityLabel}
            testID={centerOptions.tabBarButtonTestID}
            onPress={toggleMenu}
            onLongPress={toggleMenu}
            onPressIn={onFabPressIn}
            onPressOut={onFabPressOut}
          >
            {/* Ref sits outside the press-scale Animated.View so measureInWindow
                returns the FAB's true resting box, not the shrunk-while-pressed size. */}
            <View ref={fabRef} collapsable={false} onLayout={measureFab}>
              <Animated.View style={fabPressStyle}>
                <View
                  className="h-14 w-14 items-center justify-center rounded-full bg-[#0644C7]"
                  style={{
                    opacity: menuMounted ? 0 : 1,
                    shadowColor: ACTIVE_COLOR,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.4,
                    shadowRadius: 12,
                    elevation: 12,
                  }}
                >
                  {centerOptions.tabBarIcon?.({
                    focused: centerFocused,
                    color: "#FFFFFF",
                    size: 26,
                  })}
                </View>
              </Animated.View>
            </View>
          </Pressable>
        </View>
      )}

      <MorphingFabMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onClosed={() => setMenuMounted(false)}
        fabRect={fabRect}
      />
    </View>
  );
};

const TabLayout = () => {
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
      <Tabs.Screen
        name="navigation"
        options={{
          title: "",
          tabBarIcon: () => (
            <CenterTabIcon
              source={require("../../../assets/zapzone-assests/icon/more.png")}
            />
          ),
        }}
      />
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
