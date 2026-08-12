import { Feather } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";

export type FilterOption = { label: string; value: string | number };

/**
 * The single-choice dropdown list every filter on every screen opens — the
 * Bookings status/date sheet, extracted so a {@link FilterPill} segment and
 * {@link SheetSelect}'s bordered trigger share one option-row design instead of
 * each keeping its own copy.
 */
export function FilterOptionSheet({
  visible,
  title,
  value,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: string | number | null;
  options: FilterOption[];
  onSelect: (value: string | number) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              className={`mb-1 flex-row items-center justify-between rounded-xl px-4 py-3.5 ${
                isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                className={`mr-2 flex-1 text-base font-medium ${
                  isSelected
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-200"
                }`}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {isSelected && (
                <View className="h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
