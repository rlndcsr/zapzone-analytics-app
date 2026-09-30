import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { libraryDaysNotice, libraryDayWindow } from "./libraryDays.ts";

describe("libraryDayWindow", () => {
  it("asks for the server's default 14 days when no range is chosen", () => {
    assert.deepEqual(libraryDayWindow("", "", "2026-09-30"), {
      rangeDays: 0,
      dayLimit: 14,
    });
  });

  it("covers the whole chosen range, To defaulting to today", () => {
    assert.deepEqual(libraryDayWindow("2026-09-01", "2026-09-30", "2026-09-30"), {
      rangeDays: 30,
      dayLimit: 30,
    });
    assert.equal(libraryDayWindow("2026-09-01", "", "2026-09-30").dayLimit, 30);
  });

  it("stops at the server's 120-day maximum", () => {
    const w = libraryDayWindow("2026-01-01", "2026-09-30", "2026-09-30");
    assert.equal(w.rangeDays, 273);
    assert.equal(w.dayLimit, 120);
  });
});

describe("libraryDaysNotice", () => {
  it("says when earlier days were left out", () => {
    assert.equal(
      libraryDaysNotice({ rangeDays: 0, dayLimit: 14 }, 14, false, false),
      "Showing the 14 most recent days with photos. Pick a From date to see earlier days.",
    );
    assert.equal(
      libraryDaysNotice({ rangeDays: 273, dayLimit: 120 }, 120, false, true),
      "Showing the 120 most recent days with photos. Narrow the date range to see earlier days.",
    );
  });

  it("stays quiet when the whole range fits, or the photo cap already says so", () => {
    assert.equal(libraryDaysNotice({ rangeDays: 30, dayLimit: 30 }, 30, false, true), null);
    assert.equal(libraryDaysNotice({ rangeDays: 0, dayLimit: 14 }, 9, false, false), null);
    assert.equal(libraryDaysNotice({ rangeDays: 0, dayLimit: 14 }, 14, true, false), null);
  });
});
