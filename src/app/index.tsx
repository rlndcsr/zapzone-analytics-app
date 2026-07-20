import { Image } from "expo-image";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoginForm } from "../components/auth/LoginForm";
import { useTransientAlert } from "../lib/hooks/useTransientAlert";
import { consumeSessionExpiredNotice, isAuthenticated } from "../lib/session";
import { hasPlayedSplash } from "../lib/splashState";

const logo = require("../../assets/zapzone-assests/zapzone.png");
const LOGIN_BLUE = "#2563EB";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Shrink the blue header 1:1 with the keyboard (to a floor that keeps the logo
  // visible) so the card + form glide up in lockstep, on the UI thread.
  const keyboard = useAnimatedKeyboard();
  const RESTING_HEADER_H = height * 0.42;
  const COMPACT_HEADER_H = Math.max(height * 0.22, insets.top + 96);
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    height: Math.max(
      RESTING_HEADER_H - keyboard.height.value,
      COMPACT_HEADER_H,
    ),
  }));

  // Notice shown only when we landed here from an expired/401 session (silent
  // for a normal sign-in or intentional sign-out). Auto-dismisses after 3s.
  const [sessionEnded, showSessionEnded] = useTransientAlert<boolean>();
  useEffect(() => {
    if (consumeSessionExpiredNotice()) showSessionEnded(true);
  }, [showSessionEnded]);

  // Snapshot auth ONCE at mount (not live): this redirects an already-authed
  // cold start / deep link straight to /home, without re-rendering into a
  // redirect after an in-app login — that path is navigated imperatively by
  // LoginForm, so the two never compete.
  const [authedAtMount] = useState(() => isAuthenticated());

  if (!hasPlayedSplash()) {
    return <Redirect href="/splash" />;
  }

  if (authedAtMount) {
    return <Redirect href="/home" />;
  }

  return (
    // Root is WHITE so keyboard open/close never reveals a blue "footer"; blue
    // lives only in the header + ScrollView bg (top overscroll).
    <View className="flex-1" style={{ backgroundColor: "#ffffff" }}>
      <StatusBar style="light" />

      {/* Shrink the header as the keyboard rises (headerAnimatedStyle) so the
          card + form glide up; ScrollView keeps overflow reachable on small screens. */}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: LOGIN_BLUE }}
        contentContainerClassName="grow"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          className="items-center justify-center overflow-hidden"
          style={[
            { backgroundColor: LOGIN_BLUE, paddingTop: insets.top },
            headerAnimatedStyle,
          ]}
        >
          <Image
            source={logo}
            style={{ width: 104, height: 80 }}
            contentFit="contain"
          />
        </Animated.View>

        {/* White card overlapping the blue header */}
        <View
          className="grow bg-white dark:bg-neutral-900 px-6 pt-9"
          style={{
            marginTop: -20,
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
    </View>
  );
}
