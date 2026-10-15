import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import {
  FilterOptionSheet,
  type FilterOption,
} from "../../components/ui/FilterOptionSheet";
import {
  FilterPill,
  PillDivider,
  PillSegment,
} from "../../components/ui/FilterPill";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import {
  formatDeliveredAt,
  isCancelable,
  KIND_LABELS,
  PhotoDeliveriesTable,
  sessionContextLine,
} from "../../components/ui/PhotoDeliveriesTable";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { ApiError } from "../../lib/api";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  canRetryFromLog,
  mergeDeliveries,
  outcomeStyle,
  pendingDeliveryIds,
} from "../../lib/photos/deliveryOutcome";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  cancelPhotoDelivery,
  confirmPhotoTextReceived,
  deliveryFromError,
  fetchPhotoDeliveryLog,
  refreshPhotoDeliveryStatus,
  retryPhotoDelivery,
  type PhotoChannel,
  type PhotoDeliveryKind,
  type PhotoDeliveryLog,
  type PhotoDeliveryLogRow,
  type PhotoDeliveryRow,
  type PhotoDeliveryStatus,
  type PhotoTextOutcomeFilter,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

/**
 * The three dropdowns the web's delivery log offers, with its exact labels and
 * order. "" is the off position, matching "All statuses" / "Both channels" /
 * "All kinds". Status leaves `queued` out, as the web filter does — a queued row
 * is in flight for seconds and is never a useful thing to filter on.
 */
const STATUS_OPTIONS: FilterOption[] = [
  { label: "All statuses", value: "" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Canceled", value: "canceled" },
  { label: "Not sent (channel off)", value: "skipped" },
];

const OUTCOME_OPTIONS: FilterOption[] = [
  { label: "Any text outcome", value: "" },
  { label: "Text not delivered", value: "not_delivered" },
  { label: "Text waiting for the carrier", value: "awaiting_carrier" },
  { label: "Text reached the phone", value: "reached_phone" },
];

const CARRIER_RECHECK_MS = 10000;
const CARRIER_RECHECK_LIMIT = 18;
const CHECKS_PAUSED =
  "Checking the newest texts is paused because this sign-in checked very often. Press Refresh in a minute.";

const isRateLimited = (e: unknown): boolean => e instanceof ApiError && e.status === 429;

const CHANNEL_OPTIONS: FilterOption[] = [
  { label: "Both channels", value: "" },
  { label: "Email", value: "email" },
  { label: "SMS", value: "sms" },
];

const KIND_OPTIONS: FilterOption[] = [
  { label: "All kinds", value: "" },
  { label: "Immediate", value: "immediate" },
  { label: "9:00 AM next day", value: "next_day_9am" },
  { label: "Kiosk", value: "kiosk" },
];

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** The picked option's label, so a pill segment reads like the web's select. */
const labelFor = (options: FilterOption[], value: string): string =>
  options.find((o) => o.value === value)?.label ?? options[0].label;

function DeliveryLogSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          className="gap-2 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <SkeletonBlock pulse={pulse} className="h-4 w-1/3" />
          <SkeletonBlock pulse={pulse} className="h-3 w-2/3" />
          <SkeletonBlock pulse={pulse} className="h-3 w-1/2" />
        </View>
      ))}
    </View>
  );
}

