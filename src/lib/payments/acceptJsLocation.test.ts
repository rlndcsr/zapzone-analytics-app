import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { credentialsMatchChargeLocation } from "./acceptJsLocation.ts";

describe("credentialsMatchChargeLocation", () => {
  it("matches when both locations are the same known id", () => {
    assert.equal(credentialsMatchChargeLocation(5, 5), true);
  });

  it("does not match when the credentials are for a different location", () => {
    assert.equal(credentialsMatchChargeLocation(5, 8), false);
  });

  it("does not match when credentials have not loaded yet", () => {
    assert.equal(credentialsMatchChargeLocation(null, 5), false);
  });

  it("does not match when the charge location is not yet known", () => {
    assert.equal(credentialsMatchChargeLocation(5, null), false);
  });

  it("does not match when neither is known", () => {
    assert.equal(credentialsMatchChargeLocation(null, null), false);
  });
});
