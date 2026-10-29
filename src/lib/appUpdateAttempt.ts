import { isVersionOlderThan } from "./version.ts";

/**
 * The record of one in-app APK update attempt, kept so the NEXT launch can tell
 * how the last one ended. That is the only way to separate the two things a user
 * describes as "the app closed during the update":
 *
 *  • the expected end — Android's installer replaces the running app, which
 *    kills its process (stage `installer_launching`, and the app is now current);
 *  • a genuine stop — the process died mid-download or mid-verify, which leaves
 *    the record parked on a download stage with no failure written.
 *
 * Pure, with no native imports, so the rules are unit tested; persistence and
 * reporting live in services/appUpdateAttemptStore.ts.
 */

export type FailureStep = "download" | "verify" | "install";

export type UpdateEvent =
  | { stage: "download_started"; version: string; url: string }
  | {
      stage: "download_progress";
      percent: number | null;
      bytesWritten: number;
      totalBytes: number | null;
    }
  | { stage: "download_paused" }
  | { stage: "download_resumed" }
  | {
      stage: "download_completed";
      bytesWritten: number;
      httpStatus: number;
      resumed: boolean;
    }
  | { stage: "verified" }
  | { stage: "installer_launching" }
  | { stage: "installer_returned" }
  | { stage: "failed"; during: FailureStep; kind: string; detail: string | null }
  | { stage: "cancelled" }
  | { stage: "backgrounded" }
  | { stage: "foregrounded" };

/** Every stage an attempt can be parked on (app lifecycle events never are). */
export type AttemptStage = Exclude<
  UpdateEvent["stage"],
  "backgrounded" | "foregrounded"
>;

export type DeviceSummary = {
  os: string;
  osVersion: string | null;
  apiLevel: number | null;
  manufacturer: string | null;
  model: string | null;
  totalMemory: number | null;
};

export type UpdateAttempt = {
  mechanism: "apk";
  fromVersion: string | null;
  fromBuild: string | null;
  targetVersion: string;
  /** Host only — the full link may carry a signed query string. */
  host: string | null;
  device: DeviceSummary;
  startedAt: number;
  updatedAt: number;
  stage: AttemptStage;
  percent: number | null;
  bytesWritten: number;
  totalBytes: number | null;
  httpStatus: number | null;
  resumes: number;
  backgrounded: number;
  inBackground: boolean;
  failure: { during: FailureStep; kind: string; detail: string | null } | null;
  /** Set once a later launch has looked at it, so it is reported only once. */
  reviewed: boolean;
};

export type AttemptContext = {
  now: number;
  fromVersion: string | null;
  fromBuild: string | null;
  device: DeviceSummary;
};

const DETAIL_MAX = 200;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/** An error message fit for a log line: no links, no bearer values, short. */
export function sanitizeDetail(value: unknown): string | null {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : value == null
          ? ""
          : String(value);
  const cleaned = raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, DETAIL_MAX) : null;
}

/** Fold one event into the attempt. `null` when there is no attempt to update. */
export function applyUpdateEvent(
  attempt: UpdateAttempt | null,
  event: UpdateEvent,
  context: AttemptContext,
): UpdateAttempt | null {
  if (event.stage === "download_started") {
    return {
      mechanism: "apk",
      fromVersion: context.fromVersion,
      fromBuild: context.fromBuild,
      targetVersion: event.version,
      host: hostOf(event.url),
      device: context.device,
      startedAt: context.now,
      updatedAt: context.now,
      stage: "download_started",
      percent: 0,
      bytesWritten: 0,
      totalBytes: null,
      httpStatus: null,
      resumes: 0,
      backgrounded: 0,
      inBackground: false,
      failure: null,
      reviewed: false,
    };
  }

  if (!attempt) return null;
  const next = { ...attempt, updatedAt: context.now };

  switch (event.stage) {
    case "backgrounded":
      return { ...next, backgrounded: next.backgrounded + 1, inBackground: true };
    case "foregrounded":
      return { ...next, inBackground: false };
    case "download_progress":
      return {
        ...next,
        stage: event.stage,
        percent: event.percent,
        bytesWritten: event.bytesWritten,
        totalBytes: event.totalBytes,
      };
    case "download_resumed":
      return { ...next, stage: event.stage, resumes: next.resumes + 1 };
    case "download_completed":
      return {
        ...next,
        stage: event.stage,
        percent: 100,
        bytesWritten: event.bytesWritten,
        httpStatus: event.httpStatus,
      };
    case "failed":
      return {
        ...next,
        stage: event.stage,
        failure: {
          during: event.during,
          kind: event.kind,
          detail: sanitizeDetail(event.detail),
        },
      };
    default:
      return { ...next, stage: event.stage };
  }
}

