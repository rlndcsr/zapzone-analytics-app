import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import {
  AttractionStatusBadge,
  PRICING_SUFFIX,
  durationLabel,
  formatCreatedAt,
  formatMoney,
} from "../../lib/attractions/attractionDisplay";
import { normalizeCategory } from "../../lib/venueCategories";
import type { AttractionRow } from "../../services/attractionsService";

/** One labelled cell in the card's Price / Capacity / Duration strip. */
const Spec = ({
  label,
  value,
  hint,
  divider = false,
}: {
  label: string;
  value: string;
  hint?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"
    >
      {value}
    </Text>
    {!!hint && (
      <Text
        numberOfLines={1}
        className="text-[11px] text-gray-400 dark:text-gray-500"
      >
        {hint}
      </Text>
    )}
  </View>
);

/**
 * Card layout for a single attraction. Tapping anywhere on the card opens the
 * Attraction Details sheet (mirrors Packages) — the card carries no inline
 * actions of its own.
 */
export const AttractionCard = ({
  attraction,
  onOpenDetails,
}: {
  attraction: AttractionRow;
  onOpenDetails: () => void;
}) => {
  const isCopy = attraction.name.includes("(Copy)");
  const suffix = PRICING_SUFFIX[attraction.pricingType] ?? "";
  const created = formatCreatedAt(attraction.createdAt);

  return (
    <Pressable
      onPress={onOpenDetails}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`View details for ${attraction.name}`}
    >
      {/* Name + status */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Text
            className="shrink text-base font-semibold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {attraction.name}
          </Text>
          {isCopy && (
            <View className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30">
              <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Copy
              </Text>
            </View>
          )}
        </View>
        <AttractionStatusBadge status={attraction.status} />
      </View>

      {/* Category · location */}
      <View className="flex-row items-center gap-1.5 mt-1">
        <Text
          numberOfLines={1}
          className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          {normalizeCategory(attraction.category)}
        </Text>
        {!!attraction.locationName && (
          <>
            <Text className="text-xs text-gray-300 dark:text-neutral-600">
              •
            </Text>
            <Text
              numberOfLines={1}
              className="shrink text-xs text-gray-500 dark:text-gray-400"
            >
              {attraction.locationName}
            </Text>
          </>
        )}
      </View>

      {!!attraction.description && (
        <Text
          className="text-[13px] text-gray-500 dark:text-gray-400 leading-5 mt-2"
          numberOfLines={2}
        >
          {attraction.description}
        </Text>
      )}

      {/* Price / Capacity / Duration */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec
          label="Price"
          value={formatMoney(attraction.price)}
          hint={suffix || undefined}
        />
        <Spec
          divider
          label="Capacity"
          value={`${attraction.maxCapacity} people`}
          hint={attraction.displayCapacityToCustomers ? undefined : "Hidden"}
        />
        <Spec divider label="Duration" value={durationLabel(attraction)} />
      </View>

      {/* Created + affordance */}
      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {created ? `Created ${created}` : ""}
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Details
          </Text>
          <Feather name="chevron-right" size={14} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};
