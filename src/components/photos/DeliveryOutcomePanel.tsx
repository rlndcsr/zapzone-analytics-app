import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ApiError } from "../../lib/api";
import {
  canRetryFromOutcome,
  channelName,
  isCarrierPending,
  mergeDeliveries,
  outcomeStyle,
  resultStyleKey,
  type ResultStyleKey,
} from "../../lib/photos/deliveryOutcome";
import { getToken } from "../../lib/session";
import {
  confirmPhotoTextReceived,
  deliveryFromError,
  refreshPhotoDeliveryStatus,
  retryPhotoDelivery,
  type PhotoDeliveryRow,
  type PhotoSendOutcome,
} from "../../services/photosService";

const POLL_INTERVAL_MS = 5000;
const PAUSED_INTERVAL_MS = 60000;
const POLL_LIMIT = 24;

type RefreshResult = "ok" | "stale" | "paused" | "failed" | "signed_out";

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

const statusOf = (e: unknown): number | undefined =>
  e instanceof ApiError ? e.status : undefined;

const RESULT_STYLE: Record<
  ResultStyleKey,
  { icon: keyof typeof Feather.glyphMap | null; color: string; box: string }
> = {
  sent: {
    icon: "check-circle",
    color: "#16A34A",
    box: "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20",
  },
  partial: {
    icon: "alert-triangle",
    color: "#D97706",
    box: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20",
  },
  failed: {
    icon: "x-circle",
    color: "#DC2626",
    box: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
  },
  scheduled: {
    icon: "clock",
    color: "#2563EB",
    box: "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20",
  },
  waiting: {
    icon: null,
    color: "#2563EB",
    box: "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20",
  },
};

