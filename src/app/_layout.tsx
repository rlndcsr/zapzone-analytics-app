import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../global.css";
import { AuthGuard } from "../components/AuthGuard";
import { STACK_SCREEN_TRANSITION } from "../components/navigation/tabTransition";
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <AuthGuard />
      {/* Directional slide for every pushed screen (incl. all Quick-Navigation
          modules), reusing the tabs' motion language via the shared transition
          config. Splash keeps its own fade below. */}
      <Stack screenOptions={{ headerShown: false, ...STACK_SCREEN_TRANSITION }}>
        <Stack.Screen name="splash" options={{ animation: "fade" }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