/**
 * How the previous attempt ended, judged on the next launch:
 *  • `installed` — handed to the installer and the app is now that version;
 *    the "close" the user saw was Android replacing the app.
 *  • `installer_closed` — handed to the installer but still the old version.
 *  • `interrupted` — the app stopped before the installer was reached.
 *  • `ended` — it already finished with a recorded failure or a cancel.
 */
export type AttemptOutcome =
  | "installed"
  | "installer_closed"
  | "interrupted"
  | "ended";

const HANDED_OFF: readonly AttemptStage[] = [
  "installer_launching",
  "installer_returned",
];

export function attemptOutcome(
  attempt: UpdateAttempt,
  installedVersion: string | null,
): AttemptOutcome {
  if (attempt.stage === "failed" || attempt.stage === "cancelled") {
    return "ended";
  }
  if (HANDED_OFF.includes(attempt.stage)) {
    const stillOlder =
      !installedVersion ||
      isVersionOlderThan(installedVersion, attempt.targetVersion);
    return stillOlder ? "installer_closed" : "installed";
  }
  return "interrupted";
}

const STAGE_WORDS: Record<AttemptStage, string> = {
  download_started: "while starting the download",
  download_progress: "while downloading",
  download_paused: "with the download paused",
  download_resumed: "while resuming the download",
  download_completed: "while checking the downloaded file",
  verified: "just before opening the installer",
  installer_launching: "with the Android installer open",
  installer_returned: "after returning from the Android installer",
  failed: "after a failure",
  cancelled: "after a cancel",
};

const OUTCOME_WORDS: Record<AttemptOutcome, string> = {
  installed: "installed",
  installer_closed: "not installed",
  interrupted: "interrupted",
  ended: "ended",
};

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** One line, under the 500-character report limit, with the facts that matter. */
export function summarizeAttempt(
  attempt: UpdateAttempt,
  outcome: AttemptOutcome,
): string {
  const progress =
    attempt.totalBytes && attempt.totalBytes > 0
      ? ` at ${attempt.percent ?? 0}% (${mb(attempt.bytesWritten)} of ${mb(attempt.totalBytes)})`
      : attempt.bytesWritten > 0
        ? ` after ${mb(attempt.bytesWritten)}`
        : "";
  const { device } = attempt;
  const os = [
    device.os === "android" ? "Android" : device.os,
    device.osVersion,
    device.apiLevel ? `(API ${device.apiLevel})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const model = [device.manufacturer, device.model].filter(Boolean).join(" ");
  const failure = attempt.failure
    ? ` Failed during ${attempt.failure.during}: ${attempt.failure.kind}${attempt.failure.detail ? ` (${attempt.failure.detail})` : ""}.`
    : "";

  return (
    `App update ${attempt.fromVersion ?? "?"} → ${attempt.targetVersion} ${OUTCOME_WORDS[outcome]}: ` +
    `the app stopped ${STAGE_WORDS[attempt.stage]}${progress}.` +
    failure +
    ` ${[os, model].filter(Boolean).join(", ")}.` +
    ` Backgrounded ${attempt.backgrounded}×${attempt.inBackground ? " (was in the background)" : ""}.`
  ).slice(0, 500);
}

/** Loose shape check for a record read back from disk. */
export function parseAttempt(raw: string | null): UpdateAttempt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<UpdateAttempt> | null;
    if (
      !value ||
      value.mechanism !== "apk" ||
      typeof value.targetVersion !== "string" ||
      typeof value.stage !== "string" ||
      typeof value.startedAt !== "number"
    ) {
      return null;
    }
    return value as UpdateAttempt;
  } catch {
    return null;
  }
}
