import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";

import { mediaUrl } from "../../lib/api";
import {
  sendAdLearnMore,
  type AdLearnMoreChannel,
  type KioskAd,
} from "../../services/waiversService";

/** How long the plain confirmation holds before the ad slides in — the web's
 *  own beat, and what its `2 + display_seconds` total is built from. */
const CONFIRM_BEAT_SECONDS = 2;
/** Interacting with Learn More must not let the kiosk close underneath the
 *  guest; these are the floors the web holds the countdown to. */
const CHOOSING_FLOOR_SECONDS = 25;
const RESULT_FLOOR_SECONDS = 12;

type LearnMoreStep = "idle" | "choose" | "sending" | "done";

/**
 * The post-waiver ad beat.
 *
 * Shown after a kiosk submission that came back with an ad. It holds for the
 * backend's configured duration and then hands the kiosk back to the caller,
 * unless the guest is partway through Learn More — sending never gets cut off,
 * and both outcomes buy enough time to be read.
 *
 * `visible` is the caller's single source of truth: the countdown only runs
 * while it is true, and every timer is torn down when it goes false, so a kiosk
 * running waiver after waiver never accumulates loops.
 */
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
  /** The completed waiver the ad was shown against; Learn More needs it. */
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

  // Read through a ref so the countdown effect can own the interval outright
  // rather than resubscribing every time the parent re-renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fresh ad, fresh beat. Keyed on the ad's identity so reopening the modal for
  // the next guest always restarts from the full duration.
  useEffect(() => {
    if (!visible || !ad) return;
    setSecondsLeft(CONFIRM_BEAT_SECONDS + ad.displaySeconds);
    setStep("idle");
    setMessage(null);
    setFailed(false);
  }, [visible, ad]);

  // The countdown. Runs only while open, and clears on close/unmount.
  useEffect(() => {
    if (!visible || !ad) return;
    const tick = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(tick);
  }, [visible, ad]);

  // Auto-close, held off while a send is in flight so the guest always sees the
  // outcome of something they asked for.
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
      // A failure drops back to the choice so the guest can try the other
      // channel; a success rests on the confirmation.
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
          {/* Confirmation strip — the ad never replaces the fact that the
              waiver was signed. */}
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
                      {sending && <ActivityIndicator size="small" color="#FFFFFF" />}
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
