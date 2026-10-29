import { sanitizeDetail, type FailureStep, type UpdateEvent } from "./appUpdateAttempt.ts";

/**
 * The in-app APK update as a plain state machine: download → verify → hand the
 * file to Android's installer. The native IO is injected, so this module has no
 * native imports and every transition (double taps, pause/resume races, retry
 * after each kind of failure) is unit tested; lib/hooks/useApkInstall.ts is the
 * thin React binding and services/appUpdateInstaller.ts the real IO.
 */

export type InstallErrorKind =
  | "invalid_url"
  | "offline"
  | "http_error"
  | "no_space"
  | "not_an_apk"
  | "incomplete"
  | "cancelled"
  | "install_failed"
  | "unknown";

export class InstallError extends Error {
  readonly kind: InstallErrorKind;
  /** Sanitized cause for diagnostics; never shown to the user. */
  readonly detail: string | null;

  constructor(kind: InstallErrorKind, detail?: unknown) {
    super(kind);
    this.name = "InstallError";
    this.kind = kind;
    this.detail = sanitizeDetail(detail);
  }
}

export type DownloadTick = {
  bytesWritten: number;
  totalBytes: number | null;
};

export type DownloadedApk = {
  uri: string;
  httpStatus: number;
  /** The request continued a paused file with a Range header. */
  resumed: boolean;
};

export type ApkDownload = {
  start: () => Promise<DownloadedApk | null>;
  resume: () => Promise<DownloadedApk | null>;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
};

export const MIN_APK_BYTES = 1_000_000;
const ZIP_MAGIC_BASE64 = "UEsD";

/** Why a downloaded file must not reach the installer, or `null` when it may. */
export function apkFileProblem(check: {
  httpStatus: number;
  resumed: boolean;
  exists: boolean;
  size: number;
  expectedBytes: number | null;
  /** First bytes of the file, base64. */
  header: string;
}): InstallErrorKind | null {
  // A 200 to a Range request means the server sent the whole file again, which
  // the native writer appended after the paused part — the result is corrupt.
  if (check.resumed && check.httpStatus === 200) return "incomplete";
  if (check.httpStatus !== (check.resumed ? 206 : 200)) return "http_error";
  if (!check.exists || check.size < MIN_APK_BYTES) return "not_an_apk";
  if (check.expectedBytes !== null && check.size !== check.expectedBytes) {
    return "incomplete";
  }
  if (!check.header.startsWith(ZIP_MAGIC_BASE64)) return "not_an_apk";
  return null;
}

export type InstallPhase =
  | "idle"
  | "downloading"
  | "paused"
  | "verifying"
  | "launching"
  | "installing"
  | "error";

export const BUSY_PHASES: readonly InstallPhase[] = [
  "downloading",
  "paused",
  "verifying",
  "launching",
  "installing",
];

export type InstallSnapshot = {
  phase: InstallPhase;
  error: InstallErrorKind | null;
  bytesWritten: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
};

export type InstallDeps = {
  createDownload: (options: {
    url: string;
    version: string;
    onTick: (tick: DownloadTick) => void;
  }) => ApkDownload;
  verify: (file: DownloadedApk, expectedBytes: number | null) => Promise<void>;
  launch: (fileUri: string) => Promise<void>;
  onEvent?: (event: UpdateEvent) => void;
  now?: () => number;
};

export type InstallController = {
  getSnapshot: () => InstallSnapshot;
  subscribe: (listener: () => void) => () => void;
  start: (url: string, version: string) => void;
  pause: () => void;
  resume: () => void;
  retry: () => void;
  cancel: () => void;
};

export const PROGRESS_COMMIT_MS = 100;
const SPEED_SMOOTHING = 0.75;
/** Diagnostics get a progress event every 10%, not every tick. */
export const PROGRESS_LOG_STEP = 10;
const UNKNOWN_TOTAL_LOG_BYTES = 10 * 1024 * 1024;

const IDLE: InstallSnapshot = {
  phase: "idle",
  error: null,
  bytesWritten: 0,
  totalBytes: null,
  bytesPerSecond: null,
};

