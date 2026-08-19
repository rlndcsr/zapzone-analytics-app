import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type DimensionValue,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnJS } from "react-native-worklets";

import { useCurrentUserRole } from "../../lib/session";
import {
  CARD_REVEAL,
  CARD_SHADOW_COLOR,
  CLOSE_BUTTON_RING,
  CLOSE_BUTTON_SIZE,
  CLOSE_EASING,
  CLOSE_LABEL_FADE,
  CLOSE_MENU_ICON_FADE,
  CLOSE_PRESS_IN,
  CLOSE_PRESS_OUT_SPRING,
  CLOSE_PRESS_SCALE,
  FAB_SHADOW_COLOR,
  FLOWER_BLOOM_SCALE_FROM,
  FLOWER_BREATHE_DURATION,
  FLOWER_BREATHE_SCALE,
  FLOWER_LIFT,
  FLOWER_SPIN_DURATION,
  ICON_MIN_SCALE,
  ICON_TURN,
  ITEM_REVEAL,
  ITEMS_CLOSE_DURATION,
  ITEMS_EASING,
  ITEMS_OPEN_DELAY,
  ITEMS_OPEN_DURATION,
  PETAL_BLOOM_DELAY,
  PETAL_BLOOM_SPRING,
  PETAL_CLOSE_TIMING,
  PETAL_SCALE_FROM,
  PETAL_STAGGER,
  PETAL_SWIRL,
  PETAL_WINDOW,
  SHEET_CLOSE_TIMING,
  SHEET_OPEN_SPRING,
  SHEET_SCALE_FROM,
  SHEET_TRANSLATE_Y,
} from "./fabMenuMotion";
import { getNavMenuItems, type NavMenuItem } from "./navMenuItems";
import { QUICK_ACTION_ITEMS, type QuickActionItem } from "./quickActionItems";

const FAB_COLOR = "#0644C7";
/** Page behind the cards — the same pairing every tab screen uses. */
const PAGE_LIGHT = "#F9FAFB";
const PAGE_DARK = "#000000";
const HEADER_ICON_LIGHT = "#6B7280";
const HEADER_ICON_DARK = "#D1D5DB";

const COLUMNS = 4;
/**
 * Each tile takes an exact quarter of the row, and the spacing between the
 * chips is simply what is left over inside that quarter.
 *
 * This is a percentage rather than a measured pixel width on purpose: a
 * computed width has to predict the row's inner box exactly, and it only takes
 * the card's 1px border to push four cells one pixel over the line and wrap the
 * fourth onto its own row. Four quarters always add up to the row.
 */
const CELL_WIDTH = `${100 / COLUMNS}%` as DimensionValue;
const ROW_GAP = 10;
const SCREEN_PADDING = 16;
const CARD_PADDING = 18;
const CARD_GAP = 14;
const CARD_RADIUS = 26;
const MAX_CONTENT_WIDTH = 440;

const CHIP_SIZE = 50;
const CHIP_ICON_SIZE = 21;
const LABEL_GAP = 8;
const LABEL_LINE_HEIGHT = 14;
/** chip + gap + two label lines — every tile measures the same. */
const CELL_HEIGHT = CHIP_SIZE + LABEL_GAP + LABEL_LINE_HEIGHT * 2;

const HEADER_HEIGHT = 48;

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

type RevealSpec = {
  stagger: number;
  window: number;
  translateY: number;
  scaleFrom: number;
};

/** Shared entrance: the cards and the tiles inside them come off the same
 *  driver, so the page deals itself in as one list instead of two. */
function useRevealStyle(
  driver: SharedValue<number>,
  index: number,
  spec: RevealSpec,
) {
  return useAnimatedStyle(() => {
    const start = Math.min(index * spec.stagger, 1 - spec.window);
    const local = interpolate(
      driver.value,
      [start, start + spec.window],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: local,
      transform: [
        { translateY: (1 - local) * spec.translateY },
        { scale: spec.scaleFrom + local * (1 - spec.scaleFrom) },
      ],
    };
  });
}

type MenuCellProps = {
  label: string;
  /** Pre-rendered glyph — Feather for nav items, lucide for quick actions. */
  icon: ReactNode;
  index: number;
  onPress: () => void;
  itemsProgress: SharedValue<number>;
};

/** One tile in either grid: round icon chip + up-to-two-line label. Both
 *  sections render through this, so their buttons cannot drift apart. */
