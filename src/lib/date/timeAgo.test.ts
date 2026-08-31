import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { timeAgo } from "./timeAgo.ts";

/** A fixed "now" so the boundaries are exact rather than clock-dependent. */
const NOW = Date.parse("2026-08-31T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

const ago = (value: string | null | undefined, formatOlder?: (v: string) => string) =>
  timeAgo(value, { now: NOW, formatOlder });

describe("relative timestamps", () => {
  it("reads anything under a minute as Just now", () => {
    assert.equal(ago(minutesAgo(0)), "Just now");
    assert.equal(ago(minutesAgo(0.5)), "Just now");
  });

  it("counts minutes up to the hour", () => {
    assert.equal(ago(minutesAgo(1)), "1m ago");
    assert.equal(ago(minutesAgo(12)), "12m ago");
    assert.equal(ago(minutesAgo(59)), "59m ago");
  });

  it("switches to hours at 60 minutes", () => {
    assert.equal(ago(minutesAgo(60)), "1h ago");
    assert.equal(ago(minutesAgo(60 * 23)), "23h ago");
  });

  it("switches to days at 24 hours", () => {
    assert.equal(ago(minutesAgo(60 * 24)), "1d ago");
    assert.equal(ago(minutesAgo(60 * 24 * 29)), "29d ago");
  });

  it("hands off to the caller's formatter past a month", () => {
    const old = minutesAgo(60 * 24 * 40);
    assert.equal(ago(old, () => "Jul 22"), "Jul 22");
  });

  it("falls back to days when no formatter is given", () => {
    assert.equal(ago(minutesAgo(60 * 24 * 40)), "40d ago");
  });

  it("treats a future timestamp as Just now rather than negative", () => {
    assert.equal(ago(new Date(NOW + 60_000).toISOString()), "Just now");
  });

  it("is a dash for a missing or unparseable value", () => {
    assert.equal(ago(null), "—");
    assert.equal(ago(undefined), "—");
    assert.equal(ago(""), "—");
    assert.equal(ago("not a date"), "—");
  });
});
