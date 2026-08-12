import { Feather } from "@expo/vector-icons";
import React, { useState, type ComponentProps } from "react";
import { Pressable, Text } from "react-native";

import { FilterOptionSheet } from "./FilterOptionSheet";

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

      <FilterOptionSheet
        visible={open}
        title={title}
        value={value}
        options={options}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
