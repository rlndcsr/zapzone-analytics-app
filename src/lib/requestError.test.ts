import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestErrorMessage } from "./requestError.ts";

const failure = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

describe("requestErrorMessage — the server's reason, or a friendly message", () => {
  it("shows the server's reason when it refused the change", () => {
    const reason = "None of these packages can be changed. They may have been deleted, or belong to a location you do not manage.";
    assert.equal(requestErrorMessage(failure(403, reason), "Could not delete package."), reason);
    assert.equal(requestErrorMessage(failure(422, "Pick a day."), "x"), "Pick a day.");
    assert.equal(requestErrorMessage(failure(409, "Taken."), "x"), "Taken.");
  });

  it("shows the friendly message when the server fails", () => {
    assert.equal(requestErrorMessage(failure(500, "SQLSTATE[42S22]: Column not found"), "Could not delete package."), "Could not delete package.");
    assert.equal(requestErrorMessage(failure(503, "Service Unavailable"), "Try again."), "Try again.");
  });

  it("shows the friendly message for a missing record", () => {
    assert.equal(requestErrorMessage(failure(404, "No query results for model [App\\Models\\Package] 9"), "Gone."), "Gone.");
  });

  it("keeps the app's own message when the request never reached the server", () => {
    const offline = "Network error. Please check your connection and try again.";
    assert.equal(requestErrorMessage(failure(0, offline), "Could not delete package."), offline);
  });

  it("falls back for an empty reason, a plain Error or a non-error", () => {
    assert.equal(requestErrorMessage(failure(403, "  "), "Fallback."), "Fallback.");
    assert.equal(requestErrorMessage(new Error("Space was not created"), "Fallback."), "Fallback.");
    assert.equal(requestErrorMessage(undefined, "Fallback."), "Fallback.");
    assert.equal(requestErrorMessage("boom", ""), "");
  });
});
