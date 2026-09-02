import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALL_LOCATIONS_SCOPE,
  accountingLocationParam,
} from "./accountingScope.ts";

describe("scoping an accounting report", () => {
  it("sends a chosen location as its id", () => {
    assert.equal(accountingLocationParam(7), "7");
  });

  it("sends the backend's all-locations literal for no location", () => {
    assert.equal(accountingLocationParam(null), "all");
    assert.equal(accountingLocationParam(null), ALL_LOCATIONS_SCOPE);
  });

  it("keeps location 0 a concrete location rather than all", () => {
    assert.equal(accountingLocationParam(0), "0");
  });
});
