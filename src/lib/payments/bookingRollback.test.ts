import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { forceDeleteOrKeep } from "./bookingRollback.ts";

/** The shape the app's ApiError gives a refusal: a status and a message. */
const refusal = (status: number) =>
  Object.assign(new Error("refused"), { status });

describe("forceDeleteOrKeep", () => {
  it("force delete succeeds: the booking is removed", async () => {
    assert.equal(await forceDeleteOrKeep(async () => {}), "force-deleted");
  });

  it("refused because the booking has payments: the booking is kept", async () => {
    const outcome = await forceDeleteOrKeep(async () => {
      throw refusal(403);
    });
    assert.equal(outcome, "kept");
  });

  it("already removed: reports it gone", async () => {
    const outcome = await forceDeleteOrKeep(async () => {
      throw refusal(404);
    });
    assert.equal(outcome, "gone");
  });

  it("any other failure keeps the booking and never throws", async () => {
    assert.equal(
      await forceDeleteOrKeep(async () => {
        throw refusal(500);
      }),
      "kept",
    );
    assert.equal(
      await forceDeleteOrKeep(async () => {
        throw new Error("network down");
      }),
      "kept",
    );
  });

  it("only ever calls the force delete once, with no soft-delete fallback", async () => {
    let calls = 0;
    await forceDeleteOrKeep(async () => {
      calls += 1;
      throw refusal(403);
    });
    assert.equal(calls, 1);
  });
});
