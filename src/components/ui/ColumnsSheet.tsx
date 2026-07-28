import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

export type ColumnMeta = {
  key: string;
  label: string;
  /** Heading this column sits under. */
  group: string;
  /** Rendered greyed-out and non-interactive — always visible. */
  lockVisible: boolean;
};

/**
 * "Toggle Columns" picker — the mobile counterpart of the web admin table's
 * Columns dropdown: checkboxes grouped by section, with Show All / Reset. The
 * caller owns the visible-key set, so the choice can persist per screen.
 */
export function ColumnsSheet({
  visible,
  columns,
  visibleKeys,
  onToggle,
  onShowAll,
  onReset,
  onClose,
  title = "Toggle Columns",
}: {
  visible: boolean;
  columns: ColumnMeta[];
  visibleKeys: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onReset: () => void;
  onClose: () => void;
  title?: string;
}) {
  // Preserve column order while collecting each group's members.
  const groups = useMemo(() => {
    const out = new Map<string, ColumnMeta[]>();
    columns.forEach((c) => {
      if (!out.has(c.group)) out.set(c.group, []);
      out.get(c.group)!.push(c);
    });
    return [...out.entries()];
  }, [columns]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
        {groups.map(([group, groupColumns]) => (
          <View key={group} className="mb-3">
            <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {group}
            </Text>
            {groupColumns.map((column) => {
              const checked = column.lockVisible || visibleKeys.has(column.key);
              return (
                <Pressable
                  key={column.key}
                  onPress={() => !column.lockVisible && onToggle(column.key)}
                  disabled={column.lockVisible}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked,
                    disabled: column.lockVisible,
                  }}
                  accessibilityLabel={column.label}
                  className={`flex-row items-center gap-2.5 rounded-lg px-1 py-2.5 ${
                    column.lockVisible ? "opacity-50" : "active:bg-gray-50 dark:active:bg-neutral-800"
                  }`}
                >
                  <Feather
                    name={checked ? "check-square" : "square"}
                    size={18}
                    color={checked ? PRIMARY : "#9CA3AF"}
                  />
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    {column.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View className="mt-1 mb-6 flex-row gap-4 border-t border-gray-100 pt-3 dark:border-neutral-800">
          <Pressable onPress={onShowAll} hitSlop={8}>
            <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
              Show All
            </Text>
          </Pressable>
          <Pressable onPress={onReset} hitSlop={8}>
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Reset
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
