import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UpdateEvent } from "./appUpdateAttempt.ts";
import {
  apkFileProblem,
  createInstallController,
  InstallError,
  MIN_APK_BYTES,
  type ApkDownload,
  type DownloadedApk,
  type DownloadTick,
} from "./appUpdateInstall.ts";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise callback run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A native download stand-in whose every step the test settles by hand. */
function fakeDownload(onTick: (tick: DownloadTick) => void) {
  const calls = { start: 0, resume: 0, pause: 0, cancel: 0 };
  let transfer = deferred<DownloadedApk | null>();
  const pausing = deferred<void>();
  const cancelling = deferred<void>();
  const api: ApkDownload = {
    start: () => {
      calls.start += 1;
      transfer = deferred();
      return transfer.promise;
    },
    resume: () => {
      calls.resume += 1;
      transfer = deferred();
      return transfer.promise;
    },
    pause: () => {
      calls.pause += 1;
      return pausing.promise;
    },
    cancel: () => {
      calls.cancel += 1;
      return cancelling.promise;
    },
  };
  return {
    api,
    calls,
    tick: onTick,
    finish: (file: Partial<DownloadedApk> = {}) =>
      transfer.resolve({ uri: "file:///cache/a.apk", httpStatus: 200, resumed: false, ...file }),
    stop: () => transfer.resolve(null),
    fail: (error: unknown) => transfer.reject(error),
    pauseLanded: () => pausing.resolve(),
    cancelLanded: () => cancelling.resolve(),
  };
}

function harness() {
  const downloads: ReturnType<typeof fakeDownload>[] = [];
  const events: UpdateEvent[] = [];
  const verifyCalls: { file: DownloadedApk; expectedBytes: number | null }[] = [];
  const launchCalls: string[] = [];
  const state = {
    clock: 1_000,
    verify: async (): Promise<void> => {},
    launch: async (): Promise<void> => {},
  };

  const controller = createInstallController({
    createDownload: ({ onTick }) => {
      const download = fakeDownload(onTick);
      downloads.push(download);
      return download.api;
    },
    verify: (file, expectedBytes) => {
      verifyCalls.push({ file, expectedBytes });
      return state.verify();
    },
    launch: (uri) => {
      launchCalls.push(uri);
      return state.launch();
    },
    onEvent: (event) => events.push(event),
    now: () => state.clock,
  });

  const stages = () => events.map((event) => event.stage);
  const phase = () => controller.getSnapshot().phase;
  return { controller, downloads, events, stages, phase, verifyCalls, launchCalls, state };
}

const MB = 1024 * 1024;

describe("a successful update", () => {
  it("downloads, verifies against the announced size, then hands off to the installer", async () => {
    const h = harness();
    const installer = deferred<void>();
    h.state.launch = () => installer.promise;

    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    assert.equal(h.phase(), "downloading");
    await flush();

    h.downloads[0].tick({ bytesWritten: 50 * MB, totalBytes: 100 * MB });
    h.downloads[0].finish();
    await flush();

    assert.equal(h.phase(), "launching");
    assert.deepEqual(h.verifyCalls[0].expectedBytes, 100 * MB);
    assert.deepEqual(h.launchCalls, ["file:///cache/a.apk"]);

    installer.resolve();
    await flush();
    assert.equal(h.phase(), "installing");
    assert.deepEqual(h.stages(), [
      "download_started",
      "download_progress",
      "download_completed",
      "verified",
      "installer_launching",
      "installer_returned",
    ]);
  });

  it("records the hand-off before the installer opens, since installing kills the app", async () => {
    const h = harness();
    let stagesAtLaunch: string[] = [];
    h.state.launch = async () => {
      stagesAtLaunch = h.stages();
    };
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].finish();
    await flush();
    assert.equal(stagesAtLaunch.at(-1), "installer_launching");
  });
});

