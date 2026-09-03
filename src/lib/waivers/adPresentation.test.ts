import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeAdSchedule, describeAdTargets } from "./adPresentation.ts";

describe("which venues an ad names", () => {
  it("reads an empty set as every location", () => {
    // The backend stores "all locations" as a null set, which arrives as [].
    assert.equal(describeAdTargets([]), "All locations");
  });

  it("names one or two venues outright", () => {
    assert.equal(describeAdTargets(["Brighton"]), "Brighton");
    assert.equal(describeAdTargets(["Brighton", "Canton"]), "Brighton, Canton");
  });

  it("collapses to a count past two, so a row stays readable", () => {
    assert.equal(
      describeAdTargets(["Brighton", "Canton", "Warren"]),
      "3 locations",
    );
    assert.equal(
      describeAdTargets(["Brighton", "Canton", "Warren", "Lansing"]),
      "4 locations",
    );
  });

  it("ignores blank names rather than showing a stray comma", () => {
    assert.equal(describeAdTargets(["Brighton", ""]), "Brighton");
    assert.equal(describeAdTargets(["", "   "]), "All locations");
  });
});

describe("an ad's schedule window", () => {
  it("says an unscheduled ad is always shown", () => {
    assert.equal(describeAdSchedule({}), "Always shown");
    assert.equal(
      describeAdSchedule({ startsAt: null, endsAt: null }),
      "Always shown",
    );
  });

  it("joins both ends of a bounded window", () => {
    const text = describeAdSchedule({
      startsAt: "2026-06-01T00:00:00+00:00",
      endsAt: "2026-06-30T00:00:00+00:00",
    });
    assert.ok(text.startsWith("From "), `got ${text}`);
    assert.ok(text.includes(" · until "), `got ${text}`);
    assert.ok(text.includes("Jun"), `expected a formatted month, got ${text}`);
  });

  it("names the missing half rather than hiding it", () => {
    // The web spells out which end is open, so an ad is never mistaken for a
    // shorter window than it has.
    assert.ok(
      describeAdSchedule({ startsAt: "2026-06-01" }).endsWith("no end date"),
    );
    assert.ok(
      describeAdSchedule({ endsAt: "2026-06-30" }).startsWith("No start date"),
    );
  });

  it("takes the date half of the API timestamp, not the time", () => {
    const withTime = describeAdSchedule({
      startsAt: "2026-06-01T23:45:00+00:00",
    });
    const dateOnly = describeAdSchedule({ startsAt: "2026-06-01" });
    assert.equal(withTime, dateOnly);
  });
});
