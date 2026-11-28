import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSingleFlight } from "../singleFlight.ts";
import {
  executeRefund,
  hasRetryWarning,
  nextRetryWarnings,
  REFUND_RETRY_WARNING,
  REFUND_TIMEOUT_MS,
  refundConfirmMessage,
  retryWarningKey,
  runRefundFlow,
  type RequestFn,
} from "./refundFlow.ts";
import type { RefundOutcome } from "./refundOutcome.ts";

type Call = { path: string; options: Parameters<RequestFn>[1] };

/** A fake request function that records every call and answers with `answer`. */
function fakeRequest(answer: () => Promise<unknown>) {
  const calls: Call[] = [];
  const request: RequestFn = (path, options) => {
    calls.push({ path, options });
    return answer();
  };
  return { request, calls };
}

const REFUNDED = { success: true, refund_amount: "50.00", data: { refund_payment: { id: 41 } } };
const VOIDED = { success: true, was_void_fallback: true, void_amount: "50.00", payable_cancelled: true };

describe("executeRefund — the single refund request (injected request function)", () => {
  it("sends exactly one PATCH with an empty body, the token and the 60 s refund timeout", async () => {
    const { request, calls } = fakeRequest(async () => REFUNDED);
    await executeRefund(request, "tok-A", 9);
    assert.equal(REFUND_TIMEOUT_MS, 60000);
    assert.deepEqual(calls, [
      { path: "/api/payments/9/refund", options: { method: "PATCH", body: {}, token: "tok-A", timeoutMs: 60000 } },
    ]);
  });

  it("classifies a resolved refund and a resolved void-instead", async () => {
    assert.equal((await executeRefund(fakeRequest(async () => REFUNDED).request, "t", 9)).row, "S3");
    assert.equal((await executeRefund(fakeRequest(async () => VOIDED).request, "t", 9)).row, "S1");
  });

  it("a transport failure (status 0) is unknown, not failed", async () => {
    const { request, calls } = fakeRequest(async () => {
      throw Object.assign(new Error("Request timed out after 60s."), { status: 0, body: new Error("abort") });
    });
    assert.deepEqual(await executeRefund(request, "t", 9), { kind: "unknown", row: "U1" });
    assert.equal(calls.length, 1);
  });

  it("a generic 500 is unknown and a gateway decline with a code is failed — one call each", async () => {
    const generic = fakeRequest(async () => {
      throw Object.assign(new Error("x"), { status: 500, body: { success: false, message: "Refund processing failed: x" } });
    });
    const declined = fakeRequest(async () => {
      throw Object.assign(new Error("Declined"), {
        status: 400,
        body: { success: false, message: "Declined", error_code: "E00040", is_unsettled: false },
      });
    });
    assert.equal((await executeRefund(generic.request, "t", 9)).row, "U3");
    assert.equal((await executeRefund(declined.request, "t", 9)).kind, "failed");
    for (const { calls } of [generic, declined]) {
      assert.equal(calls.length, 1);
      assert.equal(calls[0].path, "/api/payments/9/refund");
    }
  });

  it("never touches the void, status or any other path", async () => {
    for (const answer of [async () => REFUNDED, async () => VOIDED, async () => Promise.reject({ status: 0 })]) {
      const { request, calls } = fakeRequest(answer);
      await executeRefund(request, "t", 9);
      assert.deepEqual(calls.map((c) => c.path), ["/api/payments/9/refund"]);
    }
  });

  it("a request that never settles (a 401 in the shared client) leaves executeRefund pending", async () => {
    const { request } = fakeRequest(() => new Promise(() => {}));
    const result = await Promise.race([
      executeRefund(request, "t", 9).then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    assert.equal(result, "pending");
  });
});

/** Spies for runRefundFlow, recording the order of every side effect. */
function flowHarness(outcome: RefundOutcome | (() => Promise<RefundOutcome>), opts: { sessionCurrent?: boolean; reloadFails?: boolean } = {}) {
  const log: string[] = [];
  let refundCalls = 0;
  const deps = {
    key: "9",
    owner: "session-A" as unknown,
    guard: createSingleFlight(),
    refund: () => {
      refundCalls += 1;
      log.push("refund");
      return typeof outcome === "function" ? outcome() : Promise.resolve(outcome);
    },
    isSessionCurrent: () => opts.sessionCurrent ?? true,
    setBusy: (b: boolean) => log.push(`busy:${b}`),
    closeSheet: () => log.push("close"),
    notify: (title: string, message: string) => log.push(`notify:${title}|${message}`),
    noticeFor: (o: RefundOutcome) => ({ title: o.kind, message: o.row }),
    applyWarning: (o: RefundOutcome) => log.push(`warn:${o.row}`),
    reload: async () => {
      log.push("reload");
      if (opts.reloadFails) throw new Error("list failed");
    },
  };
  return { deps, log, refundCalls: () => refundCalls };
}

describe("runRefundFlow — feedback, refresh and retry safety (injected callbacks)", () => {
  it("confirmed and unknown outcomes: close, notify once, record the warning, then reload", async () => {
    for (const outcome of [
      { kind: "refunded", row: "S3", amount: 50, refundPaymentId: 41 },
      { kind: "voided", row: "S1", amount: null, cancelled: true },
      { kind: "unknown", row: "U1" },
    ] as RefundOutcome[]) {
      const h = flowHarness(outcome);
      assert.deepEqual(await runRefundFlow(h.deps), outcome);
      assert.deepEqual(h.log, [
        "busy:true",
        "refund",
        "close",
        `notify:${outcome.kind}|${outcome.row}`,
        `warn:${outcome.row}`,
        "reload",
        "busy:false",
      ]);
    }
  });

  it("a confirmed failure only notifies: the sheet stays open and nothing reloads", async () => {
    const h = flowHarness({ kind: "failed", row: "F2", message: "Declined" });
    await runRefundFlow(h.deps);
    assert.deepEqual(h.log, ["busy:true", "refund", "notify:failed|F2", "warn:F2", "busy:false"]);
  });

  it("a failing reload never repeats or changes the feedback, and still frees the lock", async () => {
    const h = flowHarness({ kind: "unknown", row: "U3" }, { reloadFails: true });
    await runRefundFlow(h.deps);
    assert.equal(h.log.filter((l) => l.startsWith("notify")).length, 1);
    assert.equal(h.log.filter((l) => l.startsWith("warn")).length, 1);
    assert.equal(h.log.at(-1), "busy:false");
    assert.equal(h.deps.guard.isRunning("9", "session-A"), false);
    assert.equal(h.refundCalls(), 1);
  });

  it("an unknown outcome followed by an 'unchanged' reload is not re-classified or retried", async () => {
    const h = flowHarness({ kind: "unknown", row: "U1" });
    await runRefundFlow(h.deps);
    assert.equal(h.refundCalls(), 1);
    assert.deepEqual(h.log.filter((l) => l.startsWith("notify")), ["notify:unknown|U1"]);
  });

  it("two confirmations in the same tick start only one refund", async () => {
    let release!: (o: RefundOutcome) => void;
    const h = flowHarness(() => new Promise<RefundOutcome>((r) => (release = r)));
    const first = runRefundFlow(h.deps);
    const second = runRefundFlow(h.deps);
    assert.equal(await second, null);
    release({ kind: "refunded", row: "S3", amount: null, refundPaymentId: null });
    await first;
    assert.equal(h.refundCalls(), 1);
    assert.equal(h.log.filter((l) => l === "busy:true").length, 1);
  });

  it("the same payment can be refunded again once the earlier attempt settled", async () => {
    const h = flowHarness({ kind: "failed", row: "F1", message: "x" });
    await runRefundFlow(h.deps);
    await runRefundFlow(h.deps);
    assert.equal(h.refundCalls(), 2);
  });

  it("a late answer for a session that is no longer current shows nothing and refreshes nothing", async () => {
    const h = flowHarness({ kind: "refunded", row: "S3", amount: 50, refundPaymentId: 41 }, { sessionCurrent: false });
    await runRefundFlow(h.deps);
    assert.deepEqual(h.log, ["busy:true", "refund", "busy:false"]);
    assert.equal(h.deps.guard.isRunning("9", "session-A"), false);
  });

  it("an older session's unresolved refund does not block the current session", async () => {
    const guard = createSingleFlight();
    const old = flowHarness(() => new Promise<RefundOutcome>(() => {}));
    const current = flowHarness({ kind: "refunded", row: "S3", amount: null, refundPaymentId: null });
    old.deps.guard = guard;
    current.deps.guard = guard;
    current.deps.owner = "session-B";

    void runRefundFlow(old.deps);
    assert.notEqual(await runRefundFlow(current.deps), null);
    assert.equal(current.refundCalls(), 1);
  });
});

describe("advisory retry warning (D-1, FR-021)", () => {
  const unknown: RefundOutcome = { kind: "unknown", row: "U4" };
  const failed: RefundOutcome = { kind: "failed", row: "F1", message: "x" };
  const refunded: RefundOutcome = { kind: "refunded", row: "S3", amount: null, refundPaymentId: null };
  const voided: RefundOutcome = { kind: "voided", row: "S2", amount: null, cancelled: false };

  it("keys the warning by account and payment", () => {
    assert.equal(retryWarningKey(5, 9), "5:9");
    assert.equal(retryWarningKey(null, 9), null);
  });

  it("records on unknown, keeps on failure and on further unknowns, clears only on a confirmed success", () => {
    const empty: ReadonlySet<string> = new Set();
    const afterUnknown = nextRetryWarnings(empty, unknown, 5, 9);
    assert.equal(hasRetryWarning(afterUnknown, 5, 9), true);
    assert.equal(hasRetryWarning(nextRetryWarnings(afterUnknown, failed, 5, 9), 5, 9), true);
    assert.equal(hasRetryWarning(nextRetryWarnings(afterUnknown, unknown, 5, 9), 5, 9), true);
    assert.equal(hasRetryWarning(nextRetryWarnings(afterUnknown, refunded, 5, 9), 5, 9), false);
    assert.equal(hasRetryWarning(nextRetryWarnings(afterUnknown, voided, 5, 9), 5, 9), false);
  });

  it("only touches its own key, never mutates its input, and records nothing without an account", () => {
    const start: ReadonlySet<string> = new Set(["5:9", "5:10"]);
    const cleared = nextRetryWarnings(start, refunded, 5, 9);
    assert.deepEqual([...cleared], ["5:10"]);
    assert.deepEqual([...start], ["5:9", "5:10"]);
    assert.equal(nextRetryWarnings(new Set(), unknown, null, 9).size, 0);
  });

  it("is invisible to another account and to another payment", () => {
    const set = nextRetryWarnings(new Set(), unknown, 5, 9);
    assert.equal(hasRetryWarning(set, 5, 9), true);
    assert.equal(hasRetryWarning(set, 6, 9), false);
    assert.equal(hasRetryWarning(set, 5, 10), false);
    assert.equal(hasRetryWarning(set, null, 9), false);
  });

  it("appends the approved sentence to the confirmation only when the warning applies", () => {
    const base = "Refund $50.00 to the original card via Authorize.Net? This cannot be undone.";
    assert.equal(refundConfirmMessage(base, false), base);
    assert.equal(
      REFUND_RETRY_WARNING,
      "The outcome of a previous refund attempt could not be confirmed. Verify the transaction before proceeding with another refund.",
    );
    const warned = refundConfirmMessage(base, true);
    assert.ok(warned.startsWith(base));
    assert.ok(warned.endsWith(REFUND_RETRY_WARNING));
  });
});
