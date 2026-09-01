/**
 * Shortcut buttons for the two booking-window fields on the package forms,
 * mirroring the web's rows so Create and Edit offer the same choices.
 */

/** How far ahead a customer may book, in days. The web labels these by month. */
export const BOOKING_WINDOW_PRESETS = Array.from({ length: 12 }, (_, i) => ({
  label: `${i + 1}mo`,
  days: (i + 1) * 30,
}));

/** How close to the slot a customer may still book, in hours. */
export const ADVANCE_NOTICE_PRESETS: { label: string; hours: number }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1} h`,
    hours: i + 1,
  })),
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "4 days", hours: 96 },
  { label: "5 days", hours: 120 },
  { label: "6 days", hours: 144 },
  { label: "1 week", hours: 168 },
  { label: "2 weeks", hours: 336 },
  { label: "3 weeks", hours: 504 },
  { label: "4 weeks", hours: 672 },
];

/**
 * "3 months" when a day count lands on a whole 30-day multiple, else "" — the
 * parenthetical the web shows beside a chosen window.
 */
export function bookingWindowMonthsLabel(days: number | null): string {
  if (days == null || days <= 0 || days % 30 !== 0) return "";
  const months = days / 30;
  return `${months} month${months === 1 ? "" : "s"}`;
}
