import { ArrowDownToLine } from "lucide-react-native";
import { Text, View } from "react-native";

import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "./motion/PressableScale";

import type { AppUpdateStatus } from "../../services/appUpdateService";
import { FAB_SIZE, fabBottomOffset } from "../navigation/fabLayout";

const BRAND = "#0644C7";
const GAP_ABOVE_FAB = 12;
const GAP_ABOVE_SAFE_AREA = 16;

type Props = {
  status: AppUpdateStatus;
  overTabBar: boolean;
  onUpdate: () => void;
};

export function AppUpdateNotice({ status, overTabBar, onUpdate }: Props) {
  const insets = useSafeAreaInsets();

  const bottom = overTabBar
    ? fabBottomOffset(insets.bottom) + FAB_SIZE + GAP_ABOVE_FAB
    : insets.bottom + GAP_ABOVE_SAFE_AREA;

  return (
    <Animated.View
      pointerEvents="box-none"
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      style={{ position: "absolute", left: 0, right: 0, bottom }}
      className="px-5"
    >
      <View className="flex-row items-center gap-3 rounded-2xl border border-[#0644C7]/15 bg-white px-4 py-3 shadow-lg dark:border-[#0644C7]/30 dark:bg-neutral-900">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#0644C7]/10">
          <ArrowDownToLine size={18} color={BRAND} />
        </View>

        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            Update available
          </Text>
          <Text
            className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            {status.latestVersion
              ? `Version ${status.latestVersion} is ready to install`
              : "A newer version is ready to install"}
          </Text>
        </View>

        <PressableScale
          onPress={onUpdate}
          accessibilityRole="button"
          accessibilityLabel="Update the app"
          className="shrink-0 rounded-xl bg-[#0644C7] px-3.5 py-2.5"
        >
          <Text className="text-xs font-semibold text-white">Update</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}
