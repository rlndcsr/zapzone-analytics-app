import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoginForm } from "../components/auth/LoginForm";
import { LogoSection } from "../components/auth/LogoSection";
import { isAuthenticated } from "../lib/session";
import { hasPlayedSplash } from "../lib/splashState";

/**
 * Admin login screen. Shown after the animated splash; redirects back to the
 * splash on a cold launch so the intro always plays first, and straight to the
 * dashboard when a persisted session was restored on launch.
 */
export default function HomeScreen() {
  if (!hasPlayedSplash()) {
    return <Redirect href="/splash" />;
  }

  if (isAuthenticated()) {
    return <Redirect href="/home" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />

      {/* "padding" on both platforms is JS-only (no native window resize), so it
          works in Expo Go and dev builds, and on Android edge-to-edge where the
          default resize mode no longer pushes content above the keyboard. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <LogoSection />
          <LoginForm />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
