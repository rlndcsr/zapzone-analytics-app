import { Feather } from "@expo/vector-icons";
import React, { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

export type SheetSelectOption = { label: string; value: string | number };

/**
 * A dropdown that mirrors the Attractions screen's control design: a bordered
 * trigger button (optional leading icon + current value + chevron) that opens a
 * BottomSheet list with the selected row highlighted. Used for the analytics
 * filters so every screen's dropdowns look and behave the same.
 *
 * The trigger has no fixed width — wrap it in a `flex-1` View to size it.
 */
export function SheetSelect({
  icon,
  title,
  placeholder = "Select...",
  value,
  options,
  onSelect,
}: {
  icon?: ComponentProps<typeof Feather>["name"];
  title: string;
  placeholder?: string;
  value: string | number | null;
  options: SheetSelectOption[];
  onSelect: (value: string | number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
      >
        {icon ? <Feather name={icon} size={16} color={PRIMARY} /> : null}
        <Text
          className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={14} color="#9CA3AF" />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={String(option.value)}
                onPress={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
