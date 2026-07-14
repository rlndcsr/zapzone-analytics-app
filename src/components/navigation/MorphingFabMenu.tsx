import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnJS } from "react-native-worklets";

import {
  BACKDROP_COLOR,
  BACKDROP_MAX_OPACITY,
  BODY_FADE_RANGE,
  CLOSE_COLLAPSE_LEAD,
  CLOSE_EASING,
  FAB_SHADOW_COLOR,
  ICON_CLOSE_FADE,
  ICON_MENU_FADE,
  ICON_MIN_SCALE,
  ICON_TURN,
  ITEM_SCALE_FROM,
  ITEM_STAGGER,
  ITEM_TRANSLATE_Y,
  ITEM_WINDOW,
  ITEMS_CLOSE_DURATION,
  ITEMS_EASING,
  ITEMS_OPEN_DELAY,
  ITEMS_OPEN_DURATION,
  MORPH_CLOSE_SPRING,
  MORPH_OPEN_SPRING,
  PANEL_RADIUS,
  PANEL_SHADOW_COLOR,
  SHADOW_ELEVATION_RANGE,
  SHADOW_OFFSET_Y_RANGE,
  SHADOW_OPACITY_RANGE,
  SHADOW_RADIUS_RANGE,
} from "./fabMenuMotion";
import { getCurrentUser } from "../../lib/session";
import { getNavMenuItems, type NavMenuItem } from "./navMenuItems";

const FAB_COLOR = "#0644C7";
const SURFACE_LIGHT = "#FFFFFF";
const SURFACE_DARK = "#171717";

const COLUMNS = 3;
const COLUMN_GAP = 12;
const ROW_GAP = 16;
const PANEL_PADDING = 16;
const HEADER_HEIGHT = 52;
// One cell's content height: icon square (h-12 = 48) + label gap (mt-1.5 = 6) +
// single-line label (~16). Kept just above the real content so the height math
// never clips a row, without reserving the dead space the old 84 did.
const CELL_HEIGHT = 74;
const MAX_PANEL_WIDTH = 440;

export type FabRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MorphingFabMenuProps = {
  visible: boolean;
  onClose: () => void;

  onClosed?: () => void;
  fabRect: FabRect | null;
};

const moreIcon = require("../../../assets/zapzone-assests/icon/more.png");

type GridItemProps = {
  item: NavMenuItem;
  index: number;
  width: number;
  onPress: () => void;
  itemsProgress: SharedValue<number>;
};