describe("duplicate taps and concurrent operations", () => {
  it("starts one download however many times Update is tapped", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    assert.equal(h.downloads.length, 1);
    assert.equal(h.downloads[0].calls.start, 1);
  });

  it("resumes once however many times Resume is tapped", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.pause();
    h.downloads[0].pauseLanded();
    h.downloads[0].stop();
    await flush();

    h.controller.resume();
    h.controller.resume();
    await flush();
    assert.equal(h.downloads[0].calls.resume, 1);
  });

  it("waits for a pause to land before resuming, so two transfers never overlap", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.pause();
    h.downloads[0].stop();
    h.controller.resume();
    await flush();
    assert.equal(h.downloads[0].calls.resume, 0, "resumed while the pause was still in flight");

    h.downloads[0].pauseLanded();
    await flush();
    assert.equal(h.downloads[0].calls.resume, 1);
  });

  it("does not start a new download until the cancelled one has deleted its file", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.cancel();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    assert.equal(h.downloads.length, 1, "a second download began while the first was still deleting");

    h.downloads[0].cancelLanded();
    await flush();
    assert.equal(h.downloads.length, 2);
    assert.equal(h.downloads[1].calls.start, 1);
  });

  it("ignores pause and resume outside the phases that offer them", async () => {
    const h = harness();
    h.controller.pause();
    h.controller.resume();
    h.controller.retry();
    assert.equal(h.phase(), "idle");
    assert.equal(h.downloads.length, 0);
  });
});

describe("progress", () => {
  it("keeps updating after a pause and resume", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].tick({ bytesWritten: 20 * MB, totalBytes: 100 * MB });
    h.controller.pause();
    h.downloads[0].pauseLanded();
    h.downloads[0].stop();
    await flush();
    h.controller.resume();
    await flush();

    h.state.clock += 500;
    h.downloads[0].tick({ bytesWritten: 60 * MB, totalBytes: 100 * MB });
    assert.equal(h.controller.getSnapshot().bytesWritten, 60 * MB);
  });

  it("throttles screen updates within a percent and logs only every 10%", async () => {
    const h = harness();
    let renders = 0;
    h.controller.subscribe(() => {
      renders += 1;
    });
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    const before = renders;

    for (let i = 0; i < 50; i += 1) {
      h.downloads[0].tick({ bytesWritten: 22 * MB + i, totalBytes: 100 * MB });
    }
    assert.equal(renders - before, 1, "every tick re-rendered");

    for (const percent of [5, 12, 15, 25, 31]) {
      h.state.clock += 200;
      h.downloads[0].tick({ bytesWritten: percent * MB, totalBytes: 100 * MB });
    }
    const logged = h.events
      .filter((event) => event.stage === "download_progress")
      .map((event) => (event.stage === "download_progress" ? event.percent : null));
    assert.deepEqual(logged, [20, 30]);
  });

  it("logs by megabytes when the server sends no length", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].tick({ bytesWritten: 4 * MB, totalBytes: null });
    h.downloads[0].tick({ bytesWritten: 11 * MB, totalBytes: null });
    const progress = h.events.filter((event) => event.stage === "download_progress");
    assert.deepEqual(progress, [
      { stage: "download_progress", percent: null, bytesWritten: 11 * MB, totalBytes: null },
    ]);
  });
});

describe("failures and recovery", () => {
  it("shows a download failure, cleans up the partial file, and never retries on its own", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].tick({ bytesWritten: 22 * MB, totalBytes: 100 * MB });
    h.downloads[0].fail(new InstallError("offline", "unexpected end of stream on https://cdn.example.com/a.apk?sig=abc"));
    await flush();

    assert.equal(h.phase(), "error");
    assert.equal(h.controller.getSnapshot().error, "offline");
    assert.equal(h.downloads[0].calls.cancel, 1, "partial download left behind");
    const failed = h.events.at(-1);
    assert.deepEqual(failed, {
      stage: "failed",
      during: "download",
      kind: "offline",
      detail: "unexpected end of stream on [url]",
    });

    await flush();
    assert.equal(h.downloads.length, 1, "retried without being asked");
  });

  it("starts a clean download on Retry rather than resuming a broken file", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].fail(new InstallError("offline"));
    await flush();
    h.downloads[0].cancelLanded();

    h.controller.retry();
    await flush();
    assert.equal(h.downloads.length, 2);
    assert.equal(h.downloads[0].calls.resume, 0);
    assert.equal(h.downloads[1].calls.start, 1);
  });

  it("refuses an invalid file and downloads again on Retry", async () => {
    const h = harness();
    h.state.verify = async () => {
      throw new InstallError("incomplete");
    };
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].finish();
    await flush();

    assert.equal(h.controller.getSnapshot().error, "incomplete");
    assert.equal(h.launchCalls.length, 0, "an invalid file reached the installer");

    h.state.verify = async () => {};
    h.downloads[0].cancelLanded();
    h.controller.retry();
    await flush();
    assert.equal(h.downloads.length, 2);
  });

  it("reopens the installer on Retry after it was declined, without downloading again", async () => {
    const h = harness();
    h.state.launch = async () => {
      throw new InstallError("install_failed");
    };
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].finish();
    await flush();
    assert.equal(h.controller.getSnapshot().error, "install_failed");
    assert.equal(h.downloads[0].calls.cancel, 0, "the verified file was deleted");

    h.state.launch = async () => {};
    h.controller.retry();
    await flush();
    assert.equal(h.downloads.length, 1);
    assert.equal(h.verifyCalls.length, 2, "the kept file was not checked again");
    assert.equal(h.launchCalls.length, 2);
    assert.equal(h.phase(), "installing");
  });

  it("downloads again when the kept file no longer passes the check", async () => {
    const h = harness();
    h.state.launch = async () => {
      throw new InstallError("install_failed");
    };
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].finish();
    await flush();

    h.state.verify = async () => {
      throw new InstallError("not_an_apk");
    };
    h.controller.retry();
    await flush();
    assert.equal(h.controller.getSnapshot().error, "not_an_apk");
    assert.equal(h.downloads.length, 1);

    h.state.verify = async () => {};
    h.downloads[0].cancelLanded();
    h.controller.retry();
    await flush();
    assert.equal(h.downloads.length, 2);
  });

  it("files an unexpected error as unknown with a sanitized cause", async () => {
    const h = harness();
    h.state.verify = async () => {
      throw new Error("ENOENT reading https://x.example/a.apk?token=secret");
    };
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].finish();
    await flush();
    assert.equal(h.controller.getSnapshot().error, "unknown");
    assert.deepEqual(h.events.at(-1), {
      stage: "failed",
      during: "verify",
      kind: "unknown",
      detail: "ENOENT reading [url]",
    });
  });
});

