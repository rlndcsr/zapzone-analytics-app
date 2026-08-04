import React, { useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

import {
  SHEET_CLOSE_DISTANCE,
  SHEET_CLOSE_SPRING,
  SHEET_CLOSE_VELOCITY,
  SHEET_OPEN_SPRING,
} from "../navigation/navMotion";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Secondary line under the title (e.g. "Devin Decator · ZAP-14"). */
  subtitle?: string;
  /** Tinted icon tile left of the title, mirroring the web modal headers. */
  icon?: React.ReactNode;
  children: React.ReactNode;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  // Where the finger took over, so a drag that starts mid-animation continues
  // from the sheet's current position instead of snapping to the touch origin.
  const dragOrigin = useSharedValue(0);
  // Fling speed handed from the pan gesture to the exit spring below. A ref, not
  // a shared value: the gesture sets it through runOnJS immediately before
  // calling onClose, so it is guaranteed to be current by the time the effect
  // below reacts — a shared value written on the UI thread can lag a frame.
  const exitVelocity = useRef(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = SCREEN_HEIGHT;
      exitVelocity.current = 0;
      translateY.value = withSpring(0, SHEET_OPEN_SPRING);
    } else if (mounted) {
      // Springs from wherever the sheet currently is, carrying the fling
      // velocity, so a hard flick leaves fast and a tap-to-close glides.
      translateY.value = withSpring(
        SCREEN_HEIGHT,
        { ...SHEET_CLOSE_SPRING, velocity: exitVelocity.current },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        },
      );
    }
    // Deliberately keyed on `visible` alone: adding `mounted` would re-run this
    // the moment setMounted(true) lands and restart the entrance mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Backdrop dims in step with the sheet position (fades as you drag down).
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Dismiss triggered by a flick: record how hard, then let the parent flip
  // `visible` so the exit spring above picks the velocity up.
  const dismissWithVelocity = (velocityY: number) => {
    exitVelocity.current = Math.max(0, velocityY);
    onClose();
  };

  // Pan on the handle/header: follow the finger downward, then dismiss or snap back.
  const dragGesture = Gesture.Pan()
    .onStart(() => {
      dragOrigin.value = translateY.value;
    })
    .onUpdate((event) => {
      translateY.value = Math.max(0, dragOrigin.value + event.translationY);
    })
    .onEnd((event) => {
      if (
        event.translationY > SHEET_CLOSE_DISTANCE ||
        event.velocityY > SHEET_CLOSE_VELOCITY
      ) {
        runOnJS(dismissWithVelocity)(event.velocityY);
      } else {
        translateY.value = withSpring(0, SHEET_OPEN_SPRING);
      }
    });

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          className="absolute inset-0"
          style={[{ backgroundColor: "rgba(20, 20, 20, 0.5)" }, backdropStyle]}
        />

        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={onClose} />

          <Animated.View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[80%]"
            style={[sheetStyle, { paddingBottom: insets.bottom }]}
          >
            <GestureDetector gesture={dragGesture}>
              <View className="pb-1">
                <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3" />
                <View className="flex-row items-center justify-between px-6 pt-4 pb-3 gap-3">
                  {icon}
                  {/* flex-1 lets long titles wrap instead of pushing the close
                      button off-screen; pr-4 keeps a gap. Short titles are
                      unaffected (still left-aligned with the button at right). */}
                  <View className="flex-1 pr-4">
                    <Text className="text-lg font-bold text-gray-900 dark:text-white">
                      {title}
                    </Text>
                    {!!subtitle && (
                      <Text
                        className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                        numberOfLines={1}
                      >
                        {subtitle}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={onClose} className="p-1 shrink-0">
                    <Text className="text-xl text-gray-500 dark:text-gray-400">✕</Text>
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

            {children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
