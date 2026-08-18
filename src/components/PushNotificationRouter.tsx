import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { isPublicRoute } from "../lib/navigation/publicRoutes";
import { foregroundNotificationBehavior } from "../lib/notifications/foregroundPresentation";
import {
  pushDataToNotification,
  resolveNotificationRoute,
  type NotificationRoute,
} from "../lib/notifications/notificationRouteMapper";
import { loadNotifications } from "../lib/notifications/pushDevice";
import {
  discardPendingNotificationTap,
  flushPendingNotificationTap,
  notificationTapKey,
  offerNotificationTap,
  readNotificationResponse,
} from "../lib/notifications/pushNavigationQueue";
import { useAuthStatus, useCurrentUserId } from "../lib/session";

export function PushNotificationRouter() {
  const authed = useAuthStatus();
  const userId = useCurrentUserId();
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const router = useRouter();
  const ready = Boolean(navState?.key) && !isPublicRoute(pathname);

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
    const immediate = offerNotificationTap(notificationTapKey(tapped), route, {
      authed,
      ready,
    });
    if (immediate) navigate(immediate);
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

  // Release a parked destination once the gate opens — and drop it instead when
  // the session it belonged to has gone away.
  const lastUserId = useRef(userId);
  useEffect(() => {
    const switchedAccount =
      lastUserId.current !== null &&
      userId !== null &&
      lastUserId.current !== userId;
    lastUserId.current = userId;

    if (!authed || switchedAccount) {
      discardPendingNotificationTap();
      return;
    }
    if (!ready) return;

    const route = flushPendingNotificationTap({ authed, ready });
    if (route) navigate(route);
  }, [authed, userId, ready, navigate]);

  return null;
}
