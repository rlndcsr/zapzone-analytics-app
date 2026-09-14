import { ArrowDownToLine } from "lucide-react-native";
import { Text, View } from "react-native";

import { PressableScale } from "./motion/PressableScale";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppUpdateStatus } from "../../services/appUpdateService";
import {
  FAB_SIZE,
  fabBottomOffset,
} from "../navigation/fabLayout";

const BRAND = "#0644C7";

/** Clears the Quick Navigation FAB, which overhangs the tab bar's top edge. */
const GAP_ABOVE_FAB = 12;

/** On a pushed stack screen there is no tab bar to clear — just the inset. */
const GAP_ABOVE_SAFE_AREA = 16;

type Props = {
  status: AppUpdateStatus;
  /** True on a bottom-tab screen: lift the bar over the tab bar and FAB. */
  overTabBar: boolean;
  /** Reopens the update dialog. */
  onUpdate: () => void;
};

/**
 * The standing reminder for an update the user chose not to install.
 *
 * Once "Later" is tapped the dialog is gone for the launch, and until now
 * nothing was left behind to say an update was still waiting — the user had to
 * relaunch to be asked again. This is that leftover: a slim, non-blocking bar
 * that keeps the pending version visible and puts the dialog one tap away.
 *
 * It has no close button, on purpose. It is mounted in the root shell, so it
 * rides above every screen and stays there until the update is installed —
 * that persistence is the whole feature, and a reminder that can be closed is
 * one the user closes once and then never sees again. What makes that
 * tolerable rather than obstructive is that it only ever *covers* a screen it
 * has room for: `pointerEvents="box-none"` leaves everything but the bar
 * itself tappable, and screens with their own bottom action bar reserve space
 * via useAppUpdateNoticeInset() so no Save button ends up underneath it.
 *
 * It never appears on its own. AppUpdateGate renders it only in place of a
 * deferred *optional* prompt — a forced update blocks instead of reminding,
 * and an in-flight download keeps the dialog itself on screen.
 */

export function AppUpdateNotice({ status, overTabBar, onUpdate }: Props) {
  const insets = useSafeAreaInsets();

  const bottom = overTabBar
    ? fabBottomOffset(insets.bottom) + FAB_SIZE + GAP_ABOVE_FAB
    : insets.bottom + GAP_ABOVE_SAFE_AREA;

  return (
    // box-none so only the bar itself takes touches — the screen underneath
    // stays fully usable, which is the whole point of a notice over a dialog.
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
