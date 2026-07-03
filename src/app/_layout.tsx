import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import "../global.css";
import { applyMontserratDefault, montserratFonts } from "../lib/fonts";
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
    // Restore the saved theme alongside the session so the app paints in the
    // user's chosen mode from the first frame.
    Promise.all([restoreSession(), applyStoredTheme()]).finally(() =>
      setSessionRestored(true),
    );
  }, []);

  if (!sessionRestored || !fontsLoaded) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ animation: "fade" }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
