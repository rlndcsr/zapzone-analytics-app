import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bookingImportSummary, importWarningLines } from "./importSummary.ts";

describe("the bookings import summary", () => {
  it("keeps the counts and first error it always showed", () => {
    assert.equal(
      bookingImportSummary({
        imported: 8,
        skipped: 1,
        total_rows: 10,
        errors: [{ row: 4, error: "Unknown package" }],
      }),
      "Imported 8 of 10 row(s). Skipped 1.\n1 row error(s) — first: row 4, Unknown package",
    );
  });

  it("lists the bookings staff should check, by row", () => {
    const summary = bookingImportSummary({
      imported: 3,
      skipped: 0,
      total_rows: 3,
      errors: [],
      warnings: [
        { message: "No package given; set one on the booking.", rows: [2] },
        { message: "Guest count read from the room size.", rows: [1, 3] },
      ],
    });
    assert.equal(
      summary,
      "Imported 3 of 3 row(s). Skipped 0.\n\nCheck these bookings:\n" +
        "Row 2: No package given; set one on the booking.\n" +
        "Rows 1, 3: Guest count read from the room size.",
    );
  });

  it("says nothing extra from a server that sends no warnings", () => {
    assert.equal(
      bookingImportSummary({ imported: 1, skipped: 0, total_rows: 1, errors: [] }),
      "Imported 1 of 1 row(s). Skipped 0.",
    );
    assert.deepEqual(importWarningLines(undefined), []);
    assert.deepEqual(importWarningLines([{ message: " ", rows: [1] }]), []);
  });
});
