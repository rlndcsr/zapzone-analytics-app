import { Feather } from "@expo/vector-icons";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

import type { KeyMetric } from "../../services/analyticsService";

export const PRIMARY = "#0644C7";

export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** Any lucide icon — same family the web pages use, so glyphs match exactly. */
export type LucideIcon = React.ComponentType<{ size?: number; color?: string }>;

/** "$14,494.62" with thousands separators. */
export const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Thousands-separated count. Never rounds: whole numbers print clean ("1,204")
 * but a fractional value keeps its decimals rather than being silently rounded
 * to the nearest integer, so a card always shows the value the API sent.
 */
export const count = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A tile carrying a plain gray sub-line — a key metric with only `info`. */
export const noteMetric = (info: string): KeyMetric => ({
  value: 0,
  change: null,
  info,
  trend: null,
});

/**
 * One `key_metrics` card, laid out like the web's: label, big value, then the
 * change line (green when trending up, red otherwise) or the gray info note,
 * with the tinted icon tile on the right.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  valueSuffix,
  metric,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Muted continuation of the value, e.g. the " / 1,518" on Adults / Minors. */
  valueSuffix?: string;
  metric: KeyMetric;
}) {
  const changeColor =
    metric.trend === "up"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
  return (
    // The wrapper stretches to the tallest tile on its row; `flex-1` on the
    // card itself makes the white box fill that height, so a tile with a
    // shorter change/info line is never left smaller than its neighbour.
    <View className="w-1/2 p-1.5">
      <View
        className="flex-1 bg-white dark:bg-neutral-900 rounded-xl p-4 border border-gray-100 dark:border-neutral-800"
        style={CARD_SHADOW}
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text
              className="text-sm font-medium text-gray-600 dark:text-gray-400"
              numberOfLines={2}
            >
              {label}
            </Text>
            <Text
              className="text-2xl font-bold text-gray-900 dark:text-white mt-1"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {value}
              {valueSuffix ? (
                <Text className="font-normal text-gray-400 dark:text-gray-500">
                  {valueSuffix}
                </Text>
              ) : null}
            </Text>
            {metric.change ? (
              <Text className={`text-xs mt-1 ${changeColor}`} numberOfLines={2}>
                {metric.change}
              </Text>
            ) : metric.info ? (
              <Text
                className="text-xs mt-1 text-gray-600 dark:text-gray-400"
                numberOfLines={2}
              >
                {metric.info}
              </Text>
            ) : null}
          </View>
          <View className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
            <Icon size={18} color={PRIMARY} />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Chart card. Mirrors the web panel header: title on the left with the same
 * hover-tooltip copy behind a tappable ⓘ, and the section's gray icon on the
 * right.
 */
export function Panel({
  icon,
  title,
  info,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** The web's tooltip text for this panel, shown in an alert when tapped. */
  info?: string;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center justify-between gap-2 mb-3">
        <View className="flex-row items-center gap-1.5 flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-white shrink">
            {title}
          </Text>
          {!!info && (
            <Pressable onPress={() => Alert.alert(title, info)} hitSlop={8}>
              <Feather name="info" size={13} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
        <Icon size={16} color="#9CA3AF" />
      </View>
      {children}
    </View>
  );
}

/** Header row + rows for the web's "top N" / performance tables. */
export function TableCard({
  icon: Icon,
  title,
  columns,
  rows,
  empty,
}: {
  icon: LucideIcon;
  title: string;
  /** [label, width] — the first column flexes, the rest are fixed + right-aligned. */
  columns: [string, number][];
  rows: (string | number)[][];
  empty: string;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Icon size={18} color={PRIMARY} />
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
      </View>
      {rows.length === 0 ? (
        <Text className="text-sm text-gray-400 dark:text-gray-500">{empty}</Text>
      ) : (
        <>
          <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
            {columns.map(([label, width], i) => (
              <Text
                key={label}
                style={i === 0 ? undefined : { width }}
                className={`text-[10px] font-semibold uppercase text-gray-400 ${
                  i === 0 ? "flex-1" : "text-right"
                }`}
              >
                {label}
              </Text>
            ))}
          </View>
          {rows.map((row, r) => (
            <View
              key={r}
              className="flex-row items-center py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
            >
              {row.map((cell, i) => (
                <Text
                  key={i}
                  style={i === 0 ? undefined : { width: columns[i][1] }}
                  numberOfLines={1}
                  className={
                    i === 0
                      ? "flex-1 text-xs text-gray-700 dark:text-gray-200 mr-2"
                      : "text-right text-xs text-gray-600 dark:text-gray-300"
                  }
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