export function createInstallController(deps: InstallDeps): InstallController {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();

  let snapshot = IDLE;
  let target: { url: string; version: string } | null = null;
  let download: ApkDownload | null = null;
  let verified: { file: DownloadedApk; expectedBytes: number | null } | null =
    null;
  let pausing: Promise<void> | null = null;
  let teardown: Promise<void> = Promise.resolve();
  // Bumped by every run and every cancel; a run whose number is stale stops.
  let generation = 0;

  let totalBytes: number | null = null;
  let lastBytes = 0;
  let commit = { at: 0, percent: -1 };
  let speed = { at: 0, bytes: 0, value: null as number | null };
  let loggedMark = 0;

  const set = (patch: Partial<InstallSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const emit = (event: UpdateEvent) => {
    try {
      deps.onEvent?.(event);
    } catch {}
  };

  const resetMeters = () => {
    totalBytes = null;
    lastBytes = 0;
    commit = { at: 0, percent: -1 };
    speed = { at: 0, bytes: 0, value: null };
    loggedMark = 0;
  };

  /** Drop the current download and delete its file; the next fresh run waits for it. */
  const discardDownload = () => {
    const current = download;
    download = null;
    verified = null;
    pausing = null;
    if (current) {
      teardown = teardown.then(() => current.cancel()).catch(() => {});
    }
  };

  const handleTick = (tick: DownloadTick) => {
    const at = now();
    totalBytes = tick.totalBytes;
    lastBytes = tick.bytesWritten;

    if (speed.at !== 0 && at > speed.at) {
      const instant = ((tick.bytesWritten - speed.bytes) * 1000) / (at - speed.at);
      speed.value =
        speed.value === null
          ? instant
          : speed.value * SPEED_SMOOTHING + instant * (1 - SPEED_SMOOTHING);
    }
    speed.at = at;
    speed.bytes = tick.bytesWritten;

    const percent =
      tick.totalBytes && tick.totalBytes > 0
        ? Math.floor((tick.bytesWritten / tick.totalBytes) * 100)
        : -1;

    const mark =
      percent >= 0
        ? percent - (percent % PROGRESS_LOG_STEP)
        : tick.bytesWritten - (tick.bytesWritten % UNKNOWN_TOTAL_LOG_BYTES);
    if (mark > loggedMark) {
      loggedMark = mark;
      emit({
        stage: "download_progress",
        percent: percent >= 0 ? mark : null,
        bytesWritten: tick.bytesWritten,
        totalBytes: tick.totalBytes,
      });
    }

    if (percent === commit.percent && at - commit.at < PROGRESS_COMMIT_MS) return;
    commit = { at, percent };
    set({
      bytesWritten: tick.bytesWritten,
      totalBytes: tick.totalBytes,
      bytesPerSecond: speed.value,
    });
  };

  const fail = (run: number, during: FailureStep, caught: unknown) => {
    if (run !== generation) return;
    const kind = caught instanceof InstallError ? caught.kind : "unknown";
    const detail =
      caught instanceof InstallError ? caught.detail : sanitizeDetail(caught);
    // A verified file is kept so Retry can reopen the installer without a re-download.
    if (during !== "install") discardDownload();
    emit({ stage: "failed", during, kind, detail });
    set({ phase: "error", error: kind });
  };

  const handOff = async (run: number, file: DownloadedApk) => {
    set({ phase: "launching" });
    emit({ stage: "installer_launching" });
    try {
      await deps.launch(file.uri);
    } catch (caught) {
      fail(run, "install", caught);
      return;
    }
    if (run !== generation) return;
    emit({ stage: "installer_returned" });
    set({ phase: "installing" });
  };

  const runDownload = async (mode: "fresh" | "resume") => {
    const run = ++generation;
    const alive = () => run === generation;
    set({ phase: "downloading", error: null });

    let file: DownloadedApk | null;
    try {
      if (mode === "fresh") {
        discardDownload();
        await teardown;
        if (!alive() || !target) return;

        resetMeters();
        set({ bytesWritten: 0, totalBytes: null, bytesPerSecond: null });
        const created = deps.createDownload({
          url: target.url,
          version: target.version,
          onTick: (tick) => {
            if (download === created) handleTick(tick);
          },
        });
        download = created;
        emit({ stage: "download_started", version: target.version, url: target.url });
        file = await created.start();
      } else {
        const current = download;
        if (!current) throw new InstallError("unknown", "nothing to resume");
        if (pausing) await pausing;
        pausing = null;
        if (!alive()) return;
        emit({ stage: "download_resumed" });
        file = await current.resume();
      }
    } catch (caught) {
      fail(run, "download", caught);
      return;
    }

    // `null` is a pause or a cancel; whoever caused it already set the phase.
    if (!alive() || file === null) return;

    emit({
      stage: "download_completed",
      bytesWritten: lastBytes,
      httpStatus: file.httpStatus,
      resumed: file.resumed,
    });
    set({ phase: "verifying" });
    const expectedBytes = totalBytes;
    try {
      await deps.verify(file, expectedBytes);
    } catch (caught) {
      fail(run, "verify", caught);
      return;
    }
    if (!alive()) return;

    verified = { file, expectedBytes };
    emit({ stage: "verified" });
    await handOff(run, file);
  };

  const reinstall = async () => {
    const kept = verified;
    if (!kept) return;
    const run = ++generation;
    set({ phase: "verifying", error: null });
    try {
      // The file sat in the cache while the user was in Settings; check it again.
      await deps.verify(kept.file, kept.expectedBytes);
    } catch (caught) {
      verified = null;
      fail(run, "verify", caught);
      return;
    }
    if (run !== generation) return;
    await handOff(run, kept.file);
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start(url, version) {
      // A second tap lands here before React re-renders; the phase is already set.
      if (snapshot.phase !== "idle" && snapshot.phase !== "error") return;
      target = { url, version };
      void runDownload("fresh");
    },

    pause() {
      if (snapshot.phase !== "downloading" || !download) return;
      const current = download;
      set({ phase: "paused" });
      emit({ stage: "download_paused" });
      pausing = current.pause().catch(() => {});
    },

    resume() {
      if (snapshot.phase !== "paused" || !download) return;
      void runDownload("resume");
    },

    retry() {
      if (snapshot.phase !== "error" || !target) return;
      if (snapshot.error === "install_failed" && verified) {
        void reinstall();
        return;
      }
      void runDownload("fresh");
    },

    cancel() {
      if (snapshot.phase === "idle") return;
      generation += 1;
      discardDownload();
      emit({ stage: "cancelled" });
      resetMeters();
      set(IDLE);
    },
  };
}
