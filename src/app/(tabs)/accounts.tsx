import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TAB_BAR_HEIGHT,
  tabBarBottomPadding,
} from "../../components/navigation/fabLayout";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { SavedAccountRow } from "../../components/ui/SavedAccountRow";
import {
  getSavedAccountToken,
  isSavedAccountsFull,
  MAX_SAVED_ACCOUNTS,
  removeSavedAccount,
  useSavedAccounts,
  type SavedAccount,
} from "../../lib/accounts/savedAccountsStore";
import { prepareAccountSwitch } from "../../lib/accounts/switchAccount";
import { useLogout } from "../../lib/hooks/useLogout";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { unregisterCurrentPushDevice } from "../../lib/notifications/pushDevice";
import { clearSession, getToken, useCurrentUserId } from "../../lib/session";
import { getAppVersionLabel } from "../../services/appUpdateService";
import { revokeToken } from "../../services/auth";

const BRAND = "#0644C7";
const DANGER = "#E11D48";
/** Matches the Profile screen's panels, so the two read as one surface. */
const PANEL_RADIUS = 20;

/** The screen gutter, matching the Profile screen's. */
const SCREEN_PADDING_X = 20;
const HERO_RADIUS = 32;
/** Breathing room above the title, measured from the status bar. */
const HERO_TOP_GAP = 14;
/** Air under the subtitle, before the hero's rounded bottom edge. */
const HERO_BOTTOM_GAP = 28;
/**
 * Gap between the hero and the first row. The list sits below the hero rather
 * than overlapping it: a negative margin here puts the first card's corners
 * inside the hero's rounded ones, which is what made the two collide.
 */
const CONTENT_TOP_GAP = 20;
/** Clear air under the last row, below the floating tab bar. */
const LIST_BOTTOM_GAP = 24;

/**
 * The Accounts tab: every account saved on this device, which one is live, and
 * the way into another one.
 */
const Accounts = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const accounts = useSavedAccounts();
  const activeId = useCurrentUserId();
  const { loggingOut, logout } = useLogout();

  // Light status bar for the blue hero, back to `auto` on the way out — the
  // other tabs stay mounted behind this one on a light background.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light", true);
      return () => setStatusBarStyle("auto", true);
    }, []),
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useTransientAlert<string>();
  const [pendingRemoval, setPendingRemoval] = useState<SavedAccount | null>(
    null,
  );
  const version = getAppVersionLabel();
  const removingActive = pendingRemoval?.userId === activeId;
  const removing = pendingRemoval != null && busyId === pendingRemoval.userId;

  const ordered = [...accounts].sort((a, b) => {
    if (a.userId === activeId) return -1;
    if (b.userId === activeId) return 1;
    return b.lastUsedAt - a.lastUsedAt;
  });

  const openLogin = (params: Record<string, string>) => {
    router.push({ pathname: "/", params });
  };

  const handleSelect = async (account: SavedAccount) => {
    if (account.userId === activeId || busyId !== null) return;

    setBusyId(account.userId);
    const result = await prepareAccountSwitch(account);

    if (result.status === "ready") {
      if (router.canDismiss()) router.dismissAll();
      router.replace({
        pathname: "/switch-account",
        params: { userId: String(account.userId) },
      });
      return;
    }

    setBusyId(null);

    if (result.status === "needs_password") {
      openLogin({
        addAccount: "1",
        prefill: String(account.userId),
        ...(result.message ? { notice: "expired" } : {}),
      });
      return;
    }

    if (result.status === "error") setError(result.message);
  };

  const removeAccount = async (account: SavedAccount, isActive: boolean) => {
    setBusyId(account.userId);
    try {
      const token = isActive
        ? getToken()
        : account.tokenState === "linked"
          ? await getSavedAccountToken(account.userId)
          : null;

      if (token) {
        if (isActive) await unregisterCurrentPushDevice(token);
        await revokeToken(token);
      }

      await removeSavedAccount(account.userId);

      if (isActive) await clearSession();
    } finally {
      setBusyId(null);
      setPendingRemoval(null);
    }
  };

  const handleRemove = (account: SavedAccount) => {
    if (busyId !== null) return;
    setPendingRemoval(account);
  };

  const handleAddAnother = () => {
    if (busyId !== null) return;

    if (isSavedAccountsFull()) {
      Alert.alert(
        "Account limit reached",
        `You can save up to ${MAX_SAVED_ACCOUNTS} accounts on this device. Remove one to add another.`,
      );
      return;
    }

    openLogin({ addAccount: "1" });
  };

  return (
    <View className="flex-1 mb-10 bg-gray-50 dark:bg-black">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          // The tab bar floats over the page, so the list has to clear its full
          // height rather than just the safe-area inset.
          paddingBottom:
            TAB_BAR_HEIGHT +
            tabBarBottomPadding(insets.bottom) +
            LIST_BOTTOM_GAP,
        }}
      >
        <View
          className="overflow-hidden"
          style={{
            backgroundColor: BRAND,
            borderBottomLeftRadius: HERO_RADIUS,
            borderBottomRightRadius: HERO_RADIUS,
            paddingHorizontal: SCREEN_PADDING_X,
            paddingTop: insets.top + HERO_TOP_GAP,
            paddingBottom: HERO_BOTTOM_GAP,
          }}
        >
          <Text className="text-[24px] font-bold text-white">Accounts</Text>
          <Text className="mt-1.5 text-[13px] leading-5 text-white/80">
            Switch between your accounts without signing in again.
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: SCREEN_PADDING_X,
            paddingTop: CONTENT_TOP_GAP,
          }}
        >
          {error ? (
            <View className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-900/20">
              <Text className="text-sm text-red-600 dark:text-red-400">
                {error}
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            {ordered.map((account) => (
              <SavedAccountRow
                key={account.userId}
                account={account}
                isActive={account.userId === activeId}
                onPress={() => void handleSelect(account)}
                onMore={() => handleRemove(account)}
                busy={busyId === account.userId}
                disabled={busyId !== null && busyId !== account.userId}
              />
            ))}
          </View>

          <Pressable
            onPress={handleAddAnother}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel="Add another account"
            className="mt-3 flex-row items-center rounded-2xl bg-[#EDF2F5] px-4 py-4 active:opacity-70 dark:bg-neutral-900"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#0644C7]/10">
              <Feather name="plus" size={20} color={BRAND} />
            </View>
            <Text className="ml-3 flex-1 text-[15px] font-semibold text-gray-900 dark:text-white">
              Add another account
            </Text>
            <Feather name="chevron-right" size={18} color="#9CA3AF" />
          </Pressable>

          <Text className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
            {accounts.length} of {MAX_SAVED_ACCOUNTS} accounts saved on this
            device
          </Text>

          <Pressable
            onPress={() => void logout()}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            className="mt-6 items-center justify-center bg-[#EDF2F5] py-[18px] active:opacity-60 dark:bg-neutral-900"
            style={{ borderRadius: PANEL_RADIUS }}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color={DANGER} />
            ) : (
              <Text
                className="text-[16px] font-semibold"
                style={{ color: DANGER }}
              >
                Log out
              </Text>
            )}
          </Pressable>

          {version ? (
            <Text className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
              {version}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={pendingRemoval !== null}
        title="Remove Saved Account"
        message={
          "Remove this account from your saved accounts?\n\nYou can always sign in again later."
        }
        warning={
          removingActive
            ? "Removing the current account will also sign you out of this device."
            : null
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        loading={removing}
        onConfirm={() => {
          if (!pendingRemoval || removing) return;
          void removeAccount(pendingRemoval, removingActive);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </View>
  );
};

export default Accounts;
