import React from "react";
import { Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  breakdownRows,
  metricLine,
  type BreakdownInput,
  type MetricLike,
} from "../../lib/analytics/performanceDisplay";
import { formatNumber } from "../../lib/customers/customerAnalyticsDisplay";
import { PanelEmpty } from "../analytics/CustomerAnalyticsBlocks";
import type { SummaryFigure } from "./SummaryPanel";

/**
 * The building blocks of the Performance Analytics screens, in the flat
 * Manage Attractions design: figures go into one bordered SummaryPanel,
 * charts and tables sit in AnalyticsPanels (CustomerAnalyticsBlocks).
 */

/**
 * One `key_metrics` entry as a SummaryPanel figure: the value, then the
 * percentage change (green up / red down / grey for none) with what it is
 * measured against, or the metric's plain note ("2 new packages").
 */
export function metricFigure(
  icon: FeatherIconName,
  title: string,
  value: string,
  metric: MetricLike,
  comparison?: string,
): SummaryFigure {
  const line = metricLine(metric, comparison);
  return { icon, title, value, hint: line.hint, delta: line.delta };
}

/**
 * Parts of one whole (booking statuses, package types, waiver sources): one
 * bar split by share, then a row per part with its count and percentage.
 * Replaces the pie, whose slices and legend were hard to read on a phone.
 */
export function BreakdownList({
  parts,
  emptyMessage,
}: {
  parts: BreakdownInput[];
  emptyMessage: string;
}) {
  const rows = breakdownRows(parts);
  if (rows.length === 0) return <PanelEmpty message={emptyMessage} />;
  return (
    <View>
      <View
        className="flex-row h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-neutral-800"
        accessibilityLabel={rows.map((r) => `${r.label} ${r.percent}%`).join(", ")}
      >
        {rows.map((r) => (
          <View key={r.key} style={{ flex: r.share, backgroundColor: r.color }} />
        ))}
      </View>
      <View className="mt-3">
        {rows.map((r, i) => (
          <View
            key={r.key}
            className={`flex-row items-center gap-3 py-2 ${
              i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
            }`}
          >
            <View
              style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: r.color }}
            />
            <Text className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
              {r.label}
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatNumber(r.value)}
            </Text>
            <Text className="w-10 text-right text-xs text-gray-500 dark:text-gray-400">
              {r.percent}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A "top N" / performance table. The first column takes the remaining width
 * and wraps (names are never cut off with "..."); the others are fixed-width,
 * right-aligned figures.
 */
export function DataTable({
  columns,
  rows,
  emptyMessage,
}: {
  /** [label, width] — the first column's width is ignored (it flexes). */
  columns: [string, number][];
  rows: (string | number)[][];
  emptyMessage: string;
}) {
  if (rows.length === 0) return <PanelEmpty message={emptyMessage} />;
  return (
    <View>
      <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
        {columns.map(([label, width], i) =>
          i === 0 ? (
            <Text
              key={label}
              className="flex-1 pr-2 text-xs font-semibold text-gray-400 dark:text-gray-500"
            >
              {label}
            </Text>
          ) : (
            <Text
              key={label}
              style={{ width }}
              numberOfLines={1}
              className="text-right text-xs font-semibold text-gray-400 dark:text-gray-500"
            >
              {label}
            </Text>
          ),
        )}
      </View>
      {rows.map((row, r) => (
        <View
          key={r}
          // Index-based, so a row's classes never change while it is mounted.
          className={`flex-row items-start py-2.5 ${
            r > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
          }`}
        >
          {row.map((cell, i) =>
            i === 0 ? (
              <Text
                key={i}
                className="flex-1 pr-2 text-sm text-gray-900 dark:text-white"
              >
                {cell}
              </Text>
            ) : (
              <Text
                key={i}
                style={{ width: columns[i]?.[1] }}
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-right text-sm text-gray-700 dark:text-gray-200"
              >
                {cell}
              </Text>
            ),
          )}
        </View>
      ))}
    </View>
  );
}
