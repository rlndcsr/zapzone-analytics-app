import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { SOURCE_LABELS, type Waiver } from "../../services/waiversService";
import { StatusBadge } from "./StatusBadge";

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

/** Column-visibility toggles shared with the card view. */
export type WColKey =
  | "linked"
  | "minors"
  | "template"
  | "location"
  | "source"
  | "date"
  | "submitted"
  | "checkin"
  | "status"
  | "marketing";
export type WCols = Record<WColKey, boolean>;

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

/** "Jul 20, 2026 at 10:26 PM" — mirrors the web "Submitted" cell (minus the
 *  server timezone label, which the device can't infer). */
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

const linkedLabel = (w: Waiver): string | null =>
  w.bookingReference
    ? `#${w.bookingReference}`
    : w.eventName
      ? w.eventName
      : w.attractionPurchaseId
        ? `AP-${w.attractionPurchaseId}`
        : null;

/** Check-in pill — green "Checked In" vs gray "Not Checked In", driven purely
 *  by checkedInAt (mirrors the web admin, which has no separate boolean). */
const CheckinBadge = ({ waiver }: { waiver: Waiver }) =>
  waiver.checkedInAt ? (
    <View className="flex-row items-center gap-1 self-start px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
      <Feather name="user-check" size={11} color="#047857" />
      <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
        Checked In
      </Text>
    </View>
  ) : (
    <View className="self-start px-2.5 py-1 rounded-full bg-gray-100 dark:bg-neutral-800">
      <Text className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
        Not Checked In
      </Text>
    </View>
  );

type RowContext = {
  busy: boolean;
  canCheckIn: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onCheckIn: () => void;
  onPrint: () => void;
  onDelete: () => void;
};

type Column = {
  key: WColKey | "name" | "actions";
  label: string;
  width: number;
  /** Undefined for always-on columns (name / actions). */
  toggle?: WColKey;
  render: (w: Waiver, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Name",
    width: 220,
    render: (w) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {w.adultName}
        </Text>
        {!!w.adultEmail && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
            {w.adultEmail}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "minors",
    label: "Minors",
    width: 90,
    toggle: "minors",
    render: (w) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {w.minorsCount}
      </Text>
    ),
  },
  {
    key: "submitted",
    label: "Submitted",
    width: 200,
    toggle: "submitted",
    render: (w) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {w.submittedAt ? formatDateTime(w.submittedAt) : "—"}
      </Text>
    ),
  },
  {
    key: "checkin",
    label: "Check-in",
    width: 140,
    toggle: "checkin",
    render: (w) => <CheckinBadge waiver={w} />,
  },

  {
    key: "actions",
    label: "Actions",
    width: 190,
    render: (w, ctx) => {
      const anyAction = ctx.canCheckIn || ctx.canPrint || ctx.canDelete;
      if (!anyAction) return <Text className={CELL_TEXT}>—</Text>;
      if (ctx.busy) {
        return <ActivityIndicator size="small" color="#0644C7" />;
      }
      return (
        <View className="flex-row items-center gap-2">
          {ctx.canCheckIn && !w.checkedInAt && (
            <Pressable
              onPress={ctx.onCheckIn}
              className="flex-row items-center gap-1.5 self-start px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-neutral-900 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`Check in ${w.adultName}`}
            >
              <Feather name="user-check" size={13} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Check In
              </Text>
            </Pressable>
          )}
          {ctx.canPrint && (
            <Pressable
              onPress={ctx.onPrint}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={`Print waiver for ${w.adultName}`}
            >
              <Feather name="printer" size={15} color="#6B7280" />
            </Pressable>
          )}
          {ctx.canDelete && (
            <Pressable
              onPress={ctx.onDelete}
              className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={`Delete waiver for ${w.adultName}`}
            >
              <Feather name="trash-2" size={15} color="#EF4444" />
            </Pressable>
          )}
        </View>
      );
    },
  },
];

/**
 * Table layout for the Waivers list, mirroring the web admin's Records table:
 * Name (+ email), Minors, Submitted, Check-in, then the remaining toggleable
 * columns, and a trailing Actions cell (Check In / Print / Delete, gated by
 * role + settings). Horizontally scrollable with fixed column widths; columns
 * respect the same visibility toggles as the card view (Location also honors
 * `showLocation`, company-admin only). Tapping a row opens the detail sheet —
 * the Actions cell handles its own presses so they don't open the sheet.
 */
export const WaiversTable = memo(function WaiversTable({
  waivers,
  cols,
  showLocation,
  canCheckIn,
  canPrint,
  canDelete,
  busyId,
  onRowPress,
  onCheckIn,
  onPrint,
  onDelete,
}: {
  waivers: Waiver[];
  cols: WCols;
  showLocation: boolean;
  canCheckIn: boolean;
  canPrint: boolean;
  canDelete: boolean;
  busyId: number | null;
  onRowPress: (waiver: Waiver) => void;
  onCheckIn: (waiver: Waiver) => void;
  onPrint: (waiver: Waiver) => void;
  onDelete: (waiver: Waiver) => void;
}) {
  const visible = COLUMNS.filter((c) => {
    if (!c.toggle) return true;
    if (c.toggle === "location") return cols.location && showLocation;
    return cols[c.toggle];
  });
  const tableWidth = visible.reduce((sum, c) => sum + c.width, 0);

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {visible.map((col) => (
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
          {waivers.map((w, i) => {
            const ctx: RowContext = {
              busy: busyId === w.id,
              canCheckIn,
              canPrint,
              canDelete,
              onCheckIn: () => onCheckIn(w),
              onPrint: () => onPrint(w),
              onDelete: () => onDelete(w),
            };
            return (
              <Pressable
                key={w.id}
                onPress={() => onRowPress(w)}
                accessibilityRole="button"
                accessibilityLabel={`View waiver for ${w.adultName}`}
                className={`flex-row items-center ${
                  i < waivers.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={({ pressed }) => ({
                  minHeight: ROW_MIN_HEIGHT,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {visible.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(w, ctx)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
