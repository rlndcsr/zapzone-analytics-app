import type { PurchaseRow } from "../../services/attractionPurchasesService";
import type { CalendarBooking } from "../../services/bookingsService";
import type { EventPurchaseRow } from "../../services/eventPurchasesService";
import { timeToMinutes } from "../time.ts";
import { normalizeCategory } from "../venueCategories.ts";

/*
 * Activity by Category — one day's bookings, attraction tickets and event
 * registrations, grouped by what the guest is here to do (web parity:
 * components/admin/dashboard/activityCategories.ts). A row lands in a bucket
 * by its category, not by the table it came from: an escape room sold as an
 * attraction ticket counts as an escape room. Kept free of React so the rules
 * can be unit-tested.
 */

export type ActivityBucketKey =
  "party_packages" | "attractions" | "escape_rooms" | "rage_rooms" | "events";

export const RAGE_ROOM_CATEGORY = "Rage Room";
export const ESCAPE_ROOM_CATEGORY = "Escape Room";

const RAGE_ROOM_ALIASES = new Set([
  "rage room",
  "rage rooms",
  "rageroom",
  "ragerooms",
  "rage-room",
  "rage-rooms",
  "smash room",
  "smash rooms",
  "smashroom",
  "smashrooms",
  "smash-room",
  "smash-rooms",
]);

/** A category as the dashboard reads it: rage/smash rooms and escape-room
 *  difficulty labels folded into one name each. */
export function dashboardCategory(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "";
  if (RAGE_ROOM_ALIASES.has(trimmed.toLowerCase().replace(/\s+/g, " ")))
    return RAGE_ROOM_CATEGORY;
  return normalizeCategory(trimmed);
}

export function bucketForCategory(
  category: string | null | undefined,
  source: "booking" | "attraction",
): ActivityBucketKey {
  const resolved = dashboardCategory(category);
  if (resolved === ESCAPE_ROOM_CATEGORY) return "escape_rooms";
  if (resolved === RAGE_ROOM_CATEGORY) return "rage_rooms";
  return source === "attraction" ? "attractions" : "party_packages";
}

const CANCELLED_BOOKING_STATUSES = ["cancelled"];
const CANCELLED_PURCHASE_STATUSES = ["cancelled", "refunded"];

const statusOf = (value: unknown): string => String(value ?? "").toLowerCase();

export const countsAsBooking = (booking: { status?: unknown }): boolean =>
  !CANCELLED_BOOKING_STATUSES.includes(statusOf(booking.status));

export const countsAsPurchase = (purchase: { status?: unknown }): boolean =>
  !CANCELLED_PURCHASE_STATUSES.includes(statusOf(purchase.status));

export type ActivitySourceCount = {
  label: string;
  count: number;
  category: string;
};

export type ActivityBucket = {
  key: ActivityBucketKey;
  label: string;
  primaryUnit: string;
  primary: number;
  secondaryUnit: string;
  secondary: number;
  /** Cancelled / refunded rows — left out of the counts, but reported. */
  cancelled: number;
  bookings: CalendarBooking[];
  purchases: PurchaseRow[];
  eventPurchases: EventPurchaseRow[];
  /** What made up the headline number, largest first. */
  sources: ActivitySourceCount[];
  categories: string[];
  explanation: string;
};

type BucketDefinition = Pick<
  ActivityBucket,
  "key" | "label" | "primaryUnit" | "secondaryUnit" | "explanation"
>;

export const BUCKET_DEFINITIONS: BucketDefinition[] = [
  {
    key: "party_packages",
    label: "Party Packages",
    primaryUnit: "bookings",
    secondaryUnit: "guests",
    explanation:
      "Package bookings scheduled for this day that are not escape rooms or rage rooms — birthdays, adventure parties and every other package category this store sells. Cancelled bookings are left out.",
  },
  {
    key: "attractions",
    label: "Wristbands & Attractions",
    primaryUnit: "tickets",
    secondaryUnit: "orders",
    explanation:
      "Attraction tickets scheduled for this day — wristbands, activities and open play. The headline number is tickets, so one order of six wristbands counts as six. Cancelled and refunded orders are left out.",
  },
  {
    key: "escape_rooms",
    label: "Escape Rooms",
    primaryUnit: "bookings",
    secondaryUnit: "players",
    explanation:
      "Escape room activity scheduled for this day, whether it was sold as a package booking or as an attraction ticket. Difficulty labels such as Beginner or Advanced count as escape rooms. Cancelled rows are left out.",
  },
  {
    key: "rage_rooms",
    label: "Rage Rooms",
    primaryUnit: "bookings",
    secondaryUnit: "guests",
    explanation:
      "Rage room activity scheduled for this day, whether it was sold as a package booking or as an attraction ticket. Smash room is treated as the same thing. Cancelled rows are left out.",
  },
  {
    key: "events",
    label: "Events",
    primaryUnit: "tickets",
    secondaryUnit: "registrations",
    explanation:
      "Event registrations for this day. The headline number is tickets, so a family of four on one registration counts as four. Cancelled and refunded registrations are left out.",
  },
];

/** The panel's own explanation (the web's info tooltip). */
export const ACTIVITY_PANEL_INFO =
  "Everything scheduled at this location for the day shown, grouped by what the guest is here to do. Counts follow the day the activity happens, not the day it was booked. Tap a card to see the bookings and tickets behind the number.";

