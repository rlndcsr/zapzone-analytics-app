import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import type { EventRow } from "../../services/eventsService";

// Same flat row rhythm as the Manage Attractions table. These are floors —
// real cell padding does the breathing so rows stay centered.
const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 64;

const PRIMARY = "#0644C7";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Muted second line under a cell's main value (units, hints). */
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

/**
 * Tap-to-flip status pill — the mobile stand-in for the web column's
 * Active/Inactive dropdown, hitting the same PATCH toggle-status endpoint.
 * A leading status dot (like the Attractions pill) that becomes a spinner
 * while that request is in flight.
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
      className={`flex-row items-center gap-1.5 self-start pl-2 pr-2.5 py-1 rounded-full active:opacity-70 ${
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
        <View
          className={`w-1.5 h-1.5 rounded-full ${
            active ? "bg-green-500" : "bg-gray-400"
          }`}
        />
      )}
      <Text
        className={`text-xs font-medium ${
          active
            ? "text-green-700 dark:text-green-400"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </Text>
    </Pressable>
  );
};

/** One button of the Actions segmented group (matches AttractionsTable). */
const ActionIconButton = ({
  icon,
  color,
  label,
  disabled,
  divider = false,
  onPress,
}: {
  icon: FeatherIconName;
  color: string;
  label: string;
  disabled: boolean;
  /** Hairline on the leading edge — separates buttons inside the group. */
  divider?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      divider ? "border-l border-gray-200 dark:border-neutral-700" : ""
    }`}
  >
    <Feather name={icon} size={15} color={color} />
  </Pressable>
);

/** Per-row callbacks + in-flight flag, handed to each cell renderer. */
type RowContext = {
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRegistrationForm?: () => void;
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
 * Description, Date Type, Schedule, Time slot, Max groups, Add-ons,
 * Created, Updated) are omitted here too. Actions carries the web's Edit (the
 * pencil, opening Edit Event), Registration form (admins and managers) and Delete.
 */
function buildColumns(fmt: EventFormatters, withRegistration: boolean): Column[] {
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
          {/* Location and date type share one quiet meta line. */}
          <Text
            numberOfLines={1}
            className="text-[11px] text-gray-400 dark:text-gray-500 mt-1"
          >
            {[
              e.locationName,
              e.dateType === "one_time" ? "One Time" : "Date Range",
            ]
              .filter(Boolean)
              .join("  ·  ")}
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
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {fmt.money(e.price)}
          </Text>
          <Text numberOfLines={1} className={CELL_HINT}>
            per ticket
          </Text>
        </View>
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
      width: withRegistration ? 136 : 104,
      render: (e, ctx) => (
        // One bordered segmented group: neutral icons, with only the edit and
        // destructive actions tinted, so the column reads as a single control.
        <View className="flex-row items-center self-start rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
          <ActionIconButton
            icon="edit-2"
            color={PRIMARY}
            label={`Edit ${e.name}`}
            disabled={ctx.busy}
            onPress={ctx.onEdit}
          />
          {ctx.onRegistrationForm && (
            <ActionIconButton
              divider
              icon="clipboard"
              color="#6B7280"
              label={`Registration form for ${e.name}`}
              disabled={ctx.busy}
              onPress={ctx.onRegistrationForm}
            />
          )}
          <ActionIconButton
            divider
            icon="trash-2"
            color="#DC2626"
            label={`Delete ${e.name}`}
            disabled={ctx.busy}
            onPress={ctx.onDelete}
          />
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
 * laid out as the web `/events` grid in the flat Manage Attractions style. The
 * whole grid scrolls horizontally (fixed per-column widths keep header + rows
 * aligned) and reads the same `EventRow[]` page as the cards, so switching
 * layout never refetches.
 * Rows are deliberately NOT tappable: a whole-row target is too easy to hit
 * while scrolling sideways, and the row's real actions (the status pill, Edit and
 * Delete) own their own touches — the same call the Special Pricing and
 * Attractions tables make.
 */
export const EventsTable = memo(function EventsTable({
  events,
  formatters,
  busyId,
  onToggleStatus,
  onEdit,
  onDelete,
  onRegistrationForm,
}: {
  events: EventRow[];
  formatters: EventFormatters;
  /** Id of the row with a toggle/delete request in flight, or null. */
  busyId: number | null;
  onToggleStatus: (event: EventRow) => void;
  onEdit: (event: EventRow) => void;
  onDelete: (event: EventRow) => void;
  /** Omitted for roles that can't manage registration forms. */
  onRegistrationForm?: (event: EventRow) => void;
}) {
  const columns = buildColumns(formatters, Boolean(onRegistrationForm));
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <View className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-200 dark:border-neutral-800 mb-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800"
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
                  className="text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows — inert containers; the status pill, Edit and Delete are the
              only touch targets. */}
          {events.map((event, i) => {
            const ctx: RowContext = {
              busy: busyId === event.id,
              onToggle: () => onToggleStatus(event),
              onEdit: () => onEdit(event),
              onDelete: () => onDelete(event),
              onRegistrationForm: onRegistrationForm
                ? () => onRegistrationForm(event)
                : undefined,
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
