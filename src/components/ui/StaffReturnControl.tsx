import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

const HOLD_MS = 1200;

/**
 * The way out of the kiosk (the web's `StaffReturnControl`).
 *
 * Press-and-hold rather than a tap, because this device is handed to guests: a
 * guest brushing the corner should do nothing, while staff who know the gesture
 * get out in about a second. Every kiosk in the app is launched by staff from a
 * staff screen — the case the web marks with `?staff=1` — so leaving goes back
 * to exactly where they launched it (same scan, same scroll). Check-in is only
 * the fallback for a kiosk with nothing behind it.
 */
export function StaffReturnControl() {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    start.current = null;
    setProgress(0);
  }, []);

  const leave = useCallback(() => {
    cancel();
    if (router.canGoBack()) router.back();
    else router.replace("/check-in");
  }, [cancel]);

  const tick = useCallback(
    (now: number) => {
      if (start.current === null) start.current = now;
      const pct = Math.min(1, (now - start.current) / HOLD_MS);
      setProgress(pct);
      if (pct >= 1) {
        leave();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    },
    [leave],
  );

  const begin = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => cancel, [cancel]);

  return (
    <View className="mb-3 items-center">
      <Pressable
        onPressIn={begin}
        onPressOut={cancel}
        accessibilityRole="button"
        accessibilityLabel="Hold to exit the kiosk and return to staff screens"
        accessibilityHint="Press and hold for about a second"
        className="flex-row items-center gap-1.5 overflow-hidden rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900/70"
      >
        <View
          pointerEvents="none"
          className="absolute bottom-0 left-0 top-0 bg-gray-200 dark:bg-neutral-700"
          style={{ width: `${progress * 100}%` }}
        />
        <Feather name="maximize" size={12} color="#9CA3AF" />
        <Text className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
          {progress > 0 ? "Keep holding…" : "Staff — hold to exit kiosk"}
        </Text>
      </Pressable>
    </View>
  );
}

export default StaffReturnControl;
