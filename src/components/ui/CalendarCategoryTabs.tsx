import { Pressable, ScrollView, Text, View } from "react-native";

import {
  sourceOf,
  type CalendarCategory,
  type CategoryFilterState,
  type CategorySource,
} from "../../lib/calendar/categoryFilter";

/**
 * Tab tints by source, matching the web's CalendarCategoryTabs: blue for
 * package bookings, purple for attraction tickets, amber for event
 * registrations, slate when a category holds more than one.
 */
const TONE: Record<
  CategorySource | "mixed",
  { on: string; off: string; count: string }
> = {
  booking: {
    on: "bg-blue-600 border-blue-600",
    off: "bg-white dark:bg-neutral-900 border-blue-200 dark:border-blue-900/50",
    count: "text-blue-400",
  },
  attraction: {
    on: "bg-purple-600 border-purple-600",
    off: "bg-white dark:bg-neutral-900 border-purple-200 dark:border-purple-900/50",
    count: "text-purple-400",
  },
  event: {
    on: "bg-amber-600 border-amber-600",
    off: "bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/50",
    count: "text-amber-500",
  },
  mixed: {
    on: "bg-slate-700 border-slate-700",
    off: "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-700",
    count: "text-slate-400",
  },
};

const LABEL_OFF: Record<CategorySource | "mixed", string> = {
  booking: "text-blue-700 dark:text-blue-300",
  attraction: "text-purple-700 dark:text-purple-300",
  event: "text-amber-700 dark:text-amber-300",
  mixed: "text-slate-700 dark:text-gray-200",
};

const HINT: Record<CategorySource | "mixed", string> = {
  booking: "package bookings",
  attraction: "attraction tickets",
  event: "event registrations",
  mixed: "bookings and attraction tickets",
};

function Tab({
  label,
  count,
  on,
  wrap,
  text,
  countText,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  count: number;
  on: boolean;
  wrap: string;
  text: string;
  countText: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel}
      className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-70 ${wrap}`}
    >
      <Text className={`text-sm font-medium ${text}`}>{label}</Text>
      <Text className={`text-sm ${countText}`}>{count}</Text>
    </Pressable>
  );
}

/**
 * "All / Activities / Birthday / …" category tabs above the calendar — the
 * mobile counterpart of the web admin's CalendarCategoryTabs. Tapping a tab
 * toggles it (several can be on at once); "All" clears the selection. Hidden
 * when the window holds fewer than two categories, since one tab filters
 * nothing — the same rule the web uses.
 */
export function CalendarCategoryTabs({ filter }: { filter: CategoryFilterState }) {
  if (filter.categories.length < 2) return null;

  const tab = (category: CalendarCategory) => {
    const on = filter.selected.includes(category.key);
    const source = sourceOf(category);
    const tone = TONE[source];
    return (
      <Tab
        key={category.key}
        label={category.label}
        count={category.count}
        on={on}
        wrap={on ? tone.on : tone.off}
        text={on ? "text-white" : LABEL_OFF[source]}
        countText={on ? "text-white/80" : tone.count}
        accessibilityLabel={`${category.label}, ${category.count} ${HINT[source]}`}
        onPress={() => filter.toggle(category.key)}
      />
    );
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 4 }}
      className="mb-4 -mx-1 px-1"
    >
      <View className="flex-row items-center gap-2">
        <Tab
          label="All"
          count={filter.total}
          on={filter.isAll}
          wrap={
            filter.isAll
              ? "bg-gray-900 border-gray-900"
              : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
          }
          text={filter.isAll ? "text-white" : "text-gray-700 dark:text-gray-200"}
          countText={filter.isAll ? "text-white/80" : "text-gray-400"}
          accessibilityLabel={`Show all ${filter.total} scheduled items`}
          onPress={filter.showAll}
        />
        {filter.categories.map(tab)}
      </View>
    </ScrollView>
  );
}
