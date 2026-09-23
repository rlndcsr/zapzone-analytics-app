import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { validateOverridePin } from "../../lib/overridePin";
import { getToken } from "../../lib/session";
import { setOverridePin } from "../../services/overridePinService";
import { CenterModal } from "./CenterModal";
import { PressableScale } from "./motion/PressableScale";

// three fields plus the password keyboard can push Save below the fold — cap
// the card and let it scroll instead
const MAX_MODAL_HEIGHT = Dimensions.get("window").height * 0.85;

type Props = {
  visible: boolean;
  hasPin: boolean;
  onCancel: () => void;
  onSaved: () => void;
};

/** Lets an eligible manager set or change the PIN staff ask for to approve an overlapping booking. */
export function OverridePinModal({
  visible,
  hasPin,
  onCancel,
  onSaved,
}: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin("");
    setConfirmPin("");
    setPassword("");
    setError(null);
    setSaving(false);
  }, [visible]);

  const submit = async () => {
    const validationError = validateOverridePin(pin, confirmPin);
    if (validationError) {
      setError(validationError);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setOverridePin(token, pin, password);
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That PIN could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!pin && !!confirmPin && !!password && !saving;

  return (
    <CenterModal visible={visible} onClose={onCancel} dismissable={!saving}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ maxHeight: MAX_MODAL_HEIGHT }}
      >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View className="rounded-3xl bg-white p-6 dark:bg-neutral-900">
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {hasPin ? "Change your override PIN" : "Set your override PIN"}
        </Text>
        <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Staff use this at the front desk to get your approval for a booking
          that overlaps another. Keep it to yourself — every approval is
          recorded against your name.
        </Text>

        <Text className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          New PIN (4-6 digits)
        </Text>
        <TextInput
          value={pin}
          onChangeText={(text) => setPin(text.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
          placeholderTextColor="#9CA3AF"
          className="mt-1.5 rounded-xl border border-gray-300 px-3 py-3 text-center text-lg tracking-[8px] text-gray-900 dark:border-neutral-700 dark:text-white"
        />

        <Text className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          Repeat the PIN
        </Text>
        <TextInput
          value={confirmPin}
          onChangeText={(text) =>
            setConfirmPin(text.replace(/\D/g, "").slice(0, 6))
          }
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
          placeholderTextColor="#9CA3AF"
          className="mt-1.5 rounded-xl border border-gray-300 px-3 py-3 text-center text-lg tracking-[8px] text-gray-900 dark:border-neutral-700 dark:text-white"
        />

        <Text className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          Your account password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Confirms it is really you"
          placeholderTextColor="#9CA3AF"
          className="mt-1.5 rounded-xl border border-gray-300 px-3 py-3 text-gray-900 dark:border-neutral-700 dark:text-white"
        />

        {!!error && (
          <Text className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">
            {error}
          </Text>
        )}

        <View className="mt-5 flex-row justify-end gap-2">
          <PressableScale
            onPress={onCancel}
            disabled={saving}
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
            {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className="text-sm font-semibold text-white">
              {saving ? "Saving…" : "Save PIN"}
            </Text>
          </PressableScale>
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </CenterModal>
  );
}
