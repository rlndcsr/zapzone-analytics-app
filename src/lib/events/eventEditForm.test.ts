import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { EventRow } from "../../services/eventsService";
import {
  buildEventUpdate,
  eventToEditForm,
  moveItem,
  validateEventEdit,
  type EventEditForm,
} from "./eventEditForm.ts";

const row = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 7,
  name: "Scotch Elementary",
  description: "Fundraiser",
  dateType: "one_time",
  startDate: "2027-01-21T00:00:00.000000Z",
  endDate: null,
  timeStart: "17:00:00",
  timeEnd: "20:00:00",
  intervalMinutes: 180,
  maxBookingsPerSlot: 150,
  maxTicketsPerSlot: null,
  price: 25,
  features: [],
  status: "active",
  locationId: 3,
  locationName: "Waterford | Zap Zone",
  createdAt: null,
  images: [],
  addOns: [],
  addOnsOrder: [],
  ...overrides,
});

const form = (overrides: Partial<EventEditForm> = {}): EventEditForm => ({
  ...eventToEditForm(row()),
  ...overrides,
});

describe("eventToEditForm", () => {
  it("fills the form the way the web does", () => {
    const f = eventToEditForm(row());
    assert.equal(f.startDate, "2027-01-21");
    assert.equal(f.timeStart, "17:00");
    assert.equal(f.timeEnd, "20:00");
    assert.equal(f.noSetTimes, false);
    assert.equal(f.intervalMinutes, 180);
    assert.equal(f.maxBookingsPerSlot, "150");
    assert.equal(f.maxTicketsPerSlot, "");
    assert.equal(f.price, "25.00");
    assert.equal(f.isActive, true);
    assert.deepEqual(f.image, { kind: "keep" });
  });

  it("reads an event without times as no set times, keeping default times", () => {
    const f = eventToEditForm(row({ timeStart: "", timeEnd: "" }));
    assert.equal(f.noSetTimes, true);
    assert.equal(f.timeStart, "09:00");
    assert.equal(f.timeEnd, "17:00");
  });

  it("prefers the saved add-on order, else the attached add-ons", () => {
    const addOns = [1, 2, 3].map((id) => ({
      id,
      name: `A${id}`,
      price: 1,
      description: null,
      image: null,
      minQuantity: 0,
      maxQuantity: 99,
    }));
    assert.deepEqual(
      eventToEditForm(row({ addOns, addOnsOrder: [3, 1, 2] })).addOnIds,
      [3, 1, 2],
    );
    assert.deepEqual(eventToEditForm(row({ addOns })).addOnIds, [1, 2, 3]);
  });

  it("falls back to a 60-minute slot when none is stored", () => {
    assert.equal(eventToEditForm(row({ intervalMinutes: 0 })).intervalMinutes, 60);
  });
});

describe("validateEventEdit", () => {
  it("passes a complete form", () => {
    assert.equal(validateEventEdit(form()), null);
  });

  it("needs a name", () => {
    assert.equal(validateEventEdit(form({ name: "  " })), "Event name is required");
  });

  it("needs an end date on a range, not before the start", () => {
    assert.match(
      validateEventEdit(form({ dateType: "date_range", endDate: "" }))!,
      /End date is required/,
    );
    assert.match(
      validateEventEdit(
        form({ dateType: "date_range", endDate: "2027-01-20" }),
      )!,
      /before the start date/,
    );
  });

  it("refuses the same start and end time", () => {
    assert.equal(
      validateEventEdit(form({ timeStart: "17:00", timeEnd: "17:00" })),
      "Start and end time cannot be the same",
    );
  });

  it("allows an event that runs past midnight", () => {
    assert.equal(
      validateEventEdit(
        form({ timeStart: "22:00", timeEnd: "01:00", intervalMinutes: 60 }),
      ),
      null,
    );
  });

  it("refuses a slot longer than the window", () => {
    assert.match(
      validateEventEdit(form({ intervalMinutes: 240 }))!,
      /Interval \(240 min\) is longer than the event's time window \(180 min\)/,
    );
  });

  it("does not judge times on an event with no set times", () => {
    assert.equal(
      validateEventEdit(
        form({ noSetTimes: true, timeStart: "10:00", timeEnd: "10:00" }),
      ),
      null,
    );
  });
});

describe("buildEventUpdate", () => {
  it("sends the web's payload", () => {
    assert.deepEqual(buildEventUpdate(form()), {
      location_id: 3,
      name: "Scotch Elementary",
      description: "Fundraiser",
      date_type: "one_time",
      start_date: "2027-01-21",
      time_start: "17:00",
      time_end: "20:00",
      interval_minutes: 180,
      max_bookings_per_slot: 150,
      max_tickets_per_slot: null,
      price: 25,
      features: [],
      add_on_ids: [],
      add_ons_order: [],
      is_active: true,
    });
  });

  it("sends null times for no set times", () => {
    const p = buildEventUpdate(form({ noSetTimes: true }));
    assert.equal(p.time_start, null);
    assert.equal(p.time_end, null);
    assert.equal(p.interval_minutes, null);
  });

  it("sends end_date only for a range", () => {
    assert.equal("end_date" in buildEventUpdate(form()), false);
    assert.equal(
      buildEventUpdate(form({ dateType: "date_range", endDate: "2027-01-25" }))
        .end_date,
      "2027-01-25",
    );
  });

  it("empties what was emptied", () => {
    const p = buildEventUpdate(
      form({
        description: "  ",
        maxBookingsPerSlot: "",
        price: "",
        features: ["  ", " Laser tag "],
      }),
    );
    assert.equal(p.description, null);
    assert.equal(p.max_bookings_per_slot, null);
    assert.equal(p.price, 0);
    assert.deepEqual(p.features, ["Laser tag"]);
  });

  it("keeps, replaces or removes the picture", () => {
    assert.equal("image" in buildEventUpdate(form()), false);
    assert.equal(
      buildEventUpdate(form({ image: { kind: "new", dataUrl: "data:x" } })).image,
      "data:x",
    );
    const removed = buildEventUpdate(form({ image: { kind: "remove" } }));
    assert.equal("image" in removed, true);
    assert.equal(removed.image, null);
  });

  it("sends the add-ons in their chosen order, even when none are left", () => {
    const p = buildEventUpdate(form({ addOnIds: [5, 2] }));
    assert.deepEqual(p.add_on_ids, [5, 2]);
    assert.deepEqual(p.add_ons_order, [5, 2]);
  });
});

describe("moveItem", () => {
  it("swaps with a neighbour and ignores moves off either end", () => {
    assert.deepEqual(moveItem([1, 2, 3], 1, -1), [2, 1, 3]);
    assert.deepEqual(moveItem([1, 2, 3], 1, 1), [1, 3, 2]);
    assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
    assert.deepEqual(moveItem([1, 2, 3], 2, 1), [1, 2, 3]);
  });
});
