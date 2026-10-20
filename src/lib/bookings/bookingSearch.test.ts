import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_NAME_FALLBACK,
  isIdTerm,
  matchesBookingId,
  normalizeBookingSearchTerm,
  rankBookingSearchResults,
  searchableCustomerName,
} from "./bookingSearch.ts";

describe("normalizeBookingSearchTerm", () => {
  it("drops a leading # and surrounding whitespace", () => {
    assert.equal(normalizeBookingSearchTerm("7"), "7");
    assert.equal(normalizeBookingSearchTerm("#7"), "7");
    assert.equal(normalizeBookingSearchTerm("  #1234 "), "1234");
    assert.equal(normalizeBookingSearchTerm("##12"), "12");
    assert.equal(normalizeBookingSearchTerm("# 12"), "12");
  });

  it("collapses whitespace and strips # from each word", () => {
    assert.equal(normalizeBookingSearchTerm("tom   #BK2026"), "tom BK2026");
    assert.equal(normalizeBookingSearchTerm("\t tom \n smith "), "tom smith");
  });

  it("keeps a # inside a word", () => {
    assert.equal(normalizeBookingSearchTerm("a#b"), "a#b");
  });
});

describe("isIdTerm / matchesBookingId", () => {
  it("treats only all-digit terms as ids, single digits included", () => {
    assert.equal(isIdTerm("7"), true);
    assert.equal(isIdTerm("1234"), true);
    assert.equal(isIdTerm("12a"), false);
    assert.equal(isIdTerm(""), false);
  });

  it("matches the whole id, never a fragment of it", () => {
    assert.equal(matchesBookingId(7, "7"), true);
    assert.equal(matchesBookingId(17, "7"), false);
    assert.equal(matchesBookingId(1234, "1234"), true);
    assert.equal(matchesBookingId(1234, "123"), false);
    assert.equal(matchesBookingId(1234, "12345"), false);
    assert.equal(matchesBookingId(null, "7"), false);
  });
});

describe("rankBookingSearchResults", () => {
  const row = (id: number, email: string | null = null) => ({
    id,
    guestEmail: email,
    customerEmail: null,
  });

  it("puts the exact id first and keeps the server order otherwise", () => {
    const rows = [row(17), row(70), row(7), row(27)];
    assert.deepEqual(
      rankBookingSearchResults(rows, "7").map((b) => b.id),
      [7, 17, 70, 27],
    );
  });

  it("puts an exact email first, ignoring case", () => {
    const rows = [row(1, "tom.smith@x.com"), row(2, "Tom@X.com")];
    assert.deepEqual(
      rankBookingSearchResults(rows, "tom@x.com").map((b) => b.id),
      [2, 1],
    );
    assert.deepEqual(
      rankBookingSearchResults(
        [{ id: 3, guestEmail: null, customerEmail: "tom@x.com" }, row(4)],
        "TOM@x.com",
      ).map((b) => b.id),
      [3, 4],
    );
  });

  it("returns the rows untouched when nothing is exact, without duplicates", () => {
    const rows = [row(12), row(1234)];
    assert.equal(rankBookingSearchResults(rows, "123"), rows);
    assert.equal(rankBookingSearchResults(rows, "1234").length, rows.length);
  });
});

describe("searchableCustomerName", () => {
  it("drops the display fallback when there is no real name", () => {
    assert.equal(searchableCustomerName(GUEST_NAME_FALLBACK), "");
    assert.equal(searchableCustomerName("Guest", null), "");
  });

  it("keeps real names, including ones containing Guest", () => {
    assert.equal(searchableCustomerName("Tom Andersen"), "Tom Andersen");
    assert.equal(searchableCustomerName("Guest Smith"), "Guest Smith");
    assert.equal(searchableCustomerName("Guest", "Guest"), "Guest");
  });
});
