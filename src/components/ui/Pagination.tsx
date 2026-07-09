import React from "react";
import { Pressable, Text, View } from "react-native";

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
 */
export function Pagination({
  page,
  perPage,
  total,
  options = DEFAULT_OPTIONS,
  onPageChange,
  onPerPageChange,
}: {
  page: number;
  perPage: number;
  total: number;
  options?: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}) {
  if (total === 0) return null;

  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), lastPage);

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
                <Pressable
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
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Previous / page / next */}
        <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
          <Pressable
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
          </Pressable>

          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Page {current} of {lastPage}
          </Text>

          <Pressable
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
          </Pressable>
        </View>
      </View>
    </View>
  );
}