function OutcomeBadge({
  row,
  polling,
}: {
  row: PhotoDeliveryRow;
  polling: boolean;
}) {
  const style = outcomeStyle(row.outcomeTone);
  return (
    <View className="mt-1 flex-row">
      <View
        className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${style.wrap}`}
      >
        {row.awaitingCarrier && polling && (
          <ActivityIndicator size="small" color="#2563EB" />
        )}
        <Text className={`text-xs ${style.text}`}>
          {row.outcomeLabel ?? row.status}
        </Text>
      </View>
    </View>
  );
}

function RowAction({
  label,
  icon,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tone: "green" | "gray";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 dark:bg-neutral-900 ${
        tone === "green"
          ? "border-green-300 dark:border-green-800"
          : "border-gray-200 dark:border-neutral-700"
      } ${disabled ? "opacity-40" : "active:opacity-70"}`}
    >
      <Feather
        name={icon}
        size={13}
        color={tone === "green" ? "#166534" : "#4B5563"}
      />
      <Text
        className={`text-xs font-medium ${
          tone === "green"
            ? "text-green-800 dark:text-green-300"
            : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DeliveryOutcomePanel({
  outcome,
  deliveries,
  onResultChange,
}: {
  outcome: PhotoSendOutcome;
  deliveries: PhotoDeliveryRow[];
  onResultChange?: (result: PhotoSendOutcome["result"]) => void;
}) {
  const [summary, setSummary] = useState<PhotoSendOutcome>(outcome);
  const [rows, setRows] = useState<PhotoDeliveryRow[]>(() =>
    deliveries.filter((row) => outcome.deliveryIds.includes(row.id)),
  );
  const [checks, setChecks] = useState(0);
  const [pollTick, setPollTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkPaused, setCheckPaused] = useState(false);
  const [refreshDue, setRefreshDue] = useState(false);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const mounted = useRef(true);
  // A retry / confirm in flight makes any status answer that started before it stale.
  const mutations = useRef(0);
  const refreshes = useRef(0);
  const busyCount = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    onResultChange?.(summary.result);
  }, [onResultChange, summary.result]);

  const deliveryIds = summary.deliveryIds;

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    const token = getToken();
    if (!mounted.current || !token) return "stale";
    if (deliveryIds.length === 0) return "ok";
    const startedAt = mutations.current;
    const sequence = ++refreshes.current;
    setChecking(true);
    try {
      const result = await refreshPhotoDeliveryStatus(token, deliveryIds);
      if (
        !mounted.current ||
        startedAt !== mutations.current ||
        sequence !== refreshes.current
      )
        return "stale";
      setRows((prev) => mergeDeliveries(prev, result.deliveries));
      if (result.outcome) setSummary(result.outcome);
      setCheckFailed(false);
      setCheckPaused(false);
      setRefreshDue(false);
      return "ok";
    } catch (e) {
      if (!mounted.current) return "stale";
      const stale =
        startedAt !== mutations.current || sequence !== refreshes.current;
      if (statusOf(e) === 401) {
        setChecks(POLL_LIMIT);
        setRefreshDue(false);
        setNotice({
          tone: "error",
          text: "You are signed out, so this screen stopped checking. The delivery log keeps the result.",
        });
        return "signed_out";
      }
      if (statusOf(e) === 429) {
        setRefreshDue(true);
        setCheckPaused(true);
        setCheckFailed(false);
        return "paused";
      }
      if (stale) return "stale";
      setRefreshDue(true);
      setCheckFailed(true);
      setCheckPaused(false);
      return "failed";
    } finally {
      if (mounted.current && sequence === refreshes.current) setChecking(false);
    }
  }, [deliveryIds]);

  const waiting = summary.carrierPending > 0 || rows.some(isCarrierPending);
  const keepChecking = waiting || refreshDue;

  useEffect(() => {
    if (!keepChecking || checks >= POLL_LIMIT) return undefined;
    const timer = setTimeout(
      () => {
        if (busyCount.current > 0) {
          setPollTick((n) => n + 1);
          return;
        }
        void refresh().then((result) => {
          if (!mounted.current) return;
          if (result === "paused") setPollTick((n) => n + 1);
          else setChecks((n) => n + 1);
        });
      },
      checkPaused ? PAUSED_INTERVAL_MS : POLL_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [keepChecking, checks, pollTick, checkPaused, refresh]);

  const startBusy = useCallback((id: number) => {
    mutations.current += 1;
    busyCount.current += 1;
    setBusyIds((prev) => [...prev, id]);
    setNotice(null);
  }, []);

  const endBusy = useCallback((id: number) => {
    mutations.current += 1;
    busyCount.current = Math.max(0, busyCount.current - 1);
    setBusyIds((prev) => prev.filter((busyId) => busyId !== id));
  }, []);

  const afterAction = useCallback(() => {
    setChecks(0);
    if (busyCount.current === 0) void refresh();
    else setRefreshDue(true);
  }, [refresh]);

  const confirmReceived = useCallback(
    async (row: PhotoDeliveryRow) => {
      const token = getToken();
      if (!token) return;
      startBusy(row.id);
      try {
        const result = await confirmPhotoTextReceived(token, row.id);
        if (!mounted.current) return;
        setRows((prev) => mergeDeliveries(prev, [result.row]));
        setSummary((prev) => ({ ...prev, askForReceipt: false }));
        setNotice({ tone: "success", text: result.message });
      } catch (e) {
        if (!mounted.current) return;
        const current = deliveryFromError(e);
        if (current) setRows((prev) => mergeDeliveries(prev, [current]));
        setNotice({
          tone: "error",
          text: errorMessage(e, "That could not be saved. Try again."),
        });
      } finally {
        endBusy(row.id);
        if (mounted.current) afterAction();
      }
    },
    [afterAction, endBusy, startBusy],
  );

  const retry = useCallback(
    async (row: PhotoDeliveryRow) => {
      const token = getToken();
      if (!token) return;
      startBusy(row.id);
      try {
        const result = await retryPhotoDelivery(token, row.id);
        if (!mounted.current) return;
        if (result.row) setRows((prev) => mergeDeliveries(prev, [result.row!]));
        setNotice({ tone: "success", text: result.message });
      } catch (e) {
        if (!mounted.current) return;
        const failedRow = deliveryFromError(e);
        if (failedRow) setRows((prev) => mergeDeliveries(prev, [failedRow]));
        setNotice({
          tone: "error",
          text: errorMessage(e, "It did not go out again."),
        });
      } finally {
        endBusy(row.id);
        if (mounted.current) afterAction();
      }
    },
    [afterAction, endBusy, startBusy],
  );

  const polling = keepChecking && checks < POLL_LIMIT;
  const timedOut = waiting && checks >= POLL_LIMIT;
  const style =
    RESULT_STYLE[resultStyleKey(summary.result, waiting, polling)] ??
    RESULT_STYLE.partial;

  return (
    <View>
      <View
        className={`rounded-xl border p-4 ${style.box}`}
        accessibilityLiveRegion="polite"
      >
        <View className="flex-row items-start gap-3">
          {style.icon ? (
            <Feather name={style.icon} size={22} color={style.color} />
          ) : (
            <ActivityIndicator size="small" color={style.color} />
          )}
          <View className="min-w-0 flex-1">
            <Text className="font-semibold text-gray-900 dark:text-white">
              {summary.headline}
            </Text>
            <Text className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {summary.message}
            </Text>
            {timedOut && (
              <Text className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                The phone carrier has not answered yet. The delivery log keeps
                checking for three days.
              </Text>
            )}
          </View>
        </View>
      </View>

      {summary.askForReceipt && (
        <View className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
          <View className="flex-row items-center gap-2">
            <Feather name="smartphone" size={14} color="#1E3A8A" />
            <Text className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Is the text on the guest&apos;s phone?
            </Text>
          </View>
          <Text className="mt-1 text-sm text-blue-900 dark:text-blue-200">
            Texting is not confirmed as working yet. Ask the guest to check
            their phone. If the photo text is there, tap “Guest received it”.
            Texting then counts as confirmed once the phone carrier reports the
            text delivered, or after three days if the carrier reports no
            problem. The guest opening the link from the text confirms it at
            once.
          </Text>
        </View>
      )}

      <View className="mt-4 border-y border-gray-100 dark:border-neutral-800">
        {rows.map((row, i) => {
          const busy = busyIds.includes(row.id);
          const canRetry = canRetryFromOutcome(row, summary.textsBlocked);
          return (
            <View
              key={row.id}
              className={`py-3 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
            >
              <View className="flex-row items-start gap-3">
                <Feather
                  name={row.channel === "email" ? "mail" : "message-square"}
                  size={15}
                  color="#6B7280"
                  style={{ marginTop: 2 }}
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm text-gray-900 dark:text-white">
                    {channelName(row)} · {row.destinationMasked}
                    {!!row.recipientName && (
                      <Text className="text-gray-500 dark:text-gray-400">
                        {" "}
                        · {row.recipientName}
                      </Text>
                    )}
                  </Text>
                  <OutcomeBadge row={row} polling={polling} />
                  {!!row.outcomeDetail && (
                    <Text className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                      {row.outcomeDetail}
                    </Text>
                  )}
                </View>
              </View>
              {(row.canConfirmReceipt || canRetry) && (
                <View className="mt-2 flex-row flex-wrap gap-2 pl-7">
                  {row.canConfirmReceipt && (
                    <RowAction
                      label="Guest received it"
                      icon="smartphone"
                      tone="green"
                      disabled={busy}
                      onPress={() => void confirmReceived(row)}
                    />
                  )}
                  {canRetry && (
                    <RowAction
                      label="Retry"
                      icon="refresh-cw"
                      tone="gray"
                      disabled={busy}
                      onPress={() => void retry(row)}
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {(keepChecking || checkFailed || checkPaused) && (
        <Pressable
          onPress={() => {
            setChecks(0);
            void refresh();
          }}
          disabled={checking}
          accessibilityRole="button"
          className={`mt-3 flex-row items-center gap-1.5 self-start ${checking ? "opacity-50" : "active:opacity-70"}`}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#374151" />
          ) : (
            <Feather name="refresh-cw" size={14} color="#374151" />
          )}
          <Text className="text-sm text-gray-700 underline dark:text-gray-300">
            Check again now
          </Text>
        </Pressable>
      )}
      {checkFailed && (
        <Text
          className="mt-2 text-sm text-amber-800 dark:text-amber-300"
          accessibilityLiveRegion="polite"
        >
          {checks >= POLL_LIMIT
            ? "This screen could not check the delivery status just now. Tap “Check again now” to try again."
            : "This screen could not check the delivery status just now. It will try again shortly."}
        </Text>
      )}
      {checkPaused && (
        <Text
          className="mt-2 text-sm text-amber-800 dark:text-amber-300"
          accessibilityLiveRegion="polite"
        >
          Checking is paused for a minute because this sign-in checked very
          often. It tries again in a minute.
        </Text>
      )}
      {!!notice && (
        <Text
          accessibilityLiveRegion="polite"
          className={`mt-3 text-sm ${
            notice.tone === "success"
              ? "text-green-800 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {notice.text}
        </Text>
      )}
    </View>
  );
}
