import { memo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import type { WaiverDeletionLogEntry } from "../../services/waiversService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWhen(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Column = {
  key: string;
  label: string;
  width: number;
  render: (entry: WaiverDeletionLogEntry) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "guest",
    label: "Guest",
    width: 200,
    render: (e) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {e.guestName ?? "Unknown guest"}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Waiver #{e.waiverId}
        </Text>
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 110,
    render: () => (
      <View className="flex-row">
        <View className="bg-red-100 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
          <Text className="text-[10px] font-semibold text-red-700 dark:text-red-400">
            Deleted
          </Text>
        </View>
      </View>
    ),
  },
  {
    key: "visit",
    label: "Visit Date",
    width: 130,
    render: (e) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatDate(e.selectedDate)}
      </Text>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    width: 240,
    render: (e) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {e.reason || "—"}
      </Text>
    ),
  },
  {
    key: "deletedBy",
    label: "Deleted By",
    width: 160,
    render: (e) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {e.deletedBy ?? "—"}
      </Text>
    ),
  },
  {
    key: "when",
    label: "When",
    width: 190,
    render: (e) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatWhen(e.deletedAt)}
      </Text>
    ),
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for the Waiver Deletion Log. Horizontally scrollable with fixed
 * column widths — a read-only audit grid (rows carry no tap action, matching
 * the card view).
 */
export const DeletionLogTable = memo(function DeletionLogTable({
  entries,
}: {
  entries: WaiverDeletionLogEntry[];
}) {
  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: TABLE_WIDTH }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
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
          {entries.map((entry, i) => (
            <View
              key={entry.id}
              className={`flex-row items-center ${
                i < entries.length - 1
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
                  {col.render(entry)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});
