/**
 * Splits a notification list into "Today" and "Earlier", the two headings the
 * list shows above its rows.
 *
 * The comparison is on calendar day, not elapsed hours: something from 11pm
 * last night is "Earlier" at 1am even though it is two hours old. `dayKey` is
 * injected so the caller decides which clock draws the boundary — the app pins
 * this to the venue's timezone, so a phone abroad groups rows the same way the
 * web admin does.
 */
export type NotificationGroup<T> = {
  title: "Today" | "Earlier";
  items: T[];
};

export function groupByDay<T>(
  items: T[],
  {
    createdAt,
    dayKey,
    today,
  }: {
    /** The row's timestamp. */
    createdAt: (item: T) => string | null | undefined;
    /** Timestamp to a comparable calendar-day key, e.g. "2026-08-31". */
    dayKey: (value: string) => string;
    /** Today's key, in the same form. */
    today: string;
  },
): NotificationGroup<T>[] {
  const todayItems: T[] = [];
  const earlier: T[] = [];

  for (const item of items) {
    const value = createdAt(item);
    // An undated row is not "today" — it sinks to Earlier rather than being
    // dropped, so nothing silently disappears from the list.
    if (value && dayKey(value) === today) todayItems.push(item);
    else earlier.push(item);
  }

  const groups: NotificationGroup<T>[] = [];
  if (todayItems.length > 0) groups.push({ title: "Today", items: todayItems });
  if (earlier.length > 0) groups.push({ title: "Earlier", items: earlier });
  return groups;
}
