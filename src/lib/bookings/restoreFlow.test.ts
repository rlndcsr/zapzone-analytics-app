import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSingleFlight } from "../singleFlight.ts";
import { executeRestore, runRestoreFlow, type RestoreRequestFn } from "./restoreFlow.ts";
import type { RestoreOutcome } from "./restoreOutcome.ts";

function fakeRequest(answer: () => Promise<unknown>) {
  const calls: { path: string; options: Parameters<RestoreRequestFn>[1] }[] = [];
  const request: RestoreRequestFn = (path, options) => {
    calls.push({ path, options });
    return answer();
  };
  return { request, calls };
}

describe("executeRestore — the single restore request (injected request function)", () => {
  it("sends exactly one POST with no body and no custom timeout", async () => {
    const { request, calls } = fakeRequest(async () => ({ success: true, space_warning: null }));
    assert.deepEqual(await executeRestore(request, "tok-A", 12), { kind: "restored" });
    assert.deepEqual(calls, [{ path: "/api/bookings/12/restore", options: { method: "POST", token: "tok-A" } }]);
  });

  it("maps each answer to its outcome with one call every time", async () => {
    const cases: [() => Promise<unknown>, RestoreOutcome["kind"]][] = [
      [async () => ({ success: true, space_warning: "Booking restored, but … REF-1 …" }), "restored_with_warning"],
      [async () => Promise.reject({ status: 422, body: { success: false, message: "full" }, message: "full" }), "rejected"],
      [async () => Promise.reject({ status: 404, body: { message: "No query results" }, message: "No query results" }), "unknown"],
      [async () => Promise.reject({ status: 500, body: { message: "Server Error" }, message: "Server Error" }), "unknown"],
      [async () => Promise.reject({ status: 0, message: "Request timed out after 15s." }), "unknown"],
    ];
    for (const [answer, kind] of cases) {
      const { request, calls } = fakeRequest(answer);
      assert.equal((await executeRestore(request, "t", 12)).kind, kind);
      assert.equal(calls.length, 1);
    }
  });
});

function flowHarness(
  outcome: RestoreOutcome | (() => Promise<RestoreOutcome>),
  opts: { sessionCurrent?: boolean; refreshFails?: boolean } = {},
) {
  const log: string[] = [];
  let restoreCalls = 0;
  const deps = {
    key: "12",
    owner: "session-A" as unknown,
    guard: createSingleFlight(),
    restore: () => {
      restoreCalls += 1;
      log.push("restore");
      return typeof outcome === "function" ? outcome() : Promise.resolve(outcome);
    },
    isSessionCurrent: () => opts.sessionCurrent ?? true,
    setBusy: (b: boolean) => log.push(`busy:${b}`),
    closeSheet: () => log.push("close"),
    notify: (title: string, message: string) => log.push(`notify:${title}|${message}`),
    noticeFor: (o: RestoreOutcome) => ({ title: o.kind, message: "m" }),
    refresh: async () => {
      log.push("refresh");
      if (opts.refreshFails) throw new Error("lists failed");
    },
  };
  return { deps, log, restoreCalls: () => restoreCalls };
}

describe("runRestoreFlow (injected callbacks)", () => {
  it("restored, restored-with-warning and unknown: close, notify once, then refresh both lists", async () => {
    for (const outcome of [
      { kind: "restored" },
      { kind: "restored_with_warning", warning: "w" },
      { kind: "unknown" },
    ] as RestoreOutcome[]) {
      const h = flowHarness(outcome);
      await runRestoreFlow(h.deps);
      assert.deepEqual(h.log, ["busy:true", "restore", "close", `notify:${outcome.kind}|m`, "refresh", "busy:false"]);
    }
  });

  it("a confirmed rejection only notifies — no close, no refresh (today's behaviour)", async () => {
    const h = flowHarness({ kind: "rejected", message: "full" });
    await runRestoreFlow(h.deps);
    assert.deepEqual(h.log, ["busy:true", "restore", "notify:rejected|m", "busy:false"]);
  });

  it("a failing refresh never repeats or changes the feedback and frees the lock", async () => {
    const h = flowHarness({ kind: "restored" }, { refreshFails: true });
    await runRestoreFlow(h.deps);
    assert.equal(h.log.filter((l) => l.startsWith("notify")).length, 1);
    assert.equal(h.log.at(-1), "busy:false");
    assert.equal(h.deps.guard.isRunning("12", "session-A"), false);
  });

  it("two confirmations in the same tick send one restore; the booking can be restored again later", async () => {
    let release!: (o: RestoreOutcome) => void;
    const h = flowHarness(() => new Promise<RestoreOutcome>((r) => (release = r)));
    const first = runRestoreFlow(h.deps);
    assert.equal(await runRestoreFlow(h.deps), null);
    release({ kind: "unknown" });
    await first;
    assert.equal(h.restoreCalls(), 1);
    // The lock was released: a later attempt starts (and is settled here).
    const again = runRestoreFlow(h.deps);
    release({ kind: "restored" });
    assert.deepEqual(await again, { kind: "restored" });
    assert.equal(h.restoreCalls(), 2);
  });

  it("a late answer for a session that is no longer current shows nothing and refreshes nothing", async () => {
    const h = flowHarness({ kind: "restored" }, { sessionCurrent: false });
    await runRestoreFlow(h.deps);
    assert.deepEqual(h.log, ["busy:true", "restore", "busy:false"]);
  });

  it("never sends a second restore after classifying an outcome", async () => {
    for (const outcome of [
      { kind: "unknown" },
      { kind: "rejected", message: "x" },
      { kind: "restored" },
    ] as RestoreOutcome[]) {
      const h = flowHarness(outcome, { refreshFails: true });
      await runRestoreFlow(h.deps);
      assert.equal(h.restoreCalls(), 1);
    }
  });
});
