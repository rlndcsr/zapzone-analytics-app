/**
 * Relative age of a timestamp — "Just now", "12m ago", "3h ago", "5d ago".
 *
 * Past about a month the relative form stops being useful ("47d ago" tells you
 * less than a date), so it hands off to `formatOlder`. Callers pass the venue's
 * date formatter there: a phone in another timezone would otherwise date the
 * row a day off from what the web admin shows.
 *
 * Kept free of runtime imports so it stays unit-testable, and `now` is
 * injectable so the boundaries can be checked without freezing the clock.
 */
export function timeAgo(
  value: string | null | undefined,
  {
    now = Date.now(),
    formatOlder,
  }: {
    now?: number;
    formatOlder?: (value: string) => string;
  } = {},
): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";

  const mins = Math.floor((now - then) / 60000);
  // Clock skew that puts a timestamp slightly in the future reads as "Just now"
  // rather than a negative age.
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;

  return formatOlder ? formatOlder(value) : `${days}d ago`;
}
