import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import type {
  ConcernKind,
  ConcernRow,
  ConcernStatus,
} from "../../services/checkoutConcernsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 76;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** Why the guest is in the list — same labels and tints as the web badges. */
const KIND_META: Record<
  ConcernKind,
  { label: string; icon: FeatherIconName; bg: string; fg: string }
> = {
  schedule_help: {
    label: "Schedule help",
    icon: "calendar",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    fg: "text-amber-700 dark:text-amber-300",
  },
  call_to_book: {
    label: "Call to book",
    icon: "phone",
    bg: "bg-teal-50 dark:bg-teal-900/30",
    fg: "text-teal-700 dark:text-teal-300",
  },
  abandoned_checkout: {
    label: "Left unfinished",
    icon: "shopping-cart",
    bg: "bg-purple-50 dark:bg-purple-900/30",
    fg: "text-purple-700 dark:text-purple-300",
  },
};

export const STATUS_META: Record<
  ConcernStatus,
  { label: string; bg: string; fg: string }
> = {
  new: {
    label: "Needs a call",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    fg: "text-amber-700 dark:text-amber-300",
  },
  contacted: {
    label: "Contacted",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    fg: "text-blue-700 dark:text-blue-300",
  },
  resolved: {
    label: "Resolved",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    fg: "text-emerald-700 dark:text-emerald-300",
  },
};

/** "Package name · Thu, Aug 27 · 6:30 PM", or the web's fallback line. */
export function describeWanted(concern: ConcernRow): string {
  const parts: string[] = [];
  if (concern.entityName) parts.push(concern.entityName);
  if (concern.preferredDate) {
    const d = new Date(`${concern.preferredDate}T00:00:00`);
    parts.push(
      Number.isNaN(d.getTime())
        ? concern.preferredDate
        : d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
    );
  }
  if (concern.preferredTime) parts.push(concern.preferredTime);
  return parts.length ? parts.join(" · ") : "Nothing chosen yet";
}

/** Received timestamp, in venue time like every other table's date cell. */
export const formatReceived = (iso: string): string =>
  iso ? formatDateTimeET(iso, { month: "short" }) : "—";

/** Tappable phone / email line — opens the dialer or mail app. */
const ContactLine = ({
  icon,
  value,
  url,
  small,
}: {
  icon: FeatherIconName;
  value: string;
  url: string;
  small?: boolean;
}) => (
  <Pressable
    onPress={() => Linking.openURL(url)}
    accessibilityRole="link"
    accessibilityLabel={value}
    className="flex-row items-center gap-1.5 active:opacity-70"
  >
    <Feather name={icon} size={small ? 11 : 12} color="#6B7280" />
    <Text
      numberOfLines={1}
      className={
        small
          ? "text-xs text-gray-500 dark:text-gray-400 flex-1"
          : "text-sm font-medium text-[#0644C7] dark:text-blue-400 flex-1"
      }
    >
      {value}
    </Text>
  </Pressable>
);

