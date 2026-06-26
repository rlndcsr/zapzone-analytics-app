import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import "../global.css";

// Keep the native splash visible until our animated splash screen takes over,
// so there is no white flash on launch.
SplashScreen.preventAutoHideAsync();

// Anchor the stack on the splash route so it is the first screen of the session.
export const unstable_settings = {
  initialRouteName: "splash",
};

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" options={{ animation: "fade" }} />
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
