import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import {
  AttractionStatusBadge,
  CARD_SHADOW,
  PRICING_SUFFIX,
  Stat,
  durationLabel,
  formatCreatedAt,
  formatMoney,
} from "../../lib/attractions/attractionDisplay";
import type { AttractionRow } from "../../services/attractionsService";

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
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${attraction.name}`}
    >
      {/* Header: name + location (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {attraction.name}
            </Text>
            {isCopy && (
              <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">
                <Feather name="copy" size={9} color="#B45309" />
                <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Copy
                </Text>
              </View>
            )}
          </View>
          {!!attraction.locationName && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Feather name="map-pin" size={11} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {attraction.locationName}
              </Text>
            </View>
          )}
        </View>
        <AttractionStatusBadge status={attraction.status} />
      </View>

      {/* Description */}
      {!!attraction.description && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 leading-5"
          numberOfLines={2}
        >
          {attraction.description}
        </Text>
      )}

      {/* Category + price */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
          <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
            {attraction.category}
          </Text>
        </View>
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {formatMoney(attraction.price)}
          {!!suffix && (
            <Text className="text-xs font-normal text-gray-400"> {suffix}</Text>
          )}
        </Text>
      </View>

      {/* Capacity / duration / created */}
      <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mt-2">
        <Stat
          icon="users"
          label={`${attraction.maxCapacity} people${
            attraction.displayCapacityToCustomers ? "" : " (hidden)"
          }`}
        />
        <Stat icon="clock" label={durationLabel(attraction)} />
        {!!created && <Stat icon="calendar" label={created} />}
      </View>
    </Pressable>
  );
};
