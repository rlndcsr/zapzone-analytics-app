import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSingleFlight } from "./singleFlight.ts";

/** A promise plus the handles to settle it from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("takes the lock synchronously: two starts in the same tick run fn once", async () => {
    const guard = createSingleFlight();
    const gate = deferred<string>();
    let calls = 0;
    const fn = () => {
      calls += 1;
      return gate.promise;
    };

    const first = guard.run("pay:9", "session-A", fn);
    const second = guard.run("pay:9", "session-A", fn);

    assert.equal(calls, 1);
    assert.equal(await second, null);
    gate.resolve("done");
    assert.equal(await first, "done");
  });

  it("lets different keys run at the same time", async () => {
    const guard = createSingleFlight();
    const a = deferred<number>();
    const b = deferred<number>();
    let calls = 0;

    const first = guard.run("pay:1", "session-A", () => {
      calls += 1;
      return a.promise;
    });
    const second = guard.run("pay:2", "session-A", () => {
      calls += 1;
      return b.promise;
    });

    assert.equal(calls, 2);
    a.resolve(1);
    b.resolve(2);
    assert.deepEqual([await first, await second], [1, 2]);
  });

  it("releases the key after fn resolves, so the same owner can run again", async () => {
    const guard = createSingleFlight();
    assert.equal(await guard.run("pay:9", "session-A", async () => "one"), "one");
    assert.equal(guard.isRunning("pay:9", "session-A"), false);
    assert.equal(await guard.run("pay:9", "session-A", async () => "two"), "two");
  });

  it("releases the key after fn rejects and propagates the rejection", async () => {
    const guard = createSingleFlight();
    await assert.rejects(
      guard.run("pay:9", "session-A", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(guard.isRunning("pay:9", "session-A"), false);
    assert.equal(await guard.run("pay:9", "session-A", async () => "again"), "again");
  });

  it("releases the key when fn throws synchronously", async () => {
    const guard = createSingleFlight();
    await assert.rejects(
      guard.run("pay:9", "session-A", () => {
        throw new Error("sync boom");
      }),
      /sync boom/,
    );
    assert.equal(guard.isRunning("pay:9", "session-A"), false);
  });

  it("never lets an older session's unresolved attempt block a newer session", async () => {
    const guard = createSingleFlight();
    const never = new Promise<string>(() => {});
    let newerCalls = 0;

    void guard.run("pay:9", "session-OLD", () => never);
    const newer = await guard.run("pay:9", "session-NEW", async () => {
      newerCalls += 1;
      return "newer";
    });

    assert.equal(newerCalls, 1);
    assert.equal(newer, "newer");
    assert.equal(guard.isRunning("pay:9", "session-NEW"), false);
  });

  it("an older session settling late never releases the newer session's lock", async () => {
    const guard = createSingleFlight();
    const old = deferred<string>();
    const newer = deferred<string>();

    const oldRun = guard.run("pay:9", "session-OLD", () => old.promise);
    const newRun = guard.run("pay:9", "session-NEW", () => newer.promise);

    old.resolve("late");
    assert.equal(await oldRun, "late");

    // The newer session still holds the key: a third start by it is refused.
    assert.equal(guard.isRunning("pay:9", "session-NEW"), true);
    let thirdCalls = 0;
    const third = await guard.run("pay:9", "session-NEW", async () => {
      thirdCalls += 1;
      return "third";
    });
    assert.equal(third, null);
    assert.equal(thirdCalls, 0);

    newer.resolve("newer");
    assert.equal(await newRun, "newer");
    assert.equal(guard.isRunning("pay:9", "session-NEW"), false);
  });

  it("isRunning reports only the owner that holds the key", async () => {
    const guard = createSingleFlight();
    const gate = deferred<void>();
    const run = guard.run("pay:9", "session-A", () => gate.promise);

    assert.equal(guard.isRunning("pay:9", "session-A"), true);
    assert.equal(guard.isRunning("pay:9", "session-B"), false);
    assert.equal(guard.isRunning("pay:10", "session-A"), false);

    gate.resolve();
    await run;
    assert.equal(guard.isRunning("pay:9", "session-A"), false);
  });
});
