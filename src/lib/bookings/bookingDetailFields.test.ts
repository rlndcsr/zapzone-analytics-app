import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addOnUnitPrice, locationAddressLine } from "./bookingDetailFields.ts";

describe("the venue address line under Location", () => {
  it("joins street, city and state", () => {
    assert.equal(
      locationAddressLine({
        address: "123 Main St",
        city: "Farmington",
        state: "MI",
      }),
      "123 Main St, Farmington, MI",
    );
  });

  it("shows nothing when there is no street address", () => {
    assert.equal(locationAddressLine({ city: "Farmington", state: "MI" }), null);
    assert.equal(locationAddressLine({ address: "   " }), null);
    assert.equal(locationAddressLine(null), null);
    assert.equal(locationAddressLine(undefined), null);
  });

  it("drops blank parts rather than leaving a stray comma", () => {
    assert.equal(
      locationAddressLine({ address: "1 Main St", city: "  ", state: null }),
      "1 Main St",
    );
    assert.equal(
      locationAddressLine({ address: "1 Main St", city: "Novi" }),
      "1 Main St, Novi",
    );
  });

  it("trims each part", () => {
    assert.equal(
      locationAddressLine({ address: " 1 Main St ", city: " Novi " }),
      "1 Main St, Novi",
    );
  });
});

describe("what one unit of a booked add-on was charged at", () => {
  it("prefers a forced add-on's price for this exact package", () => {
    assert.equal(
      addOnUnitPrice(
        {
          price: "10",
          is_force_add_on: true,
          price_each_packages: [
            { package_id: 4, price: "7" },
            { package_id: 5, price: "8.5" },
          ],
          pivot: { price_at_booking: "9" },
        },
        5,
      ),
      8.5,
    );
  });

  it("falls through when no package entry matches", () => {
    assert.equal(
      addOnUnitPrice(
        {
          price: "10",
          is_force_add_on: true,
          price_each_packages: [{ package_id: 4, price: "7" }],
          pivot: { price_at_booking: "9" },
        },
        5,
      ),
      9,
    );
  });

  it("falls through when the matching package entry is priced at zero", () => {
    assert.equal(
      addOnUnitPrice(
        {
          price: "10",
          is_force_add_on: true,
          price_each_packages: [{ package_id: 5, price: "0" }],
          pivot: { price_at_booking: "9" },
        },
        5,
      ),
      9,
    );
  });

  it("ignores per-package pricing on an add-on that is not forced", () => {
    assert.equal(
      addOnUnitPrice(
        {
          price: "10",
          price_each_packages: [{ package_id: 5, price: "1" }],
          pivot: { price_at_booking: "9" },
        },
        5,
      ),
      9,
    );
  });

  it("ignores per-package pricing when the booking has no package", () => {
    assert.equal(
      addOnUnitPrice(
        {
          price: "10",
          is_force_add_on: true,
          price_each_packages: [{ package_id: 5, price: "1" }],
        },
        null,
      ),
      10,
    );
  });

  it("uses the price frozen at booking time before the catalog price", () => {
    assert.equal(
      addOnUnitPrice({ price: "10", pivot: { price_at_booking: "6" } }, null),
      6,
    );
  });

  it("uses the pivot's plain price when nothing was frozen", () => {
    assert.equal(addOnUnitPrice({ price: "10", pivot: { price: "4" } }, null), 4);
  });

  it("falls back to the catalog price with no pivot at all", () => {
    assert.equal(addOnUnitPrice({ price: "10" }, null), 10);
  });

  it("is zero when the add-on carries no price anywhere", () => {
    assert.equal(addOnUnitPrice({}, null), 0);
  });

  it("treats an unparseable price as zero rather than NaN", () => {
    assert.equal(addOnUnitPrice({ price: "free" }, null), 0);
  });

  it("keeps a genuine zero price frozen on the pivot", () => {
    assert.equal(
      addOnUnitPrice({ price: "10", pivot: { price_at_booking: "0" } }, null),
      0,
    );
  });
});
