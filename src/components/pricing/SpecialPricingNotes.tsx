import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import {
  SPECIAL_CHECK_FAILED,
  specialDealHeadline,
  specialDealHint,
  type DealUnit,
  type SpecialDeal,
} from "../../lib/pricing/specialPricing";

/**
 * Shown above the pay / save button when the special for this visit couldn't
 * be checked (web SpecialCheckAlert): payment is held, not charged at full
 * price, until Try again gets an answer.
 */
export function SpecialCheckAlert({
  failed,
  onRetry,
  message = SPECIAL_CHECK_FAILED,
  className = "",
}: {
  failed: boolean;
  onRetry: () => void;
  message?: string;
  className?: string;
}) {
  if (!failed) return null;
  return (
    <View
      className={`flex-row flex-wrap items-center gap-x-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20 ${className}`}
      accessibilityRole="alert"
    >
      <Text className="text-sm text-amber-900 dark:text-amber-300">{message}</Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text className="text-sm font-semibold text-amber-900 underline dark:text-amber-300">
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Under an edit screen's schedule: what a reschedule did to the special, in
 * green — or, in amber with Try again, that it couldn't be checked and the
 * change can't be saved yet (web EditPurchase specialNotice). Two separate
 * elements rather than one whose classes flip, so nothing upgrades in place.
 */
export function RepricingNotice({
  notice,
  failed,
  onRetry,
}: {
  notice: string | null;
  failed: boolean;
  onRetry: () => void;
}) {
  if (!notice) return null;
  if (failed) {
    return (
      <View
        key="repricing-failed"
        className="mt-3 flex-row flex-wrap items-center gap-x-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20"
        accessibilityRole="alert"
      >
        <Text className="text-sm text-amber-900 dark:text-amber-300">{notice}</Text>
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <Text className="text-sm font-semibold text-amber-900 underline dark:text-amber-300">
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View
      key="repricing-ok"
      className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-900/20"
    >
      <Text className="text-sm text-emerald-900 dark:text-emerald-200">{notice}</Text>
    </View>
  );
}

/**
 * The item's specials under its date picker, and that they follow the VISIT
 * day, not the day of the sale (web SpecialDealNote). Nothing when there are
 * no specials.
 */
export function SpecialDealNote({
  deals,
  selectedDate,
  applied,
  unit = "ticket",
  checkFailed = false,
  onRetry,
  className = "",
}: {
  deals: SpecialDeal[];
  selectedDate?: string | null;
  applied: boolean;
  unit?: DealUnit;
  checkFailed?: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  if (deals.length === 0) return null;
  return (
    <View
      className={`rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-900/20 ${className}`}
    >
      {deals.map((deal) => (
        <View key={deal.special_pricing_id} className="mb-0.5 flex-row items-start gap-2">
          <Feather name="tag" size={14} color="#059669" style={{ marginTop: 2 }} />
          <Text className="flex-1 text-sm text-emerald-900 dark:text-emerald-200">
            <Text className="font-semibold">{deal.name}:</Text>{" "}
            {specialDealHeadline(deal, unit)}.
          </Text>
        </View>
      ))}
      {checkFailed ? (
        <View className="mt-1 flex-row flex-wrap items-center gap-x-1 pl-6">
          <Text className="text-xs font-medium text-amber-800 dark:text-amber-300">
            We couldn&apos;t check the special price for this visit.
          </Text>
          {!!onRetry && (
            <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
              <Text className="text-xs font-semibold text-amber-800 underline dark:text-amber-300">
                Try again
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text className="mt-1 pl-6 text-xs text-emerald-800 dark:text-emerald-300">
          {specialDealHint(applied, selectedDate)}
        </Text>
      )}
    </View>
  );
}
