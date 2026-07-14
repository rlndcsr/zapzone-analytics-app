import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { Trash2, Undo2 } from 'lucide-react-native';

type UndoSnackbarProps = {
  visible: boolean;
  message?: string;
  onUndo: () => void;
};

// A bottom snackbar that slides up when a notification is deleted, offering an
// "Undo" while the delete waits out its grace period in the hook.
export function UndoSnackbar({
  visible,
  message = 'Notification deleted',
  onUndo,
}: UndoSnackbarProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, { duration: 220 });
      opacity.value = withTiming(1, { duration: 220 });
    } else if (mounted) {
      opacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(120, { duration: 180 }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        { position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 16 },
        animatedStyle,
      ]}
      className="px-5"
    >
      <View className="flex-row items-center justify-between rounded-2xl bg-neutral-900 dark:bg-neutral-800 px-4 py-3.5 shadow-lg">
        <View className="flex-1 flex-row items-center gap-2.5">
          <Trash2 size={16} color="#f87171" />
          <Text className="text-sm font-medium text-white" numberOfLines={1}>
            {message}
          </Text>
        </View>
        <Pressable
          onPress={onUndo}
          hitSlop={8}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10"
        >
          <Undo2 size={14} color="#93c5fd" />
          <Text className="text-sm font-semibold text-blue-300">Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
