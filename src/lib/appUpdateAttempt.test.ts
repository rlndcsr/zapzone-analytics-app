import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyUpdateEvent,
  attemptOutcome,
  hostOf,
  parseAttempt,
  sanitizeDetail,
  summarizeAttempt,
  type UpdateAttempt,
  type UpdateEvent,
} from "./appUpdateAttempt.ts";

const MB = 1024 * 1024;

const context = {
  now: 1_000,
  fromVersion: "1.2.1",
  fromBuild: "12",
  device: {
    os: "android",
    osVersion: "13",
    apiLevel: 33,
    manufacturer: "samsung",
    model: "SM-A125F",
    totalMemory: 3 * 1024 * MB,
  },
};

/** Replays events the way the store does, one after another. */
function replay(events: UpdateEvent[]): UpdateAttempt | null {
  return events.reduce<UpdateAttempt | null>(
    (attempt, event, index) =>
      applyUpdateEvent(attempt, event, { ...context, now: context.now + index }),
    null,
  );
}

const STARTED: UpdateEvent = {
  stage: "download_started",
  version: "1.2.2",
  url: "https://cdn.example.com/builds/zapzone.apk?X-Amz-Signature=abc",
};

const at22: UpdateEvent = {
  stage: "download_progress",
  percent: 20,
  bytesWritten: 22 * MB,
  totalBytes: 100 * MB,
};

describe("the attempt record", () => {
  it("starts on download and keeps only the host of the link", () => {
    const attempt = replay([STARTED]);
    assert.ok(attempt);
    assert.equal(attempt.host, "cdn.example.com");
    assert.equal(JSON.stringify(attempt).includes("Signature"), false);
    assert.equal(attempt.fromVersion, "1.2.1");
    assert.equal(attempt.targetVersion, "1.2.2");
    assert.equal(attempt.stage, "download_started");
  });

  it("follows the download and counts trips to the background without losing the stage", () => {
    const attempt = replay([STARTED, at22, { stage: "backgrounded" }]);
    assert.ok(attempt);
    assert.equal(attempt.stage, "download_progress");
    assert.equal(attempt.percent, 20);
    assert.equal(attempt.bytesWritten, 22 * MB);
    assert.equal(attempt.backgrounded, 1);
    assert.equal(attempt.inBackground, true);

    const back = replay([STARTED, at22, { stage: "backgrounded" }, { stage: "foregrounded" }]);
    assert.equal(back?.inBackground, false);
  });

  it("counts resumes and records a failure with a sanitized cause", () => {
    const attempt = replay([
      STARTED,
      { stage: "download_paused" },
      { stage: "download_resumed" },
      {
        stage: "failed",
        during: "download",
        kind: "offline",
        detail: "timeout https://cdn.example.com/a.apk?sig=1",
      },
    ]);
    assert.equal(attempt?.resumes, 1);
    assert.equal(attempt?.stage, "failed");
    assert.deepEqual(attempt?.failure, {
      during: "download",
      kind: "offline",
      detail: "timeout [url]",
    });
  });

  it("ignores events with no attempt to attach them to", () => {
    assert.equal(replay([{ stage: "backgrounded" }]), null);
    assert.equal(replay([at22]), null);
  });

  it("starts over for a new download", () => {
    const attempt = replay([STARTED, at22, { stage: "cancelled" }, STARTED]);
    assert.equal(attempt?.stage, "download_started");
    assert.equal(attempt?.bytesWritten, 0);
  });
});

describe("how the previous attempt ended", () => {
  const parked = (events: UpdateEvent[]) => {
    const attempt = replay([STARTED, ...events]);
    assert.ok(attempt);
    return attempt;
  };

  it("calls a stop mid-download an interruption — the reported crash", () => {
    assert.equal(attemptOutcome(parked([at22]), "1.2.1"), "interrupted");
    assert.equal(attemptOutcome(parked([]), "1.2.1"), "interrupted");
    assert.equal(attemptOutcome(parked([{ stage: "download_paused" }]), "1.2.1"), "interrupted");
    assert.equal(
      attemptOutcome(
        parked([{ stage: "download_completed", bytesWritten: 100 * MB, httpStatus: 200, resumed: false }]),
        "1.2.1",
      ),
      "interrupted",
    );
  });

  it("calls the app closing at the installer a successful install once it is the new version", () => {
    const handedOff = parked([{ stage: "verified" }, { stage: "installer_launching" }]);
    assert.equal(attemptOutcome(handedOff, "1.2.2"), "installed");
    assert.equal(attemptOutcome(handedOff, "1.3.0"), "installed");
  });

  it("flags a hand-off that left the old version in place", () => {
    const handedOff = parked([{ stage: "installer_launching" }]);
    assert.equal(attemptOutcome(handedOff, "1.2.1"), "installer_closed");
    assert.equal(attemptOutcome(handedOff, null), "installer_closed");
  });

  it("leaves failures and cancels alone, since they were reported when they happened", () => {
    assert.equal(
      attemptOutcome(parked([{ stage: "failed", during: "download", kind: "offline", detail: null }]), "1.2.1"),
      "ended",
    );
    assert.equal(attemptOutcome(parked([{ stage: "cancelled" }]), "1.2.1"), "ended");
  });
});

describe("summarizeAttempt", () => {
  it("names the stage, the progress and the device in one short line", () => {
    const attempt = replay([STARTED, at22, { stage: "backgrounded" }]);
    assert.ok(attempt);
    const line = summarizeAttempt(attempt, "interrupted");
    assert.equal(
      line,
      "App update 1.2.1 → 1.2.2 interrupted: the app stopped while downloading at 20% (22.0 MB of 100.0 MB). " +
        "Android 13 (API 33), samsung SM-A125F. Backgrounded 1× (was in the background).",
    );
  });

  it("stays within the report limit whatever the cause says", () => {
    const attempt = replay([
      STARTED,
      { stage: "failed", during: "verify", kind: "unknown", detail: "x".repeat(5000) },
    ]);
    assert.ok(attempt);
    assert.ok(summarizeAttempt(attempt, "ended").length <= 500);
  });
});

describe("sanitizeDetail", () => {
  it("drops links and bearer values and keeps it short", () => {
    assert.equal(
      sanitizeDetail("failed GET https://api.example.com/x?token=abc with Bearer eyJabc.def"),
      "failed GET [url] with Bearer [redacted]",
    );
    assert.equal(sanitizeDetail(new Error("  socket\n closed  ")), "socket closed");
    assert.equal(sanitizeDetail("a".repeat(500))?.length, 200);
    assert.equal(sanitizeDetail(null), null);
    assert.equal(sanitizeDetail(""), null);
  });
});

describe("hostOf and parseAttempt", () => {
  it("reads a host or gives up", () => {
    assert.equal(hostOf("https://cdn.example.com:8443/a.apk?x=1"), "cdn.example.com:8443");
    assert.equal(hostOf("not a url"), null);
  });

  it("reads back what was written and refuses anything else", () => {
    const attempt = replay([STARTED, at22]);
    assert.deepEqual(parseAttempt(JSON.stringify(attempt)), attempt);
    assert.equal(parseAttempt(null), null);
    assert.equal(parseAttempt("{nope"), null);
    assert.equal(parseAttempt(JSON.stringify({ mechanism: "ota" })), null);
  });
});
