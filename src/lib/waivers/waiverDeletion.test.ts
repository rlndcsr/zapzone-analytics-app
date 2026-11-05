import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canDeleteWaivers,
  deletionReasonPayload,
  submitWaiverDeletion,
  waiverDeleteSubject,
} from "./waiverDeletion.ts";

/** A fake DELETE that records what it was sent. */
function recorder(fail?: Error) {
  const calls: { token: string; id: number; reason: string }[] = [];
  const remove = async (token: string, id: number, reason: string) => {
    calls.push({ token, id, reason });
    if (fail) throw fail;
  };
  return { calls, remove };
}

describe("canDeleteWaivers", () => {
  it("lets only a company admin delete", () => {
    assert.equal(canDeleteWaivers("company_admin", true), true);
    assert.equal(canDeleteWaivers("location_manager", true), false);
    assert.equal(canDeleteWaivers("attendant", true), false);
    assert.equal(canDeleteWaivers(undefined, true), false);
  });
  it("honours the company switch, defaulting to on before settings load", () => {
    assert.equal(canDeleteWaivers("company_admin", false), false);
    assert.equal(canDeleteWaivers("company_admin", undefined), true);
    assert.equal(canDeleteWaivers("company_admin", null), true);
  });
});

describe("waiverDeleteSubject", () => {
  it("names the guest, or falls back like the web modal", () => {
    assert.equal(waiverDeleteSubject("Ana Diaz"), "Ana Diaz");
    assert.equal(waiverDeleteSubject("  Ana Diaz "), "Ana Diaz");
    assert.equal(waiverDeleteSubject(""), "this guest");
    assert.equal(waiverDeleteSubject(null), "this guest");
  });
});

describe("deletionReasonPayload", () => {
  it("trims the reason and leaves it empty when none was given", () => {
    assert.equal(deletionReasonPayload("  Duplicate signing  "), "Duplicate signing");
    assert.equal(deletionReasonPayload(""), "");
    assert.equal(deletionReasonPayload("   "), "");
  });
});

describe("submitWaiverDeletion", () => {
  it("deletes without a reason", async () => {
    const { calls, remove } = recorder();
    const lock = { current: false };
    const res = await submitWaiverDeletion({ token: "t", waiverId: 7, reason: "", lock, remove });
    assert.deepEqual(res, { status: "deleted" });
    assert.deepEqual(calls, [{ token: "t", id: 7, reason: "" }]);
    assert.equal(lock.current, false);
  });

  it("sends the optional reason, trimmed", async () => {
    const { calls, remove } = recorder();
    const res = await submitWaiverDeletion({
      token: "t",
      waiverId: 7,
      reason: " Signed twice ",
      lock: { current: false },
      remove,
    });
    assert.equal(res.status, "deleted");
    assert.equal(calls[0].reason, "Signed twice");
  });

  it("refuses a second submission while one is in flight", async () => {
    let release: () => void = () => {};
    const calls: number[] = [];
    const remove = (_t: string, id: number) => {
      calls.push(id);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const lock = { current: false };
    const first = submitWaiverDeletion({ token: "t", waiverId: 7, reason: "", lock, remove });
    const second = await submitWaiverDeletion({ token: "t", waiverId: 7, reason: "", lock, remove });
    assert.deepEqual(second, { status: "busy" });
    release();
    assert.deepEqual(await first, { status: "deleted" });
    assert.deepEqual(calls, [7]);
    assert.equal(lock.current, false);
  });

  it("reports the server's message on failure and frees the lock for a retry", async () => {
    const { calls, remove } = recorder(new Error("You cannot delete this waiver."));
    const lock = { current: false };
    const res = await submitWaiverDeletion({ token: "t", waiverId: 7, reason: "x", lock, remove });
    assert.deepEqual(res, { status: "failed", message: "You cannot delete this waiver." });
    assert.equal(calls.length, 1);
    assert.equal(lock.current, false);
  });

  it("falls back to a plain message when the error has none", async () => {
    const { remove } = recorder(new Error(""));
    const res = await submitWaiverDeletion({
      token: "t",
      waiverId: 7,
      reason: "",
      lock: { current: false },
      remove,
    });
    assert.deepEqual(res, { status: "failed", message: "Could not delete this waiver." });
  });

  it("sends nothing when signed out", async () => {
    const { calls, remove } = recorder();
    const res = await submitWaiverDeletion({
      token: null,
      waiverId: 7,
      reason: "",
      lock: { current: false },
      remove,
    });
    assert.deepEqual(res, { status: "unauthenticated" });
    assert.equal(calls.length, 0);
  });
});
