import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PurchaseRow } from "../../services/attractionPurchasesService";
import type { CalendarBooking } from "../../services/bookingsService";
import type { EventPurchaseRow } from "../../services/eventPurchasesService";
import {
  activityDateLabel,
  attractionsForDate,
  bucketForCategory,
  bucketItemCount,
  bucketSubline,
  buildActivityBuckets,
  dashboardCategory,
  eventsForDate,
  shiftDateKey,
  type ActivityBucketKey,
} from "./activityCategories.ts";

const booking = (o: Partial<CalendarBooking>): CalendarBooking =>
  ({
    id: 1,
    status: "confirmed",
    participants: 4,
    packageNameRaw: "Birthday Bash",
    packageCategoryRaw: "Birthday",
    ...o,
  }) as CalendarBooking;

const purchase = (o: Partial<PurchaseRow>): PurchaseRow =>
  ({
    id: 1,
    status: "confirmed",
    quantity: 1,
    attractionName: "Wristband",
    category: "Wristband",
    scheduledDate: "2026-09-28",
    purchaseDate: "2026-09-20",
    scheduledTime: null,
    ...o,
  }) as PurchaseRow;

const event = (o: Partial<EventPurchaseRow>): EventPurchaseRow =>
  ({
    id: 1,
    status: "confirmed",
    quantity: 1,
    eventName: "Glow Night",
    purchaseDate: "2026-09-28",
    purchaseTime: null,
    ...o,
  }) as EventPurchaseRow;

const byKey = (input: Parameters<typeof buildActivityBuckets>[0]) => {
  const buckets = buildActivityBuckets(input);
  return (key: ActivityBucketKey) => buckets.find((b) => b.key === key)!;
};

describe("dashboardCategory / bucketForCategory", () => {
  it("folds rage and smash rooms into Rage Room", () => {
    assert.equal(dashboardCategory("Smash  Rooms"), "Rage Room");
    assert.equal(dashboardCategory("rage-room"), "Rage Room");
  });

  it("reads escape-room difficulty labels as Escape Room", () => {
    assert.equal(dashboardCategory("Advanced"), "Escape Room");
    assert.equal(bucketForCategory("Beginner", "attraction"), "escape_rooms");
  });

  it("files everything else by where it came from", () => {
    assert.equal(bucketForCategory("Birthday", "booking"), "party_packages");
    assert.equal(bucketForCategory("", "booking"), "party_packages");
    assert.equal(bucketForCategory("Laser Tag", "attraction"), "attractions");
  });
});

describe("buildActivityBuckets", () => {
  it("returns the five web buckets in order, even when empty", () => {
    assert.deepEqual(
      buildActivityBuckets({}).map((b) => b.key),
      ["party_packages", "attractions", "escape_rooms", "rage_rooms", "events"],
    );
  });

  it("counts party bookings and their guests, leaving cancelled out but reported", () => {
    const get = byKey({
      bookings: [
        booking({ id: 1, participants: 4 }),
        booking({ id: 2, participants: 6 }),
        booking({ id: 3, status: "cancelled" }),
      ],
    });
    const party = get("party_packages");
    assert.equal(party.primary, 2);
    assert.equal(party.secondary, 10);
    assert.equal(party.cancelled, 1);
    assert.deepEqual(party.categories, ["Birthday"]);
    assert.deepEqual(party.sources, [
      { label: "Birthday Bash", category: "Birthday", count: 2 },
    ]);
  });

  it("buckets a booking by the package's own category, not its display label", () => {
    const get = byKey({
      bookings: [
        booking({
          packageCategoryRaw: "Escape Room",
          packageCategory: "Mystery Mansion",
          packageNameRaw: "Witching Hour",
          participants: 6,
        }),
      ],
    });
    const escape = get("escape_rooms");
    assert.equal(escape.primary, 1);
    assert.equal(escape.secondary, 6);
    assert.deepEqual(escape.categories, ["Escape Room"]);
  });

  it("counts wristband tickets, not orders, and refunded ones not at all", () => {
    const get = byKey({
      purchases: [
        purchase({ id: 1, quantity: 6 }),
        purchase({
          id: 2,
          quantity: 2,
          attractionName: "Laser Tag",
          category: "Laser Tag",
        }),
        purchase({ id: 3, quantity: 9, status: "refunded" }),
      ],
    });
    const attractions = get("attractions");
    assert.equal(attractions.primary, 8);
    assert.equal(attractions.secondary, 2);
    assert.equal(attractions.cancelled, 1);
    assert.deepEqual(
      attractions.sources.map((s) => [s.label, s.count]),
      [
        ["Wristband", 6],
        ["Laser Tag", 2],
      ],
    );
  });

  it("counts a rage room sold as a ticket as one booking of N guests", () => {
    const get = byKey({
      purchases: [
        purchase({
          quantity: 2,
          category: "Smash Room",
          attractionName: "Smash It",
        }),
      ],
    });
    const rage = get("rage_rooms");
    assert.equal(rage.primary, 1);
    assert.equal(rage.secondary, 2);
    assert.equal(get("attractions").primary, 0);
  });

  it("counts event tickets and registrations", () => {
    const get = byKey({
      events: [
        event({ id: 1, quantity: 4 }),
        event({ id: 2, quantity: 1 }),
        event({ id: 3, status: "cancelled" }),
      ],
    });
    const events = get("events");
    assert.equal(events.primary, 5);
    assert.equal(events.secondary, 2);
    assert.equal(events.cancelled, 1);
    assert.equal(bucketItemCount(events), 2);
  });
});

describe("bucketSubline", () => {
  it("names the secondary count, or says none — with any cancellations", () => {
    const get = byKey({
      bookings: [booking({ participants: 6 })],
      purchases: [purchase({ status: "cancelled" })],
    });
    assert.equal(bucketSubline(get("party_packages")), "6 guests");
    assert.equal(
      bucketSubline(get("attractions")),
      "None scheduled · 1 cancelled",
    );
    assert.equal(bucketSubline(get("events")), "None scheduled");
  });
});

describe("day filters", () => {
  it("files a ticket by its scheduled day, else its purchase day, earliest first", () => {
    const list = [
      purchase({ id: 1, scheduledTime: "18:00" }),
      purchase({ id: 2, scheduledTime: "09:30" }),
      purchase({ id: 3, scheduledDate: null, purchaseDate: "2026-09-28" }),
      purchase({ id: 4, scheduledDate: "2026-09-29" }),
    ];
    assert.deepEqual(
      attractionsForDate(list, "2026-09-28").map((p) => p.id),
      [2, 1, 3],
    );
  });

  it("files a registration by its day", () => {
    const list = [
      event({ id: 1, purchaseTime: "19:00" }),
      event({ id: 2, purchaseDate: "2026-09-27" }),
      event({ id: 3, purchaseTime: "17:00" }),
    ];
    assert.deepEqual(
      eventsForDate(list, "2026-09-28").map((e) => e.id),
      [3, 1],
    );
  });
});

describe("dates", () => {
  it("steps whole days across month and year ends", () => {
    assert.equal(shiftDateKey("2026-09-30", 1), "2026-10-01");
    assert.equal(shiftDateKey("2027-01-01", -1), "2026-12-31");
  });

  it("labels a day the web's way", () => {
    assert.equal(activityDateLabel("2026-09-28"), "Mon, Sep 28, 2026");
  });
});