function GridItem({
  item,
  index,
  width,
  onPress,
  itemsProgress,
}: GridItemProps) {
  const style = useAnimatedStyle(() => {
    const start = Math.min(index * ITEM_STAGGER, 1 - ITEM_WINDOW);
    const local = interpolate(
      itemsProgress.value,
      [start, start + ITEM_WINDOW],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: local,
      transform: [
        { translateY: (1 - local) * ITEM_TRANSLATE_Y },
        { scale: ITEM_SCALE_FROM + local * (1 - ITEM_SCALE_FROM) },
      ],
    };
  });

  return (
    <Animated.View style={[{ width, marginBottom: ROW_GAP }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        className="items-center active:opacity-70"
      >
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/40">
          <Feather name={item.icon} size={22} color={FAB_COLOR} />
        </View>
        <Text
          numberOfLines={1}
          className="mt-1.5 text-xs text-gray-700 dark:text-gray-200"
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function MorphingFabMenu({
  visible,
  onClose,
  onClosed,
  fabRect,
}: MorphingFabMenuProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const surfaceColor = colorScheme === "dark" ? SURFACE_DARK : SURFACE_LIGHT;

  // Quick Navigation is role-aware: the management entry swaps between User
  // Management (company_admin) and Attendants Management (location_manager),
  // mirroring the Web Admin sidebar. Memoized so the list isn't rebuilt on the
  // re-renders that bracket the open/close animation (role is stable while the
  // menu is mounted).
  const items = useMemo(() => getNavMenuItems(getCurrentUser()?.role), []);

  const progress = useSharedValue(0);
  const itemsProgress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  // Unmount the morph and reveal the real FAB in one batched commit; splitting
  // these across two runOnJS hops flicks the FAB for a frame on close.
  const finishClose = () => {
    setMounted(false);
    onClosed?.();
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = 0;
      itemsProgress.value = 0;
      progress.value = withSpring(1, MORPH_OPEN_SPRING);
      itemsProgress.value = withDelay(
        ITEMS_OPEN_DELAY,
        withTiming(1, {
          duration: ITEMS_OPEN_DURATION,
          easing: ITEMS_EASING,
        }),
      );
    } else if (mounted) {
      itemsProgress.value = withTiming(0, {
        duration: ITEMS_CLOSE_DURATION,
        easing: CLOSE_EASING,
      });
      progress.value = withDelay(
        CLOSE_COLLAPSE_LEAD,
        withSpring(0, MORPH_CLOSE_SPRING, (done) => {
          if (done) runOnJS(finishClose)();
        }),
      );
    }
  }, [visible]);

  const fab = fabRect;
  // Android's translucent Modal renders from the true screen top while
  // measureInWindow reports app-window Y, so shift FAB-derived Y down by the
  // top inset to realign (iOS Modals already share full-screen coordinates).
  const modalYOffset = Platform.OS === "android" ? insets.top : 0;
  const fabBottom = fab ? fab.y + fab.height + modalYOffset : 0;
  const fabCenterX = fab ? fab.x + fab.width / 2 : screenW / 2;
  const fabW = fab?.width ?? 56;
  const fabH = fab?.height ?? 56;

  const panelW = Math.min(screenW - 32, MAX_PANEL_WIDTH);
  const contentW = panelW - PANEL_PADDING * 2;
  const cellW = (contentW - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
  const rows = Math.ceil(items.length / COLUMNS);

  const footerH = fabH + 24;

  const naturalPanelH =
    HEADER_HEIGHT +
    PANEL_PADDING +
    rows * CELL_HEIGHT +
    (rows - 1) * ROW_GAP +
    footerH;

  const maxPanelH = fab ? fabBottom - (insets.top + 8) : naturalPanelH;
  const panelH = Math.min(naturalPanelH, maxPanelH);
  const needsScroll = naturalPanelH > maxPanelH;

  const surfaceStyle = useAnimatedStyle(() => {
    const h = interpolate(
      progress.value,
      [0, 1],
      [fabH, panelH],
      Extrapolation.CLAMP,
    );
    return {
      width: interpolate(
        progress.value,
        [0, 1],
        [fabW, panelW],
        Extrapolation.CLAMP,
      ),
      height: h,

      top: fabBottom - h,
      left: interpolate(
        progress.value,
        [0, 1],
        [fabCenterX - fabW / 2, fabCenterX - panelW / 2],
        Extrapolation.CLAMP,
      ),
      borderRadius: interpolate(
        progress.value,
        [0, 1],
        [fabH / 2, PANEL_RADIUS],
        Extrapolation.CLAMP,
      ),
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [FAB_COLOR, surfaceColor],
      ),
      // Shadow morphs from the FAB's blue glow to the panel's slate shadow so
      // the swap with the real FAB is seamless at both ends of the animation.
      shadowColor: interpolateColor(
        progress.value,
        [0, 1],
        [FAB_SHADOW_COLOR, PANEL_SHADOW_COLOR],
      ),
      shadowOffset: {
        width: 0,
        height: interpolate(
          progress.value,
          [0, 1],
          SHADOW_OFFSET_Y_RANGE,
          Extrapolation.CLAMP,
        ),
      },
      shadowOpacity: interpolate(
        progress.value,
        [0, 1],
        SHADOW_OPACITY_RANGE,
        Extrapolation.CLAMP,
      ),
      shadowRadius: interpolate(
        progress.value,
        [0, 1],
        SHADOW_RADIUS_RANGE,
        Extrapolation.CLAMP,
      ),
      elevation: interpolate(
        progress.value,
        [0, 1],
        SHADOW_ELEVATION_RANGE,
        Extrapolation.CLAMP,
      ),
    };
  });

  const clipStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      progress.value,
      [0, 1],
      [fabH / 2, PANEL_RADIUS],
      Extrapolation.CLAMP,
    ),
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, BACKDROP_MAX_OPACITY],
      Extrapolation.CLAMP,
    ),
  }));

  const menuIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      ICON_MENU_FADE,
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        rotate: `${interpolate(progress.value, ICON_MENU_FADE, [0, -ICON_TURN], Extrapolation.CLAMP)}deg`,
      },
      {
        scale: interpolate(
          progress.value,
          ICON_MENU_FADE,
          [1, ICON_MIN_SCALE],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const closeIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      ICON_CLOSE_FADE,
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        rotate: `${interpolate(progress.value, ICON_CLOSE_FADE, [ICON_TURN, 0], Extrapolation.CLAMP)}deg`,
      },
      {
        scale: interpolate(
          progress.value,
          ICON_CLOSE_FADE,
          [ICON_MIN_SCALE, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      BODY_FADE_RANGE,
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  if (!mounted || !fab) return null;

  // Items with a route navigate then close; the rest keep their close-only
  // behavior until their destinations exist.
  const handleSelect = (item: NavMenuItem) => {
    onClose();
    if (item.route) {
      router.push(item.route as never);
    }
  };

  const grid = (
    // Each GridItem carries a bottom margin (ROW_GAP) for row spacing; the
    // negative margin here cancels the last row's trailing one so the grid
    // measures to its true content height and centers cleanly.
    <View
      className="flex-row flex-wrap justify-between"
      style={{ marginBottom: -ROW_GAP }}
    >
      {items.map((item, i) => (
        <GridItem
          key={item.key}
          item={item}
          index={i}
          width={cellW}
          onPress={() => handleSelect(item)}
          itemsProgress={itemsProgress}
        />
      ))}
    </View>
  );

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BACKDROP_COLOR },
            backdropStyle,
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
        />

        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[
            { position: "absolute" },
            // shadowColor / shadowOffset are animated in surfaceStyle so the
            // FAB→panel shadow morph stays seamless.
            surfaceStyle,
          ]}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { overflow: "hidden" }, clipStyle]}
          >
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: panelW,
                  height: panelH,
                },
                bodyStyle,
              ]}
            >
              <View
                style={{
                  flex: 1,
                  paddingTop: PANEL_PADDING,
                  paddingHorizontal: PANEL_PADDING,
                  paddingBottom: footerH,
                }}
              >
                <View
                  style={{
                    height: HEADER_HEIGHT - PANEL_PADDING,
                    justifyContent: "center",
                  }}
                >
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    Quick Navigation
                  </Text>
                </View>

                {/* Grid */}
                {needsScroll ? (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: PANEL_PADDING }}
                  >
                    {grid}
                  </ScrollView>
                ) : (
                  // Center the grid in the space between the header and the
                  // footer so any leftover height is split evenly above and
                  // below the icons instead of pooling into one gap at the
                  // bottom. paddingTop keeps a comfortable margin under the
                  // title so the grid never crowds the header.
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      paddingTop: PANEL_PADDING,
                    }}
                  >
                    {grid}
                  </View>
                )}
              </View>
            </Animated.View>

            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: fabH,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                style={{
                  width: fabW,
                  height: fabH,
                  borderRadius: fabH / 2,
                  backgroundColor: FAB_COLOR,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { alignItems: "center", justifyContent: "center" },
                    menuIconStyle,
                  ]}
                >
                  <Image
                    source={moreIcon}
                    style={{ width: 22, height: 22, tintColor: "#FFFFFF" }}
                    contentFit="contain"
                  />
                </Animated.View>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { alignItems: "center", justifyContent: "center" },
                    closeIconStyle,
                  ]}
                >
                  <Feather name="x" size={24} color="#FFFFFF" />
                </Animated.View>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}
