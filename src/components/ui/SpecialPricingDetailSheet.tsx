import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateET } from "../../lib/date/venueTime";
import { getToken } from "../../lib/session";
import { convertTo12Hour } from "../../lib/time";
import {
  fetchSpecialPricing,
  type SpecialPricingDetail,
  type SpecialPricingEntityType,
  type SpecialPricingRow,
} from "../../services/specialPricingService";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

type IconName = React.ComponentProps<typeof Feather>["name"];

const ENTITY_META: Record<
  SpecialPricingEntityType,
  { icon: IconName; label: string; plural: string }
> = {
  attraction: { icon: "zap", label: "Attraction", plural: "attractions" },
  package: { icon: "package", label: "Package", plural: "packages" },
  event: { icon: "calendar", label: "Event", plural: "events" },
  all: { icon: "grid", label: "All Entities", plural: "items" },
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const RECURRENCE_LABEL: Record<SpecialPricingRow["recurrenceType"], string> = {
  one_time: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
};

/**
 * "YYYY-MM-DD" → "Jul 24, 2026". Date-only values are calendar days, not
 * instants, so they're parsed as local midnight and never routed through the
 * venue-time helpers (see lib/date/venueTime).
 */
function formatCalendarDate(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Section heading, matching the other detail sheets' in-sheet rhythm. */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-3">
    {children}
  </Text>
);

/** Half-width labelled fact with a tinted icon tile. */
const DetailTile = ({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) => (
  <View className="w-1/2 flex-row items-start gap-2.5 mb-4 pr-2">
    <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
      <Feather name={icon} size={15} color={PRIMARY} />
    </View>
    <View className="flex-1">
      <Text className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}
      </Text>
      <Text className="text-[13px] font-medium text-gray-900 dark:text-white">
        {value}
      </Text>
    </View>
  </View>
);

const Chip = ({ icon, label }: { icon: IconName; label: string }) => (
  <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
    <Feather name={icon} size={11} color={PRIMARY} />
    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
      {label}
    </Text>
  </View>
);

const StatusPill = ({ active }: { active: boolean }) => (
  <View
    className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
      active
        ? "bg-green-50 dark:bg-green-900/30"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Feather name="power" size={11} color={active ? "#16A34A" : "#9CA3AF"} />
    <Text
      className={`text-xs font-semibold ${
        active
          ? "text-green-600 dark:text-green-400"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </Text>
  </View>
);

type Props = {
  visible: boolean;
  /** The tapped list row; its values render immediately, before the fetch lands. */
  row: SpecialPricingRow | null;
  /** True while the parent is deleting this rule. */
  busy?: boolean;
  onClose: () => void;
  onEdit: (row: SpecialPricingRow) => void;
  onDelete: (row: SpecialPricingRow) => void;
};

/**
 * Per-rule detail sheet for Special Pricing — opened by tapping a table row.
 * The list row is enough to paint the header, discount and scope immediately;
 * GET /api/special-pricings/{id} then fills in the parts the list endpoint
 * doesn't carry (the day/time window and which specific items are targeted).
 * Footer actions reuse the screen's existing Edit and Delete handlers, so
 * behaviour matches the row's inline action buttons.
 */
export function SpecialPricingDetailSheet({
  visible,
  row,
  busy = false,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const [detail, setDetail] = useState<SpecialPricingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const loadDetail = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      return;
    }
    const rid = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchSpecialPricing(token, id);
      if (rid === reqRef.current) setDetail(d);
    } catch (err) {
      if (rid === reqRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load the details",
        );
      }
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, []);

  // Keyed on the rule id, so switching rows reloads but a list refetch doesn't.
  const rowId = row?.id;
  useEffect(() => {
    if (visible && rowId != null) {
      setDetail(null);
      setError(null);
      loadDetail(rowId);
    }
  }, [visible, rowId, loadDetail]);

  if (!row) {
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Special pricing details"
      >
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  const entity = ENTITY_META[row.entityType];
  const isPercent = row.discountType === "percentage";
  const isOneTime = row.recurrenceType === "one_time";

  // The time window only exists on the detail payload; blank means all day.
  const timeWindow =
    detail?.timeFrom || detail?.timeTo
      ? `${detail.timeFrom ? convertTo12Hour(detail.timeFrom) : "Open"} – ${
          detail.timeTo ? convertTo12Hour(detail.timeTo) : "Close"
        }`
      : "All day";

  // Which items the rule targets: an empty selection means "every one of them".
  const scope =
    row.entityType === "all"
      ? "Everything"
      : detail == null
        ? "—"
        : detail.entityIds.length === 0
          ? `All ${entity.plural}`
          : `${detail.entityIds.length} ${
              detail.entityIds.length === 1 ? "item" : "items"
            } selected`;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Special pricing details"
      subtitle={`#${row.id}`}
    >
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — name, status, and the list's summary chips. */}
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          {row.name}
        </Text>
        <View className="flex-row items-center gap-2 mt-1.5">
          <StatusPill active={row.status === "active"} />
          <Text
            className="text-sm text-gray-500 dark:text-gray-400 flex-1"
            numberOfLines={1}
          >
            {row.locationName || "All locations"}
          </Text>
        </View>

        <View className="flex-row items-center flex-wrap gap-2 mt-3">
          <Chip
            icon={isPercent ? "percent" : "dollar-sign"}
            label={row.discountLabel}
          />
          {!!row.recurrenceDisplay && (
            <Chip icon="repeat" label={row.recurrenceDisplay} />
          )}
          <Chip icon={entity.icon} label={entity.label} />
        </View>

        {!!row.description && (
          <>
            <SectionTitle>Description</SectionTitle>
            <Text className="text-sm text-gray-700 dark:text-gray-200 leading-6">
              {row.description}
            </Text>
          </>
        )}

        <SectionTitle>Discount</SectionTitle>
        <View className="flex-row flex-wrap">
          <DetailTile
            icon={isPercent ? "percent" : "dollar-sign"}
            label="Amount"
            value={row.discountLabel}
          />
          <DetailTile
            icon="tag"
            label="Type"
            value={isPercent ? "Percentage" : "Fixed amount"}
          />
          <DetailTile
            icon="bar-chart-2"
            label="Priority"
            value={String(row.priority)}
          />
          <DetailTile
            icon="layers"
            label="Stackable"
            value={row.isStackable ? "Yes" : "No"}
          />
        </View>

        <SectionTitle>Schedule</SectionTitle>
        {loading && !detail ? (
          <View className="py-4">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : (
          <View className="flex-row flex-wrap">
            <DetailTile
              icon="repeat"
              label="Recurrence"
              value={
                row.recurrenceDisplay || RECURRENCE_LABEL[row.recurrenceType]
              }
            />
            {isOneTime ? (
              <DetailTile
                icon="calendar"
                label="Runs on"
                value={formatCalendarDate(
                  detail?.specificDate || row.specificDate || row.startDate,
                )}
              />
            ) : (
              <>
                {row.recurrenceType === "weekly" &&
                  detail?.dayOfWeek != null && (
                    <DetailTile
                      icon="calendar"
                      label="Day of week"
                      value={DAY_NAMES[detail.dayOfWeek] ?? "—"}
                    />
                  )}
                <DetailTile
                  icon="calendar"
                  label="Starts"
                  value={formatCalendarDate(detail?.startDate || row.startDate)}
                />
                <DetailTile
                  icon="calendar"
                  label="Ends"
                  value={
                    detail?.endDate
                      ? formatCalendarDate(detail.endDate)
                      : "No end date"
                  }
                />
              </>
            )}
            <DetailTile icon="clock" label="Time window" value={timeWindow} />
          </View>
        )}

        <SectionTitle>Applies To</SectionTitle>
        <View className="flex-row flex-wrap">
          <DetailTile
            icon={entity.icon}
            label="Entity type"
            value={entity.label}
          />
          <DetailTile icon="check-square" label="Scope" value={scope} />
          <DetailTile
            icon="map-pin"
            label="Location"
            value={row.locationName || "All locations (company-wide)"}
          />
          <DetailTile
            icon="calendar"
            label="Created"
            value={formatDateET(row.createdAt, { month: "short" })}
          />
        </View>

        {/* A failed detail fetch is a note, not a wall — the row's own values
            are already on screen and both actions still work. */}
        {!!error && !loading && (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Couldn&apos;t load the full schedule ({error}).
          </Text>
        )}

        {/* Footer actions */}
        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={() => onEdit(row)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Edit special pricing"
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] ${
              busy ? "opacity-60" : "active:opacity-90"
            }`}
          >
            <Feather name="edit-2" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(row)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Delete special pricing"
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-red-600 ${
              busy ? "opacity-60" : "active:opacity-90"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="trash-2" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
