import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getInstalledAppVersion } from "../../services/appUpdateService";
import type { UserRole } from "../../services/auth";
import {
  registerPushDevice,
  unregisterPushDevice,
  type PushPlatform,
} from "../../services/pushDeviceService";
import { getCurrentUser, getToken } from "../session";

/** Mirrors MobilePushDeviceController::ALLOWED_ROLES — attendants are excluded. */
const ELIGIBLE_ROLES: readonly string[] = [
  "company_admin",
  "admin",
  "location_manager",
];

export function isPushEligibleRole(role: UserRole | null | undefined): boolean {
  return typeof role === "string" && ELIGIBLE_ROLES.includes(role);
}

/** The Expo token is device-scoped, so it survives a sign-out; the registration
 *  key is session-scoped and is what `resetPushDeviceRegistration` clears. */
let cachedExpoToken: string | null = null;
let permissionRefused = false;
let registeredKey: string | null = null;
let inFlight: Promise<void> | null = null;

function maskToken(token: string): string {
  return token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-5)}` : "…";
}

/** Dev-only: a push token is a credential and must never reach a release log. */
function devLog(message: string, error?: unknown): void {
  if (!__DEV__) return;
  if (error === undefined) {
    console.log(`[push] ${message}`);
    return;
  }
  console.warn(
    `[push] ${message}:`,
    error instanceof Error ? error.message : error,
  );
}

function currentPlatform(): PushPlatform | null {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return null;
}

function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function permissionFlags(response: unknown): {
  granted: boolean;
  canAskAgain: boolean;
} {
  const r = (response ?? {}) as { granted?: unknown; canAskAgain?: unknown };
  return { granted: r.granted === true, canAskAgain: r.canAskAgain !== false };
}

async function ensurePermission(): Promise<boolean> {
  if (permissionRefused) return false;

  // Android 13+ shows no permission prompt until a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = permissionFlags(await Notifications.getPermissionsAsync());
  if (current.granted) return true;

  if (!current.canAskAgain) {
    permissionRefused = true;
    return false;
  }

  const requested = permissionFlags(
    await Notifications.requestPermissionsAsync(),
  );
  if (!requested.granted) permissionRefused = true;
  return requested.granted;
}

async function acquireExpoToken(): Promise<string | null> {
  if (cachedExpoToken) return cachedExpoToken;

  const projectId = easProjectId();
  if (!projectId) {
    devLog("no EAS projectId in the app config; skipping registration");
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  cachedExpoToken = typeof data === "string" && data.length > 0 ? data : null;
  return cachedExpoToken;
}

export function syncPushDeviceRegistration(): Promise<void> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<void> {
  const platform = currentPlatform();
  if (!platform) return;

  // Expo only issues push tokens to physical devices.
  if (!Device.isDevice) {
    devLog("emulator/simulator — no push token available");
    return;
  }

  // Remote push left Expo Go on Android in SDK 53 (iOS Expo Go still works), so
  // the token call throws there — skip it rather than log a failure every launch.
  if (platform === "android" && Constants.expoGoConfig != null) {
    devLog("Expo Go on Android — push registration needs a development build");
    return;
  }

  const user = getCurrentUser();
  const authToken = getToken();
  if (!user || !authToken || !isPushEligibleRole(user.role)) return;

  if (cachedExpoToken && registeredKey === `${user.id}:${cachedExpoToken}`)
    return;

  let expoPushToken: string | null;
  try {
    if (!(await ensurePermission())) {
      devLog("notification permission not granted");
      return;
    }
    expoPushToken = await acquireExpoToken();
  } catch (error) {
    devLog("could not obtain an Expo push token", error);
    return;
  }
  if (!expoPushToken) return;

  try {
    await registerPushDevice(
      {
        expoPushToken,
        platform,
        deviceName: Device.deviceName ?? Device.modelName,
        appVersion: getInstalledAppVersion(),
      },
      authToken,
    );
    registeredKey = `${user.id}:${expoPushToken}`;
    devLog(`registered ${maskToken(expoPushToken)} for user #${user.id}`);
  } catch (error) {
    devLog("registration failed", error);
  }
}

export async function unregisterCurrentPushDevice(
  authToken: string,
): Promise<void> {
  const expoPushToken = cachedExpoToken;
  registeredKey = null;
  if (!expoPushToken) return;
  devLog(`deactivating ${maskToken(expoPushToken)}`);
  await unregisterPushDevice(expoPushToken, authToken);
}

export function resetPushDeviceRegistration(): void {
  registeredKey = null;
}
