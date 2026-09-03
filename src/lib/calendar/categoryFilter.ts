import { useCallback, useMemo, useState } from "react";

import { normalizeCategory } from "../venueCategories.ts";

export type CategorySource = "booking" | "attraction" | "event";

export const EVENTS_CATEGORY_KEY = "__events";
export const UNCATEGORISED_CATEGORY_KEY = "__uncategorised";

export type CalendarCategory = {
  key: string;
  label: string;
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

export const categoryKeyOf = (value?: string | null): string => {
  const normalized = normalizeCategory(value);
  return normalized === "" ? UNCATEGORISED_CATEGORY_KEY : normalized;
};

export const categoryLabelOf = (key: string): string => {
  if (key === EVENTS_CATEGORY_KEY) return "Events";
  if (key === UNCATEGORISED_CATEGORY_KEY) return "No category";
  return key;
};

/** Real categories first (A→Z), then Events, then No category — as on the web. */
const sortCategories = (a: CalendarCategory, b: CalendarCategory): number => {
  const rank = (key: string) =>
    key === EVENTS_CATEGORY_KEY
      ? 1
      : key === UNCATEGORISED_CATEGORY_KEY
        ? 2
        : 0;
  if (rank(a.key) !== rank(b.key)) return rank(a.key) - rank(b.key);
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
};

export function buildCalendarCategories(input: {
  bookings?: { packageCategory?: string | null }[];
  attractions?: { category?: string | null }[];
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

export const sourceOf = (
  category: CalendarCategory,
): CategorySource | "mixed" =>
  category.sources.length > 1 ? "mixed" : (category.sources[0] ?? "booking");