function MenuCell({
  label,
  icon,
  index,
  onPress,
  itemsProgress,
}: MenuCellProps) {
  const style = useRevealStyle(itemsProgress, index, ITEM_REVEAL);

  return (
    <Animated.View
      style={[
        { width: CELL_WIDTH, height: CELL_HEIGHT, marginBottom: ROW_GAP },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-1 items-center px-0.5 active:opacity-60"
      >
        <View
          className="items-center justify-center bg-blue-100 dark:bg-blue-900/40"
          style={{
            width: CHIP_SIZE,
            height: CHIP_SIZE,
            borderRadius: CHIP_SIZE / 2,
          }}
        >
          {icon}
        </View>
        <Text
          numberOfLines={2}
          style={{ lineHeight: LABEL_LINE_HEIGHT, marginTop: LABEL_GAP }}
          className="text-center text-[11px] text-gray-700 dark:text-gray-200"
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

type SectionCardProps = {
  title: string;
  index: number;
  itemsProgress: SharedValue<number>;
  children: ReactNode;
};

/** A titled card: label, hairline rule, grid — the card shape the tab screens
 *  already use, so the menu reads as another page of the app. */
function SectionCard({
  title,
  index,
  itemsProgress,
  children,
}: SectionCardProps) {
  const style = useRevealStyle(itemsProgress, index, CARD_REVEAL);

  return (
    <Animated.View
      className="border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      style={[
        {
          borderRadius: CARD_RADIUS,
          padding: CARD_PADDING,
          marginBottom: CARD_GAP,
          shadowColor: CARD_SHADOW_COLOR,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 14,
          elevation: 2,
        },
        style,
      ]}
    >
      <Text className="text-lg font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
      <View className="mt-3 h-px bg-gray-100 dark:bg-neutral-800" />
      <View className="mt-4">{children}</View>
    </Animated.View>
  );
}

type PetalRing = {
  count: number;
  /** Degrees this ring is turned against the previous one. */
  phase: number;
  width: number;
  height: number;
  /** Distance from the flower centre to the petal centre. */
  offset: number;
  color: string;
};

/** Two rings of six, the inner one turned into the outer one's gaps: where the
 *  translucent petals overlap they darken, and that is what gives the flower its
 *  layered look without a gradient or an image. */
function petalRings(dark: boolean): PetalRing[] {
  return [
    {
      count: 6,
      phase: 0,
      width: 58,
      height: 104,
      offset: 30,
      color: dark ? "rgba(37,99,235,0.22)" : "rgba(6,68,199,0.14)",
    },
    {
      count: 6,
      phase: 30,
      width: 46,
      height: 80,
      offset: 22,
      color: dark ? "rgba(37,99,235,0.34)" : "rgba(6,68,199,0.22)",
    },
  ];
}

type PetalProps = {
  angle: number;
  index: number;
  ring: PetalRing;
  radius: number;
  bloom: SharedValue<number>;
};

function Petal({ angle, index, ring, radius, bloom }: PetalProps) {
  const style = useAnimatedStyle(() => {
    const start = Math.min(index * PETAL_STAGGER, 1 - PETAL_WINDOW);
    const local = interpolate(
      bloom.value,
      [start, start + PETAL_WINDOW],
      [0, 1],
      Extrapolation.CLAMP,
    );
    // Order matters: the scale shrinks the petal about its own centre, the
    // translate pushes it out, and the rotate — which carries that translation
    // with it — aims the ray. The extra swirl while it grows is what makes the
    // ring unfurl rather than simply appear.
    return {
      opacity: local,
      transform: [
        { rotate: `${angle - (1 - local) * PETAL_SWIRL}deg` },
        { translateY: -ring.offset * (0.45 + 0.55 * local) },
        { scale: PETAL_SCALE_FROM + local * (1 - PETAL_SCALE_FROM) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: radius - ring.width / 2,
          top: radius - ring.height / 2,
          width: ring.width,
          height: ring.height,
          borderRadius: ring.width / 2,
          backgroundColor: ring.color,
        },
        style,
      ]}
    />
  );
}

export function MorphingFabMenu({
  visible,
  onClose,
  onClosed,
  fabRect,
}: MorphingFabMenuProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const pageColor = dark ? PAGE_DARK : PAGE_LIGHT;

  // quick navigation role awareness
  const role = useCurrentUserRole();
  const items = useMemo(() => getNavMenuItems(role), [role]);

  const progress = useSharedValue(0);
  const itemsProgress = useSharedValue(0);
  const bloom = useSharedValue(0);
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const closePress = useSharedValue(1);
  const [mounted, setMounted] = useState(visible);

  const finishClose = () => {
    setMounted(false);
    onClosed?.();
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = 0;
      itemsProgress.value = 0;
      bloom.value = 0;
      progress.value = withSpring(1, SHEET_OPEN_SPRING);
      itemsProgress.value = withDelay(
        ITEMS_OPEN_DELAY,
        withTiming(1, {
          duration: ITEMS_OPEN_DURATION,
          easing: ITEMS_EASING,
        }),
      );
      bloom.value = withDelay(
        PETAL_BLOOM_DELAY,
        withSpring(1, PETAL_BLOOM_SPRING),
      );
    } else if (mounted) {
      // Petals fold back in and the tiles drop out while the page is still
      // fading, so closing reads as one gesture. The page owns the unmount.
      bloom.value = withTiming(0, PETAL_CLOSE_TIMING);
      itemsProgress.value = withTiming(0, {
        duration: ITEMS_CLOSE_DURATION,
        easing: CLOSE_EASING,
      });
      progress.value = withTiming(0, SHEET_CLOSE_TIMING, (done) => {
        if (done) runOnJS(finishClose)();
      });
    }
  }, [visible]);

  // The flower keeps a slow turn and a shallow breath while it is open: enough
  // to feel alive under the finger, too slow to pull the eye off the grid.
  useEffect(() => {
    if (!mounted) return;
    spin.value = withRepeat(
      withTiming(1, { duration: FLOWER_SPIN_DURATION, easing: Easing.linear }),
      -1,
      false,
    );
    breathe.value = withRepeat(
      withTiming(1, {
        duration: FLOWER_BREATHE_DURATION,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
      spin.value = 0;
      breathe.value = 0;
    };
  }, [mounted]);

  const fab = fabRect;
  const modalYOffset = Platform.OS === "android" ? insets.top : 0;
  const fabH = fab?.height ?? 56;
  const fabW = fab?.width ?? 56;
  const flowerCenterX = fab ? fab.x + fabW / 2 : screenW / 2;
  const flowerCenterY = fab ? fab.y + modalYOffset + fabH / 2 : screenH - 120;

  const rings = useMemo(() => petalRings(dark), [dark]);
  const flowerRadius = useMemo(
    () => Math.ceil(Math.max(...rings.map((r) => r.offset + r.height / 2)) + 6),
    [rings],
  );

  const contentWidth = Math.min(
    screenW - SCREEN_PADDING * 2,
    MAX_CONTENT_WIDTH,
  );

  // The grid scrolls under the translucent petals, so the last row only has to
  // be reachable clear of them rather than kept above them.
  const scrollBottomPadding = Math.max(
    24,
    screenH - (flowerCenterY - FLOWER_LIFT - flowerRadius) + 16,
  );

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.85], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: (1 - progress.value) * SHEET_TRANSLATE_Y },
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [SHEET_SCALE_FROM, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // The flower rides up off the FAB as the page arrives — the FAB sits low in
  // the tab bar notch, and this is what gives the lowest petals room to open
  // above the bottom edge.
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -FLOWER_LIFT * progress.value }],
  }));

  const flowerStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.value * 360}deg` },
      // `bloom` is a spring and is deliberately not clamped here: the petals
      // themselves land at full size, and the overshoot of the flower as a whole
      // is the pop that finishes the bloom.
      {
        scale:
          (FLOWER_BLOOM_SCALE_FROM +
            bloom.value * (1 - FLOWER_BLOOM_SCALE_FROM)) *
          (1 + breathe.value * (FLOWER_BREATHE_SCALE - 1)),
      },
    ],
  }));

  const buttonStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [fabH, CLOSE_BUTTON_SIZE],
      Extrapolation.CLAMP,
    );
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      transform: [{ scale: closePress.value }],
      shadowRadius: interpolate(
        progress.value,
        [0, 1],
        [12, 18],
        Extrapolation.CLAMP,
      ),
    };
  });

  // A disc of the page colour behind the button, so the circle stays crisp
  // where the petals crowd it. At rest it is exactly the FAB, i.e. invisible.
  const ringStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [fabH, CLOSE_BUTTON_SIZE + CLOSE_BUTTON_RING],
      Extrapolation.CLAMP,
    );
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      transform: [{ scale: closePress.value }],
    };
  });

  const menuIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      CLOSE_MENU_ICON_FADE,
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        rotate: `${interpolate(progress.value, CLOSE_MENU_ICON_FADE, [0, -ICON_TURN], Extrapolation.CLAMP)}deg`,
      },
      {
        scale: interpolate(
          progress.value,
          CLOSE_MENU_ICON_FADE,
          [1, ICON_MIN_SCALE],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const closeLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      CLOSE_LABEL_FADE,
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          progress.value,
          CLOSE_LABEL_FADE,
          [ICON_MIN_SCALE, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  if (!mounted || !fab) return null;

  const handleSelect = (item: NavMenuItem | QuickActionItem) => {
    onClose();
    if (!item.route) return;
    if (item.mode === "navigate") {
      router.navigate(item.route as never);
    } else {
      router.push(item.route as never);
    }
  };

  // No columnGap and no justify-between: the quarter-width cells carry their own
  // spacing, so a partial last row packs left under the row above it instead of
  // spreading to both edges. The negative bottom margin cancels the last row's
  // ROW_GAP.
  const gridWrapper = (children: ReactNode) => (
    <View className="flex-row flex-wrap" style={{ marginBottom: -ROW_GAP }}>
      {children}
    </View>
  );

  const actionGrid = gridWrapper(
    QUICK_ACTION_ITEMS.map((item, i) => (
      <MenuCell
        key={item.key}
        label={item.label}
        icon={<item.icon size={CHIP_ICON_SIZE} color={FAB_COLOR} />}
        index={i}
        onPress={() => handleSelect(item)}
        itemsProgress={itemsProgress}
      />
    )),
  );

  // Stagger continues from the actions above so the page reveals as one list.
  const navGrid = gridWrapper(
    items.map((item, i) => (
      <MenuCell
        key={item.key}
        label={item.label}
        icon={
          <Feather name={item.icon} size={CHIP_ICON_SIZE} color={FAB_COLOR} />
        }
        index={QUICK_ACTION_ITEMS.length + i}
        onPress={() => handleSelect(item)}
        itemsProgress={itemsProgress}
      />
    )),
  );

  let petalIndex = 0;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: pageColor },
          sheetStyle,
        ]}
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            paddingHorizontal: SCREEN_PADDING,
          }}
        >
          <View
            style={{
              height: HEADER_HEIGHT,
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close navigation menu"
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-50"
            >
              <Feather
                name="x"
                size={24}
                color={dark ? HEADER_ICON_DARK : HEADER_ICON_LIGHT}
              />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              width: contentWidth,
              alignSelf: "center",
              paddingBottom: scrollBottomPadding,
            }}
          >
            <SectionCard
              title="Quick Actions"
              index={0}
              itemsProgress={itemsProgress}
            >
              {actionGrid}
            </SectionCard>

            <SectionCard
              title="Quick Navigation"
              index={1}
              itemsProgress={itemsProgress}
            >
              {navGrid}
            </SectionCard>
          </ScrollView>
        </View>
      </Animated.View>

      {/* The flower sits over the page at the FAB centre, so the button the
          finger is still on is the one that grows into "Tap to close". */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            left: flowerCenterX - flowerRadius,
            top: flowerCenterY - flowerRadius,
            width: flowerRadius * 2,
            height: flowerRadius * 2,
            alignItems: "center",
            justifyContent: "center",
          },
          liftStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, flowerStyle]}
        >
          {rings.map((ring, ringIndex) =>
            Array.from({ length: ring.count }, (_, i) => (
              <Petal
                key={`${ringIndex}-${i}`}
                angle={ring.phase + (360 / ring.count) * i}
                index={petalIndex++}
                ring={ring}
                radius={flowerRadius}
                bloom={bloom}
              />
            )),
          )}
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", backgroundColor: pageColor },
            ringStyle,
          ]}
        />

        <Pressable
          onPress={onClose}
          onPressIn={() => {
            closePress.value = withTiming(CLOSE_PRESS_SCALE, CLOSE_PRESS_IN);
          }}
          onPressOut={() => {
            closePress.value = withSpring(1, CLOSE_PRESS_OUT_SPRING);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
        >
          <Animated.View
            style={[
              {
                backgroundColor: FAB_COLOR,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: FAB_SHADOW_COLOR,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                elevation: 14,
              },
              buttonStyle,
            ]}
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
                closeLabelStyle,
              ]}
            >
              <Text
                style={{ lineHeight: 14 }}
                className="text-center text-[11px] font-semibold text-white"
              >
                {"Tap to\nclose"}
              </Text>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