describe("pause, cancel and late results", () => {
  it("cancels back to idle and ignores the transfer's late result", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.downloads[0].tick({ bytesWritten: 22 * MB, totalBytes: 100 * MB });
    h.controller.cancel();
    assert.equal(h.phase(), "idle");
    assert.equal(h.controller.getSnapshot().bytesWritten, 0);

    h.downloads[0].finish();
    await flush();
    assert.equal(h.verifyCalls.length, 0);
    assert.equal(h.stages().at(-1), "cancelled");
  });

  it("still installs a download that finished just as Pause was tapped", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.pause();
    h.downloads[0].finish();
    await flush();
    assert.equal(h.verifyCalls.length, 1);
    assert.equal(h.phase(), "installing");
  });

  it("stays paused when the transfer stops for the pause", async () => {
    const h = harness();
    h.controller.start("https://cdn.example.com/a.apk", "1.2.2");
    await flush();
    h.controller.pause();
    h.downloads[0].stop();
    await flush();
    assert.equal(h.phase(), "paused");
    assert.equal(h.verifyCalls.length, 0);
  });
});

describe("apkFileProblem", () => {
  const good = {
    httpStatus: 200,
    resumed: false,
    exists: true,
    size: 40 * MB,
    expectedBytes: 40 * MB,
    header: "UEsDBBQAAAAI",
  };

  it("passes a complete APK, fresh or resumed", () => {
    assert.equal(apkFileProblem(good), null);
    assert.equal(apkFileProblem({ ...good, resumed: true, httpStatus: 206 }), null);
    assert.equal(apkFileProblem({ ...good, expectedBytes: null }), null);
  });

  it("rejects a resume the server answered with the whole file", () => {
    assert.equal(apkFileProblem({ ...good, resumed: true, httpStatus: 200 }), "incomplete");
  });

  it("rejects HTTP errors and a partial answer to a fresh request", () => {
    assert.equal(apkFileProblem({ ...good, httpStatus: 404 }), "http_error");
    assert.equal(apkFileProblem({ ...good, httpStatus: 206 }), "http_error");
    assert.equal(apkFileProblem({ ...good, resumed: true, httpStatus: 416 }), "http_error");
  });

  it("rejects a file shorter than announced", () => {
    assert.equal(apkFileProblem({ ...good, size: 22 * MB }), "incomplete");
  });

  it("rejects anything that is not an APK", () => {
    assert.equal(apkFileProblem({ ...good, exists: false, size: 0 }), "not_an_apk");
    assert.equal(apkFileProblem({ ...good, size: MIN_APK_BYTES - 1, expectedBytes: null }), "not_an_apk");
    assert.equal(apkFileProblem({ ...good, header: "PCFET0NU" }), "not_an_apk");
  });
});
