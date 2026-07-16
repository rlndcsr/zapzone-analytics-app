import { Feather } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

type Props = {
  page: number;
  lastPage: number;
  perPage: number;
  perPageOptions: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;

  compact?: boolean;
};

// Shared pagination for lists. Supports a full bottom view or a compact top view. Both use the same page state and stay in sync
export function PaginationControls({
  page,
  lastPage,
  perPage,
  perPageOptions,
  onPageChange,
  onPerPageChange,
  compact = false,
}: Props) {
  const { colorScheme } = useColorScheme();
  const atFirst = page <= 1;
  const atLast = page >= lastPage;

  if (compact) {
    const enabledIcon = colorScheme === "dark" ? "#E5E7EB" : "#374151";
    const disabledIcon = "#9CA3AF";
    return (
      <View className="flex-row items-center gap-2 flex-wrap">
        {/* Items per page */}
        <View className="flex-row gap-1">
          {perPageOptions.map((option) => {
            const isActive = perPage === option;
            return (
              <Pressable
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
              </Pressable>
            );
          })}
        </View>

        {/* Previous / page indicator / Next */}
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => onPageChange(page - 1)}
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
          </Pressable>
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 px-0.5">
            {page}/{lastPage}
          </Text>
          <Pressable
            onPress={() => onPageChange(page + 1)}
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
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-1 mb-4">
      <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Items per page
          </Text>
          <View className="flex-row gap-1.5">
            {perPageOptions.map((option) => {
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
                      isActive
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
          <Pressable
            onPress={() => onPageChange(page - 1)}
            disabled={atFirst}
            className={`px-4 py-2 rounded-lg border ${
              atFirst
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                atFirst
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              Previous
            </Text>
          </Pressable>

          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Page {page} of {lastPage}
          </Text>

          <Pressable
            onPress={() => onPageChange(page + 1)}
            disabled={atLast}
            className={`px-4 py-2 rounded-lg border ${
              atLast
                ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                atLast
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
