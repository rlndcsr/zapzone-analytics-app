import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deferUpdatePrompt,
  isUpdatePromptDeferred,
  reopenUpdatePrompt,
  subscribeToUpdatePrompt,
} from "./appUpdatePrompt.ts";

// One module-level store, so these run as one sequence over a single instance
// rather than as independent cases — the order below is the user's journey.
describe("the update prompt's deferral state", () => {
  it("starts with the dialog in charge", () => {
    assert.equal(isUpdatePromptDeferred(), false);
  });

  it("hands over to the standing notice when Later is tapped", () => {
    deferUpdatePrompt();
    assert.equal(isUpdatePromptDeferred(), true);
  });

  it("stays deferred — there is no way to dismiss the notice away", () => {
    // The reminder is meant to outlive the dialog and follow the user across
    // every screen, so nothing here can switch it back off. Only reopening the
    // dialog (and installing) ends it.
    deferUpdatePrompt();
    assert.equal(isUpdatePromptDeferred(), true);
  });

  it("reopening from the notice or Settings brings the dialog back", () => {
    reopenUpdatePrompt();
    assert.equal(isUpdatePromptDeferred(), false);
  });

  it("a second Later behaves exactly like the first", () => {
    deferUpdatePrompt();
    assert.equal(isUpdatePromptDeferred(), true);
    reopenUpdatePrompt();
    assert.equal(isUpdatePromptDeferred(), false);
  });
});

describe("subscriber notifications", () => {
  it("fires only on an actual change, so repeats don't re-render", () => {
    let calls = 0;
    const unsubscribe = subscribeToUpdatePrompt(() => {
      calls += 1;
    });

    deferUpdatePrompt();
    deferUpdatePrompt();
    assert.equal(calls, 1, "a repeated Later must not notify twice");

    reopenUpdatePrompt();
    reopenUpdatePrompt();
    assert.equal(calls, 2, "reopening an already-open prompt must not notify");

    unsubscribe();
    deferUpdatePrompt();
    assert.equal(calls, 2, "an unsubscribed listener must stop hearing");
    reopenUpdatePrompt();
  });
});
