import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { EventRow } from "../../services/eventsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

// Comfortable, SaaS-style row rhythm (matches the Special Pricing table). These
// are floors — real cell padding does the breathing so rows stay centered.
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 72;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

/**
 * Tap-to-flip status pill — the mobile stand-in for the web column's
 * Active/Inactive dropdown, hitting the same PATCH toggle-status endpoint.
 * Shows a spinner in place of its icon while that request is in flight.
 */
const StatusPill = ({
  status,
  busy,
  onPress,
}: {
  status: EventRow["status"];
  busy: boolean;
  onPress: () => void;
}) => {
  const active = status === "active";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={
        active ? "Deactivate this event" : "Activate this event"
      }
      className={`flex-row items-center gap-1 self-start px-2.5 py-1 rounded-full active:opacity-70 ${
        active
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={active ? "#16A34A" : "#9CA3AF"}
        />
      ) : (
        <Feather name="power" size={11} color={active ? "#16A34A" : "#9CA3AF"} />
      )}
      <Text
        className={`text-xs font-semibold ${
          active
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </Text>
    </Pressable>
  );
};

/** Per-row callbacks + in-flight flag, handed to each cell renderer. */
type RowContext = {
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (event: EventRow, ctx: RowContext) => ReactNode;
};

/**
 * Columns mirror the web `/events` default-visible set, in order and label:
 * Event (name over location and date type) · Date · Time · Price · Status ·
 * Actions. The web's `defaultVisible: false` columns (Event #, Location,
 * Description, Date Type, Schedule, Slot Interval, Max Per Slot, Add-ons,
 * Created, Updated) are omitted here too. Actions carries Delete only — the app
 * has no Edit Event screen for the web table's pencil to open.
 */
function buildColumns(fmt: EventFormatters): Column[] {
  return [
    {
      key: "event",
      label: "Event",
      width: 220,
      render: (e) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {e.name}
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
          >
            {e.locationName || "—"}
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
            {e.dateType === "one_time" ? "One Time" : "Date Range"}
          </Text>
        </View>
      ),
    },
    {
      key: "date",
      label: "Date",
      width: 170,
      render: (e) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {fmt.dateLabel(e) || "—"}
        </Text>
      ),
    },
    {
      key: "time",
      label: "Time",
      width: 170,
      render: (e) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {fmt.timeRange(e.timeStart, e.timeEnd) || "—"}
        </Text>
      ),
    },
    {
      key: "price",
      label: "Price",
      width: 110,
      render: (e) => (
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {fmt.money(e.price)}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      render: (e, ctx) => (
        <StatusPill status={e.status} busy={ctx.busy} onPress={ctx.onToggle} />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: 100,
      render: (e, ctx) => (
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={ctx.onDelete}
            disabled={ctx.busy}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${e.name}`}
            className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center active:opacity-70"
          >
            <Feather name="trash-2" size={15} color="#EF4444" />
          </Pressable>
        </View>
      ),
    },
  ];
}

/**
 * Display helpers owned by the Events screen (so the table formats dates,
 * times and money exactly like the card view next to it).
 */
export type EventFormatters = {
  /** "Oct 23, 2026", or the "start – end" span for a date-range event. */
  dateLabel: (event: EventRow) => string;
  /** "10:30 PM – 11:59 PM". */
  timeRange: (start: string, end: string) => string;
  money: (value: number) => string;
};

/**
 * Table layout for the All Events list — the same rows the card list renders,
 * laid out as the web `/events` grid. The whole grid scrolls horizontally
 * (fixed per-column widths keep header + rows aligned) and reads the same
 * `EventRow[]` page as the cards, so switching layout never refetches.
 * Rows are deliberately NOT tappable: a whole-row target is too easy to hit
 * while scrolling sideways, and the row's two real actions (the status pill and
 * Delete) own their own touches — the same call the Special Pricing and
 * Attractions tables make.
 */
export const EventsTable = memo(function EventsTable({
  events,
  formatters,
  busyId,
  onToggleStatus,
  onDelete,
}: {
  events: EventRow[];
  formatters: EventFormatters;
  /** Id of the row with a toggle/delete request in flight, or null. */
  busyId: number | null;
  onToggleStatus: (event: EventRow) => void;
  onDelete: (event: EventRow) => void;
}) {
  const columns = buildColumns(formatters);
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {columns.map((col) => (
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

          {/* Rows — inert containers; the status pill and Delete are the only
              touch targets. */}
          {events.map((event, i) => {
            const ctx: RowContext = {
              busy: busyId === event.id,
              onToggle: () => onToggleStatus(event),
              onDelete: () => onDelete(event),
            };
            return (
              <View
                key={event.id}
                accessibilityLabel={event.name}
                className={`flex-row items-center ${
                  i < events.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={{ minHeight: ROW_MIN_HEIGHT }}
              >
                {columns.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(event, ctx)}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