/** A small labelled action button in the trailing Actions cell. */
const ActionButton = ({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  tone: "primary" | "neutral";
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg active:opacity-70 ${
      tone === "primary"
        ? "bg-[#0644C7]"
        : "border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    }`}
  >
    <Feather
      name={icon}
      size={12}
      color={tone === "primary" ? "#FFFFFF" : "#6B7280"}
    />
    <Text
      numberOfLines={1}
      className={`shrink-0 text-xs font-semibold ${
        tone === "primary" ? "text-white" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

type RowContext = {
  busy: boolean;
  onContacted: () => void;
  onResolve: () => void;
  onReopen: () => void;
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (concern: ConcernRow, ctx: RowContext) => ReactNode;
};

/**
 * Columns mirror the web page, in order and label: Guest (name over venue) ·
 * Reach them on (phone / email) · What they wanted · Why (kind badge + the
 * guest's own words) · Status (+ who handled it) · When · Actions.
 */
const COLUMNS: Column[] = [
  {
    key: "guest",
    label: "Guest",
    width: 190,
    render: (c) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {c.name}
        </Text>
        {!!c.locationName && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
            {c.locationName}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "contact",
    label: "Reach them on",
    width: 200,
    render: (c) => (
      <View className="gap-0.5">
        {!!c.phone && (
          <ContactLine icon="phone" value={c.phone} url={`tel:${c.phone}`} />
        )}
        {!!c.email && (
          <ContactLine
            icon="mail"
            value={c.email}
            url={`mailto:${c.email}`}
            small
          />
        )}
        {!c.phone && !c.email && <Text className={CELL_TEXT}>—</Text>}
      </View>
    ),
  },
  {
    key: "wanted",
    label: "What they wanted",
    width: 220,
    render: (c) => (
      <View>
        <Text numberOfLines={2} className="text-sm text-gray-800 dark:text-gray-200">
          {describeWanted(c)}
        </Text>
        {!!c.stepLabel && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
            Reached: {c.stepLabel}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "why",
    label: "Why",
    width: 230,
    render: (c) => {
      const kind = KIND_META[c.kind] ?? KIND_META.schedule_help;
      return (
        <View>
          <View
            className={`flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full ${kind.bg}`}
          >
            <Feather name={kind.icon} size={11} color="#6B7280" />
            <Text className={`text-[11px] font-semibold ${kind.fg}`}>
              {kind.label}
            </Text>
          </View>
          {!!c.message && (
            <Text
              numberOfLines={3}
              className="text-xs text-gray-600 dark:text-gray-300 leading-4 mt-1.5"
            >
              “{c.message}”
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    width: 150,
    render: (c) => {
      const status = STATUS_META[c.status] ?? STATUS_META.new;
      return (
        <View>
          <View className={`self-start px-2 py-0.5 rounded-full ${status.bg}`}>
            <Text className={`text-[11px] font-semibold ${status.fg}`}>
              {status.label}
            </Text>
          </View>
          {!!c.handlerName && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-400 dark:text-gray-500 mt-1"
            >
              by {c.handlerName}
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "when",
    label: "When",
    width: 180,
    render: (c) => (
      <Text numberOfLines={2} className="text-sm text-gray-500 dark:text-gray-400">
        {formatReceived(c.createdAt)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 230,
    render: (c, ctx) => {
      if (ctx.busy) return <ActivityIndicator size="small" color="#0644C7" />;
      return (
        <View className="flex-row items-center gap-2">
          {c.status === "new" && (
            <ActionButton
              icon="phone-call"
              label="Mark contacted"
              tone="neutral"
              onPress={ctx.onContacted}
            />
          )}
          {c.status !== "resolved" && (
            <ActionButton
              icon="check-circle"
              label="Resolve"
              tone="primary"
              onPress={ctx.onResolve}
            />
          )}
          {c.status === "resolved" && (
            <ActionButton
              icon="rotate-ccw"
              label="Reopen"
              tone="neutral"
              onPress={ctx.onReopen}
            />
          )}
        </View>
      );
    },
  },
];

/**
 * Table layout for Customer Concerns — the web grid, scrolled horizontally with
 * fixed column widths so the header and rows stay aligned. Rows are inert: the
 * only touch targets are the phone / email links and the Actions cell, so a
 * sideways scroll can never fire a status change.
 */
export const ConcernsTable = memo(function ConcernsTable({
  concerns,
  busyId,
  onSetStatus,
}: {
  concerns: ConcernRow[];
  /** Id of the row with a status write in flight, or null. */
  busyId: number | null;
  onSetStatus: (concern: ConcernRow, status: ConcernStatus) => void;
}) {
  const tableWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0);

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
          {concerns.map((concern, i) => {
            const ctx: RowContext = {
              busy: busyId === concern.id,
              onContacted: () => onSetStatus(concern, "contacted"),
              onResolve: () => onSetStatus(concern, "resolved"),
              onReopen: () => onSetStatus(concern, "new"),
            };
            return (
              <View
                key={concern.id}
                accessibilityLabel={`Concern from ${concern.name}`}
                className={`flex-row items-center ${
                  i < concerns.length - 1
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
                    {col.render(concern, ctx)}
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
