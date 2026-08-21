import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { isPublicRoute } from "../lib/navigation/publicRoutes";
import { foregroundNotificationBehavior } from "../lib/notifications/foregroundPresentation";
import {
  pushDataToNotification,
  resolveNotificationRoute,
  type NotificationRoute,
} from "../lib/notifications/notificationRouteMapper";
import { loadNotifications } from "../lib/notifications/pushDevice";
import {
  claimPendingNotificationTap,
  discardPendingNotificationTap,
  notificationTapKey,
  offerNotificationTap,
  readNotificationResponse,
  settlePendingNotificationTap,
} from "../lib/notifications/pushNavigationQueue";
import { useAuthStatus, useCurrentUserId } from "../lib/session";

export function PushNotificationRouter() {
  const authed = useAuthStatus();
  const userId = useCurrentUserId();
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const router = useRouter();
  const ready = Boolean(navState?.key) && !isPublicRoute(pathname);

  const [tapCount, setTapCount] = useState(0);

  const navigate = useCallback(
    (route: NotificationRoute) => {
      if (__DEV__) console.log(`[push-nav] opening ${route.pathname}`);
      router.navigate(route as never);
    },
    [router],
  );

  const handleTapRef = useRef<(response: unknown) => void>(() => {});
  handleTapRef.current = (response: unknown) => {
    const tapped = readNotificationResponse(response);
    const route = resolveNotificationRoute(
      pushDataToNotification(tapped.data, {
        title: tapped.title,
        body: tapped.body,
      }),
    );
    if (offerNotificationTap(notificationTapKey(tapped), route)) {
      setTapCount((count) => count + 1);
    }
  };

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async (notification) =>
        foregroundNotificationBehavior(notification),
    });

    let cancelled = false;
    const onTap = (response: unknown) => handleTapRef.current(response);

    // Cold start: the tap that launched the app happened before this listener
    // existed, so it is never delivered to it — it has to be read back.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!cancelled && response) onTap(response);
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn("[push-nav] cold-start read failed:", error);
      });

    // Taps while the app is running or backgrounded.
    const subscription =
      Notifications.addNotificationResponseReceivedListener(onTap);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const lastUserId = useRef(userId);
  useEffect(() => {
    const switchedAccount =
      lastUserId.current !== null &&
      userId !== null &&
      lastUserId.current !== userId;
    lastUserId.current = userId;

    if (!authed || switchedAccount) discardPendingNotificationTap();
  }, [authed, userId]);

  useEffect(() => {
    if (!authed || !ready) return;

    // Arrived — stop tracking it.
    if (settlePendingNotificationTap(pathname)) return;

    const route = claimPendingNotificationTap({ authed, ready });
    if (!route) return;
    navigate(route);

    settlePendingNotificationTap(pathname);
  }, [authed, ready, pathname, tapCount, navigate]);

  return null;
}
