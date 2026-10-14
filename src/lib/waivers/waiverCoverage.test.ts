import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  entityCoverage,
  formsSignedLabel,
  participantsCoveredLabel,
  peopleOnForm,
  waiverCoverage,
} from "./waiverCoverage.ts";

describe("peopleOnForm", () => {
  it("covers the signer alone, or the signer and every minor on the form", () => {
    assert.equal(peopleOnForm({ status: "completed", minors: [] }), 1);
    assert.equal(peopleOnForm({ status: "completed", minors: ["Ava", "Leo"] }), 3);
    assert.equal(peopleOnForm({ status: "completed", minorsCount: 2 }), 3);
  });

  it("covers nobody until the form is signed", () => {
    assert.equal(peopleOnForm({ status: "pending", minors: ["Ava"] }), 0);
    assert.equal(peopleOnForm({ status: "expired", minorsCount: 1 }), 0);
  });
});

describe("waiverCoverage", () => {
  it("counts participants apart from forms, each person once", () => {
    const totals = waiverCoverage([
      { status: "completed", minors: ["Ava", "Leo"], checkedInAt: "2026-10-15T10:00:00Z" },
      { status: "completed", minors: [] },
      { status: "completed", minorsCount: 1 },
      { status: "completed", minors: [] },
      { status: "pending", minors: ["Mia"] },
    ]);
    assert.deepEqual(totals, {
      participants: 7,
      forms: 4,
      notSigned: 1,
      minors: 3,
      participantsCheckedIn: 3,
    });
  });

  it("gives zeros for no forms", () => {
    assert.deepEqual(waiverCoverage([]), {
      participants: 0,
      forms: 0,
      notSigned: 0,
      minors: 0,
      participantsCheckedIn: 0,
    });
  });
});

describe("entityCoverage", () => {
  const waivers = [
    { status: "completed", minors: ["Ava"] },
    { status: "pending", minors: [] },
  ];

  it("prefers the server's totals", () => {
    assert.deepEqual(
      entityCoverage({
        waivers,
        summary: { completed: 4, pending: 2, peopleCovered: 6, peopleCheckedIn: 1 },
      }),
      { participants: 6, forms: 4, notSigned: 2, participantsCheckedIn: 1 },
    );
  });

  it("counts the forms itself when an older server sends no coverage", () => {
    assert.deepEqual(
      entityCoverage({
        waivers,
        summary: { completed: 1, pending: 1, peopleCovered: null, peopleCheckedIn: null },
      }),
      { participants: 2, forms: 1, notSigned: 1, participantsCheckedIn: 0 },
    );
  });
});

describe("labels", () => {
  it("read the web's way", () => {
    assert.equal(
      `${participantsCoveredLabel(5)} · ${formsSignedLabel(4)}`,
      "5 participants covered · 4 waiver forms signed",
    );
    assert.equal(participantsCoveredLabel(1), "1 participant covered");
    assert.equal(formsSignedLabel(1), "1 waiver form signed");
  });
});
