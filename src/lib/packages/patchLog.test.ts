import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPatchLog } from "./patchLog.ts";

type Row = { id: number; online: boolean; active: boolean };

describe("a switch flipped during a quiet refresh", () => {
  it("is not undone by the refresh that started before it", () => {
    const log = createPatchLog<Row>();
    const started = log.mark();
    log.record(1, { online: false });
    const answer = [{ id: 1, online: true, active: true }, { id: 2, online: true, active: true }];
    assert.deepEqual(log.replay(answer, started), [
      { id: 1, online: false, active: true },
      { id: 2, online: true, active: true },
    ]);
  });

  it("trusts a refresh that started after the change, and forgets the change", () => {
    const log = createPatchLog<Row>();
    log.record(1, { online: false });
    const started = log.mark();
    assert.deepEqual(log.replay([{ id: 1, online: true, active: true }], started), [
      { id: 1, online: true, active: true },
    ]);
    // Forgotten: an even later refresh is not overridden either.
    assert.deepEqual(log.replay([{ id: 1, online: true, active: true }], 0), [
      { id: 1, online: true, active: true },
    ]);
  });

  it("merges several changes to one row, newest last", () => {
    const log = createPatchLog<Row>();
    const started = log.mark();
    log.record(1, { online: false });
    log.record(1, { active: false });
    log.record(1, { online: true });
    assert.deepEqual(log.replay([{ id: 1, online: false, active: true }], started), [
      { id: 1, online: true, active: false },
    ]);
  });
});
