import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import {
  coveredBy,
  registerBlockedPeriodHandler,
  type BlockedPeriod,
  type BlockedPeriodWarning,
} from "../../lib/blockedPeriodPrompt";
import { formatFullDate } from "../../lib/date/calendar";
import { getCurrentUser } from "../../lib/session";

type Pending = { warning: BlockedPeriodWarning; resolve: (confirmed: boolean) => void };

/** "Book anyway" waits this long, so the tap that caused the save cannot also confirm it. */
const ARM_DELAY_MS = 400;

function PeriodRow({ period, showLocation }: { period: BlockedPeriod; showLocation: boolean }) {
  return (
    <View className="mb-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-900/20">
      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
        {period.groupName || "Blocked"}
        {!!period.reason && (
          <Text className="font-normal text-gray-700 dark:text-gray-300"> — {period.reason}</Text>
        )}
      </Text>
      <Text className="mt-1 text-xs text-gray-700 dark:text-gray-300">
        {period.occurrenceDate ? `${formatFullDate(period.occurrenceDate)} · ` : ""}
        {period.windowLabel}
      </Text>
      <Text className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{period.scopeLabel}</Text>
      {showLocation && !!period.locationName && (
        <Text className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{period.locationName}</Text>
      )}
      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Set by {period.setByName ?? "an earlier version of the system"}
      </Text>
    </View>
  );
}

/**
 * Asks staff to confirm a save that falls inside an availability block (web
 * BlockedPeriodHost). Mounted once in the root layout; lib/api calls it on a
 * 409 BLOCKED_PERIOD and resends the save only when staff tap "Book anyway".
 */
export function BlockedPeriodHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [armed, setArmed] = useState(false);
  const queueRef = useRef<Pending[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const unregister = registerBlockedPeriodHandler(
      (warning) =>
        new Promise<boolean>((resolve) => {
          queueRef.current = [...queueRef.current, { warning, resolve }];
          setQueue(queueRef.current);
        }),
    );
    return () => {
      unregister();
      queueRef.current.forEach((p) => p.resolve(false));
      queueRef.current = [];
    };
  }, []);

  // One answer settles every waiting save inside the same blocks (a bulk change asks once).
  const settle = useCallback((confirmed: boolean) => {
    const [first, ...others] = queueRef.current;
    if (!first) return;
    const same = others.filter((p) => coveredBy(p.warning, first.warning));
    queueRef.current = others.filter((p) => !same.includes(p));
    setQueue(queueRef.current);
    first.resolve(confirmed);
    same.forEach((p) => p.resolve(confirmed));
  }, []);

  useEffect(() => {
    setArmed(false);
    if (!current) return;
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const { warning } = current;
  const showLocation = getCurrentUser()?.role === "company_admin";
  const alsoAnswers = queue.slice(1).filter((p) => coveredBy(p.warning, warning)).length;
  const stillWaiting = queue.length - 1 - alsoAnswers;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => settle(false)}>
      <View className="flex-1 items-center justify-center bg-black/50 p-5">
        <View
          className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900"
          style={{ maxHeight: "85%" }}
          accessibilityRole="alert"
        >
          <View className="border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
            <View className="flex-row items-center gap-2">
              <Feather name="alert-triangle" size={18} color="#D97706" />
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                This time is blocked
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {"Guests cannot book it online. You can still book it, for example for the group it was blocked for. Your name is recorded on the block's history."}
            </Text>
            {alsoAnswers > 0 && (
              <Text className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                Your answer also applies to {alsoAnswers} other save{alsoAnswers === 1 ? "" : "s"} inside the same blocked period.
              </Text>
            )}
            {stillWaiting > 0 && (
              <Text className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                {stillWaiting} more save{stillWaiting === 1 ? "" : "s"} will ask about a different blocked period next.
              </Text>
            )}
          </View>

          <ScrollView className="px-5 py-4" contentContainerStyle={{ paddingBottom: 8 }}>
            {warning.periods.length > 0 ? (
              warning.periods.map((p) => (
                <PeriodRow key={`${p.id}-${p.occurrenceDate ?? ""}`} period={p} showLocation={showLocation} />
              ))
            ) : (
              <Text className="text-sm text-gray-700 dark:text-gray-300">{warning.message}</Text>
            )}
          </ScrollView>

          <View className="flex-row gap-2 border-t border-gray-100 px-5 py-3 dark:border-neutral-800">
            <Pressable
              onPress={() => settle(false)}
              className="flex-1 items-center rounded-lg border border-gray-300 py-2.5 active:opacity-80 dark:border-neutral-700"
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">Go back</Text>
            </Pressable>
            <Pressable
              onPress={() => settle(true)}
              disabled={!armed}
              className={`flex-1 items-center rounded-lg bg-amber-600 py-2.5 active:opacity-80 ${
                armed ? "" : "opacity-60"
              }`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !armed }}
            >
              <Text className="text-sm font-medium text-white">Book anyway</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default BlockedPeriodHost;
