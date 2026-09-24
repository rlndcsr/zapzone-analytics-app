import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePaymentState } from "../payments/paymentState.ts";
import {
  arrivalFlag,
  balanceSummary,
  BASE_CONTENT_HEIGHT,
  cellExtras,
  cellSpanHeight,
  compactTimeRange,
  describeClashes,
  EXTRA_LINE_HEIGHT,
  extraLineRoom,
  guaranteedExtraLines,
  headCount,
  LATE_AFTER_MINUTES,
  MAX_GUARANTEED_EXTRAS,
} from "./bookingCell.ts";

describe("compactTimeRange", () => {
  it("drops the first meridiem when both ends share it", () => {
    assert.equal(compactTimeRange("10:00 AM", "11:30 AM"), "10:00–11:30 AM");
    assert.equal(compactTimeRange("3 PM", "4:15 PM"), "3–4:15 PM");
  });

  it("keeps both when the range crosses noon", () => {
    assert.equal(compactTimeRange("11:30 AM", "12:30 PM"), "11:30 AM–12:30 PM");
  });
});

describe("balanceSummary — what is still owed, never the total", () => {
  const view = (total: number, paid: number, status = "partial") =>
    resolvePaymentState({ total_amount: total, amount_paid: paid, payment_status: status });

  it("shows the outstanding balance, not the booking total", () => {
    assert.deepEqual(balanceSummary(view(250, 100)), { text: "$150.00 due", tone: "owed" });
  });

  it("says Paid once nothing is owed", () => {
    assert.deepEqual(balanceSummary(view(250, 250, "paid")), { text: "Paid", tone: "paid" });
  });

  it("names a refund or a void rather than doing the arithmetic", () => {
    assert.deepEqual(balanceSummary(view(250, 250, "refunded")), { text: "Refunded", tone: "terminal" });
  });
});

describe("headCount", () => {
  it("shows the party against the space's limit", () => {
    assert.deepEqual(headCount(6, 8), { text: "6/8 pax", overCapacity: false });
  });

  it("flags a party too big for the room", () => {
    assert.deepEqual(headCount(10, 8), { text: "10/8 pax", overCapacity: true });
  });

  it("shows the party alone when the column has no limit", () => {
    assert.deepEqual(headCount(4, null), { text: "4 pax", overCapacity: false });
  });
});

describe("arrivalFlag", () => {
  const at = (nowMinutes: number, status = "confirmed", isToday = true) =>
    arrivalFlag({ status, isToday, nowMinutes, startMin: 600, endMin: 660 });

  it("flags a party that should be in the room and has not been checked in", () => {
    assert.equal(at(600 + LATE_AFTER_MINUTES), "late");
    assert.equal(at(660 + LATE_AFTER_MINUTES - 1), "late");
  });

  it("gives them a few minutes before calling them late, and stops once well past", () => {
    assert.equal(at(600 + LATE_AFTER_MINUTES - 1), null);
    assert.equal(at(660 + LATE_AFTER_MINUTES), null);
  });

  it("marks a checked-in party that is running as in", () => {
    assert.equal(at(630, "checked-in"), "in");
    assert.equal(at(630, "completed"), "in");
    assert.equal(at(670, "checked-in"), null);
  });

  it("never flags a cancelled booking, or any day but today", () => {
    assert.equal(at(630, "cancelled"), null);
    assert.equal(at(630, "confirmed", false), null);
  });
});

describe("how tall a booking's minutes must be drawn", () => {
  it("keeps a booking with nothing to add at the four-line floor", () => {
    assert.equal(guaranteedExtraLines({ clashing: false, staffNote: "", guestNote: "" }), 0);
    assert.equal(cellSpanHeight(0, 4), BASE_CONTENT_HEIGHT + 4);
  });

  it("buys a line each for a clash, a staff note and a guest note", () => {
    const lines = guaranteedExtraLines({ clashing: true, staffNote: "VIP", guestNote: "Allergy" });
    assert.equal(lines, 3);
    assert.equal(cellSpanHeight(lines, 4), BASE_CONTENT_HEIGHT + 3 * EXTRA_LINE_HEIGHT + 4);
  });

  it("guarantees no more than three", () => {
    assert.equal(
      cellSpanHeight(MAX_GUARANTEED_EXTRAS + 2, 0),
      cellSpanHeight(MAX_GUARANTEED_EXTRAS, 0),
    );
  });

  it("gives a block sized for n extras room for exactly n, despite float error", () => {
    assert.equal(extraLineRoom(BASE_CONTENT_HEIGHT), 0);
    assert.equal(extraLineRoom(BASE_CONTENT_HEIGHT + 2 * EXTRA_LINE_HEIGHT - 1e-9), 2);
    assert.equal(extraLineRoom(BASE_CONTENT_HEIGHT - 10), 0);
  });
});

describe("cellExtras", () => {
  const clash = { doubleBooked: true, label: "Sam at 10 AM (15 min over)" };

  it("orders the lines by what earns its space first", () => {
    const extras = cellExtras({
      clash,
      staffNote: "VIP",
      guestNote: "Nut allergy",
      honoreeName: "Mia",
      honoreeAge: 7,
      referenceNumber: "BK-000123",
    });
    assert.deepEqual(
      extras.map((e) => e.text),
      [
        "Overlaps Sam at 10 AM (15 min over)",
        "Staff: VIP",
        "Guest: Nut allergy",
        "Birthday: Mia, 7",
        "#000123",
      ],
    );
  });

  it("calls a missing turnaround a gap, not an overlap", () => {
    const [line] = cellExtras({
      clash: { doubleBooked: false, label: "Lee at 11 AM (no gap between them)" },
      staffNote: "",
      guestNote: "",
    });
    assert.equal(line.text, "No gap Lee at 11 AM (no gap between them)");
    assert.equal(line.tone, "gap");
  });

  it("keeps a multi-line note on one line", () => {
    const [line] = cellExtras({ clash: null, staffNote: "", guestNote: "Balloons\n\nNo nuts" });
    assert.equal(line.text, "Guest: Balloons No nuts");
  });

  it("names the birthday child without an age when none is given", () => {
    const [line] = cellExtras({ clash: null, staffNote: "", guestNote: "", honoreeName: " Mia " });
    assert.equal(line.text, "Birthday: Mia");
  });

  it("says nothing extra for a plain booking", () => {
    assert.deepEqual(cellExtras({ clash: null, staffNote: "", guestNote: "" }), []);
  });
});

describe("describeClashes", () => {
  it("names each booking in the clash and by how much", () => {
    assert.equal(
      describeClashes([
        { name: "Sam", startLabel: "10 AM", overlapMinutes: 15 },
        { name: "Lee", startLabel: "11 AM", overlapMinutes: 0 },
      ]),
      "Sam at 10 AM (15 min over), Lee at 11 AM (no gap between them)",
    );
  });
});
