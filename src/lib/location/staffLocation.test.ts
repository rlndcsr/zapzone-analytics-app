import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthUser } from "../../services/auth.ts";
import {
  canSwitchLocation,
  homeLocationIdOf,
  reopenTarget,
  stateFromUserPayload,
  withStaffLocation,
  workLocationsOf,
  type StaffLocationState,
} from "./staffLocation.ts";

const NORTH = { id: 1, name: "North", city: "Detroit", state: "MI" };
const SOUTH = { id: 2, name: "South", city: "Toledo", state: "OH" };

function manager(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 7,
    company_id: 3,
    location_id: 1,
    first_name: "Sam",
    last_name: "Lee",
    name: "Sam Lee",
    email: "sam@example.com",
    role: "location_manager",
    status: "active",
    location: { id: 1, name: "North", timezone: "America/Detroit" },
    home_location_id: 1,
    work_locations: [NORTH, SOUTH],
    ...over,
  };
}

function state(over: Partial<StaffLocationState> = {}): StaffLocationState {
  return {
    active_location_id: 2,
    active_location_name: "South",
    home_location_id: 1,
    can_switch: true,
    locations: [NORTH, SOUTH],
    ...over,
  };
}

describe("workLocationsOf / canSwitchLocation", () => {
  it("lets a manager with several locations switch", () => {
    assert.deepEqual(workLocationsOf(manager()), [NORTH, SOUTH]);
    assert.equal(canSwitchLocation(manager()), true);
  });

  it("hides the switch for a single location or a payload without the field", () => {
    assert.equal(canSwitchLocation(manager({ work_locations: [NORTH] })), false);
    assert.equal(canSwitchLocation(manager({ work_locations: undefined })), false);
  });

  it("never offers locations to other roles", () => {
    assert.deepEqual(workLocationsOf(manager({ role: "attendant" })), []);
    assert.deepEqual(workLocationsOf(manager({ role: "company_admin" })), []);
    assert.deepEqual(workLocationsOf(null), []);
  });
});

describe("homeLocationIdOf", () => {
  it("prefers the server's home location and falls back to location_id", () => {
    assert.equal(homeLocationIdOf(manager({ location_id: 2, home_location_id: 1 })), 1);
    assert.equal(homeLocationIdOf(manager({ home_location_id: undefined })), 1);
  });
});

describe("reopenTarget", () => {
  it("reopens a remembered location that is still assigned", () => {
    assert.equal(reopenTarget(manager(), 2), 2);
  });

  it("ignores no memory, the location already active, or one no longer assigned", () => {
    assert.equal(reopenTarget(manager(), null), null);
    assert.equal(reopenTarget(manager(), 1), null);
    assert.equal(reopenTarget(manager(), 99), null);
    assert.equal(reopenTarget(manager({ role: "attendant" }), 2), null);
  });
});

describe("withStaffLocation", () => {
  it("moves only the location fields to the active location", () => {
    const user = manager();
    const next = withStaffLocation(user, state());
    assert.equal(next.location_id, 2);
    assert.deepEqual(next.location, { id: 2, name: "South", city: "Toledo", state: "OH" });
    assert.equal(next.home_location_id, 1);
    assert.deepEqual(next.work_locations, [NORTH, SOUTH]);
    assert.equal(next.id, user.id);
    assert.equal(next.role, user.role);
    assert.equal(next.email, user.email);
    assert.equal(user.location_id, 1, "input left untouched");
  });

  it("keeps the loaded location relation when the active location is unchanged", () => {
    const user = manager();
    const next = withStaffLocation(user, state({ active_location_id: 1, active_location_name: "North" }));
    assert.equal(next.location, user.location);
  });

  it("drops a removed assignment from the list", () => {
    const next = withStaffLocation(manager(), state({ active_location_id: 1, locations: [NORTH] }));
    assert.deepEqual(next.work_locations, [NORTH]);
    assert.equal(canSwitchLocation(next), false);
  });
});

describe("stateFromUserPayload", () => {
  it("reads the active location from GET /api/user", () => {
    assert.deepEqual(
      stateFromUserPayload({ id: 7, location_id: 2, home_location_id: 1, work_locations: [NORTH, SOUTH] }),
      state(),
    );
  });

  it("returns null when the backend does not send work locations", () => {
    assert.equal(stateFromUserPayload({ id: 7, location_id: 1 }), null);
    assert.equal(stateFromUserPayload(null), null);
  });
});
