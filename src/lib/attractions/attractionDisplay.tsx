import { Feather } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Text, View } from "react-native";

import type {
  AttractionRow,
  AttractionStatus,
} from "../../services/attractionsService";

/**
 * Shared presentation primitives for the Attractions list. Both the card view
 * ({@link AttractionCard}) and the table view ({@link AttractionsTable}) render
 * from these helpers so the two layouts stay in lock-step — a single source of
 * truth for money / date / duration / pricing formatting and the status badge,
 * mirroring the web `/attractions` admin page.
 */

export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** Only these pricing types carry a unit suffix on the web page. */
export const PRICING_SUFFIX: Record<string, string> = {
  per_person: "/person",
  per_group: "/group",
  per_hour: "/hour",
};

export const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function formatCreatedAt(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function durationLabel(row: AttractionRow): string {
  if (!row.duration) return "Unlimited";
  return `${row.duration} ${row.durationUnit}`;
}

/**
 * Compact duration for purchase cards — a port of the web
 * `formatDurationDisplay` ("5 min", "1 hr 30 min", "2 hours", "Unlimited"),
 * so the onsite purchase flow reads the same on both platforms.
 */
export function formatDurationDisplay(
  duration: number | null | undefined,
  durationUnit: string | null | undefined,
): string {
  if (duration == null || Number.isNaN(duration)) return "Not specified";
  if (duration === 0) return "Unlimited";

  const hoursLabel = (h: number) => (h === 1 ? "1 hour" : `${h} hours`);

  if (durationUnit === "minutes") {
    if (duration < 60) return `${Math.round(duration)} min`;
    const hours = Math.floor(duration / 60);
    const mins = Math.round(duration % 60);
    return mins === 0 ? hoursLabel(hours) : `${hours} hr ${mins} min`;
  }

  // "hours" and "hours and minutes" both render whole hours plus leftover mins.
  const hours = Math.floor(duration);
  const mins = Math.round((duration % 1) * 60);
  if (mins === 0) return hoursLabel(hours);
  if (hours === 0) return `${mins} min`;
  return `${hours} hr ${mins} min`;
}

export type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** A small icon + label metric used in the attraction card footer. */
export const Stat = ({
  icon,
  label,
}: {
  icon: FeatherIconName;
  label: string;
}) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={12} color="#9CA3AF" />
    <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
  </View>
);

/** Active / inactive status pill, matching the web attractions status colors. */
export const AttractionStatusBadge = ({
  status,
}: {
  status: AttractionStatus;
}) => {
  const active = status === "active";
  return (
    <View
      className={`px-2.5 py-1 rounded-full ${
        active
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <Text
        className={`text-xs font-semibold capitalize ${
          active
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {status}
      </Text>
    </View>
  );
};
