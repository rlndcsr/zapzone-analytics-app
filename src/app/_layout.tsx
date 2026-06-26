import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import "../global.css";
import { restoreSession } from "../lib/session";

// Keep the native splash visible until our animated splash screen takes over,
// so there is no white flash on launch.
SplashScreen.preventAutoHideAsync();

// Anchor the stack on the splash route so it is the first screen of the session.
export const unstable_settings = {
  initialRouteName: "splash",
};

export default function RootLayout() {
  // Rehydrate any persisted session before routes mount, so the synchronous
  // auth checks in the splash/index gate read the restored state. The native
  // splash stays up while this (fast, local) read runs.
  const [sessionRestored, setSessionRestored] = useState(false);

  useEffect(() => {
    restoreSession().finally(() => setSessionRestored(true));
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
