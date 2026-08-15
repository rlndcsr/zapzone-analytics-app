import { apiRequest, apiUrl } from "../lib/api";

/** Platform values the backend's `Rule::in(MobilePushDevice::PLATFORMS)` accepts. */
export type PushPlatform = "android" | "ios";

export type PushDeviceRegistration = {
  expoPushToken: string;
  platform: PushPlatform;
  deviceName?: string | null;
  appVersion?: string | null;
};

/** Backend column limits — over-length values fail validation, so trim to fit. */
const DEVICE_NAME_MAX = 255;
const APP_VERSION_MAX = 32;

function trimmed(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, max) : null;
}

/** POST /api/mobile/push-devices — register or reactivate this device. */
export async function registerPushDevice(
  registration: PushDeviceRegistration,
  authToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const deviceName = trimmed(registration.deviceName, DEVICE_NAME_MAX);
  const appVersion = trimmed(registration.appVersion, APP_VERSION_MAX);

  await apiRequest<unknown>("/api/mobile/push-devices", {
    method: "POST",
    token: authToken,
    signal,
    body: {
      expo_push_token: registration.expoPushToken,
      platform: registration.platform,
      ...(deviceName ? { device_name: deviceName } : {}),
      ...(appVersion ? { app_version: appVersion } : {}),
    },
  });
}

/** Logout must not outlive this call, so it fails fast rather than on the 15s default. */
const UNREGISTER_TIMEOUT_MS = 8000;

export async function unregisterPushDevice(
  expoPushToken: string,
  authToken: string,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UNREGISTER_TIMEOUT_MS);
  try {
    await fetch(apiUrl("/api/mobile/push-devices"), {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ expo_push_token: expoPushToken }),
      signal: controller.signal,
    });
  } catch {
    // Offline or timed out — the row stays active until the next registration.
  } finally {
    clearTimeout(timeoutId);
  }
}
