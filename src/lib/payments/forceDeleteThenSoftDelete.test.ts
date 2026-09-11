import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  forceDeleteThenSoftDelete,
  ROLLBACK_REASON,
} from "./forceDeleteThenSoftDelete.ts";

describe("forceDeleteThenSoftDelete", () => {
  it("force-delete succeeds: the soft delete is never attempted", async () => {
    let softDeleteCalled = false;
    const outcome = await forceDeleteThenSoftDelete(
      async () => {},
      async () => {
        softDeleteCalled = true;
      },
    );
    assert.equal(outcome, "force-deleted");
    assert.equal(softDeleteCalled, false);
  });

  it("force-delete fails: falls back to soft delete", async () => {
    let softDeleteCalled = false;
    const outcome = await forceDeleteThenSoftDelete(
      async () => {
        throw new Error("booking already has a payment on it");
      },
      async () => {
        softDeleteCalled = true;
      },
    );
    assert.equal(outcome, "soft-deleted");
    assert.equal(softDeleteCalled, true);
  });

  it("both fail: reports failure without throwing", async () => {
    const outcome = await forceDeleteThenSoftDelete(
      async () => {
        throw new Error("force-delete unavailable");
      },
      async () => {
        throw new Error("soft-delete also failed");
      },
    );
    assert.equal(outcome, "failed");
  });

  it("rollbackBooking's fallback reason matches the web's exact wording", () => {
    assert.equal(ROLLBACK_REASON, "Payment failed - automatic rollback");
  });
});
