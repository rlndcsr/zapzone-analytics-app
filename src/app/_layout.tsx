import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import "../global.css";
import { restoreSession } from "../lib/session";
import { applyStoredTheme } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "splash",
};

export default function RootLayout() {
  const [sessionRestored, setSessionRestored] = useState(false);

  useEffect(() => {
    // Restore the saved theme alongside the session so the app paints in the
    // user's chosen mode from the first frame.
    Promise.all([restoreSession(), applyStoredTheme()]).finally(() =>
      setSessionRestored(true),
    );
  }, []);

  if (!sessionRestored) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" options={{ animation: "fade" }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
