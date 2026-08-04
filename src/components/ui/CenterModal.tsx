import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

import {
  MODAL_BACKDROP_COLOR,
  MODAL_CARD_SCALE_FROM,
  MODAL_CLOSE_TIMING,
  MODAL_OPEN_SPRING,
} from "../navigation/navMotion";

type CenterModalProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * When false the dialog is blocking: backdrop taps and the Android back
   * button do nothing, and no dismiss affordance is rendered.
   */
  dismissable?: boolean;
  children: React.ReactNode;
  /**
   * Rendered as a sibling of the card rather than inside it, so it escapes the
   * card's width clamp and its entrance transform. For off-screen views that
   * exist only to be captured to an image (the QR "save to gallery" cards).
   */
  offscreen?: React.ReactNode;
};

/**
 * The app's centre-dialog presentation — the counterpart to {@link BottomSheet}
 * for content that belongs in the middle of the screen (QR codes, the update
 * prompt) rather than rising from the bottom edge.
 *
 * Replaces RN's `animationType="fade"`, which fades the backdrop and the card as
 * one flat block. Here the backdrop fades while the card scales up into place on
 * a lightly-sprung curve, so the dialog reads as emerging from the screen
 * underneath instead of being pasted over it. `animationType="none"` hands the
 * whole transition to Reanimated; the exit is driven off `mounted`, which keeps
 * the card on screen long enough to animate out after `visible` flips false.
 */
export function CenterModal({
  visible,
  onClose,
  dismissable = true,
  children,
  offscreen,
}: CenterModalProps) {
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, MODAL_OPEN_SPRING);
    } else if (mounted) {
      progress.value = withTiming(0, MODAL_CLOSE_TIMING, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // Keyed on `visible` alone — see the same note in BottomSheet.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        scale:
          MODAL_CARD_SCALE_FROM +
          (1 - MODAL_CARD_SCALE_FROM) * progress.value,
      },
    ],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={dismissable ? onClose : () => {}}
    >
      <View
        accessibilityViewIsModal
        className="flex-1 items-center justify-center px-8"
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: MODAL_BACKDROP_COLOR },
            backdropStyle,
          ]}
        />

        {dismissable && (
          <Pressable
            className="absolute inset-0"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        )}

        <Animated.View className="w-full max-w-sm" style={cardStyle}>
          {children}
        </Animated.View>

        {offscreen}
      </View>
    </Modal>
  );
}
