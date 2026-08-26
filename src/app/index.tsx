import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoginForm } from "../components/auth/LoginForm";
import { SavedAccountsStrip } from "../components/auth/SavedAccountsStrip";
import { useSavedAccounts } from "../lib/accounts/savedAccountsStore";
// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../lib/debug/authDebug";
import { useTransientAlert } from "../lib/hooks/useTransientAlert";
import { consumeSessionExpiredNotice, isAuthenticated } from "../lib/session";
import { hasPlayedSplash } from "../lib/splashState";
import type { AuthUser } from "../services/auth";

const logo = require("../../assets/zapzone-assests/zapzone.png");
const LOGIN_BLUE = "#2563EB";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{
    addAccount?: string;
    prefill?: string;
    notice?: string;
  }>();
  const savedAccounts = useSavedAccounts();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  // Why the screen was opened, snapshotted ONCE — for the same reason
  // `authedAtMount` below is a snapshot: anything reactive up here competes
  // with the imperative navigation and re-fires the redirect every render.
  const [entry] = useState(() => ({
    /** Adding an account while another session stays live behind this screen. */
    addAccount: params.addAccount === "1",
    prefillId: params.prefill ? Number(params.prefill) : null,
    expiredNotice: params.notice === "expired",
  }));

  // Which saved account the form is filled in for. Mutable so "Use a different
  // account" can clear it.
  const [prefillUserId, setPrefillUserId] = useState<number | null>(
    () => entry.prefillId,
  );
  const prefillAccount =
    savedAccounts.find((a) => a.userId === prefillUserId) ?? null;

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
  const [stripError, setStripError] = useTransientAlert<string>();
  useEffect(() => {
    if (entry.expiredNotice || consumeSessionExpiredNotice()) {
      showSessionEnded(true);
    }
  }, [entry.expiredNotice, showSessionEnded]);

  // This screen deliberately owns NO authenticated navigation. It used to
  // snapshot auth at mount and `<Redirect href="/home">` when that snapshot was
  // true, which made it a second authority over the auth boundary: AuthGuard
  // pushed unauthed users to `/`, and this pushed them straight back to
  // `/home`. Because `/` is public, arriving here re-armed AuthGuard's
  // `redirectedRef`, so the two could trade redirects until React threw
  // "Maximum update depth exceeded".
  //
  // The only case that redirect legitimately served was an already-signed-in
  // cold start, and the splash hand-off (app/splash.tsx) now routes that
  // directly to `/home` without this screen ever mounting.
  authDebug("index(login) render", {
    liveAuthed: isAuthenticated(),
    splashPlayed: hasPlayedSplash(),
    addAccount: entry.addAccount,
  });

  /**
   * Plain back navigation — this screen is pushed over Saved Accounts, so it
   * simply pops. Nothing is signed out and no session changes; the account the
   * user arrived with is still the live one.
   */
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Reached without anything behind it (a deep link, or a reload in dev):
    // fall back to the account still signed in rather than dead-ending.
    router.replace("/home");
  };

  /**
   * Signed in as somebody new while the previous account's tab tree is still
   * mounted below. Hand off through the switch bridge — replacing the stack
   * root is what unmounts (tabs), so the new account gets a fresh tree with its
   * own role and data instead of inheriting the previous one's.
   */
  const handleAccountAdded = (user: AuthUser) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace({
      pathname: "/switch-account",
      params: { userId: String(user.id) },
    });
  };

  if (!hasPlayedSplash()) {
    authDebug("index → returns <Redirect href=/splash>");
    return <Redirect href="/splash" />;
  }

  authDebug("index → returns login form");

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
        // iOS only (a no-op on Android, which resizes the window instead).
        // Insets the scroll view by the keyboard AND lifts the focused field
        // above it, which the shrinking header alone can't always do — its
        // floor keeps the logo visible, so on short screens it can absorb less
        // than the keyboard's height. Both are driven by the same keyboard
        // frame, so they move together rather than fighting.
        automaticallyAdjustKeyboardInsets
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
          {entry.addAccount ? (
            // Same header shape as every other pushed screen (edit-profile,
            // saved-accounts): circular back button, then the title. Adding an
            // account is a place in the hierarchy, not a modal interruption.
            <>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={handleBack}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  className="h-9 w-9 items-center justify-center rounded-full bg-black/5 active:opacity-80 dark:bg-neutral-800"
                >
                  <Feather name="chevron-left" size={22} color={headerIcon} />
                </Pressable>
                <Text className="flex-1 text-[20px] font-bold text-gray-900 dark:text-white">
                  Sign in to another account
                </Text>
              </View>
              <Text className="mt-3 mb-1 text-sm leading-5 text-gray-400 dark:text-gray-500">
                Your current account stays signed in and saved on this device.
              </Text>
            </>
          ) : (
            <>
              <Text className="text-center text-3xl font-bold text-gray-900 dark:text-white">
                Sign in
              </Text>
              <Text className="mt-2 mb-4 self-center max-w-[300px] text-center text-sm leading-5 text-gray-400 dark:text-gray-500">
                Welcome back! Enter your details to get signed in to your
                account
              </Text>
            </>
          )}

          {sessionEnded && (
            <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20 px-4 py-3">
              <Text className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
                Your session expired. Please sign in again.
              </Text>
            </View>
          )}

          {stripError && (
            <View className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3">
              <Text className="text-center text-sm font-medium text-red-600 dark:text-red-400">
                {stripError}
              </Text>
            </View>
          )}

          {/* Picking a saved account seeds the email and nothing else — the
              form itself says who is signing in, so there is no banner and no
              "Change" affordance to explain. Remounted per target so the seed
              happens once from props (and the password starts empty) instead
              of being re-synced in an effect. */}
          <LoginForm
            key={prefillAccount?.userId ?? "new"}
            initialEmail={prefillAccount?.email}
            onSuccess={entry.addAccount ? handleAccountAdded : undefined}
          />

          {/* Adding an account is an explicit "somebody else" flow — offering
              the saved list there would just undo the user's choice. */}
          {!entry.addAccount && (
            <SavedAccountsStrip
              onNeedsPassword={(account, message) => {
                setPrefillUserId(account.userId);
                // A message means the token was found dead rather than simply
                // absent — worth saying so above the form.
                if (message) showSessionEnded(true);
              }}
              onError={setStripError}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
