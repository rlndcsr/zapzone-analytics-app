import React, { useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

const SCREEN_HEIGHT = Dimensions.get("window").height;
// Drag the sheet down past this distance (or flick faster than this) to dismiss.
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 800;

const OPEN_SPRING = { damping: 20, stiffness: 200, mass: 0.8 };

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, OPEN_SPRING);
    } else if (mounted) {
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration: 220 },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        },
      );
    }
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

  // Pan on the handle/header: follow the finger downward, then dismiss or snap back.
  const dragGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (
        event.translationY > CLOSE_DISTANCE ||
        event.velocityY > CLOSE_VELOCITY
      ) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, OPEN_SPRING);
      }
    });

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          className="absolute inset-0 bg-black/50"
          style={backdropStyle}
        />

        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={onClose} />

          <Animated.View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[80%]"
            style={sheetStyle}
          >
            <GestureDetector gesture={dragGesture}>
              <View className="pb-1">
                <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3" />
                <View className="flex-row items-center justify-between px-6 pt-4 pb-3">
                  <Text className="text-lg font-bold text-gray-900 dark:text-white">
                    {title}
                  </Text>
                  <Pressable onPress={onClose} className="p-1">
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
