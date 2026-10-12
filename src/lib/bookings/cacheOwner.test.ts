import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOwnerGuard } from "./cacheOwner.ts";

describe("createOwnerGuard", () => {
  it("resets once for the first owner, then not again for the same one", () => {
    let resets = 0;
    const own = createOwnerGuard<string | null>(() => resets++);
    own("token-a");
    own("token-a");
    own("token-a");
    assert.equal(resets, 1);
  });

  it("resets when another session takes over, so its lists never show the last one's", () => {
    let resets = 0;
    const own = createOwnerGuard<string | null>(() => resets++);
    own("token-a");
    own("token-b");
    assert.equal(resets, 2);
  });

  it("treats signing out and back in as a new owner, even for the same account", () => {
    let resets = 0;
    const own = createOwnerGuard<string | null>(() => resets++);
    own("token-a");
    own(null);
    own("token-a2");
    assert.equal(resets, 3);
  });
});
