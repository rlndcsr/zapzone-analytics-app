import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPackageTimeSlotRestricted,
  packageServesRoom,
  packagesValidForSlot,
  type PackageClosureDayOff,
  type SchedulePackageCandidate,
} from "./packageCandidates.ts";

describe("packageServesRoom", () => {
  it("treats a package with no room list as serving every room", () => {
    assert.equal(packageServesRoom({ rooms: [] }, 10), true);
    assert.equal(packageServesRoom(null, 10), true);
  });

  it("requires the room to be one of the package's own", () => {
    const pkg = { rooms: [{ id: 10 }, { id: 11 }] };
    assert.equal(packageServesRoom(pkg, 10), true);
    assert.equal(packageServesRoom(pkg, 12), false);
  });
});

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

describe("isPackageTimeSlotRestricted", () => {
  const today = new Date(2026, 0, 10); // Jan 10, 2026, local midnight

  it("blocks a walk-in that starts after the package closes early", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: "17:00",
        timeEnd: null,
        isRecurring: false,
        packageIds: [5],
        roomIds: [],
      },
    ];
    // starts at 17:00 — at the close boundary, so restricted
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      true,
    );
    // ends after close even though it starts before it
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 16 * 60 + 30, 17 * 60 + 15, today),
      true,
    );
    // fully before the early close
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 14 * 60, 15 * 60, today),
      false,
    );
  });

  it("blocks a walk-in that starts before a delayed opening", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: null,
        timeEnd: "12:00",
        isRecurring: false,
        packageIds: [5],
        roomIds: [],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 10 * 60, 11 * 60, today),
      true,
    );
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 13 * 60, 14 * 60, today),
      false,
    );
  });

  it("ignores a day-off scoped to a room, not a package — that closes the space, not the package", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: "17:00",
        timeEnd: null,
        isRecurring: false,
        packageIds: [],
        roomIds: [3],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      false,
    );
  });

  it("applies a venue-wide day-off (no package or room scoping) to every package", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: "17:00",
        timeEnd: null,
        isRecurring: false,
        packageIds: [],
        roomIds: [],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      true,
    );
  });

  it("skips a package-scoped day-off that names a different package", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: "17:00",
        timeEnd: null,
        isRecurring: false,
        packageIds: [9],
        roomIds: [],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      false,
    );
  });

  it("ignores a full-day day-off — that is a different concern than a time-restricted one", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2026-01-10",
        timeStart: null,
        timeEnd: null,
        isRecurring: false,
        packageIds: [5],
        roomIds: [],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      false,
    );
  });

  it("expands a recurring day-off onto this year's date", () => {
    const dayOffs: PackageClosureDayOff[] = [
      {
        date: "2020-01-10", // year is irrelevant once recurring — only month/day matter
        timeStart: "17:00",
        timeEnd: null,
        isRecurring: true,
        packageIds: [5],
        roomIds: [],
      },
    ];
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-10", 17 * 60, 18 * 60, today),
      true,
    );
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2027-01-10", 17 * 60, 18 * 60, today),
      true,
    );
    assert.equal(
      isPackageTimeSlotRestricted(dayOffs, 5, "2026-01-11", 17 * 60, 18 * 60, today),
      false,
    );
  });
});
