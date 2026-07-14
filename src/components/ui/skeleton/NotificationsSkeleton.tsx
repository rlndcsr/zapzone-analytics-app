import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

// Matches the default page size (useNotifications perPage = 5) so the skeleton
// fills roughly the same vertical space as the first loaded page.
const LIST_COUNT = 5;

// Mirrors the notification card's own inline shadow (see notification.tsx) so the
// placeholder and the real card cast an identical shadow — no pop on swap.
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

/**
 * One skeleton "line": a fixed-height row wrapping the pulsing bar. Wrapping the
 * bar in a sized View (rather than sizing the SkeletonBlock directly) keeps the
 * line's box height equal to the real text's line-height, so vertical rhythm
 * matches exactly. (SkeletonBlock's className styles its inner View, so a flex/
 * height class placed on it collapses the bar — hence this wrapper.)
 */
function SkeletonLine({
  pulse,
  width,
  line,
  bar = "h-3",
  className = "",
}: {
  pulse: SharedValue<number>;
  width: string;
  line: string;
  bar?: string;
  className?: string;
}) {
  return (
    <View className={`${line} justify-center ${className}`}>
      <SkeletonBlock pulse={pulse} className={`${width} ${bar}`} />
    </View>
  );
}

/**
 * Placeholder for a single notification card. Dimensions mirror the real card in
 * notification.tsx exactly (p-5 container, 40×40 avatar, title + priority row,
 * "Mark as Read" pill, two-line message, timestamp) so replacing skeleton with
 * content produces no layout shift. The 12px bottom margin matches the spacing
 * SwipeableNotificationCard applies between real cards (containerStyle marginBottom).
 */
export function NotificationCardSkeleton({
  pulse,
}: {
  pulse: SharedValue<number>;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-3 shadow-sm border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      {/* Row 1 — avatar + title/priority, with the Mark-as-Read pill on the right */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 flex-row items-center gap-3">
          {/* Avatar — same 40×40 circle as the real Bell badge */}
          <SkeletonBlock pulse={pulse} className="w-10 h-10 rounded-full" />
          <View className="flex-1">
            {/* Title (text-sm) */}
            <SkeletonLine pulse={pulse} width="w-40" line="h-5" bar="h-3.5" />
            {/* Priority row (icon + text-xs label) */}
            <SkeletonLine
              pulse={pulse}
              width="w-16"
              line="h-4"
              bar="h-2.5"
              className="mt-0.5"
            />
          </View>
        </View>
        {/* Mark as Read pill */}
        <SkeletonBlock pulse={pulse} className="w-24 h-6 rounded-full" />
      </View>

      {/* Row 2 — message + timestamp, offset to align under the title (ml-13
          mirrors the real card's message container). */}
      <View className="ml-13">
        <SkeletonLine pulse={pulse} width="w-full" line="h-5" bar="h-3" />
        <SkeletonLine pulse={pulse} width="w-2/3" line="h-5" bar="h-3" />
        {/* Timestamp (text-xs) */}
        <SkeletonLine
          pulse={pulse}
          width="w-40"
          line="h-4"
          bar="h-2.5"
          className="mt-2"
        />
      </View>
    </View>
  );
}

/**
 * The notifications list placeholder — a column of card skeletons shown while the
 * list is being fetched. A single shared pulse drives every bar so the shimmer
 * stays in sync and only one animation loop runs.
 */
export function NotificationsListSkeleton({
  count = LIST_COUNT,
}: {
  count?: number;
}) {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <NotificationCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
