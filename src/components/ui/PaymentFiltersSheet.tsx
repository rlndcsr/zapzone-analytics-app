import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { SelectField, type SelectOption } from "./FormControls";

/**
 * Payments filter values. Mirrors the web Payments `filterDefs` keys that the
 * app supports today; "all" means "no restriction", like the web `allLabel`
 * options.
 */
export type PaymentFilterValues = {
  status: string;
};

export const EMPTY_PAYMENT_FILTERS: PaymentFilterValues = {
  status: "all",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActivePaymentFilters(v: PaymentFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
  { label: "Failed", value: "failed" },
];

type Props = {
  visible: boolean;
  values: PaymentFilterValues;
  onChange: (next: PaymentFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Payments filter panel — one BottomSheet holding every list filter, opened from
 * the "Filters" segment of the toolbar pill (same pattern as Manage
 * Attractions). Values apply live to the list behind it; "Done" just closes and
 * "Clear Filters" resets everything.
 */
export function PaymentFiltersSheet({
  visible,
  values,
  onChange,
  onClear,
  onClose,
}: Props) {
  const set = (patch: Partial<PaymentFilterValues>) =>
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

          {/* Footer: Clear Filters (secondary) + Done (primary) */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={onClear}
              className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Clear Filters
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 h-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
