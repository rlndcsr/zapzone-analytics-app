import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { packagesValidForSlot, type SchedulePackageCandidate } from "./packageCandidates.ts";

describe("packagesValidForSlot", () => {
  it("auto-selects when exactly one package is valid", () => {
    const candidates: SchedulePackageCandidate[] = [
      { packageId: 1, roomIds: [10], openMinutes: 600, closeMinutes: 1320 },
    ];
    assert.deepEqual(packagesValidForSlot(candidates, 10, 700), [1]);
  });

  it("narrows to every package valid for the room and minute, not just the first", () => {
    const candidates: SchedulePackageCandidate[] = [
      { packageId: 1, roomIds: [10, 11], openMinutes: 600, closeMinutes: 1320 },
      { packageId: 2, roomIds: [10], openMinutes: 600, closeMinutes: 1320 },
      { packageId: 3, roomIds: [12], openMinutes: 600, closeMinutes: 1320 }, // different room
    ];
    assert.deepEqual(packagesValidForSlot(candidates, 10, 700), [1, 2]);
  });

  it("returns an empty list when no package covers the room/time", () => {
    const candidates: SchedulePackageCandidate[] = [
      { packageId: 1, roomIds: [10], openMinutes: 600, closeMinutes: 700 },
    ];
    assert.deepEqual(packagesValidForSlot(candidates, 10, 800), []);
  });

  it("excludes a package whose closed range covers the minute", () => {
    const candidates: SchedulePackageCandidate[] = [
      {
        packageId: 1,
        roomIds: [10],
        openMinutes: 600,
        closeMinutes: 1320,
        closedRanges: [{ startMinutes: 720, endMinutes: 780 }],
      },
    ];
    assert.deepEqual(packagesValidForSlot(candidates, 10, 740), []);
    assert.deepEqual(packagesValidForSlot(candidates, 10, 700), [1]);
  });

  it("respects the room's own open/close, not just the minute range on the package", () => {
    const candidates: SchedulePackageCandidate[] = [
      { packageId: 1, roomIds: [10], openMinutes: 600, closeMinutes: 660 },
    ];
    assert.deepEqual(packagesValidForSlot(candidates, 10, 660), []); // half-open interval
    assert.deepEqual(packagesValidForSlot(candidates, 10, 659), [1]);
  });
});
