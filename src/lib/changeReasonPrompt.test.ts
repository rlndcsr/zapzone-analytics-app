import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bodyCarriesChangeReason,
  changeReasonPromptAvailable,
  describeChangeReasonRequest,
  registerChangeReasonHandler,
  requestChangeReason,
  requiresChangeReason,
  withChangeReason,
} from "./changeReasonPrompt.ts";

describe("requiresChangeReason", () => {
  it("is true for a 422 whose errors include change_reason", () => {
    assert.equal(
      requiresChangeReason(422, { errors: { change_reason: ["The change reason field is required."] } }),
      true,
    );
  });

  it("is false for a 422 about something else", () => {
    assert.equal(requiresChangeReason(422, { errors: { guest_email: ["Invalid email."] } }), false);
  });

  it("is false for any non-422 status", () => {
    assert.equal(
      requiresChangeReason(400, { errors: { change_reason: ["required"] } }),
      false,
    );
    assert.equal(requiresChangeReason(500, null), false);
  });

  it("is false when the body has no errors object at all", () => {
    assert.equal(requiresChangeReason(422, null), false);
    assert.equal(requiresChangeReason(422, {}), false);
  });
});

describe("bodyCarriesChangeReason", () => {
  it("is false when there is no body", () => {
    assert.equal(bodyCarriesChangeReason(undefined), false);
    assert.equal(bodyCarriesChangeReason(null), false);
  });

  it("is false when change_reason is blank or whitespace", () => {
    assert.equal(bodyCarriesChangeReason({ change_reason: "" }), false);
    assert.equal(bodyCarriesChangeReason({ change_reason: "   " }), false);
  });

  it("is true when the caller already supplied a real reason", () => {
    assert.equal(bodyCarriesChangeReason({ change_reason: "Customer asked" }), true);
  });
});

describe("withChangeReason", () => {
  it("adds change_reason to an existing body without disturbing other fields", () => {
    const result = withChangeReason({ status: "cancelled" }, "Customer asked");
    assert.deepEqual(result, { status: "cancelled", change_reason: "Customer asked" });
  });

  it("creates a body when there was none (e.g. a plain DELETE)", () => {
    const result = withChangeReason(undefined, "Duplicate booking removed");
    assert.deepEqual(result, { change_reason: "Duplicate booking removed" });
  });
});

describe("describeChangeReasonRequest", () => {
  it("describes a cancel as destructive", () => {
    const { summary, destructive } = describeChangeReasonRequest("PATCH", "/api/bookings/9/cancel");
    assert.equal(summary, "Cancelling this booking");
    assert.equal(destructive, true);
  });

  it("describes a plain DELETE as destructive", () => {
    const { summary, destructive } = describeChangeReasonRequest("DELETE", "/api/bookings/9");
    assert.equal(summary, "Deleting this booking");
    assert.equal(destructive, true);
  });

  it("describes a status change as non-destructive", () => {
    const { summary, destructive } = describeChangeReasonRequest("PATCH", "/api/bookings/9/status");
    assert.equal(summary, "Changing this booking's status");
    assert.equal(destructive, false);
  });

  it("falls back to a generic update summary for an unrecognized path", () => {
    const { summary } = describeChangeReasonRequest("PATCH", "/api/bookings/9");
    assert.equal(summary, "Updating this booking");
  });
});

describe("registerChangeReasonHandler / requestChangeReason", () => {
  it("resolves null when no handler is registered", async () => {
    assert.equal(changeReasonPromptAvailable(), false);
    const result = await requestChangeReason({ summary: "test" });
    assert.equal(result, null);
  });

  it("routes the request through the registered handler and back", async () => {
    const unregister = registerChangeReasonHandler(async (req) => {
      assert.equal(req.summary, "Cancelling this booking");
      return "Customer asked";
    });
    try {
      assert.equal(changeReasonPromptAvailable(), true);
      const result = await requestChangeReason({ summary: "Cancelling this booking" });
      assert.equal(result, "Customer asked");
    } finally {
      unregister();
    }
  });

  it("unregistering restores the no-prompt default", async () => {
    const unregister = registerChangeReasonHandler(async () => "reason");
    unregister();
    assert.equal(changeReasonPromptAvailable(), false);
    assert.equal(await requestChangeReason(), null);
  });

  it("a handler that throws resolves to null rather than rejecting the caller", async () => {
    const unregister = registerChangeReasonHandler(async () => {
      throw new Error("boom");
    });
    try {
      const result = await requestChangeReason();
      assert.equal(result, null);
    } finally {
      unregister();
    }
  });

  it("registering a second handler while one is active does not leave a stale unregister able to clear it", () => {
    const unregisterFirst = registerChangeReasonHandler(async () => "first");
    const unregisterSecond = registerChangeReasonHandler(async () => "second");
    // The first handler's own unregister must not clear the second, now-active one.
    unregisterFirst();
    assert.equal(changeReasonPromptAvailable(), true);
    unregisterSecond();
    assert.equal(changeReasonPromptAvailable(), false);
  });
});
