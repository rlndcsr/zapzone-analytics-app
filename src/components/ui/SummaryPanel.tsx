import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";

export type SummaryFigure = {
  icon: FeatherIconName;
  title: string;
  value: string;
  hint: string;
};

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile — the same panel as Manage Attractions / Packages.
 */
const SummaryCell = ({
  icon,
  title,
  value,
  hint,
  divideLeft = false,
  divideTop = false,
}: SummaryFigure & { divideLeft?: boolean; divideTop?: boolean }) => (
  <View
    className={`flex-1 p-4 ${
      divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
    } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
      </Text>
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
    >
      {value}
    </Text>
    <Text
      numberOfLines={1}
      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
    >
      {hint}
    </Text>
  </View>
);

/**
 * Figures in one bordered panel, two per row (pairs with
 * AttractionsSummarySkeleton). An odd last figure spans the full row.
 */
export const SummaryPanel = ({ figures }: { figures: SummaryFigure[] }) => {
  const rows: SummaryFigure[][] = [];
  for (let i = 0; i < figures.length; i += 2) rows.push(figures.slice(i, i + 2));
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      {rows.map((row, r) => (
        <View key={r} className="flex-row">
          {row.map((figure, c) => (
            <SummaryCell
              key={figure.title}
              {...figure}
              divideTop={r > 0}
              divideLeft={c > 0}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

/** A filter chip in the shared chip-row style (dark when selected). */
export const FilterChip = ({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-70 ${
      selected
        ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white"
        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
    }`}
  >
    <Text
      className={`text-sm font-medium ${
        selected ? "text-white dark:text-gray-900" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
    {count != null && (
      <Text
        className={`text-sm ${
          selected ? "text-white/70 dark:text-gray-900/60" : "text-gray-400"
        }`}
      >
        {count}
      </Text>
    )}
  </Pressable>
);

/** Status pill with a dot — green when on, gray when off. */
export const StatusDotBadge = ({ on, label }: { on: boolean; label: string }) => (
  <View
    className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-full ${
      on ? "bg-green-50 dark:bg-green-900/30" : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <View
      className={`w-1.5 h-1.5 rounded-full ${on ? "bg-green-500" : "bg-gray-400"}`}
    />
    <Text
      className={`text-xs font-medium ${
        on ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
      }`}
    >
      {label}
    </Text>
  </View>
);

/** One labelled cell of a card's spec strip (e.g. Value / Balance / Usage). */
export const SpecCell = ({
  label,
  value,
  valueClassName = "text-gray-900 dark:text-white",
  divider = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">{label}</Text>
    <Text
      numberOfLines={1}
      className={`text-sm font-semibold mt-0.5 ${valueClassName}`}
    >
      {value}
    </Text>
  </View>
);

/** Section header above a list: title + count, optional trailing control. */
export const ListHeader = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children?: ReactNode;
}) => (
  <View className="flex-row items-center justify-between gap-2 mb-3">
    <View className="flex-row items-baseline gap-2 shrink">
      <Text
        numberOfLines={1}
        className="shrink text-base font-semibold text-gray-900 dark:text-white"
      >
        {title}
      </Text>
      <Text className="text-sm text-gray-400 dark:text-gray-500">{count}</Text>
    </View>
    {children}
  </View>
);

/** The Filters button beside the search box, with an applied-count badge. */
export const FiltersButton = ({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={count > 0 ? `Filters, ${count} applied` : "Filters"}
    className={`flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border active:opacity-70 ${
      count > 0
        ? "bg-blue-50 dark:bg-blue-900/30 border-[#0644C7]/40"
        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
    }`}
  >
    <Feather name="sliders" size={15} color={count > 0 ? "#0644C7" : "#6B7280"} />
    <Text
      className={`text-sm font-medium ${
        count > 0 ? "text-[#0644C7] dark:text-blue-300" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      Filters
    </Text>
    {count > 0 && (
      <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0644C7] items-center justify-center">
        <Text className="text-[10px] font-bold text-white">{count}</Text>
      </View>
    )}
  </Pressable>
);

/** "N filters applied · Clear all" under the search row. */
export const AppliedFiltersHint = ({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) =>
  count > 0 ? (
    <View className="flex-row items-center justify-between mb-3 -mt-1">
      <Text className="text-xs text-gray-500 dark:text-gray-400">
        {count} {count === 1 ? "filter" : "filters"} applied
      </Text>
      <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
        <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
          Clear all
        </Text>
      </Pressable>
    </View>
  ) : null;

/** Square icon button used in list toolbars (e.g. Columns). */
export const ToolbarIconButton = ({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-9 h-9 rounded-xl items-center justify-center active:opacity-70 ${
      active ? "bg-blue-50 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Feather name={icon} size={16} color={active ? "#0644C7" : "#6B7280"} />
  </Pressable>
);

/** Error banner used when nothing cached can be shown. */
export const ListErrorBanner = ({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) => (
  <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
    <Feather name="alert-circle" size={18} color="#DC2626" />
    <View className="flex-1">
      <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
        {title}
      </Text>
      <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
        accessibilityRole="button"
      >
        <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
          Try again
        </Text>
      </Pressable>
    </View>
  </View>
);

/** Empty state card: icon, title, message, and one action. */
export const ListEmptyState = ({
  icon,
  title,
  message,
  actionLabel,
  actionIcon,
  primary = false,
  onAction,
}: {
  icon: FeatherIconName;
  title: string;
  message: string;
  actionLabel?: string;
  actionIcon?: FeatherIconName;
  /** Solid blue action (create) vs. outlined (clear filters). */
  primary?: boolean;
  onAction?: () => void;
}) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
    <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
      <Feather name={icon} size={20} color="#9CA3AF" />
    </View>
    <Text className="text-base font-semibold text-gray-900 dark:text-white">
      {title}
    </Text>
    <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
      {message}
    </Text>
    {!!actionLabel && !!onAction && (
      <Pressable
        onPress={onAction}
        className={`flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl ${
          primary
            ? "bg-[#0644C7] active:opacity-90"
            : "border border-gray-200 dark:border-neutral-700 active:opacity-70"
        }`}
        accessibilityRole="button"
      >
        {!!actionIcon && (
          <Feather name={actionIcon} size={15} color={primary ? "#FFFFFF" : "#374151"} />
        )}
        <Text
          className={`text-sm font-semibold ${
            primary ? "text-white" : "text-gray-700 dark:text-gray-200"
          }`}
        >
          {actionLabel}
        </Text>
      </Pressable>
    )}
  </View>
);
