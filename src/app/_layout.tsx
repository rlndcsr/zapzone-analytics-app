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
import { QuickNavFab } from "../components/navigation/QuickNavFab";
import { screenEnterLayout } from "../components/navigation/ScreenEnter";
import "../global.css";
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
      restoreSession().then(async (restored) => {
        await restoreTimeframeSelection();
        return restored ? validateStoredSession() : undefined;
      }),
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
      </Stack>
      {/* The app's one Quick Navigation FAB. Rendered after the Stack so it
          floats above every authenticated screen the navigator pushes — screens
          inherit it without knowing about it. It hides itself on the public
          screens (login/splash). */}
      <QuickNavFab />
      {/* Launch version check. Mounted here (after session restore, once for
          the whole app) so it runs a single request per launch and its blocking
          form can cover every screen — including login. */}
      <AppUpdateGate />
    </GestureHandlerRootView>
  );
}
