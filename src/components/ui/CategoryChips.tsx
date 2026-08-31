import { Pressable, ScrollView, Text } from "react-native";

import {
  categoryKeyOf,
  categoryLabelOf,
  UNCATEGORISED_CATEGORY_KEY,
} from "../../lib/calendar/categoryFilter";

/** The "no filter" value, matching the other list filters ("all"). */
export const ALL_CATEGORIES = "all";

export type CategoryChipOption = {
  value: string;
  label: string;
  count: number;
};

export function buildCategoryOptions(
  values: (string | null | undefined)[],
): CategoryChipOption[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = categoryKeyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: categoryLabelOf(value),
      count,
    }))
    .sort((a, b) => {
      const rank = (o: CategoryChipOption) =>
        o.value === UNCATEGORISED_CATEGORY_KEY ? 1 : 0;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
}

function Chip({
  label,
  count,
  on,
  onPress,
}: {
  label: string;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "record" : "records"}`}
      className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-70 ${
        on
          ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white"
          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          on
            ? "text-white dark:text-gray-900"
            : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
      <Text
        className={`text-sm ${
          on ? "text-white/70 dark:text-gray-900/60" : "text-gray-400"
        }`}
      >
        {count}
      </Text>
    </Pressable>
  );
}

export function CategoryChips({
  options,
  value,
  onChange,
  totalCount,
  allLabel = "All",
}: {
  options: CategoryChipOption[];
  value: string;
  onChange: (next: string) => void;
  totalCount: number;
  allLabel?: string;
}) {
  if (options.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 4, gap: 8 }}
      className="mb-4 -mx-1 px-1"
    >
      <Chip
        label={allLabel}
        count={totalCount}
        on={value === ALL_CATEGORIES}
        onPress={() => onChange(ALL_CATEGORIES)}
      />
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          count={option.count}
          on={value === option.value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}
