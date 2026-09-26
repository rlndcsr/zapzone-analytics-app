import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { globalNotePayload } from "./globalNotePayload.ts";

const form = (over: Partial<Parameters<typeof globalNotePayload>[0]> = {}) => ({
  title: "Arrive early",
  content: "Please arrive 15 minutes before your time.",
  isActive: true,
  global: false,
  packageIds: [3, 7],
  ...over,
});

describe("globalNotePayload", () => {
  it("sends a note pinned to packages as those packages", () => {
    assert.deepEqual(globalNotePayload(form()).package_ids, [3, 7]);
  });

  it("sends a global note as null packages, never an empty list", () => {
    // an empty list matches no package, so the note would show nowhere
    assert.equal(globalNotePayload(form({ global: true })).package_ids, null);
    assert.equal(globalNotePayload(form({ global: true, packageIds: [3] })).package_ids, null);
  });

  it("sends a cleared title as null so it is actually removed", () => {
    assert.equal(globalNotePayload(form({ title: "" })).title, null);
    assert.equal(globalNotePayload(form({ title: "   " })).title, null);
    assert.equal(JSON.stringify(globalNotePayload(form({ title: "" }))).includes('"title":null'), true);
  });

  it("keeps a title and content, trimmed", () => {
    const body = globalNotePayload(form({ title: " Parking ", content: " Use lot B. " }));
    assert.equal(body.title, "Parking");
    assert.equal(body.content, "Use lot B.");
  });
});
