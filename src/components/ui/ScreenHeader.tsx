import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, type ReactNode } from "react";
import { Text, View } from "react-native";

import { PressableScale } from "./motion/PressableScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#0644C7";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children?: ReactNode;
  className?: string;
};

/** Solid blue hero with white text, matching the Profile screen's hero. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  children,
  className = "pb-6",
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Light status bar (white clock / wifi) over the blue hero while focused,
  // back to `auto` on the way out — as the Profile screen does.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light", true);
      return () => setStatusBarStyle("auto", true);
    }, []),
  );

  return (
    <View
      className={`rounded-b-[32px] px-5 ${className}`}
      style={{ paddingTop: insets.top + 10, backgroundColor: BRAND }}
    >
      <View className="flex-row items-center">
        <PressableScale
          pressScale="icon"
          onPress={onBack ?? (() => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
        >
          <Feather name="chevron-left" size={22} color="#FFFFFF" />
        </PressableScale>
        <Text
          className="flex-1 text-center text-[22px] font-bold text-white"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="h-9 w-9" />
      </View>

      {subtitle ? (
        <Text className="mt-2 text-center text-sm text-white/80">
          {subtitle}
        </Text>
      ) : null}

      {children}
    </View>
  );
}
