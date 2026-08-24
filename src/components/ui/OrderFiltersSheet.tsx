import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { SelectField, type SelectOption } from "./FormControls";

/**
 * Bulk Orders filter values — the web `/orders` `filterDefs` keys (status and
 * payment method); "all" means "no restriction", like the web `allLabel` option.
 */
export type OrderFilterValues = {
  status: string;
  method: string;
};

export const EMPTY_ORDER_FILTERS: OrderFilterValues = {
  status: "all",
  method: "all",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActiveOrderFilters(v: OrderFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.method !== "all") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

const METHOD_OPTS: SelectOption[] = [
  { label: "All Methods", value: "all" },
  { label: "Authorize.Net", value: "authorize.net" },
  { label: "In-Store", value: "in-store" },
  { label: "Pay Later", value: "paylater" },
];

type Props = {
  visible: boolean;
  values: OrderFilterValues;
  onChange: (next: OrderFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Bulk Orders filter panel — one BottomSheet holding every list filter, opened
 * from the "Filters" pill. Values apply live to the list behind it; "Done" just
 * closes and "Clear Filters" resets everything (same as Payments).
 */
export function OrderFiltersSheet({
  visible,
  values,
  onChange,
  onClear,
  onClose,
}: Props) {
  const set = (patch: Partial<OrderFilterValues>) =>
    onChange({ ...values, ...patch });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4 pt-1">
          <SelectField
            label="Status"
            value={values.status}
            options={STATUS_OPTS}
            onSelect={(v) => set({ status: String(v) })}
          />

          <SelectField
            label="Payment Method"
            value={values.method}
            options={METHOD_OPTS}
            onSelect={(v) => set({ method: String(v) })}
          />

          {/* Footer: Clear Filters (secondary) + Done (primary) */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={onClear}
              className="flex-1 h-14 items-center justify-center rounded-xl border border-gray-300 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Clear Filters
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 h-14 items-center justify-center rounded-xl bg-[#0644C7] active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
