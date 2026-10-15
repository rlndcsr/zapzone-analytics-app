import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { canRetryFromLog, outcomeStyle } from "../../lib/photos/deliveryOutcome";
import type {
  PhotoDeliveryKind,
  PhotoDeliveryLogRow,
  PhotoDeliveryStatus,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 68;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

/** The web prints the kind as lower-case prose, not a chip. */
export const KIND_LABELS: Record<PhotoDeliveryKind, string> = {
  immediate: "immediate",
  next_day_9am: "9:00 AM next day",
  kiosk: "kiosk",
};

/** Matches the web's `toLocaleString()` output, e.g. "8/12/2026, 2:50:02 AM". */
export function formatDeliveredAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** "Staff · Brighton | Zap Zone" — the web's second line under the session id. */
export function sessionContextLine(row: PhotoDeliveryLogRow): string {
  const source = row.sessionSource
    ? row.sessionSource.charAt(0).toUpperCase() + row.sessionSource.slice(1)
    : null;
  return [source, row.locationName].filter(Boolean).join(" · ") || "—";
}

type RowHandlers = {
  onRetry: (row: PhotoDeliveryLogRow) => void;
  onCancel: (row: PhotoDeliveryLogRow) => void;
  onConfirm: (row: PhotoDeliveryLogRow) => void;
  /** Id with a call in flight, so only that row shows a spinner. */
  busyId: number | null;
};

/** Cancel only reaches a send that has not gone out yet. */
export const isCancelable = (status: PhotoDeliveryStatus): boolean =>
  status === "queued" || status === "scheduled";

type Column = {
  key: string;
  label: string;
  width: number;
  render: (row: PhotoDeliveryLogRow, handlers: RowHandlers) => ReactNode;
};

/** The web table's columns, in the same order and with the same content. */
const COLUMNS: Column[] = [
  {
    key: "session",
    label: "Session",
    width: 190,
    render: (row) => (
      <View>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {row.sessionId != null ? `#${row.sessionId}` : "—"}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
        >
          {sessionContextLine(row)}
        </Text>
      </View>
    ),
  },
  {
    key: "channel",
    label: "Channel",
    width: 120,
    render: (row) => (
      <View className="flex-row items-center gap-2">
        <Feather
          name={row.channel === "sms" ? "message-square" : "mail"}
          size={14}
          color="#6B7280"
        />
        <Text className={CELL_TEXT}>
          {row.channel === "sms" ? "SMS" : "Email"}
        </Text>
      </View>
    ),
  },
  {
    key: "destination",
    label: "Destination",
    width: 250,
    render: (row) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-gray-800 dark:text-gray-100"
        >
          {row.destinationMasked}
        </Text>
        {!!row.recipientName && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
          >
            {row.recipientName}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "kind",
    label: "Kind",
    width: 150,
    render: (row) => (
      <Text numberOfLines={1} className="text-sm text-[#0644C7]">
        {(row.kind ? KIND_LABELS[row.kind] : null) ?? "—"}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 230,
    render: (row) => {
      const style = outcomeStyle(row.outcomeTone);
      const detail = row.outcomeDetail ?? row.failureReason;
      return (
        <View>
          <View className="flex-row">
            <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${style.wrap}`}>
              {row.awaitingCarrier && <ActivityIndicator size="small" color="#2563EB" />}
              <Text className={`text-[10px] font-semibold ${style.text}`}>
                {row.outcomeLabel ?? row.status}
              </Text>
            </View>
          </View>
          {!!detail && (
            <Text
              numberOfLines={3}
              className={`mt-1 text-xs ${
                row.outcomeTone === "danger" || !row.outcomeTone
                  ? "text-red-700 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {detail}
            </Text>
          )}
          {!!row.receiptConfirmedByName && (
            <Text numberOfLines={1} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              confirmed by {row.receiptConfirmedByName}
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "when",
    label: "When",
    width: 210,
    render: (row) => (
      <View>
        <Text numberOfLines={1} className={CELL_TEXT}>
          {formatDeliveredAt(row.occurredAt)}
        </Text>
        {row.linkOpened && (
          <Text className="mt-0.5 text-xs font-medium text-green-700 dark:text-green-400">
            link opened from this message
          </Text>
        )}
        {row.isDuplicate && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-amber-700 dark:text-amber-400"
          >
            duplicate destination
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 340,
    render: (row, { onRetry, onCancel, onConfirm, busyId }) => {
      const busy = busyId === row.id;
      return (
        <View className="flex-row flex-wrap gap-2">
          {row.canConfirmReceipt && (
            <Pressable
              onPress={() => onConfirm(row)}
              disabled={busy}
              className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-green-300 px-3 py-2 dark:border-green-800 ${
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
              onPress={() => onRetry(row)}
              disabled={busy}
              className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 dark:border-neutral-700 ${
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
              onPress={() => onCancel(row)}
              disabled={busy}
              className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 dark:border-neutral-700 ${
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
      );
    },
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for the photo Delivery Log — the web page's grid, column for
 * column, horizontally scrollable with fixed widths. Rows carry no tap action;
 * Resend in the Actions cell is the only thing you can do to one.
 */
export const PhotoDeliveriesTable = memo(function PhotoDeliveriesTable({
  rows,
  onRetry,
  onCancel,
  onConfirm,
  busyId,
}: {
  rows: PhotoDeliveryLogRow[];
} & RowHandlers) {
  const handlers: RowHandlers = { onRetry, onCancel, onConfirm, busyId };

  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      style={CARD_SHADOW}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: TABLE_WIDTH }}>
          {/* Header */}
          <View
            className="flex-row items-center border-b border-gray-100 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/60"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {COLUMNS.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {rows.map((row, i) => (
            <View
              key={row.id}
              className={`flex-row items-center ${
                i < rows.length - 1
                  ? "border-b border-gray-100 dark:border-neutral-800"
                  : ""
              }`}
              style={{ minHeight: ROW_MIN_HEIGHT }}
            >
              {COLUMNS.map((col) => (
                <View
                  key={col.key}
                  className="justify-center px-4 py-3"
                  style={{ width: col.width }}
                >
                  {col.render(row, handlers)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});
