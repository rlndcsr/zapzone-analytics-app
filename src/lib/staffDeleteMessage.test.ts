import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { staffDeleteMessage } from "./staffDeleteMessage.ts";

const failure = (message: string, status: number) => Object.assign(new Error(message), { status });
const FALLBACK = "Failed to delete account. Please try again.";

describe("staffDeleteMessage", () => {
  it("shows the server's reason when it refuses the delete", () => {
    assert.equal(
      staffDeleteMessage(failure("Forbidden: you cannot delete your own account", 403), FALLBACK),
      "Forbidden: you cannot delete your own account",
    );
    assert.equal(
      staffDeleteMessage(failure("This account created promo codes, which would be deleted with it.", 409), FALLBACK),
      "This account created promo codes, which would be deleted with it.",
    );
  });

  it("shows a plain message when the server could not answer", () => {
    assert.equal(staffDeleteMessage(failure("SQLSTATE[23000]: Integrity constraint violation", 500), FALLBACK), FALLBACK);
    assert.equal(staffDeleteMessage(failure("Network error. Please check your connection.", 0), FALLBACK), FALLBACK);
    assert.equal(staffDeleteMessage(new Error("boom"), FALLBACK), FALLBACK);
    assert.equal(staffDeleteMessage(failure("", 422), FALLBACK), FALLBACK);
  });
});
