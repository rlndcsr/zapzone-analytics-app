import { useCallback, useEffect, useRef, useState } from "react";

import {
  createApkDownload,
  InstallError,
  launchApkInstaller,
  openUnknownSourcesSettings,
  verifyApkFile,
  type ApkDownload,
  type InstallErrorKind,
} from "../../services/appUpdateInstaller";

export type InstallPhase =
  | "idle"
  | "downloading"
  | "paused"
  | "verifying"
  | "launching"
  | "installing"
  | "error";

export type ApkInstall = {
  phase: InstallPhase;
  fraction: number | null;
  bytesWritten: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  error: InstallErrorKind | null;
  busy: boolean;
  start: (url: string, version: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retry: () => void;
  openSettings: () => void;
};

const PROGRESS_COMMIT_MS = 100;

const SPEED_SMOOTHING = 0.75;

const BUSY_PHASES: InstallPhase[] = [
  "downloading",
  "paused",
  "verifying",
  "launching",
  "installing",
];

type Meters = {
  bytesWritten: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
};

const EMPTY_METERS: Meters = {
  bytesWritten: 0,
  totalBytes: null,
  bytesPerSecond: null,
};

export function useApkInstall(): ApkInstall {
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [error, setError] = useState<InstallErrorKind | null>(null);
  const [meters, setMeters] = useState<Meters>(EMPTY_METERS);

  const downloadRef = useRef<ApkDownload | null>(null);
  const targetRef = useRef<{ url: string; version: string } | null>(null);

  const runRef = useRef(0);
  const mountedRef = useRef(true);

  const commitRef = useRef({ at: 0, percent: -1 });
  const speedRef = useRef({ at: 0, bytes: 0, value: null as number | null });

  const resetMeters = useCallback(() => {
    commitRef.current = { at: 0, percent: -1 };
    speedRef.current = { at: 0, bytes: 0, value: null };
    setMeters(EMPTY_METERS);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      void downloadRef.current?.cancel();
      downloadRef.current = null;
    };
  }, []);

  const handleTick = useCallback(
    (tick: { bytesWritten: number; totalBytes: number | null }) => {
      const now = Date.now();
      const speed = speedRef.current;

      if (speed.at !== 0 && now > speed.at) {
        const instant =
          ((tick.bytesWritten - speed.bytes) * 1000) / (now - speed.at);
        speed.value =
          speed.value === null
            ? instant
            : speed.value * SPEED_SMOOTHING + instant * (1 - SPEED_SMOOTHING);
      }
      speed.at = now;
      speed.bytes = tick.bytesWritten;

      const percent =
        tick.totalBytes && tick.totalBytes > 0
          ? Math.floor((tick.bytesWritten / tick.totalBytes) * 100)
          : -1;
      const commit = commitRef.current;
      if (percent === commit.percent && now - commit.at < PROGRESS_COMMIT_MS) {
        return;
      }
      commitRef.current = { at: now, percent };

      if (!mountedRef.current) return;
      setMeters({
        bytesWritten: tick.bytesWritten,
        totalBytes: tick.totalBytes,
        bytesPerSecond: speed.value,
      });
    },
    [],
  );

  const run = useCallback(
    async (mode: "start" | "resume") => {
      const target = targetRef.current;
      if (!target) return;

      const generation = (runRef.current += 1);
      const alive = () => mountedRef.current && runRef.current === generation;

      setError(null);
      setPhase("downloading");

      try {
        const effectiveMode =
          mode === "resume" && downloadRef.current ? "resume" : "start";

        let download = downloadRef.current;
        if (effectiveMode === "start") {
          resetMeters();
          download = createApkDownload({
            url: target.url,
            version: target.version,
            onTick: (tick) => {
              if (alive()) handleTick(tick);
            },
          });
          downloadRef.current = download;
        }
        if (!download) throw new InstallError("unknown");

        const file =
          effectiveMode === "resume"
            ? await download.resume()
            : await download.start();

        if (!alive() || file === null) return;

        setPhase("verifying");
        await verifyApkFile(file.uri, file.httpStatus);
        if (!alive()) return;

        setPhase("launching");
        await launchApkInstaller(file.uri);
        if (!alive()) return;

        setPhase("installing");
      } catch (caught) {
        if (!alive()) return;
        const kind =
          caught instanceof InstallError ? caught.kind : ("unknown" as const);
        if (kind !== "cancelled") {
          console.warn("[app-update] install failed:", kind, caught);
        }
        setError(kind);
        setPhase("error");
      }
    },
    [handleTick, resetMeters],
  );

  const start = useCallback(
    (url: string, version: string) => {
      targetRef.current = { url, version };
      void run("start");
    },
    [run],
  );

  const retry = useCallback(() => {
    void run(downloadRef.current ? "resume" : "start");
  }, [run]);

  const pause = useCallback(() => {
    setPhase("paused");
    void downloadRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    void run("resume");
  }, [run]);

  const cancel = useCallback(() => {
    runRef.current += 1;
    const download = downloadRef.current;
    downloadRef.current = null;
    void download?.cancel();
    setError(null);
    setPhase("idle");
    resetMeters();
  }, [resetMeters]);

  const openSettings = useCallback(() => {
    void openUnknownSourcesSettings().catch((caught) => {
      console.warn("[app-update] could not open install settings:", caught);
    });
  }, []);

  const fraction =
    meters.totalBytes && meters.totalBytes > 0
      ? Math.min(1, meters.bytesWritten / meters.totalBytes)
      : null;

  return {
    phase,
    fraction,
    bytesWritten: meters.bytesWritten,
    totalBytes: meters.totalBytes,
    bytesPerSecond: meters.bytesPerSecond,
    error,
    busy: BUSY_PHASES.includes(phase),
    start,
    pause,
    resume,
    cancel,
    retry,
    openSettings,
  };
}
