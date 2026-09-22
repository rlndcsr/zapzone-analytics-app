import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import { getToken } from "../../lib/session";
import { verifyOverridePin } from "../../services/overridePinService";
import { CenterModal } from "./CenterModal";
import { PressableScale } from "./motion/PressableScale";

type Props = {
  visible: boolean;
  /** Real overlaps — what this booking would double-book. Only these need a manager. */
  conflicts: string[];
  /** Start times this booking takes off the website, already formatted for reading. */
  onlineSlotsLost: string[];
  locationId: number | null;
  onCancel: () => void;
  /** Staff accepting the side effects themselves, when there is no overlap to approve. */
  onConfirm: () => void;
  onApproved: (token: string, approvedBy: string) => void;
};

/**
 * What this booking would run into, and what it takes away.
 *
 * The two are deliberately not the same thing. An overlap double-books a space, so it needs a
 * manager's PIN. Taking the last online start double-books nothing — it only means customers can
 * no longer book that time — so staff confirm it themselves rather than going to find a manager
 * for something that is not an error. A booking with neither never reaches this modal at all.
 */
export function OverlapOverrideModal({
  visible,
  conflicts,
  onlineSlotsLost,
  locationId,
  onCancel,
  onConfirm,
  onApproved,
}: Props) {
  const needsManager = conflicts.length > 0;
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
          <View
            className={`mt-0.5 h-11 w-11 items-center justify-center rounded-2xl ${
              needsManager ? "bg-rose-500/10" : "bg-amber-500/10"
            }`}
          >
            <Feather
              name="alert-triangle"
              size={20}
              color={needsManager ? "#e11d48" : "#f59e0b"}
            />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {needsManager
                ? "This booking overlaps something already in the space"
                : "Check this before you save"}
            </Text>
            <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {needsManager
                ? "A manager has to approve it before it can be saved."
                : "Nothing is double-booked, but this changes what customers can still book."}
            </Text>
          </View>
        </View>

        {conflicts.length > 0 && (
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
        )}

        {onlineSlotsLost.length > 0 && (
          <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
            <Text className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              {onlineSlotsLost.length === 1
                ? "One online start time goes away"
                : `${onlineSlotsLost.length} online start times go away`}
            </Text>
            <Text className="mt-1 text-sm text-amber-900 dark:text-amber-300">
              This holds the last free space through {onlineSlotsLost.join(", ")}
              , so customers will no longer be able to book{" "}
              {onlineSlotsLost.length === 1 ? "it" : "them"} online.
            </Text>
          </View>
        )}

        {!needsManager && (
          <View className="mt-5 flex-row justify-end gap-2">
            <PressableScale
              onPress={onCancel}
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-xl border border-gray-300 px-4 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </PressableScale>
            <PressableScale
              onPress={onConfirm}
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-xl bg-[#0644C7] px-4"
            >
              <Text className="text-sm font-semibold text-white">
                Save the booking
              </Text>
            </PressableScale>
          </View>
        )}

        {needsManager && (
          <>
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
          </>
        )}
      </View>
    </CenterModal>
  );
}
