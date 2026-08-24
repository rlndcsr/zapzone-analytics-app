import { useCallback, useMemo, useState } from "react";

/*
 * Mobile port of the web admin's `useCategoryFilter` — the model behind the
 * calendar's "All / Activities / Birthday / …" tabs. Categories are derived
 * from whatever is on screen (package category for bookings, attraction
 * category for tickets, one bucket for event registrations), so a category only
 * appears when the visible window actually holds something in it.
 *
 * An empty selection means "All": nothing is filtered out.
 */

export type CategorySource = "booking" | "attraction" | "event";

export const EVENTS_CATEGORY_KEY = "__events";
export const UNCATEGORISED_CATEGORY_KEY = "__uncategorised";

export type CalendarCategory = {
  key: string;
  label: string;
  /** Rows in this category — bookings + tickets + registrations, not quantity. */
  count: number;
  sources: CategorySource[];
};

export type CategoryFilterState = {
  categories: CalendarCategory[];
  selected: string[];
  isAll: boolean;
  /** Total across every category — the count shown on the "All" tab. */
  total: number;
  shows: (key: string) => boolean;
  toggle: (key: string) => void;
  showAll: () => void;
};

/** "" / null / whitespace all collapse to the "No category" bucket. */
export const categoryKeyOf = (value?: string | null): string => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? UNCATEGORISED_CATEGORY_KEY : trimmed;
};

export const categoryLabelOf = (key: string): string => {
  if (key === EVENTS_CATEGORY_KEY) return "Events";
  if (key === UNCATEGORISED_CATEGORY_KEY) return "No category";
  return key;
};

/** Real categories first (A→Z), then Events, then No category — as on the web. */
const sortCategories = (a: CalendarCategory, b: CalendarCategory): number => {
  const rank = (key: string) =>
    key === EVENTS_CATEGORY_KEY ? 1 : key === UNCATEGORISED_CATEGORY_KEY ? 2 : 0;
  if (rank(a.key) !== rank(b.key)) return rank(a.key) - rank(b.key);
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
};

/**
 * Collect the categories present in one window of calendar data. Each row
 * counts once, and a category tracks every source it came from so the tab can
 * be tinted (blue = bookings, purple = tickets, amber = events, grey = mixed).
 */
export function buildCalendarCategories(input: {
  /** Package category per booking. */
  bookings?: { packageCategory?: string | null }[];
  /** Attraction category per ticket purchase. */
  attractions?: { category?: string | null }[];
  /** Registrations — all in one "Events" bucket, like the web. */
  events?: unknown[];
}): CalendarCategory[] {
  const found = new Map<string, CalendarCategory>();

  const add = (key: string, source: CategorySource) => {
    const existing = found.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    found.set(key, {
      key,
      label: categoryLabelOf(key),
      count: 1,
      sources: [source],
    });
  };

  (input.bookings ?? []).forEach((b) =>
    add(categoryKeyOf(b.packageCategory), "booking"),
  );
  (input.attractions ?? []).forEach((p) =>
    add(categoryKeyOf(p.category), "attraction"),
  );
  (input.events ?? []).forEach(() => add(EVENTS_CATEGORY_KEY, "event"));

  return [...found.values()].sort(sortCategories);
}

/**
 * Selection state for {@link buildCalendarCategories}. Keys that vanish from the
 * data (a month with no birthdays, say) drop out of the selection on their own,
 * so the calendar can never end up filtered to nothing by a stale key.
 */
export function useCategoryFilter(
  categories: CalendarCategory[],
): CategoryFilterState {
  const [chosen, setChosen] = useState<string[]>([]);

  const selected = useMemo(
    () => chosen.filter((key) => categories.some((c) => c.key === key)),
    [chosen, categories],
  );

  const total = useMemo(
    () => categories.reduce((sum, c) => sum + c.count, 0),
    [categories],
  );

  const isAll = selected.length === 0;
  const shows = useCallback(
    (key: string) => selected.length === 0 || selected.includes(key),
    [selected],
  );

  return {
    categories,
    selected,
    isAll,
    total,
    shows,
    toggle: (key) =>
      setChosen(
        selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key],
      ),
    showAll: () => setChosen([]),
  };
}

/** A category's tint source; "mixed" when bookings and tickets share it. */
export const sourceOf = (
  category: CalendarCategory,
): CategorySource | "mixed" =>
  category.sources.length > 1 ? "mixed" : (category.sources[0] ?? "booking");
