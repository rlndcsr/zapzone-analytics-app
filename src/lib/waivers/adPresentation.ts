import { formatShortDate } from "../date/calendar.ts";

const MAX_NAMED_LOCATIONS = 2;

export function describeAdTargets(locationNames: string[]): string {
  const names = locationNames.filter((n) => !!n && n.trim() !== "");
  if (names.length === 0) return "All locations";
  if (names.length <= MAX_NAMED_LOCATIONS) return names.join(", ");
  return `${names.length} locations`;
}

export function describeAdSchedule(ad: {
  startsAt?: string | null;
  endsAt?: string | null;
}): string {
  if (!ad.startsAt && !ad.endsAt) return "Always shown";
  const day = (v: string | null | undefined) =>
    v ? formatShortDate(v.slice(0, 10)) : null;
  const from = day(ad.startsAt);
  const to = day(ad.endsAt);

  return `${from ? `From ${from}` : "No start date"} · ${
    to ? `until ${to}` : "no end date"
  }`;
}
