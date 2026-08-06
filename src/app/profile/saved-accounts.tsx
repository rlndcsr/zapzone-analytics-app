import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { clearSession, getToken, useCurrentUserId } from "../../lib/session";
import { revokeToken } from "../../services/auth";

const SavedAccounts = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const accounts = useSavedAccounts();
  const activeId = useCurrentUserId();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useTransientAlert<string>();
  const [pendingRemoval, setPendingRemoval] = useState<SavedAccount | null>(
    null,
  );
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
      if (token) await revokeToken(token);

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
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View
        className="bg-[#0644C7]/5 dark:bg-neutral-900 rounded-b-[32px] px-5 pb-7"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-neutral-800 active:opacity-80"
          >
            <Feather name="chevron-left" size={22} color={headerIcon} />
          </Pressable>
          <Text className="text-[26px] font-bold text-gray-900 dark:text-white">
            Saved Accounts
          </Text>
        </View>
        <Text className="mt-2 ml-12 text-sm text-gray-500 dark:text-gray-400">
          Switch between your accounts without signing in again.
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <View className="px-5 pt-5">
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
            className="mt-3 flex-row items-center rounded-2xl border border-dashed border-gray-300 px-4 py-4 active:opacity-70 dark:border-neutral-700"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-[#0644C7]/10">
              <Feather name="plus" size={20} color="#0644C7" />
            </View>
            <Text className="ml-3 flex-1 text-[15px] font-semibold text-gray-900 dark:text-white">
              Add another account
            </Text>
            <Feather name="chevron-right" size={18} color="#9CA3AF" />
          </Pressable>
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

export default SavedAccounts;
