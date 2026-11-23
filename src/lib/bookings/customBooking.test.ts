import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bookingDisplayName,
  capacityText,
  customPackagePayload,
  customQuoteFromInput,
  durationText,
  emptyCustomTermsInput,
  endTimeText,
  feeLineLabel,
  formatMoney,
  isCustomSlotClosed,
  packageLineLabel,
  toAppliedFees,
  validateCustomTerms,
  type CustomTermsInput,
} from "./customBooking.ts";

const terms = (over: Partial<CustomTermsInput> = {}): CustomTermsInput => ({
  ...emptyCustomTermsInput(),
  name: "Team Outing",
  category: "Group",
  durationMinutes: "90",
  maxGuests: "30",
  price: "100",
  ...over,
});

describe("customQuoteFromInput", () => {
  it("prices per booking once, whatever the party size", () => {
    assert.equal(customQuoteFromInput(terms(), 12).totalCents, 10000);
  });

  it("prices per guest by the participant count", () => {
    const quote = customQuoteFromInput(terms({ pricingType: "per_guest", price: "12.50" }), 4);
    assert.equal(quote.packageCents, 5000);
  });

  it("adds catalog and one-time add-ons, then fees on that subtotal (server rounding)", () => {
    const quote = customQuoteFromInput(
      terms({
        price: "10.01",
        oneTimeAddOns: [{ name: "Glow", quantity: "3", unitPrice: "1.10" }],
        fees: [
          { name: "Service", type: "percent", amount: "7.5" },
          { name: "Venue", type: "flat", amount: "5" },
        ],
      }),
      1,
      [{ unitPrice: 2.5, quantity: 2 }],
    );
    // subtotal 1001 + 500 + 330 = 1831; 7.5% → (1831*750+5000)/10000 = 137.825 → 137
    assert.equal(quote.subtotalCents, 1831);
    assert.equal(quote.fees[0].cents, 137);
    assert.equal(quote.fees[1].cents, 500);
    assert.equal(quote.totalCents, 2468);
  });

  it("builds the applied_fees rows the server stores", () => {
    const quote = customQuoteFromInput(
      terms({ fees: [{ name: "Service", type: "percent", amount: "10" }] }),
      1,
    );
    assert.deepEqual(toAppliedFees(quote), [
      {
        fee_name: "Service",
        fee_amount: 10,
        fee_application_type: "additive",
        fee_calculation_type: "percentage",
        fee_label: "10%",
        fee_support_id: null,
      },
    ]);
  });
});

describe("validateCustomTerms", () => {
  it("accepts a complete package with a space and a party inside the range", () => {
    assert.deepEqual(
      validateCustomTerms(terms({ minGuests: "5" }), { participants: "10", locationId: 1, roomId: 3 }),
      {},
    );
  });

  it("names every missing field", () => {
    const errors = validateCustomTerms(emptyCustomTermsInput(), { locationId: null, roomId: null });
    assert.deepEqual(Object.keys(errors).sort(), [
      "category",
      "durationMinutes",
      "location",
      "maxGuests",
      "name",
      "price",
      "room",
    ]);
  });

  it("keeps participants inside the guest range", () => {
    const errors = validateCustomTerms(terms({ minGuests: "5", maxGuests: "8" }), { participants: "9" });
    assert.equal(errors.participants, "Participants must be between 5 and 8.");
  });

  it("refuses a max below the min, a rate over 100 and an amount paid over the total", () => {
    const errors = validateCustomTerms(
      terms({ minGuests: "10", maxGuests: "5", fees: [{ name: "Tax", type: "percent", amount: "101" }] }),
      { amountPaid: "200", totalCents: 10000 },
    );
    assert.equal(errors.maxGuests, "Max. guests must be at least 10.");
    assert.equal(errors["fees.0.amount"], "Rate must be from 0 to 100, with at most 2 decimals.");
    assert.equal(errors.amountPaid, "Amount paid cannot exceed the total.");
  });

  it("checks catalog add-on quantities against their own limits", () => {
    const errors = validateCustomTerms(terms(), {
      catalog: [{ id: 7, name: "Pizza", quantity: 1, minQuantity: 2, maxQuantity: 4 }],
    });
    assert.equal(errors["catalog.7"], "Enter zero or at least 2.");
  });
});

describe("customPackagePayload", () => {
  it("trims text and sends numbers, with no min guests as null", () => {
    assert.deepEqual(
      customPackagePayload(
        terms({ name: "  Team Outing ", oneTimeAddOns: [{ name: " Glow ", quantity: "2", unitPrice: "1.5" }] }),
      ),
      {
        name: "Team Outing",
        category: "Group",
        duration_minutes: 90,
        min_guests: null,
        max_guests: 30,
        pricing_type: "per_booking",
        price: 100,
        fees: [],
        one_time_add_ons: [{ name: "Glow", quantity: 2, unit_price: 1.5 }],
      },
    );
  });
});

describe("display text", () => {
  it("formats money, duration, capacity, end time and fee lines", () => {
    assert.equal(formatMoney(123456), "$1,234.56");
    assert.equal(formatMoney(5), "$0.05");
    assert.equal(durationText("90"), "1 hr 30 min");
    assert.equal(durationText("45"), "45 min");
    assert.equal(capacityText("", "30"), "Up to 30 guests");
    assert.equal(capacityText("5", "30"), "5–30 guests");
    assert.equal(endTimeText("2026-12-01", "23:30", "60"), "Ends 12:30 AM (next day)");
    assert.equal(feeLineLabel({ name: "Service", type: "percent", amount: 7.5 }), "Service (7.5%)");
    assert.equal(packageLineLabel("per_guest", 4, 12.5), "Package · 4 × $12.50");
  });

  it("names a custom booking by its own name", () => {
    assert.equal(
      bookingDisplayName({ is_custom_package: true, custom_package_name: "Team Outing" }, "—"),
      "Team Outing",
    );
    assert.equal(bookingDisplayName({ is_custom_package: 1, custom_package_name: " " }, "—"), "Custom Package");
    assert.equal(bookingDisplayName({ package: { name: "Party" } }, "—"), "Party");
  });
});

describe("isCustomSlotClosed", () => {
  const today = new Date(2026, 10, 1);
  const closure = (over: Record<string, unknown> = {}) => ({
    date: "2026-12-01",
    timeStart: "10:00",
    timeEnd: "12:00",
    isRecurring: false,
    packageIds: [] as number[],
    roomIds: [] as number[],
    ...over,
  });

  it("is blocked by a location-wide closure", () => {
    assert.equal(isCustomSlotClosed([closure()], "2026-12-01", 600, 660, null, today), true);
  });

  it("ignores closures aimed at packages", () => {
    assert.equal(
      isCustomSlotClosed([closure({ packageIds: [4] })], "2026-12-01", 600, 660, 3, today),
      false,
    );
  });

  it("counts a space closure only for that space", () => {
    const offs = [closure({ roomIds: [3] })];
    assert.equal(isCustomSlotClosed(offs, "2026-12-01", 600, 660, 3, today), true);
    assert.equal(isCustomSlotClosed(offs, "2026-12-01", 600, 660, 9, today), false);
  });
});
