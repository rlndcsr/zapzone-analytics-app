import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  sourceOf,
  type CalendarCategory,
  type CategoryFilterState,
  type CategorySource,
} from "../../lib/calendar/categoryFilter";
import { SkeletonBlock, usePulse } from "./skeleton/SkeletonBlock";

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

/** The scrolling row both the real tabs and their placeholders sit in, so the
 *  two reserve identical space. */
function TabRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 4 }}
      className="mb-4 -mx-1 px-1"
    >
      <View className="flex-row items-center gap-2">{children}</View>
    </ScrollView>
  );
}

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

/** Varied bar widths so the placeholder row reads as pills rather than a
 *  repeating pattern. Deliberately nameless — no category is known yet. */
const PLACEHOLDER_WIDTHS = ["w-8", "w-16", "w-12", "w-20", "w-14"];

/**
 * A placeholder pill. Carries the real Tab's box — the same border, px-3.5 and
 * py-1.5 around a text-sm line — so a placeholder row stands exactly as tall as
 * the row of real tabs that replaces it.
 */
function TabPlaceholder({
  pulse,
  width,
}: {
  pulse: ReturnType<typeof usePulse>;
  width: string;
}) {
  return (
    <View className="flex-row items-center rounded-full border border-gray-200 bg-white px-3.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
      <View className="h-5 justify-center">
        <SkeletonBlock pulse={pulse} className={`${width} h-3.5`} />
      </View>
    </View>
  );
}

/**
 * Stands in for the row on a cold load, before any booking has arrived to build
 * categories from. Pulses off the same shared helper as the calendar skeleton
 * below it, so the two loading areas breathe together.
 */
function TabsSkeleton() {
  const pulse = usePulse();

  return (
    <TabRow>
      {PLACEHOLDER_WIDTHS.map((width, index) => (
        <TabPlaceholder key={index} pulse={pulse} width={width} />
      ))}
    </TabRow>
  );
}

/**
 * "All / Activities / Birthday / …" category tabs above the calendar — the
 * mobile counterpart of the web admin's CalendarCategoryTabs. Tapping a tab
 * toggles it (several can be on at once); "All" clears the selection. Hidden
 * when the window holds fewer than two categories, since one tab filters
 * nothing — the same rule the web uses.
 */
export function CalendarCategoryTabs({
  filter,
  loading = false,
}: {
  filter: CategoryFilterState;
  /** True while bookings are in flight. Only consulted when no categories exist
   *  yet, to tell "nothing has arrived" apart from "nothing to show". */
  loading?: boolean;
}) {
  // A cold load: the window's bookings haven't arrived, so no category can be
  // built yet. Hold the row's place rather than let the calendar sit up here
  // and jump down once the real tabs appear. Once anything is known the normal
  // visibility rule below takes over, placeholders included.
  if (loading && filter.categories.length === 0) return <TabsSkeleton />;

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
    <TabRow>
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
    </TabRow>
  );
}
