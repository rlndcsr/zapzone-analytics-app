import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupByDay } from "./notificationGroups.ts";

type Row = { id: number; created_at: string | null };

/** Stand-in for the venue-time day key: just the date portion. */
const dayKey = (v: string) => v.substring(0, 10);
const TODAY = "2026-08-31";

const group = (items: Row[]) =>
  groupByDay(items, {
    createdAt: (r) => r.created_at,
    dayKey,
    today: TODAY,
  });

describe("grouping notifications by day", () => {
  it("splits today's rows from earlier ones, keeping order", () => {
    const groups = group([
      { id: 1, created_at: "2026-08-31T09:00:00Z" },
      { id: 2, created_at: "2026-08-30T23:00:00Z" },
      { id: 3, created_at: "2026-08-31T08:00:00Z" },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.title, g.items.map((i) => i.id)]),
      [
        ["Today", [1, 3]],
        ["Earlier", [2]],
      ],
    );
  });

  it("omits a heading that would have no rows under it", () => {
    assert.deepEqual(
      group([{ id: 1, created_at: "2026-08-31T09:00:00Z" }]).map((g) => g.title),
      ["Today"],
    );
    assert.deepEqual(
      group([{ id: 2, created_at: "2026-01-01T09:00:00Z" }]).map((g) => g.title),
      ["Earlier"],
    );
  });

  it("groups on the calendar day, not on hours elapsed", () => {
    // 11pm yesterday is Earlier even though it is only hours old.
    const groups = group([{ id: 1, created_at: "2026-08-30T23:59:00Z" }]);
    assert.deepEqual(groups.map((g) => g.title), ["Earlier"]);
  });

  it("sinks an undated row into Earlier rather than dropping it", () => {
    const groups = group([{ id: 1, created_at: null }]);
    assert.deepEqual(groups.map((g) => [g.title, g.items.map((i) => i.id)]), [
      ["Earlier", [1]],
    ]);
  });

  it("is empty for an empty list", () => {
    assert.deepEqual(group([]), []);
  });
});
