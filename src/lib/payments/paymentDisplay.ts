// Display helpers for payment rows, identical to the ones Manage Payments has
// always used, so the Deleted Payments and Package Invoices screens render a
// payment exactly as the list does.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const money = (n: number) => `$${n.toFixed(2)}`;

/** ISO -> "Jul 9, 2026, 4:05 PM". */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

/** Pill classes for a payment status. */
export function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "pending":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "refunded":
    case "voided":
      return { pill: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}
