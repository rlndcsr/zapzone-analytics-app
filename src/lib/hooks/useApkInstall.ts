import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { recordUpdateEvent } from "../../services/appUpdateAttemptStore";
import {
  createApkDownload,
  launchApkInstaller,
  openUnknownSourcesSettings,
  verifyApkFile,
  type InstallErrorKind,
} from "../../services/appUpdateInstaller";
import {
  BUSY_PHASES,
  createInstallController,
  type InstallPhase,
} from "../appUpdateInstall";

export type { InstallPhase } from "../appUpdateInstall";

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

/** React binding for the install state machine in lib/appUpdateInstall.ts. */
export function useApkInstall(): ApkInstall {
  const [controller] = useState(() =>
    createInstallController({
      createDownload: createApkDownload,
      verify: verifyApkFile,
      launch: launchApkInstaller,
      onEvent: recordUpdateEvent,
    }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const busy = BUSY_PHASES.includes(snapshot.phase);

  useEffect(() => () => controller.cancel(), [controller]);

  // Whether the app left the foreground mid-update is the first question when one dies.
  useEffect(() => {
    if (!busy) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") recordUpdateEvent({ stage: "backgrounded" });
      else if (state === "active") recordUpdateEvent({ stage: "foregrounded" });
    });
    return () => subscription.remove();
  }, [busy]);

  const openSettings = useCallback(() => {
    void openUnknownSourcesSettings().catch((caught) => {
      console.warn("[app-update] could not open install settings:", caught);
    });
  }, []);

  const fraction =
    snapshot.totalBytes && snapshot.totalBytes > 0
      ? Math.min(1, snapshot.bytesWritten / snapshot.totalBytes)
      : null;

  return {
    phase: snapshot.phase,
    fraction,
    bytesWritten: snapshot.bytesWritten,
    totalBytes: snapshot.totalBytes,
    bytesPerSecond: snapshot.bytesPerSecond,
    error: snapshot.error,
    busy,
    start: controller.start,
    pause: controller.pause,
    resume: controller.resume,
    cancel: controller.cancel,
    retry: controller.retry,
    openSettings,
  };
}
