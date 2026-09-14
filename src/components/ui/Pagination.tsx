import { Feather } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import React from "react";
import { Text, View } from "react-native";

import { PressableScale } from "./motion/PressableScale";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const DEFAULT_OPTIONS = [5, 10, 15];

/**
 * Shared list pagination card — an "Items per page" selector plus
 * Previous / "Page X of Y" / Next. Matches the Attraction Purchases pager so
 * every paged list looks and behaves identically. Page numbers are 1-indexed.
 *
 * With `compact`, renders a slim inline row (per-page chips + ‹ x/y › arrows)
 * for placing at the top of a list below its title. Both variants are driven by
 * the same props, so a top and bottom instance stay perfectly in sync.
 */
export function Pagination({
  page,
  perPage,
  total,
  options = DEFAULT_OPTIONS,
  onPageChange,
  onPerPageChange,
  compact = false,
}: {
  page: number;
  perPage: number;
  total: number;
  options?: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  compact?: boolean;
}) {
  const { colorScheme } = useColorScheme();

  if (total === 0) return null;

  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), lastPage);

  if (compact) {
    const atFirst = current === 1;
    const atLast = current >= lastPage;
    const enabledIcon = colorScheme === "dark" ? "#E5E7EB" : "#374151";
    const disabledIcon = "#9CA3AF";
    return (
      <View className="flex-row items-center gap-2 flex-wrap mb-4">
        {/* Items per page */}
        <View className="flex-row gap-1">
          {options.map((option) => {
            const isActive = perPage === option;
            return (
              <PressableScale
                key={option}
                onPress={() => onPerPageChange(option)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${option} per page`}
                className={`px-2.5 py-1 rounded-lg border ${
                  isActive
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    isActive ? "text-white" : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {option}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {/* Previous / page indicator / Next */}
        <View className="flex-row items-center gap-1">
          <PressableScale
            onPress={() => onPageChange(current - 1)}
            disabled={atFirst}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            className={`w-7 h-7 items-center justify-center rounded-lg border ${
              atFirst
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Feather
              name="chevron-left"
              size={16}
              color={atFirst ? disabledIcon : enabledIcon}
            />
          </PressableScale>
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 px-0.5">
            {current}/{lastPage}
          </Text>
          <PressableScale
            onPress={() => onPageChange(current + 1)}
            disabled={atLast}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Next page"
            className={`w-7 h-7 items-center justify-center rounded-lg border ${
              atLast
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Feather
              name="chevron-right"
              size={16}
              color={atLast ? disabledIcon : enabledIcon}
            />
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-1 mb-4">
      <View
        className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
        style={CARD_SHADOW}
      >
        {/* Items per page */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Items per page
          </Text>
          <View className="flex-row gap-1.5">
            {options.map((option) => {
              const isActive = perPage === option;
              return (
                <PressableScale
                  key={option}
                  onPress={() => onPerPageChange(option)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    isActive
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      isActive ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {option}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Previous / page / next */}
        <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
          <PressableScale
            onPress={() => onPageChange(current - 1)}
            disabled={current === 1}
            className={`px-4 py-2 rounded-lg border ${
              current === 1
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                current === 1
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              Previous
            </Text>
          </PressableScale>

          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Page {current} of {lastPage}
          </Text>

          <PressableScale
            onPress={() => onPageChange(current + 1)}
            disabled={current >= lastPage}
            className={`px-4 py-2 rounded-lg border ${
              current >= lastPage
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                current >= lastPage
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              Next
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
