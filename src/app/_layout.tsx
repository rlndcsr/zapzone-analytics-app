import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import "../global.css";
import { AuthGuard } from "../components/AuthGuard";
import { applyMontserratDefault, montserratFonts } from "../lib/fonts";
import { restoreActiveLocation } from "../lib/location/activeLocationStore";
import { restoreSession } from "../lib/session";
import { applyStoredTheme } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

// Make Montserrat the default font for every <Text>/<TextInput> app-wide.
applyMontserratDefault();

export const unstable_settings = {
  initialRouteName: "splash",
};

export default function RootLayout() {
  const [sessionRestored, setSessionRestored] = useState(false);
  const [fontsLoaded] = useFonts(montserratFonts);

  useEffect(() => {
    // Restore the saved theme + active location alongside the session so the
    // app paints in the user's chosen mode and workspace from the first frame.
    Promise.all([
      restoreSession(),
      applyStoredTheme(),
      restoreActiveLocation(),
    ]).finally(() => setSessionRestored(true));
  }, []);

  if (!sessionRestored || !fontsLoaded) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ animation: "fade" }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
