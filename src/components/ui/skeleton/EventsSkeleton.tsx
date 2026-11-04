import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const LIST_COUNT = 5;

/** A skeleton bar vertically centered within a text line's height. */
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

/** Matches EventCard: name + status, meta line, description, the
 *  Date / Time / Price strip, and the footer (details + action group). */
function EventCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
        <SkeletonBlock pulse={pulse} className="w-16 h-5 rounded-full" />
      </View>
      <SkeletonLine
        pulse={pulse}
        width="w-28"
        line="h-4"
        bar="h-2.5"
        className="mt-1"
      />
      <SkeletonLine
        pulse={pulse}
        width="w-full"
        line="h-5"
        bar="h-2.5"
        className="mt-2"
      />
      <SkeletonLine pulse={pulse} width="w-2/3" line="h-5" bar="h-2.5" />
      <SkeletonBlock pulse={pulse} className="w-full h-14 rounded-xl mt-3" />
      <View className="flex-row items-center justify-between mt-3">
        <SkeletonLine pulse={pulse} width="w-32" line="h-4" bar="h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-16 h-8 rounded-lg" />
      </View>
    </View>
  );
}

/** The event card list placeholder. */
export function EventsListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <EventCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}

/** Matches EventsTable's flat look: header bar, then event (name / meta),
 *  a value column and the status pill per 64px row. */
export function EventsTableSkeleton() {
  const pulse = usePulse();
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden mb-3">
      <View className="h-11 flex-row items-center px-4 gap-6 bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800">
        <SkeletonBlock pulse={pulse} className="w-12 h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-20 h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-12 h-2.5" />
      </View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <View
          key={i}
          className={`h-16 flex-row items-center px-4 gap-4 ${
            i < LIST_COUNT - 1
              ? "border-b border-gray-100 dark:border-neutral-800"
              : ""
          }`}
        >
          <View className="flex-1">
            <SkeletonLine pulse={pulse} width="w-36" line="h-5" bar="h-3" />
            <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2" />
          </View>
          <SkeletonBlock pulse={pulse} className="w-20 h-3" />
          <SkeletonBlock pulse={pulse} className="w-16 h-6 rounded-full" />
        </View>
      ))}
    </View>
  );
}
