import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

import { mediaUrl } from "../../lib/api";
import {
  sendAdLearnMore,
  type AdLearnMoreChannel,
  type KioskAd,
} from "../../services/waiversService";

const CONFIRM_BEAT_SECONDS = 2;
const CHOOSING_FLOOR_SECONDS = 25;
const RESULT_FLOOR_SECONDS = 12;

type LearnMoreStep = "idle" | "choose" | "sending" | "done";

export function KioskAdModal({
  visible,
  ad,
  waiverId,
  signerFirstName,
  onClose,
  closeLabel = "Start Next Waiver",
  closingText = "Returning to the start screen",
}: {
  visible: boolean;
  ad: KioskAd | null;
  waiverId: number | null;
  signerFirstName?: string | null;
  onClose: () => void;
  closeLabel?: string;
  closingText?: string;
}) {
  const totalSeconds = ad ? CONFIRM_BEAT_SECONDS + ad.displaySeconds : 0;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [step, setStep] = useState<LearnMoreStep>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible || !ad) return;
    setSecondsLeft(CONFIRM_BEAT_SECONDS + ad.displaySeconds);
    setStep("idle");
    setMessage(null);
    setFailed(false);
  }, [visible, ad]);

  useEffect(() => {
    if (!visible || !ad) return;
    const tick = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(tick);
  }, [visible, ad]);

  useEffect(() => {
    if (!visible || !ad) return;
    if (secondsLeft === 0 && step !== "sending") onCloseRef.current();
  }, [visible, ad, secondsLeft, step]);

  const openLearnMore = useCallback(() => {
    setStep("choose");
    setSecondsLeft((s) => Math.max(s, CHOOSING_FLOOR_SECONDS));
  }, []);

  const send = useCallback(
    async (channel: AdLearnMoreChannel) => {
      if (!ad || waiverId == null || step === "sending") return;
      setStep("sending");
      setFailed(false);
      const res = await sendAdLearnMore(waiverId, ad.id, channel);
      setMessage(res.message);
      setFailed(!res.ok);
      setStep(res.ok ? "done" : "choose");
      setSecondsLeft((s) => Math.max(s, RESULT_FLOOR_SECONDS));
    },
    [ad, waiverId, step],
  );

  if (!ad) return null;

  const imageUri = mediaUrl(ad.imagePath);
  const canLearnMore = ad.hasLink && waiverId != null;
  const sending = step === "sending";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 p-5">
        <View className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
          <View className="flex-row items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
            <View className="h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <Feather name="check" size={12} color="#16A34A" />
            </View>
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Waiver signed
              {signerFirstName ? ` — thanks, ${signerFirstName}` : ""}
            </Text>
          </View>

          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              className="h-56 w-full bg-gray-50 dark:bg-neutral-800"
              resizeMode="contain"
              accessibilityLabel={ad.name || "Announcement"}
            />
          )}

          <View className="px-5 py-4">
            {step === "idle" && canLearnMore && (
              <Pressable
                onPress={openLearnMore}
                className="rounded-lg bg-[#0644C7] py-3 active:opacity-80"
                accessibilityRole="button"
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Learn More
                </Text>
              </Pressable>
            )}

            {(step === "choose" || sending) && (
              <View>
                {failed && message && (
                  <Text className="mb-2 text-center text-xs text-red-600 dark:text-red-400">
                    {message}
                  </Text>
                )}
                <Text className="mb-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                  Where should we send the details?
                </Text>
                <View className="flex-row gap-2">
                  {(
                    [
                      { channel: "email", label: "Send by Email" },
                      { channel: "sms", label: "Send by Text" },
                    ] as const
                  ).map((opt) => (
                    <Pressable
                      key={opt.channel}
                      onPress={() => send(opt.channel)}
                      disabled={sending}
                      className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] py-3 active:opacity-80 ${
                        sending ? "opacity-60" : ""
                      }`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: sending }}
                    >
                      {sending && (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      )}
                      <Text className="text-center text-sm font-semibold text-white">
                        {sending ? "Sending…" : opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {step === "done" && message && (
              <View className="rounded-lg border border-green-100 bg-green-50 px-3 py-2.5 dark:border-green-900/40 dark:bg-green-900/20">
                <Text className="text-center text-sm font-medium text-green-700 dark:text-green-300">
                  {message}
                </Text>
              </View>
            )}

            <Pressable
              onPress={onClose}
              className={`mt-2.5 rounded-lg py-3 active:opacity-80 ${
                step === "idle" && canLearnMore
                  ? "border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                  : "bg-[#0644C7]"
              }`}
              accessibilityRole="button"
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  step === "idle" && canLearnMore
                    ? "text-gray-600 dark:text-gray-300"
                    : "text-white"
                }`}
              >
                {closeLabel}
              </Text>
            </Pressable>

            <Text className="mt-2.5 text-center text-[11px] text-gray-400 dark:text-gray-500">
              {secondsLeft > 0
                ? `${closingText} in ${secondsLeft}s`
                : `${closingText}…`}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
