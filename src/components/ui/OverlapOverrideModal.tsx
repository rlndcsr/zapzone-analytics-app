import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import { getToken } from "../../lib/session";
import { verifyOverridePin } from "../../services/overridePinService";
import { CenterModal } from "./CenterModal";
import { PressableScale } from "./motion/PressableScale";

type Props = {
  visible: boolean;
  conflicts: string[];
  locationId: number | null;
  onCancel: () => void;
  onApproved: (token: string, approvedBy: string) => void;
};

/** Shows what the booking runs into and takes a manager's PIN before it can be saved. */
export function OverlapOverrideModal({
  visible,
  conflicts,
  locationId,
  onCancel,
  onApproved,
}: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin("");
    setError(null);
    setChecking(false);
  }, [visible]);

  const submit = async () => {
    if (!locationId) {
      setError("This booking has no location yet, so it cannot be approved.");
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const approval = await verifyOverridePin(
        token,
        pin,
        locationId,
        conflicts.join(" "),
      );
      onApproved(approval.token, approval.approvedBy);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That PIN could not be checked. Try again.",
      );
    } finally {
      setChecking(false);
    }
  };

  const canSubmit = pin.length >= 4 && !checking;

  return (
    <CenterModal visible={visible} onClose={onCancel} dismissable={!checking}>
      <View className="rounded-3xl bg-white p-6 dark:bg-neutral-900">
        <View className="flex-row items-start gap-3">
          <View className="mt-0.5 h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10">
            <Feather name="alert-triangle" size={20} color="#e11d48" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              This booking overlaps something already in the space
            </Text>
            <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              A manager has to approve it before it can be saved.
            </Text>
          </View>
        </View>

        <View className="mt-4 gap-1 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/10">
          {conflicts.map((reason) => (
            <Text
              key={reason}
              className="text-sm text-rose-800 dark:text-rose-300"
            >
              {reason}
            </Text>
          ))}
        </View>

        <Text className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          Manager override PIN
        </Text>
        <TextInput
          value={pin}
          onChangeText={(text) => setPin(text.replace(/\D/g, "").slice(0, 6))}
          onSubmitEditing={() => {
            if (canSubmit) void submit();
          }}
          keyboardType="number-pad"
          secureTextEntry
          autoFocus
          maxLength={6}
          placeholder="••••"
          placeholderTextColor="#9CA3AF"
          className="mt-1.5 rounded-xl border border-gray-300 px-3 py-3 text-center text-lg tracking-[8px] text-gray-900 dark:border-neutral-700 dark:text-white"
        />

        {!!error && (
          <Text className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">
            {error}
          </Text>
        )}

        <View className="mt-5 flex-row justify-end gap-2">
          <PressableScale
            onPress={onCancel}
            disabled={checking}
            accessibilityRole="button"
            className="h-11 items-center justify-center rounded-xl border border-gray-300 px-4 dark:border-neutral-700"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => void submit()}
            disabled={!canSubmit}
            accessibilityRole="button"
            className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] px-4 ${
              canSubmit ? "" : "opacity-40"
            }`}
          >
            {checking && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className="text-sm font-semibold text-white">
              {checking ? "Checking…" : "Approve and save"}
            </Text>
          </PressableScale>
        </View>
      </View>
    </CenterModal>
  );
}
