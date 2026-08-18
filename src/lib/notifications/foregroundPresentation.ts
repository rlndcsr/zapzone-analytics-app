// Type-only: nothing here loads expo-notifications at runtime, so this module
// needs no native dependency and stays testable in bare Node.
import type { NotificationBehavior } from "expo-notifications";

/** How an incoming push is presented while the app is already open. */
export function foregroundNotificationBehavior(
  // Accepted but ignored: presentation is uniform today, and this is the seam a
  // later per-type or per-priority rule would use.
  notification?: unknown,
): NotificationBehavior {
  // Pure and constant-time on purpose — Expo discards the notification if the
  // handler does not answer within 3 seconds. Without a handler at all, Expo's
  // default is to show nothing, which is the gap this closes.
  return {
    // SDK 55 field names; the older `shouldShowAlert` is deprecated.
    shouldShowBanner: true,
    shouldShowList: true,
    // Must stay true on Android: false suppresses the banner whatever the priority.
    shouldPlaySound: true,
    // iOS-only, and badge counts are deliberately out of scope.
    shouldSetBadge: false,
    // No `priority`: the backend's is business urgency, not Android presentation
    // priority, and mapping the two waits for real-device testing.
  };
}
