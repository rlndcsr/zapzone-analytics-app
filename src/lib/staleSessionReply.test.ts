import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isStaleSessionReply } from "./staleSessionReply.ts";

describe("isStaleSessionReply", () => {
  it("treats a 401 for the signed-in token as the current session's", () => {
    assert.equal(isStaleSessionReply("tok-new", "tok-new"), false);
  });

  it("ignores a 401 for a token the app has since left", () => {
    assert.equal(isStaleSessionReply("tok-old", "tok-new"), true);
    assert.equal(isStaleSessionReply("tok-old", null), true);
  });

  it("leaves unauthenticated requests to the normal rules", () => {
    assert.equal(isStaleSessionReply(undefined, "tok-new"), false);
  });
});