/** One email/SMS row — the mobile form of the web table's row. */
function DeliveryCard({
  row,
  busy,
  onRetry,
  onCancel,
  onConfirm,
}: {
  row: PhotoDeliveryLogRow;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const status = outcomeStyle(row.outcomeTone);
  const detail = row.outcomeDetail ?? row.failureReason;
  return (
    <View className="mb-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Feather
              name={row.channel === "sms" ? "message-square" : "mail"}
              size={14}
              color={PRIMARY}
            />
            <Text
              className="flex-1 text-sm font-medium text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {row.destinationMasked}
            </Text>
          </View>
          {!!row.recipientName && (
            <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {row.recipientName}
            </Text>
          )}
        </View>
        <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${status.wrap}`}>
          {row.awaitingCarrier && <ActivityIndicator size="small" color="#2563EB" />}
          <Text className={`text-[11px] ${status.text}`}>{row.outcomeLabel ?? row.status}</Text>
        </View>
      </View>

      <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {row.sessionId != null ? `#${row.sessionId} · ` : ""}
        {sessionContextLine(row)}
      </Text>

      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {(row.kind ? KIND_LABELS[row.kind] : null) ?? "—"} ·{" "}
        {formatDeliveredAt(row.occurredAt)}
      </Text>

      {row.linkOpened && (
        <Text className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
          link opened from this message
        </Text>
      )}

      {row.isDuplicate && (
        <Text className="mt-1 text-xs text-amber-800 dark:text-amber-400">
          Duplicate destination
          {row.duplicateOfId != null ? ` of row #${row.duplicateOfId}` : ""} — it
          was recorded, not sent again.
        </Text>
      )}

      {!!detail && (
        <Text
          className={`mt-1 text-xs ${
            // No tone means an older server, whose only detail is the failure.
            row.outcomeTone === "danger" || !row.outcomeTone
              ? "text-red-700 dark:text-red-400"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          {detail}
        </Text>
      )}

      {!!row.receiptConfirmedByName && (
        <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          confirmed by {row.receiptConfirmedByName}
        </Text>
      )}

      <View className="mt-3 flex-row flex-wrap gap-2">
        {row.canConfirmReceipt && (
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-green-300 py-2.5 dark:border-green-800 ${
              busy ? "opacity-40" : "active:opacity-70"
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Guest received the text to ${row.destinationMasked}`}
          >
            <Feather name="smartphone" size={13} color="#166534" />
            <Text className="text-xs font-medium text-green-800 dark:text-green-300">
              Guest received it
            </Text>
          </Pressable>
        )}
        {canRetryFromLog(row) && (
          <Pressable
            onPress={onRetry}
            disabled={busy}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 dark:border-neutral-700 ${
              busy ? "opacity-40" : "active:opacity-70"
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Resend to ${row.destinationMasked}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={PRIMARY} />
            ) : (
              <Feather name="refresh-cw" size={13} color="#4B5563" />
            )}
            <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
              Resend
            </Text>
          </Pressable>
        )}
        {isCancelable(row.status) && (
          <Pressable
            onPress={onCancel}
            disabled={busy}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 dark:border-neutral-700 ${
              busy ? "opacity-40" : "active:opacity-70"
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Cancel the send to ${row.destinationMasked}`}
          >
            <Feather name="x-circle" size={13} color="#B91C1C" />
            <Text className="text-xs font-medium text-red-700 dark:text-red-400">
              Cancel
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function PhotoDeliveryLogScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  /**
   * The log is company-wide — the web page has no location filter and prints the
   * location on each row. A pinned workspace location narrows it; "All
   * Locations" fetches everything rather than blocking on a choice.
   */
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  const [log, setLog] = useState<PhotoDeliveryLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const [status, setStatus] = useState<"" | PhotoDeliveryStatus>("");
  const [channel, setChannel] = useState<"" | PhotoChannel>("");
  const [kind, setKind] = useState<"" | PhotoDeliveryKind>("");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [outcome, setOutcome] = useState<"" | PhotoTextOutcomeFilter>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Table is the default layout everywhere in the app; cards suit narrow phones.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // One sheet at a time — two stacked native sheets crash Android.
  const [sheet, setSheet] = useState<
    null | "status" | "channel" | "kind" | "outcome" | "date"
  >(null);

  // A newer load, or a row changed by hand, makes an older carrier answer stale.
  const loadSeq = useRef(0);
  const rowEdits = useRef(0);
  const [recheckRounds, setRecheckRounds] = useState(0);

  const applyChecked = useCallback((checked: PhotoDeliveryRow[]) => {
    setLog((prev) => (prev ? { ...prev, rows: mergeDeliveries(prev.rows, checked) } : prev));
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    setRecheckRounds(0);
    try {
      const loadedLog = await fetchPhotoDeliveryLog(token, {
        locationId: effectiveLocationId,
        status: status || undefined,
        channel: channel || undefined,
        kind: kind || undefined,
        from: from || undefined,
        to: to || undefined,
        includeDuplicates: showDuplicates || undefined,
        outcome: outcome || undefined,
      });
      if (seq !== loadSeq.current) return;
      setLog(loadedLog);
      // Texts still on their way are asked about straight away.
      const waitingIds = pendingDeliveryIds(loadedLog.rows);
      if (waitingIds.length > 0) {
        const edits = rowEdits.current;
        try {
          const checked = await refreshPhotoDeliveryStatus(token, waitingIds);
          if (seq !== loadSeq.current) return;
          if (edits === rowEdits.current) applyChecked(checked.deliveries);
        } catch (checkError) {
          if (seq !== loadSeq.current) return;
          if (isRateLimited(checkError)) setRecheckRounds(CARRIER_RECHECK_LIMIT);
          showToast({
            message: isRateLimited(checkError)
              ? CHECKS_PAUSED
              : "The text provider could not be asked about the newest texts just now.",
            type: "info",
          });
        }
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      // Shown in the list area too — a toast disappears, and "no rows" and "the
      // request failed" must not look the same.
      const message = errorMessage(e, "Could not load the delivery log.");
      setError(message);
      showToast({ message, type: "error" });
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [
    applyChecked,
    channel,
    effectiveLocationId,
    from,
    kind,
    outcome,
    showDuplicates,
    status,
    to,
    showToast,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingIds = useMemo(() => pendingDeliveryIds(log?.rows ?? []), [log]);

  // Keep asking about texts still on their way, every 10 s for three minutes.
  useEffect(() => {
    if (loading || pendingIds.length === 0 || recheckRounds >= CARRIER_RECHECK_LIMIT) return undefined;
    const timer = setTimeout(() => {
      const token = getToken();
      if (!token) return;
      const seq = loadSeq.current;
      const edits = rowEdits.current;
      refreshPhotoDeliveryStatus(token, pendingIds)
        .then((checked) => {
          if (seq !== loadSeq.current) return;
          if (edits === rowEdits.current) applyChecked(checked.deliveries);
          setRecheckRounds((n) => n + 1);
        })
        .catch((checkError) => {
          if (seq !== loadSeq.current) return;
          setRecheckRounds(CARRIER_RECHECK_LIMIT);
          if (isRateLimited(checkError)) showToast({ message: CHECKS_PAUSED, type: "info" });
        });
    }, CARRIER_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [applyChecked, loading, pendingIds, recheckRounds, showToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /** Retry and cancel differ only in the call and the failure line. */
  const runRowAction = useCallback(
    async (row: PhotoDeliveryLogRow, action: "retry" | "cancel") => {
      const token = getToken();
      if (!token || busyId !== null) return;
      setBusyId(row.id);
      try {
        showToast({
          message:
            action === "retry"
              ? (await retryPhotoDelivery(token, row.id)).message
              : await cancelPhotoDelivery(token, row.id),
          type: "success",
        });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(
            e,
            action === "retry"
              ? "That link could not be sent again."
              : "That delivery could not be canceled.",
          ),
          type: "error",
        });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, load, showToast],
  );

  /** "Guest received it": staff saw the text on the guest's phone. */
  const confirmReceived = useCallback(
    async (row: PhotoDeliveryLogRow) => {
      const token = getToken();
      if (!token || busyId !== null) return;
      rowEdits.current += 1;
      setBusyId(row.id);
      try {
        const result = await confirmPhotoTextReceived(token, row.id);
        applyChecked([result.row]);
        showToast({ message: result.message, type: "success" });
      } catch (e) {
        const current = deliveryFromError(e);
        if (current) applyChecked([current]);
        showToast({ message: errorMessage(e, "That could not be saved."), type: "error" });
      } finally {
        rowEdits.current += 1;
        setBusyId(null);
      }
    },
    [applyChecked, busyId, showToast],
  );

  /**
   * Narrow to the pinned location here as well as in the query. Whether the
   * endpoint honours `location_id` is unverified, so the pin is enforced on what
   * came back rather than trusted to the server.
   */
  const rows = useMemo(() => {
    const all = log?.rows ?? [];
    if (effectiveLocationId == null || activeLocation.id === "all") return all;
    if (!activeLocation.name) return all;
    // Keep rows with no location on them — dropping them would hide real sends.
    return all.filter(
      (row) => !row.locationName || row.locationName === activeLocation.name,
    );
  }, [activeLocation.id, activeLocation.name, effectiveLocationId, log]);

  // The server's total only speaks for the unnarrowed set; once rows are
  // filtered here, count what is actually on screen.
  const fetchedCount = log?.rows.length ?? 0;
  const total =
    rows.length === fetchedCount ? (log?.total ?? rows.length) : rows.length;
  const hasDateRange = !!(from && to);
  const anyFilterOn =
    status !== "" ||
    channel !== "" ||
    kind !== "" ||
    outcome !== "" ||
    showDuplicates ||
    hasDateRange;

  const dateLabel = useMemo(
    () =>
      hasDateRange
        ? `${formatShortDate(from)} – ${formatShortDate(to)}`
        : "All dates",
    [from, hasDateRange, to],
  );

  /** Reset every filter, including the range — the calendar has no clear. */
  const clearAll = useCallback(() => {
    setStatus("");
    setChannel("");
    setKind("");
    setOutcome("");
    setShowDuplicates(false);
    setFrom("");
    setTo("");
  }, []);

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color="#111827" />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Delivery Log
        </Text>
        <Pressable
          onPress={() => void load()}
          disabled={loading}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {loading ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Feather name="refresh-cw" size={18} color="#111827" />
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="mt-5 px-5">
          <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Email and SMS are tracked separately. A text only shows as delivered
            once the phone carrier confirms it, and as received once the guest
            opens its link or a staff member sees it on their phone.
          </Text>

          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {!!error && (
            <View className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-900/20">
              <Text className="font-semibold text-red-600 dark:text-red-400">
                Something went wrong
              </Text>
              <Text className="mt-1 text-sm text-red-500 dark:text-red-300">
                {error}
              </Text>
            </View>
          )}

          {/* Filters — the web's three selects as one segmented pill, each
              segment labelled with its current value (as on Bookings). */}
          <FilterPill>
            <PillSegment
              label={labelFor(STATUS_OPTIONS, status)}
              active={sheet === "status" || status !== ""}
              onPress={() => setSheet("status")}
              renderIcon={(c) => (
                <Feather name="check-circle" size={15} color={c} />
              )}
            />
            <PillSegment
              label={labelFor(CHANNEL_OPTIONS, channel)}
              active={sheet === "channel" || channel !== ""}
              onPress={() => setSheet("channel")}
              renderIcon={(c) => <Feather name="send" size={15} color={c} />}
            />
            <PillSegment
              label={labelFor(KIND_OPTIONS, kind)}
              active={sheet === "kind" || kind !== ""}
              onPress={() => setSheet("kind")}
              renderIcon={(c) => <Feather name="clock" size={15} color={c} />}
            />
          </FilterPill>

          {/* Text outcome · date range · deduplicated links · clear (only once something is on) */}
          <FilterPill>
            <PillSegment
              label={labelFor(OUTCOME_OPTIONS, outcome)}
              active={sheet === "outcome" || outcome !== ""}
              onPress={() => setSheet("outcome")}
              renderIcon={(c) => (
                <Feather name="smartphone" size={15} color={c} />
              )}
            />
            <PillSegment
              label={dateLabel}
              active={sheet === "date" || hasDateRange}
              onPress={() => setSheet("date")}
              renderIcon={(c) => (
                <Feather name="calendar" size={15} color={c} />
              )}
            />
            <PillSegment
              label="Duplicates"
              active={showDuplicates}
              onPress={() => setShowDuplicates((v) => !v)}
              renderIcon={(c) => <Feather name="copy" size={15} color={c} />}
            />
            {anyFilterOn && (
              <>
                <PillDivider />
                <PillSegment
                  label="Clear"
                  onPress={clearAll}
                  renderIcon={(c) => <Feather name="x" size={15} color={c} />}
                />
              </>
            )}
          </FilterPill>

          {/* Row count + layout toggle (Table default / Cards) */}
          {loaded && rows.length > 0 && (
            <View className="mb-3 flex-row items-center gap-2">
              <Text className="shrink text-xs text-gray-500 dark:text-gray-400">
                {total === 1 ? "1 delivery row" : `${total} delivery rows`}
                {log?.truncated ? " · narrow the dates to see older rows" : ""}
              </Text>
              <View className="ml-auto shrink-0">
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </View>
          )}

          {!loaded && loading && <DeliveryLogSkeleton />}

          {loaded && !error && rows.length === 0 && (
            <View className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
              <Feather name="send" size={34} color="#D1D5DB" />
              <Text className="mt-3 font-bold text-gray-900 dark:text-white">
                No deliveries here
              </Text>
              <Text className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                {anyFilterOn
                  ? "Nothing matches these filters. Tap Clear to see the full log."
                  : "Rows appear once a session is sent to a waiver by email or SMS."}
              </Text>
            </View>
          )}

          {/* Both layouts render the same fields from the same helpers — the
              table is the web's grid, the cards are it stacked for narrow
              screens. */}
          {rows.length > 0 &&
            (viewMode === "table" ? (
              <PhotoDeliveriesTable
                rows={rows}
                busyId={busyId}
                onRetry={(row) => void runRowAction(row, "retry")}
                onCancel={(row) => void runRowAction(row, "cancel")}
                onConfirm={(row) => void confirmReceived(row)}
              />
            ) : (
              rows.map((row) => (
                <DeliveryCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onRetry={() => void runRowAction(row, "retry")}
                  onCancel={() => void runRowAction(row, "cancel")}
                  onConfirm={() => void confirmReceived(row)}
                />
              ))
            ))}
        </View>
      </ScrollView>

      <FilterOptionSheet
        visible={sheet === "status"}
        title="Filter by Status"
        value={status}
        options={STATUS_OPTIONS}
        onSelect={(v) => setStatus(String(v) as "" | PhotoDeliveryStatus)}
        onClose={() => setSheet(null)}
      />
      <FilterOptionSheet
        visible={sheet === "channel"}
        title="Filter by Channel"
        value={channel}
        options={CHANNEL_OPTIONS}
        onSelect={(v) => setChannel(String(v) as "" | PhotoChannel)}
        onClose={() => setSheet(null)}
      />
      <FilterOptionSheet
        visible={sheet === "kind"}
        title="Filter by Kind"
        value={kind}
        options={KIND_OPTIONS}
        onSelect={(v) => setKind(String(v) as "" | PhotoDeliveryKind)}
        onClose={() => setSheet(null)}
      />
      <FilterOptionSheet
        visible={sheet === "outcome"}
        title="Filter by Text Outcome"
        value={outcome}
        options={OUTCOME_OPTIONS}
        onSelect={(v) => setOutcome(String(v) as "" | PhotoTextOutcomeFilter)}
        onClose={() => setSheet(null)}
      />

      <DateRangeSheet
        visible={sheet === "date"}
        initialStart={from}
        initialEnd={to}
        onClose={() => setSheet(null)}
        onApply={(start, end) => {
          setFrom(start);
          setTo(end);
          setSheet(null);
        }}
      />

      {!!toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </View>
  );
}
