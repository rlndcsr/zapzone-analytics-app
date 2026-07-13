import { Image } from "expo-image";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoginForm } from "../components/auth/LoginForm";
import { consumeSessionExpiredNotice, isAuthenticated } from "../lib/session";
import { hasPlayedSplash } from "../lib/splashState";

const logo = require("../../assets/zapzone-assests/zapzone.png");
const LOGIN_BLUE = "#2563EB";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Show a subtle notice when we arrived here because the session expired or was
  // rejected (401) — silent for a normal sign-in or intentional sign-out.
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(() => {
    if (consumeSessionExpiredNotice()) setSessionEnded(true);
  }, []);

  if (!hasPlayedSplash()) {
    return <Redirect href="/splash" />;
  }

  if (isAuthenticated()) {
    return <Redirect href="/home" />;
  }

  return (
    // Root is WHITE so the space revealed when the keyboard opens/closes (the
    // KeyboardAvoidingView bottom padding) is white, never a blue "footer". The
    // blue only lives in the header + the ScrollView bg (for top overscroll).
    <View className="flex-1" style={{ backgroundColor: "#ffffff" }}>
      <StatusBar style="light" />

      {/* "padding" on both platforms is JS-only (no native window resize), so it
          works in Expo Go and dev builds, and on Android edge-to-edge where the
          default resize mode no longer pushes content above the keyboard. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          style={{ backgroundColor: LOGIN_BLUE }}
          contentContainerClassName="grow"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Blue header — radial gradient + decorative opacity circles.
              Fixed to ~42% of the screen so the white card starts lower down,
              matching the design. */}
          <View
            className="items-center justify-center overflow-hidden"
            style={{
              backgroundColor: LOGIN_BLUE,
              height: height * 0.42,
              paddingTop: insets.top,
            }}
          >
            

            {/* Soft translucent circles */}
            <View
              pointerEvents="none"
              style={[
                styles.circle,
                { width: 350, height: 350, top: -70, right: 80 },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.circle,
                { width: 250, height: 250, bottom: 170, left: -10 },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.circleFaint,
                { width: 150, height: 150, top: -30, left: 0 },
              ]}
            />

            <Image
              source={logo}
              style={{ width: 104, height: 80 }}
              contentFit="contain"
            />
          </View>


          {/* White card overlapping the blue header */}
          <View
            className="grow bg-white dark:bg-neutral-900 px-6 pt-9"
            style={{
              marginTop: -28,
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              paddingBottom: insets.bottom + 32,
            }}
          >
            <Text className="text-center text-3xl font-bold text-gray-900 dark:text-white">
              Sign in
            </Text>
            <Text className="mt-2 mb-4 self-center max-w-[300px] text-center text-sm leading-5 text-gray-400 dark:text-gray-500">
              Welcome back! Enter your details to get signed in to your account
            </Text>

            {sessionEnded && (
              <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 px-4 py-3">
                <Text className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
                  Your session expired. Please sign in again.
                </Text>
              </View>
            )}

            <LoginForm />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  circleFaint: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
