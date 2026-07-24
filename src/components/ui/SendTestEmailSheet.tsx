import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { BottomSheet } from "./BottomSheet";

/** Shared "Send Test Email" sheet — reused by the notification details + list screens. */
export function SendTestEmailSheet({
  visible,
  sending,
  onClose,
  onSend,
}: {
  visible: boolean;
  sending: boolean;
  onClose: () => void;
  onSend: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  // Clear the field each time the sheet is dismissed.
  useEffect(() => {
    if (!visible) setEmail("");
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Send Test Email">
      <View className="px-5 pb-8">
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Send a preview of this notification to an email address.
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
          style={{ paddingVertical: 10 }}
        />
        <Pressable
          onPress={() => onSend(email.trim())}
          disabled={!email.trim() || sending}
          className={`mt-4 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] ${
            !email.trim() || sending ? "opacity-50" : "active:opacity-90"
          }`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="send" size={16} color="#FFFFFF" />
          )}
          <Text className="text-sm font-semibold text-white">Send Test</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
