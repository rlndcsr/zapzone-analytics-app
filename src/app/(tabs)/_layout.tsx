import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { ImageSourcePropType, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ACTIVE_COLOR = "#0644C7";
const INACTIVE_COLOR = "#9AA0A6";

// The center "navigation" route is rendered as the elevated action button.
const CENTER_ROUTE = "navigation";

type TabIconProps = {
  source: ImageSourcePropType;
  focused: boolean;
};

// Module-scope so the component identity is stable across tab-bar re-renders;
// defined inline it would remount every render and drop the focus animation.
const TabIcon = ({ source, focused }: TabIconProps) => {
  const progress = useSharedValue(focused ? 1 : 0);

  // Smooth icon transition when a tab becomes active/inactive.
  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.1 }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Image
        source={source}
        style={{
          width: 20,
          height: 20,
          tintColor: focused ? ACTIVE_COLOR : INACTIVE_COLOR,
        }}
        contentFit="contain"
      />
    </Animated.View>
  );
};

// The center icon always renders white on top of the blue action button.
const CenterTabIcon = ({ source }: { source: ImageSourcePropType }) => (
  <Image
    source={source}
    style={{ width: 22, height: 22, tintColor: "#FFFFFF" }}
    contentFit="contain"
  />
);

// Custom floating tab bar. Navigation behaviour mirrors the default React
// Navigation bottom bar (tabPress emit + navigate, long-press emit, a11y
// state) — only the presentation changes.
const FloatingTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  // Mirror the default bottom-tab press behaviour: let listeners pre-empt the
  // press, otherwise navigate to the tab. Long-press just emits the event.
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
  const centerHandlers = centerRoute
    ? createPressHandlers(centerRoute, centerFocused)
    : null;

  return (
    <View
      // Absolutely positioned + transparent so the dashboard scrolls behind it
      // and shows through around the card — a true floating bar rather than a
      // reserved strip. box-none lets taps in the transparent gaps reach the
      // content underneath; only the card and center button capture touches.
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 px-4"
      style={{
        paddingTop: 28,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
      }}
    >
      <View
        className="flex-row items-center rounded-3xl border border-gray-100 bg-white px-2"
        style={{
          height: 64,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;
          const label =
            typeof options.title === "string" ? options.title : route.name;

          // The center route keeps its column as a spacer; its action button is
          // rendered as an overlay (below) so it stays fully tappable.
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

      {/* Elevated center action button. Rendered as a box-none overlay so it
          floats above the card and stays fully tappable on both platforms,
          while taps outside the circle still reach the tabs underneath. */}
      {centerRoute && centerOptions && centerHandlers && (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 items-center"
          // Nudged down so ~40% of the FAB floats above the card and ~60%
          // overlaps it — anchored to the bar while still floating.
          style={{ top: 10 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={centerFocused ? { selected: true } : {}}
            accessibilityLabel={centerOptions.tabBarAccessibilityLabel}
            testID={centerOptions.tabBarButtonTestID}
            onPress={centerHandlers.onPress}
            onLongPress={centerHandlers.onLongPress}
          >
            <View
              className="h-14 w-14 items-center justify-center rounded-full bg-[#0644C7]"
              style={{
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
          </Pressable>
        </View>
      )}
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
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/home.png")}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Location",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/pin.png")}
              focused={focused}
            />
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
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/calendar.png")}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/user.png")}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
};

export default TabLayout;
