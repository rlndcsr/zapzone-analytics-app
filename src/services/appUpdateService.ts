import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { apiRequest } from "../lib/api";
import { isVersionOlderThan } from "../lib/version";

/**
 * In-app update checking against the backend's public version endpoint
 * (GET /api/mobile/version). This module owns ALL of the decision-making —
 * which version is installed, what the backend requires, and whether that adds
 * up to an optional prompt or a hard block — so the UI only renders a verdict.
 *
 * The admin-facing endpoint that *sets* these values is deliberately not touched
 * by the app: the mobile client is a read-only consumer.
 */

/** Platforms the version endpoint understands. */
export type UpdatePlatform = "android" | "ios";

/** The verdict the UI renders. Every field is already normalized. */
export type AppUpdateStatus = {
  /** Installed version is behind `latestVersion` (or below the minimum). */
  hasUpdate: boolean;
  /** Installed version is unsupported — the app must be blocked. */
  requiresUpdate: boolean;
  /** Version of the installed binary, `null` when it can't be determined. */
  currentVersion: string | null;
  latestVersion: string | null;
  minimumVersion: string | null;
  /** Download link for the build; `null` when the backend hasn't published one. */
  apkUrl: string | null;
  updateMessage: string;
  releaseNotes: string[];
};

/** Shown when the backend sends no message of its own. */
const DEFAULT_UPDATE_MESSAGE =
  "A new version of ZapZone Admin is available.";

/**
 * Startup must never stall on this call, so it fails faster than the app-wide
 * 15s default (same reasoning as the launch token check in services/auth.ts).
 */
const VERSION_CHECK_TIMEOUT_MS = 8000;

/** Raw payload — every field optional/loose because it comes off the wire. */
type RawVersionPayload = {
  platform?: string | null;
  latest_version?: string | null;
  minimum_version?: string | null;
  force_update?: boolean | number | string | null;
  apk_url?: string | null;
  update_message?: string | null;
  release_notes?: unknown;
};

/** `null` on web (and anything exotic): there is no binary to update there. */
function currentPlatform(): UpdatePlatform | null {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return null;
}

/**
 * The version of the *installed binary* — `expo-application` reads it straight
 * from the native app (Android `version`, iOS `CFBundleShortVersionString`), so
 * it can't drift from what the user actually has installed.
 *
 * Exception: inside Expo Go the native binary IS Expo Go, so its version is
 * Expo Go's (e.g. "2.33.x"), not ours. There we read the manifest version from
 * app.json instead, which is the closest truthful answer while developing.
 * `Constants.expoGoConfig` is non-null only in Expo Go, so it is the signal.
 */
export function getInstalledAppVersion(): string | null {
  if (Constants.expoGoConfig != null) {
    return Constants.expoConfig?.version ?? null;
  }
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    null
  );
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Laravel can serialize booleans as 1/0 or "true"/"false" depending on cast. */
function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["1", "true", "yes"].includes(value.trim().toLowerCase());
  }
  return false;
}

/** Release notes as plain bullet strings, tolerating `[{ note }]`-shaped rows. */
function toReleaseNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const text = row.note ?? row.text ?? row.title ?? row.description;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter((note) => note.length > 0);
}

/**
 * Turn the installed version + backend payload into a verdict. Pure and
 * exported so the rule can be reasoned about (and tested) without a network.
 *
 * Blocking rule: below `minimum_version` always blocks. `force_update` blocks
 * only when an actual newer build exists — a `force_update` flag left on while
 * the user already runs the latest version would otherwise brick the app with
 * no recoverable action (downloading the same version changes nothing).
 */
export function evaluateUpdateStatus(
  currentVersion: string | null,
  payload: RawVersionPayload,
): AppUpdateStatus {
  const latestVersion = trimmedOrNull(payload.latest_version);
  const minimumVersion = trimmedOrNull(payload.minimum_version);
  const forceUpdate = toBoolean(payload.force_update);

  const behindLatest = isVersionOlderThan(currentVersion, latestVersion);
  const belowMinimum = isVersionOlderThan(currentVersion, minimumVersion);

  const hasUpdate = behindLatest || belowMinimum;

  return {
    hasUpdate,
    requiresUpdate: belowMinimum || (forceUpdate && hasUpdate),
    currentVersion,
    latestVersion,
    minimumVersion,
    apkUrl: trimmedOrNull(payload.apk_url),
    updateMessage:
      trimmedOrNull(payload.update_message) ?? DEFAULT_UPDATE_MESSAGE,
    releaseNotes: toReleaseNotes(payload.release_notes),
  };
}

/**
 * GET /api/mobile/version?platform=… — public route, so it is flagged as such:
 * a 401 here must never tear down the user's session.
 * Accepts both the bare object and a `{ data: … }` envelope, matching the rest
 * of the mobile API surface.
 */
async function requestVersionPayload(
  platform: UpdatePlatform,
): Promise<RawVersionPayload | null> {
  const response = await apiRequest<unknown>(
    `/api/mobile/version?platform=${platform}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS, publicEndpoint: true },
  );

  if (!response || typeof response !== "object") return null;

  const envelope = response as { data?: unknown };
  const payload =
    envelope.data && typeof envelope.data === "object"
      ? envelope.data
      : response;

  return payload as RawVersionPayload;
}

/**
 * The single in-flight/completed check for this app launch. Memoized rather
 * than stored in a reactive store: nothing needs to observe it beyond the one
 * consumer, and caching the promise makes a duplicate call (dev double-effect,
 * a remount) reuse the same request instead of firing a second one.
 */
let pendingCheck: Promise<AppUpdateStatus | null> | null = null;

/**
 * Check whether an update is available. Resolves to `null` — never rejects —
 * when the answer is unknown (unsupported platform, unreadable app version,
 * offline, timeout, server error, malformed body), so a failed check can never
 * block or crash the app. Exactly one network request per app launch.
 */
export function checkForAppUpdate(): Promise<AppUpdateStatus | null> {
  pendingCheck ??= runUpdateCheck();
  return pendingCheck;
}

async function runUpdateCheck(): Promise<AppUpdateStatus | null> {
  const platform = currentPlatform();
  if (!platform) return null;

  const currentVersion = getInstalledAppVersion();
  if (!currentVersion) {
    console.warn("[app-update] installed version unavailable; skipping check");
    return null;
  }

  try {
    const payload = await requestVersionPayload(platform);
    if (!payload) {
      console.warn("[app-update] version endpoint returned an unusable body");
      return null;
    }
    return evaluateUpdateStatus(currentVersion, payload);
  } catch (error) {
    // Offline, timeout, 5xx, bad JSON — all non-fatal: launch continues.
    console.warn(
      "[app-update] version check failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
