import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

type Props = {
  visible: boolean;
  waiverReference: string | null;
  onClose: () => void;
  /** Greets the signer by name ("Thanks, Sam!"). */
  signerFirstName?: string | null;
  /** An extra line under the thank-you (e.g. the escape-room photo note). */
  note?: string;
  /** Label of the main button; "Done" by default. */
  closeLabel?: string;
  /**
   * Closes by itself after this many seconds, calling `onAutoClose` (or
   * `onClose` when that is absent) and showing `closingText` with a countdown.
   */
  autoCloseSeconds?: number;
  onAutoClose?: () => void;
  closingText?: string;
};

export function WaiverSuccessModal({
  visible,
  waiverReference,
  onClose,
  signerFirstName,
  note,
  closeLabel = "Done",
  autoCloseSeconds,
  onAutoClose,
  closingText = "Closing",
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(autoCloseSeconds ?? 0);
  const autoCloseRef = useRef(onAutoClose ?? onClose);
  autoCloseRef.current = onAutoClose ?? onClose;

  useEffect(() => {
    if (!visible || !autoCloseSeconds) return;
    const deadline = Date.now() + autoCloseSeconds * 1000;
    setSecondsLeft(autoCloseSeconds);
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        autoCloseRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, autoCloseSeconds]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 p-5">
        <View className="w-full max-w-md items-center rounded-2xl bg-white p-6 dark:bg-neutral-900">
          <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
            <Feather name="check" size={24} color="#16A34A" />
          </View>
          <Text className="text-center text-lg font-bold text-gray-900 dark:text-white">
            {signerFirstName ? `Thanks, ${signerFirstName}!` : "Waiver Signed"}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
            Thank you! The waiver has been recorded.
          </Text>
          {!!note && (
            <Text className="mt-1 text-center text-sm text-gray-600 dark:text-gray-300">
              {note}
            </Text>
          )}

          {!!waiverReference && (
            <View className="mt-5 items-center rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <View className="rounded-lg bg-white p-2">
                <QRCode
                  value={waiverReference}
                  size={104}
                  backgroundColor="#FFFFFF"
                  color="#111827"
                />
              </View>
              <Text className="mt-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                Show this at the front desk
              </Text>
              <Text className="mt-0.5 text-center text-[11px] text-gray-400 dark:text-gray-500">
                Staff can scan it to check you in.
              </Text>
              <Text className="mt-1.5 text-center text-[11px] text-gray-400 dark:text-gray-500">
                {waiverReference}
              </Text>
            </View>
          )}

          <Pressable
            onPress={onClose}
            className="mt-5 w-full rounded-lg bg-[#0644C7] py-3 active:opacity-80"
            accessibilityRole="button"
          >
            <Text className="text-center text-sm font-semibold text-white">
              {closeLabel}
            </Text>
          </Pressable>

          {!!autoCloseSeconds && (
            <Text className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
              {closingText} in {secondsLeft}s
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
