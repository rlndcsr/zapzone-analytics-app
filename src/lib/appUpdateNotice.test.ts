import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldShowUpdateNotice } from "./appUpdateNotice.ts";

/** An optional update with a download waiting — the case the notice is for. */
const PENDING = { hasUpdate: true, requiresUpdate: false, apkUrl: "https://x/a.apk" };

const show = (over: Partial<Parameters<typeof shouldShowUpdateNotice>[0]> = {}) =>
  shouldShowUpdateNotice({
    status: PENDING,
    deferred: true,
    pathname: "/home",
    ...over,
  });

describe("the reminder stays put once the update is declined", () => {
  it("shows on every screen, not just the one the dialog was declined on", () => {
    for (const pathname of [
      "/home",
      "/calendar",
      "/profile",
      "/bookings",
      "/settings/settings",
      "/check-in",
      "/attractions/purchases",
      "/events/purchases",
      "/notification/notification",
    ]) {
      assert.equal(show({ pathname }), true, pathname);
    }
  });

  it("shows on the login screen too", () => {
    // A slim bar, not a modal over the login form — and a signed-out user on
    // an out-of-date build is exactly who needs telling.
    assert.equal(show({ pathname: "/" }), true);
  });

  it("is held back only for the splash animation", () => {
    assert.equal(show({ pathname: "/splash" }), false);
  });

  it("is not shown before the user has declined the dialog", () => {
    // Until then the dialog itself is up; two prompts at once would be silly.
    assert.equal(show({ deferred: false }), false);
  });
});

describe("the reminder ends when the app is updated", () => {
  it("disappears once the installed build is current", () => {
    // The install relaunches the app as the new build, the launch check comes
    // back with hasUpdate: false, and the notice retires itself — no one has
    // to remember to clear the deferral.
    assert.equal(
      show({ status: { ...PENDING, hasUpdate: false } }),
      false,
      "an up-to-date build must never show the reminder",
    );
  });

  it("stays gone even though the user had declined the old update", () => {
    assert.equal(
      shouldShowUpdateNotice({
        status: { hasUpdate: false, requiresUpdate: false, apkUrl: "https://x/a.apk" },
        deferred: true,
        pathname: "/home",
      }),
      false,
    );
  });
});

describe("cases the notice is not responsible for", () => {
  it("stands aside for a forced update, which blocks instead of reminding", () => {
    assert.equal(show({ status: { ...PENDING, requiresUpdate: true } }), false);
  });

  it("says nothing when there is no download to offer", () => {
    assert.equal(show({ status: { ...PENDING, apkUrl: null } }), false);
  });

  it("says nothing while the check is unresolved or failed", () => {
    assert.equal(show({ status: null }), false);
  });
});
