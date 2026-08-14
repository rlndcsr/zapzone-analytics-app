import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { CARD_SHADOW } from "../AnalyticsCards";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

/**
 * Placeholder for one {@link MetricCard}: same half-width cell, same card box,
 * and the same label / value / change stack beside the tinted icon tile.
 */
function MetricCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="w-1/2 p-1.5">
      <View
        className="flex-1 bg-white dark:bg-neutral-900 rounded-xl p-4 border border-gray-100 dark:border-neutral-800"
        style={CARD_SHADOW}
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <SkeletonBlock pulse={pulse} className="w-24 h-3.5" />
            <SkeletonBlock pulse={pulse} className="w-20 h-7 mt-2" />
            <SkeletonBlock pulse={pulse} className="w-28 h-3 mt-2" />
          </View>
          <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-lg" />
        </View>
      </View>
    </View>
  );
}

/** Placeholder for one {@link Panel}: header row + the chart area. */
function ChartPanelSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center justify-between gap-2 mb-3">
        <SkeletonBlock pulse={pulse} className="w-44 h-4" />
        <SkeletonBlock pulse={pulse} className="w-4 h-4 rounded" />
      </View>
      <SkeletonBlock pulse={pulse} className="w-full h-[220px] rounded-xl" />
    </View>
  );
}

/** Placeholder for one {@link TableCard}: icon + title, header row, then rows. */
function TableCardSkeleton({
  pulse,
  rows = 4,
}: {
  pulse: SharedValue<number>;
  rows?: number;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <SkeletonBlock pulse={pulse} className="w-[18px] h-[18px] rounded" />
        <SkeletonBlock pulse={pulse} className="w-40 h-4" />
      </View>
      <View className="flex-row items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-800">
        <SkeletonBlock pulse={pulse} className="w-20 h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-16 h-2.5" />
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          className="flex-row items-center justify-between py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
        >
          <SkeletonBlock pulse={pulse} className="w-32 h-3" />
          <SkeletonBlock pulse={pulse} className="w-14 h-3" />
        </View>
      ))}
    </View>
  );
}

/**
 * Loading placeholder for the Performance Analytics screens. Unlike the generic
 * {@link AnalyticsSkeleton} (built for the StatTile dashboards), this mirrors
 * what those two screens actually render: the half-width metric-card grid, the
 * chart panels, then the performance tables.
 */
export function PerformanceAnalyticsSkeleton({
  metrics = 6,
  panels = 6,
  tables = 2,
}: {
  metrics?: number;
  panels?: number;
  tables?: number;
}) {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      {metrics > 0 && (
        <View className="flex-row flex-wrap items-stretch -mx-1.5">
          {Array.from({ length: metrics }).map((_, i) => (
            <MetricCardSkeleton key={i} pulse={pulse} />
          ))}
        </View>
      )}
      {Array.from({ length: panels }).map((_, i) => (
        <ChartPanelSkeleton key={i} pulse={pulse} />
      ))}
      {Array.from({ length: tables }).map((_, i) => (
        <TableCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
