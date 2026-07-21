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
