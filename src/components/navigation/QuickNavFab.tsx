import { Image } from "expo-image";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fabBottomOffset } from "./fabLayout";
import {
  FAB_PRESS_IN,
  FAB_PRESS_OUT_SPRING,
  FAB_PRESS_SCALE,
} from "./fabMenuMotion";
import { FabRect, MorphingFabMenu } from "./MorphingFabMenu";
import { isPublicRoute } from "../../lib/navigation/publicRoutes";
import { useAuthStatus } from "../../lib/session";

const FAB_COLOR = "#0644C7";

const moreIcon = require("../../../assets/zapzone-assests/icon/more.png");

/** Keyboard visibility. Only keyboardDid* fires on both platforms. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

/**
 * The single Quick Navigation FAB for the whole authenticated app.
 *
 * Mounted once in the root shell (app/_layout.tsx) as a sibling *after* the
 * root Stack, so it draws above every screen the navigator renders — tab
 * screens, feature screens, nested/detail/edit/create screens alike — and no
 * screen has to know it exists. It anchors to the bottom of the window at the
 * same offset the floating tab bar used to place it at (see fabLayout.ts), so
 * its position on tab screens is unchanged.
 *
 * Screen bottom sheets present in a native Modal, which sits above the root
 * view, so an open sheet still covers the FAB exactly as before.
 */
export function QuickNavFab() {
  const insets = useSafeAreaInsets();
  const authed = useAuthStatus();
  const pathname = usePathname();
  const keyboardVisible = useKeyboardVisible();

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

  // Signed out / on a public screen, and while typing — a bottom-centered FAB
  // would otherwise sit on top of the field the keyboard was opened for.
  const hidden = !authed || isPublicRoute(pathname) || keyboardVisible;

  // Drop the menu state when the FAB goes away (session expiry, keyboard) so it
  // doesn't re-open by itself once the FAB comes back.
  useEffect(() => {
    if (!hidden) return;
    setMenuOpen(false);
    setMenuMounted(false);
  }, [hidden]);

  if (hidden) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: fabBottomOffset(insets.bottom),
        alignItems: "center",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={menuOpen ? { expanded: true } : {}}
        accessibilityLabel="Quick navigation"
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
                shadowColor: FAB_COLOR,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 12,
              }}
            >
              <Image
                source={moreIcon}
                style={{ width: 22, height: 22, tintColor: "#FFFFFF" }}
                contentFit="contain"
              />
            </View>
          </Animated.View>
        </View>
      </Pressable>

      <MorphingFabMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onClosed={() => setMenuMounted(false)}
        fabRect={fabRect}
      />
    </View>
  );
}
