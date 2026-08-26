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
import { PushDeviceRegistrar } from "../components/PushDeviceRegistrar";
import { PushNotificationRouter } from "../components/PushNotificationRouter";
import "../global.css";
import { restoreSavedAccounts } from "../lib/accounts/savedAccountsStore";
// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../lib/debug/authDebug";
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
  const [sessionRestored, setSessionRestored] = useState(false);
  const [fontsLoaded] = useFonts(montserratFonts);

  authDebug("RootLayout render", { sessionRestored, fontsLoaded });

  const { colorScheme } = useColorScheme();

  useEffect(() => {
    authDebug("RootLayout hydration START");
    Promise.all([
      restoreSavedAccounts().then(() =>
        restoreSession().then(async (restored) => {
          await restoreTimeframeSelection();
          return restored ? validateStoredSession() : undefined;
        }),
      ),
      applyStoredTheme(),
      restoreActiveLocation(),
    ]).finally(() => {
      authDebug("RootLayout hydration COMPLETE → mounting <Stack>");
      setSessionRestored(true);
    });
  }, []);

  if (!sessionRestored || !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <AuthGuard />
      {/* Registers this device for push once an eligible staff account is live. */}
      <PushDeviceRegistrar />
      {/* Opens the destination behind a tapped push notification, once the
          session is restored and the navigator has settled. */}
      <PushNotificationRouter />

      <Stack
        screenOptions={stackScreenOptions(colorScheme)}
        screenLayout={screenEnterLayout}
      >
        {/* The auth boundary cross-fades rather than sliding: these three are
            router.replace() hand-offs between full-screen surfaces, not pushes. */}
        <Stack.Screen name="splash" options={AUTH_SCREEN_OPTIONS} />
        <Stack.Screen name="index" options={AUTH_SCREEN_OPTIONS} />
        <Stack.Screen name="(tabs)" options={AUTH_SCREEN_OPTIONS} />

        <Stack.Screen
          name="switch-account"
          options={{ ...AUTH_SCREEN_OPTIONS, gestureEnabled: false }}
        />
      </Stack>

      <AppUpdateGate />
    </GestureHandlerRootView>
  );
}
