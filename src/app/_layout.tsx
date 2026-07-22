import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthGuard } from "../components/AuthGuard";
import { STACK_SCREEN_TRANSITION } from "../components/navigation/tabTransition";
import "../global.css";
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

  useEffect(() => {
    // Restore theme + location + session, and validate a restored token against
    // the backend before lifting the gate so a dead token never flashes a screen.
    Promise.all([
      restoreSession().then((restored) =>
        restored ? validateStoredSession() : undefined,
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
      <Stack screenOptions={{ headerShown: false, ...STACK_SCREEN_TRANSITION }}>
        <Stack.Screen name="splash" options={{ animation: "fade" }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
