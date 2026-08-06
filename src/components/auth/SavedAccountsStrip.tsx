import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  getSavedAccountToken,
  removeSavedAccount,
  useSavedAccounts,
  type SavedAccount,
} from "../../lib/accounts/savedAccountsStore";
import { prepareAccountSwitch } from "../../lib/accounts/switchAccount";
import { revokeToken } from "../../services/auth";
import { ConfirmationModal } from "../ui/ConfirmationModal";
import { SavedAccountRow } from "../ui/SavedAccountRow";

type SavedAccountsStripProps = {
  onNeedsPassword: (account: SavedAccount, message: string | null) => void;
  onError: (message: string) => void;
};

export function SavedAccountsStrip({
  onNeedsPassword,
  onError,
}: SavedAccountsStripProps) {
  const router = useRouter();
  const accounts = useSavedAccounts();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [managing, setManaging] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<SavedAccount | null>(
    null,
  );
  const removing = pendingRemoval != null && busyId === pendingRemoval.userId;

  if (accounts.length === 0) return null;

  const handleSelect = async (account: SavedAccount) => {
    if (busyId !== null) return;

    setBusyId(account.userId);
    const result = await prepareAccountSwitch(account);

    if (result.status === "ready") {
      router.replace({
        pathname: "/switch-account",
        params: { userId: String(account.userId) },
      });
      return;
    }

    setBusyId(null);

    if (result.status === "needs_password") {
      onNeedsPassword(account, result.message);
      return;
    }
    if (result.status === "error") onError(result.message);
  };

  const removeAccount = async (account: SavedAccount) => {
    setBusyId(account.userId);
    try {
      const token =
        account.tokenState === "linked"
          ? await getSavedAccountToken(account.userId)
          : null;
      if (token) await revokeToken(token);
      await removeSavedAccount(account.userId);
    } finally {
      setBusyId(null);
      setPendingRemoval(null);
    }
  };

  const confirmRemove = (account: SavedAccount) => {
    if (busyId !== null) return;
    setPendingRemoval(account);
  };

  return (
    <View className="mt-8">
      <View className="flex-row items-center">
        <View className="h-px flex-1 bg-gray-200 dark:bg-neutral-800" />
        <Text className="mx-3 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          or continue as
        </Text>
        <View className="h-px flex-1 bg-gray-200 dark:bg-neutral-800" />
      </View>

      <View className="mt-4 gap-2">
        {accounts.map((account) => (
          <SavedAccountRow
            key={account.userId}
            account={account}
            compact
            onPress={managing ? undefined : () => void handleSelect(account)}
            onRemove={managing ? () => confirmRemove(account) : undefined}
            busy={busyId === account.userId}
            disabled={busyId !== null && busyId !== account.userId}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setManaging((current) => !current)}
        disabled={busyId !== null}
        hitSlop={8}
        accessibilityRole="button"
        className="mt-3 self-center px-3 py-1.5 active:opacity-60"
      >
        <Text className="text-[13px] font-semibold text-gray-500 dark:text-gray-400">
          {managing ? "Done" : "Manage accounts"}
        </Text>
      </Pressable>

      <ConfirmationModal
        visible={pendingRemoval !== null}
        title="Remove Saved Account"
        message={
          "Remove this account from your saved accounts?\n\nYou can always sign in again later."
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        loading={removing}
        onConfirm={() => {
          if (!pendingRemoval || removing) return;
          void removeAccount(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </View>
  );
}
