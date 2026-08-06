import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppUpdateGate } from "../components/AppUpdateGate";
import { AuthGuard } from "../components/AuthGuard";
import {
  AUTH_SCREEN_OPTIONS,
  stackScreenOptions,
} from "../components/navigation/navMotion";
import { screenEnterLayout } from "../components/navigation/ScreenEnter";
import "../global.css";
import { restoreSavedAccounts } from "../lib/accounts/savedAccountsStore";
import { restoreTimeframeSelection } from "../lib/dashboard/timeframeStore";
import { applyMontserratDefault, montserratFonts } from "../lib/fonts";
import { restoreActiveLocation } from "../lib/location/activeLocationStore";
import { restoreSession } from "../lib/session";
import { applyStoredTheme } from "../lib/theme";
import { validateStoredSession } from "../services/auth";

SplashScreen.preventAutoHideAsync();

applyMontserratDefault();

export const unstable_settings = {
  initialRouteName: "splash",
};

export default function RootLayout() {
  if (__DEV__) console.count("[render] RootLayout");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [fontsLoaded] = useFonts(montserratFonts);
  // NativeWind's scheme, not the OS one — the in-app Settings switch is
  // authoritative here (see lib/theme.ts). Drives the opaque backing colour the
  // navigator puts under every screen.
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    if (__DEV__) console.log("[RootLayout] restore effect run");
    Promise.all([
      // Saved accounts before the session: `restoreSession` upserts the
      // restored account, so the list must already be in memory or that write
      // would land on an empty index and drop the others.
      restoreSavedAccounts().then(() =>
        restoreSession().then(async (restored) => {
          await restoreTimeframeSelection();
          return restored ? validateStoredSession() : undefined;
        }),
      ),
      applyStoredTheme(),
      restoreActiveLocation(),
    ]).finally(() => setSessionRestored(true));
  }, []);

  if (!sessionRestored || !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <AuthGuard />
      {/* One stack for the whole app. Module screens (bookings/, attractions/,
          …) are auto-registered by expo-router as siblings of (tabs), so they
          inherit STACK_SCREEN_OPTIONS — every nested flow slides identically
          without being listed here. screenLayout gives each of them the same
          content entrance for the same reason. */}
      <Stack
        screenOptions={stackScreenOptions(colorScheme)}
        screenLayout={screenEnterLayout}
      >
        {/* The auth boundary cross-fades rather than sliding: these three are
            router.replace() hand-offs between full-screen surfaces, not pushes. */}
        <Stack.Screen name="splash" options={AUTH_SCREEN_OPTIONS} />
        <Stack.Screen name="index" options={AUTH_SCREEN_OPTIONS} />
        <Stack.Screen name="(tabs)" options={AUTH_SCREEN_OPTIONS} />
        {/* Account switching crosses the same boundary: it replaces the stack
            root (which is what unmounts (tabs) and its per-account state), so
            it fades like the others. Not dismissable — it owns the transition
            until it hands off to /home. */}
        <Stack.Screen
          name="switch-account"
          options={{ ...AUTH_SCREEN_OPTIONS, gestureEnabled: false }}
        />
      </Stack>
      {/* The Quick Navigation FAB is NOT mounted here. It lives inside
          app/(tabs)/_layout.tsx, alongside the tab bar it sits in the notch of,
          so the stack transition carries them together instead of the FAB
          having to animate itself in afterwards. */}
      {/* Launch version check. Mounted here (after session restore, once for
          the whole app) so it runs a single request per launch and its blocking
          form can cover every screen — including login. */}
      <AppUpdateGate />
    </GestureHandlerRootView>
  );
}
