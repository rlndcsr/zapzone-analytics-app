import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";
import { InputField } from "./InputField";
import { CONTROL_RADIUS } from "./PrimaryButton";

/**
 * Payments filter values — the web Payments `filterDefs` keys, one for one:
 * status, method, payable type, record type, time period, a payment-date range
 * and an amount range. "all" means "no restriction", like the web `allLabel`
 * options, and the two ranges are inert while both ends are empty.
 */
export type PaymentFilterValues = {
  status: string;
  method: string;
  payableType: string;
  recordType: "all" | "payment" | "refund" | "void";
  period: "all" | "today" | "week" | "month" | "year";
  /** Payment date range, YYYY-MM-DD, from the shared range calendar. */
  createdFrom: string;
  createdTo: string;
  amountMin: string;
  amountMax: string;
};

export const EMPTY_PAYMENT_FILTERS: PaymentFilterValues = {
  status: "all",
  method: "all",
  payableType: "all",
  recordType: "all",
  period: "all",
  createdFrom: "",
  createdTo: "",
  amountMin: "",
  amountMax: "",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActivePaymentFilters(v: PaymentFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.method !== "all") n++;
  if (v.payableType !== "all") n++;
  if (v.recordType !== "all") n++;
  if (v.period !== "all") n++;
  if (v.createdFrom !== "" || v.createdTo !== "") n++;
  if (v.amountMin !== "" || v.amountMax !== "") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

const METHOD_OPTS: SelectOption[] = [
  { label: "All Methods", value: "all" },
  { label: "Card", value: "card" },
  { label: "Authorize.net", value: "authorize.net" },
  { label: "Cash", value: "cash" },
  { label: "In-Store", value: "in-store" },
];

// The four payable kinds the backend's morph map registers.
const TYPE_OPTS: SelectOption[] = [
  { label: "All Types", value: "all" },
  { label: "Bookings", value: "booking" },
  { label: "Attractions", value: "attraction_purchase" },
  { label: "Events", value: "event_purchase" },
  { label: "Bulk Orders", value: "ticket_order" },
];

const RECORD_OPTS: SelectOption[] = [
  { label: "All Records", value: "all" },
  { label: "Payments", value: "payment" },
  { label: "Refund Records", value: "refund" },
  { label: "Void Records", value: "void" },
];

const PERIOD_OPTS: SelectOption[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Year", value: "year" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

type Props = {
  visible: boolean;
  values: PaymentFilterValues;
  onChange: (next: PaymentFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Hands the screen the request to open the shared range calendar. */
  onOpenDateRange: () => void;
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
  onOpenDateRange,
}: Props) {
  const set = (patch: Partial<PaymentFilterValues>) =>
    onChange({ ...values, ...patch });

  const hasDates = values.createdFrom !== "" || values.createdTo !== "";
  const dateText = hasDates
    ? `${formatShortDate(values.createdFrom) || "…"} – ${
        formatShortDate(values.createdTo) || "…"
      }`
    : null;

  const amountInvalid =
    values.amountMin !== "" &&
    values.amountMax !== "" &&
    Number(values.amountMin) > Number(values.amountMax);

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
          <SelectField
            label="Payment Type"
            value={values.payableType}
            options={TYPE_OPTS}
            onSelect={(v) => set({ payableType: String(v) })}
          />
          <SelectField
            label="Record Type"
            value={values.recordType}
            options={RECORD_OPTS}
            onSelect={(v) =>
              set({ recordType: v as PaymentFilterValues["recordType"] })
            }
          />
          <SelectField
            label="Time Period"
            value={values.period}
            options={PERIOD_OPTS}
            onSelect={(v) => set({ period: v as PaymentFilterValues["period"] })}
          />

          {/* Payment Date — the shared range calendar, since the sheet itself is
              a native Modal and cannot stack another one on top. */}
          <View>
            <FieldLabel>Payment Date</FieldLabel>
            <Pressable
              onPress={onOpenDateRange}
              accessibilityRole="button"
              accessibilityLabel="Select payment dates"
              className="h-14 flex-row items-center gap-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4"
            >
              <Feather name="calendar" size={18} color="#9CA3AF" />
              <Text
                className={`flex-1 text-base ${
                  dateText ? "text-gray-900 dark:text-white" : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {dateText ?? "Select dates"}
              </Text>
              {hasDates ? (
                <Pressable
                  onPress={() => set({ createdFrom: "", createdTo: "" })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear payment dates"
                >
                  <Feather name="x" size={18} color="#9CA3AF" />
                </Pressable>
              ) : (
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              )}
            </Pressable>
          </View>

          {/* Amount range */}
          <View>
            <FieldLabel>Amount ($)</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.amountMin}
                onChangeText={(t) =>
                  set({ amountMin: t.replace(/[^0-9.]/g, "") })
                }
                placeholder="Min"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.amountMax}
                onChangeText={(t) =>
                  set({ amountMax: t.replace(/[^0-9.]/g, "") })
                }
                placeholder="Max"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>
            {amountInvalid && (
              <Text className="ml-1 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          {/* Footer: Clear Filters (secondary) + Done (primary). The radius is
              an inline style, not a class: NativeWind resolves conflicting
              utilities by CSS order, so `rounded-full` would win over a class
              override here (see CONTROL_RADIUS). */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
              className="flex-1 h-14 items-center justify-center border border-gray-300 dark:border-neutral-700 active:opacity-70"
              style={{ borderRadius: CONTROL_RADIUS }}
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Clear Filters
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done"
              className="flex-1 h-14 items-center justify-center bg-[#0644C7] active:opacity-90"
              style={{ borderRadius: CONTROL_RADIUS }}
            >
              <Text className="text-base font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
