import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";

import {
  applyUpdateEvent,
  attemptOutcome,
  parseAttempt,
  summarizeAttempt,
  type DeviceSummary,
  type UpdateAttempt,
  type UpdateEvent,
} from "../lib/appUpdateAttempt";
import { reportClientError } from "../lib/errorReporting";
import { getInstalledAppVersion } from "./appUpdateService";

const ATTEMPT_FILE = "app-update-attempt.json";

let current: UpdateAttempt | null = null;
let queue: Promise<void> = Promise.resolve();

type LegacyFileSystem = typeof import("expo-file-system/legacy");

const loadFileSystem = (): Promise<LegacyFileSystem> =>
  import("expo-file-system/legacy");

const enqueue = (work: () => Promise<void>): void => {
  queue = queue.then(work).catch(() => {});
};

function deviceSummary(): DeviceSummary {
  const apiLevel = Platform.OS === "android" ? Number(Platform.Version) : NaN;
  return {
    os: Platform.OS,
    osVersion: Device.osVersion ?? null,
    apiLevel: Number.isFinite(apiLevel) ? apiLevel : null,
    manufacturer: Device.manufacturer ?? null,
    model: Device.modelName ?? null,
    totalMemory: Device.totalMemory ?? null,
  };
}

async function attemptPath(): Promise<string | null> {
  const FileSystem = await loadFileSystem();
  return FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${ATTEMPT_FILE}`
    : null;
}

function persist(attempt: UpdateAttempt): void {
  const snapshot = JSON.stringify(attempt);
  enqueue(async () => {
    const path = await attemptPath();
    if (!path) return;
    const FileSystem = await loadFileSystem();
    await FileSystem.writeAsStringAsync(path, snapshot);
  });
}

function report(
  attempt: UpdateAttempt,
  outcome: string,
  message: string,
): void {
  reportClientError({
    kind: "update",
    message,
    action: `app-update:${outcome}`,
    stack: JSON.stringify({ ...attempt, reviewed: undefined }).slice(0, 2000),
  });
}

/** Feed one install event in: logged, persisted, and failures reported. */
export function recordUpdateEvent(event: UpdateEvent): void {
  const next = applyUpdateEvent(current, event, {
    now: Date.now(),
    fromVersion: getInstalledAppVersion(),
    fromBuild: Application.nativeBuildVersion ?? null,
    device: current?.device ?? deviceSummary(),
  });
  if (!next) return;
  current = next;

  const fields = {
    target: next.targetVersion,
    host: next.host,
    percent: next.percent,
    bytes: next.bytesWritten,
    total: next.totalBytes,
    background: next.inBackground,
  };
  if (event.stage === "failed") {
    console.warn("[app-update] failed", { ...fields, ...next.failure });
  } else {
    console.info(`[app-update] ${event.stage}`, fields);
  }

  persist(next);

  if (event.stage === "failed" && event.kind !== "cancelled") {
    report(next, "failed", summarizeAttempt(next, "ended"));
  }
}

/**
 * Once per launch: how did the previous attempt end? An interrupted one, or one
 * handed to the installer that never took, is logged and reported once; a
 * successful install is only logged.
 */
export function reviewPreviousUpdateAttempt(): void {
  enqueue(async () => {
    // A new attempt already started this launch and owns the file.
    if (current) return;
    const path = await attemptPath();
    if (!path) return;
    const FileSystem = await loadFileSystem();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return;

    const attempt = parseAttempt(await FileSystem.readAsStringAsync(path));
    if (!attempt || attempt.reviewed) return;

    const outcome = attemptOutcome(attempt, getInstalledAppVersion());
    const summary = summarizeAttempt(attempt, outcome);
    if (outcome === "interrupted" || outcome === "installer_closed") {
      console.warn(`[app-update] previous attempt ${outcome}: ${summary}`);
      report(attempt, outcome, summary);
    } else if (outcome === "installed") {
      console.info(`[app-update] previous attempt installed: ${summary}`);
    }

    if (current) return;
    await FileSystem.writeAsStringAsync(
      path,
      JSON.stringify({ ...attempt, reviewed: true }),
    );
  });
}
