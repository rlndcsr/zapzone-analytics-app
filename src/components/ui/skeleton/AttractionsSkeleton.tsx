import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const KPI_COUNT = 4;
const LIST_COUNT = 5;

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

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

/** Matches AttractionKpiCard: icon badge, label, value, subtitle. */
function KpiCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
      style={CARD_SHADOW}
    >
      <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
      <SkeletonLine pulse={pulse} width="w-20" line="h-4" className="mt-3" />
      <SkeletonLine pulse={pulse} width="w-14" line="h-8" bar="h-6" className="mt-1" />
      <SkeletonLine pulse={pulse} width="w-16" line="h-4" className="mt-1" />
    </View>
  );
}

/** The 4 KPI summary cards, in a 2-column grid. */
export function AttractionsKpiSkeleton() {
  const pulse = usePulse();
  return (
    <View className="flex-row flex-wrap -mx-1.5">
      {Array.from({ length: KPI_COUNT }).map((_, i) => (
        <View key={i} className="w-1/2">
          <KpiCardSkeleton pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

/** Matches the Manage Attractions summary panel: one bordered card split into
 *  a 2×2 grid of label / value / hint cells by hairlines. */
export function AttractionsSummarySkeleton() {
  const pulse = usePulse();
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      {[0, 1].map((row) => (
        <View
          key={row}
          className={`flex-row ${
            row === 0 ? "border-b border-gray-100 dark:border-neutral-800" : ""
          }`}
        >
          {[0, 1].map((col) => (
            <View
              key={col}
              className={`flex-1 p-4 ${
                col === 1
                  ? "border-l border-gray-100 dark:border-neutral-800"
                  : ""
              }`}
            >
              <SkeletonLine pulse={pulse} width="w-20" line="h-4" bar="h-2.5" />
              <SkeletonLine
                pulse={pulse}
                width="w-14"
                line="h-8"
                bar="h-5"
                className="mt-1"
              />
              <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Matches AttractionCard: name + status, category line, description, the
 *  Price / Capacity / Duration strip, and the created footer. */
function AttractionCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
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
      <SkeletonLine
        pulse={pulse}
        width="w-24"
        line="h-4"
        bar="h-2.5"
        className="mt-3"
      />
    </View>
  );
}

/** The attraction card list placeholder. */
export function AttractionsListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <AttractionCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}

/** Matches AttractionsTable's leading columns: checkbox, order, attraction
 *  (name / description / meta), and a trailing value column. */
export function AttractionsTableSkeleton() {
  const pulse = usePulse();
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden mb-3">
      <View className="h-11 flex-row items-center px-4 gap-4 bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800">
        <SkeletonBlock
          pulse={pulse}
          className="w-[18px] h-[18px] rounded-[5px]"
        />
        <SkeletonBlock pulse={pulse} className="w-10 h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-20 h-2.5" />
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
          <SkeletonBlock
            pulse={pulse}
            className="w-[18px] h-[18px] rounded-[5px]"
          />
          <SkeletonBlock pulse={pulse} className="w-7 h-7 rounded-md" />
          <View className="flex-1">
            <SkeletonLine pulse={pulse} width="w-36" line="h-5" bar="h-3" />
            <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2" />
          </View>
          <SkeletonBlock pulse={pulse} className="w-14 h-3" />
        </View>
      ))}
    </View>
  );
}