const dayOf = (value: string | null | undefined): string =>
  (value ?? "").split("T")[0];

/** Attraction tickets on `dateKey` — scheduled date, else purchase date —
 *  earliest first (the web's `attractionsForDate`). */
export function attractionsForDate(
  list: PurchaseRow[],
  dateKey: string,
): PurchaseRow[] {
  return list
    .filter((p) => dayOf(p.scheduledDate || p.purchaseDate) === dateKey)
    .sort(
      (a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime),
    );
}

/** Event registrations on `dateKey`, earliest first (the web's `eventsForDate`). */
export function eventsForDate(
  list: EventPurchaseRow[],
  dateKey: string,
): EventPurchaseRow[] {
  return list
    .filter((p) => dayOf(p.purchaseDate) === dateKey)
    .sort(
      (a, b) => timeToMinutes(a.purchaseTime) - timeToMinutes(b.purchaseTime),
    );
}

export type ActivityInput = {
  bookings?: CalendarBooking[];
  purchases?: PurchaseRow[];
  events?: EventPurchaseRow[];
};

export function buildActivityBuckets(input: ActivityInput): ActivityBucket[] {
  const buckets = new Map<ActivityBucketKey, ActivityBucket>();
  const sourceRows = new Map<
    ActivityBucketKey,
    Map<string, ActivitySourceCount>
  >();

  for (const definition of BUCKET_DEFINITIONS) {
    buckets.set(definition.key, {
      ...definition,
      primary: 0,
      secondary: 0,
      cancelled: 0,
      bookings: [],
      purchases: [],
      eventPurchases: [],
      sources: [],
      categories: [],
    });
    sourceRows.set(definition.key, new Map());
  }

  const addSource = (
    key: ActivityBucketKey,
    label: string,
    category: string,
    count: number,
  ) => {
    const rows = sourceRows.get(key)!;
    const existing = rows.get(label);
    if (existing) existing.count += count;
    else rows.set(label, { label, category, count });
  };

  const noteCategory = (bucket: ActivityBucket, category: string) => {
    const resolved = category.trim();
    if (resolved === "" || bucket.categories.includes(resolved)) return;
    bucket.categories.push(resolved);
  };

  for (const booking of input.bookings ?? []) {
    const rawCategory = booking.packageCategoryRaw ?? "";
    const bucket = buckets.get(bucketForCategory(rawCategory, "booking"))!;
    if (!countsAsBooking(booking)) {
      bucket.cancelled += 1;
      continue;
    }
    const category = dashboardCategory(rawCategory) || "No category";
    bucket.bookings.push(booking);
    bucket.primary += 1;
    bucket.secondary += Number(booking.participants) || 0;
    noteCategory(bucket, category);
    addSource(
      bucket.key,
      booking.packageNameRaw || "Other package",
      category,
      1,
    );
  }

  for (const purchase of input.purchases ?? []) {
    const bucket = buckets.get(
      bucketForCategory(purchase.category, "attraction"),
    )!;
    if (!countsAsPurchase(purchase)) {
      bucket.cancelled += 1;
      continue;
    }
    const tickets = Number(purchase.quantity) || 0;
    const category = dashboardCategory(purchase.category) || "No category";
    bucket.purchases.push(purchase);
    noteCategory(bucket, category);

    const label = purchase.attractionName || "Other attraction";
    if (bucket.key === "attractions") {
      bucket.primary += tickets;
      bucket.secondary += 1;
      addSource(bucket.key, label, category, tickets);
    } else {
      // An escape / rage room sold as a ticket counts as one booking of N.
      bucket.primary += 1;
      bucket.secondary += tickets;
      addSource(bucket.key, label, category, 1);
    }
  }

  const eventBucket = buckets.get("events")!;
  for (const purchase of input.events ?? []) {
    if (!countsAsPurchase(purchase)) {
      eventBucket.cancelled += 1;
      continue;
    }
    const tickets = Number(purchase.quantity) || 0;
    eventBucket.eventPurchases.push(purchase);
    eventBucket.primary += tickets;
    eventBucket.secondary += 1;
    addSource("events", purchase.eventName || "Other event", "Events", tickets);
  }

  return BUCKET_DEFINITIONS.map((definition) => {
    const bucket = buckets.get(definition.key)!;
    bucket.sources = [...sourceRows.get(definition.key)!.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
    return bucket;
  });
}

/** How many rows a bucket lists (bookings + tickets + registrations). */
export const bucketItemCount = (bucket: ActivityBucket): number =>
  bucket.bookings.length +
  bucket.purchases.length +
  bucket.eventPurchases.length;

/** A card's second line, the web's wording. */
export function bucketSubline(bucket: ActivityBucket): string {
  if (bucketItemCount(bucket) > 0)
    return `${bucket.secondary.toLocaleString("en-US")} ${bucket.secondaryUnit}`;
  return bucket.cancelled > 0
    ? `None scheduled · ${bucket.cancelled} cancelled`
    : "None scheduled";
}

/** "2026-09-28" shifted by whole days, with no device-timezone drift. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** "2026-09-28" → "Mon, Sep 28, 2026". */
export function activityDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}
