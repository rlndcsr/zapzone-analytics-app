import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";
import { InputField } from "./InputField";

/** Which of the two date ranges an "open calendar" request targets. */
export type PurchaseDateTarget = "created" | "scheduled";

/** Filter values for Manage Purchases — mirrors the web `/attractions/purchases`. */
export type PurchaseFilterValues = {
  status: string;
  paymentMethod: string;
  attraction: string;
  createdFrom: string;
  createdTo: string;
  scheduledFrom: string;
  scheduledTo: string;
  amountMin: string;
  amountMax: string;
};

export const EMPTY_PURCHASE_FILTERS: PurchaseFilterValues = {
  status: "all",
  paymentMethod: "all",
  attraction: "all",
  createdFrom: "",
  createdTo: "",
  scheduledFrom: "",
  scheduledTo: "",
  amountMin: "",
  amountMax: "",
};

/** Count of non-default filters — drives the "Filters" button badge. */
export function countActivePurchaseFilters(v: PurchaseFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.paymentMethod !== "all") n++;
  if (v.attraction !== "all") n++;
  if (v.createdFrom !== "" || v.createdTo !== "") n++;
  if (v.scheduledFrom !== "" || v.scheduledTo !== "") n++;
  if (v.amountMin !== "" || v.amountMax !== "") n++;
  return n;
}

// Status + method options mirror the web AttractionPurchases filterDefs.
const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Checked In", value: "checked-in" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

const PAYMENT_METHOD_OPTS: SelectOption[] = [
  { label: "All Methods", value: "all" },
  { label: "Card", value: "card" },
  { label: "Authorize.net", value: "authorize.net" },
  { label: "In-Store", value: "in-store" },
  { label: "Pay Later", value: "paylater" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

const DateRangeRow = ({
  label,
  from,
  to,
  onOpen,
  onClear,
}: {
  label: string;
  from: string;
  to: string;
  onOpen: () => void;
  onClear: () => void;
}) => {
  const has = from !== "" || to !== "";
  const text = has
    ? `${formatShortDate(from) || "…"} – ${formatShortDate(to) || "…"}`
    : null;
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${label} range`}
        className="h-14 flex-row items-center gap-3 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
      >
        <Feather name="calendar" size={18} color="#9CA3AF" />
        <Text
          className={`flex-1 text-base ${
            text ? "text-gray-900 dark:text-white" : "text-gray-400"
          }`}
          numberOfLines={1}
        >
          {text ?? "Any date"}
        </Text>
        {has ? (
          <Pressable onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${label}`}>
            <Feather name="x" size={18} color="#9CA3AF" />
          </Pressable>
        ) : (
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        )}
      </Pressable>
    </View>
  );
};

type Props = {
  visible: boolean;
  values: PurchaseFilterValues;
  /** Attraction names for the Attraction dropdown (derived from loaded data). */
  attractions: string[];
  onChange: (next: PurchaseFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
  onOpenDateRange: (target: PurchaseDateTarget) => void;
};

/**
 * Consolidated filter sheet for Manage Purchases (web parity): Status · Payment
 * Method · Attraction · Purchase Date · Scheduled Date · Total Amount. Controlled
 * (the screen owns the draft so the date picker can write it); Apply commits,
 * Cancel discards, Clear All resets. Mirrors EventPurchaseFiltersSheet.
 */
export function PurchaseFiltersSheet({
  visible,
  values,
  attractions,
  onChange,
  onApply,
  onClear,
  onClose,
  onOpenDateRange,
}: Props) {
  const set = (patch: Partial<PurchaseFilterValues>) =>
    onChange({ ...values, ...patch });

  const amountInvalid =
    values.amountMin !== "" &&
    values.amountMax !== "" &&
    Number(values.amountMin) > Number(values.amountMax);

  const attractionOptions: SelectOption[] = [
    { label: "All Attractions", value: "all" },
    ...attractions.map((a) => ({ label: a, value: a })),
  ];

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
            value={values.paymentMethod}
            options={PAYMENT_METHOD_OPTS}
            onSelect={(v) => set({ paymentMethod: String(v) })}
          />
          <SelectField
            label="Attraction"
            value={values.attraction}
            options={attractionOptions}
            onSelect={(v) => set({ attraction: String(v) })}
          />

          <DateRangeRow
            label="Purchase Date"
            from={values.createdFrom}
            to={values.createdTo}
            onOpen={() => onOpenDateRange("created")}
            onClear={() => set({ createdFrom: "", createdTo: "" })}
          />
          <DateRangeRow
            label="Scheduled Date"
            from={values.scheduledFrom}
            to={values.scheduledTo}
            onOpen={() => onOpenDateRange("scheduled")}
            onClear={() => set({ scheduledFrom: "", scheduledTo: "" })}
          />

          {/* Total Amount range */}
          <View>
            <FieldLabel>Total Amount ($)</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.amountMin}
                onChangeText={(t) => set({ amountMin: t.replace(/[^0-9.]/g, "") })}
                placeholder="Min"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.amountMax}
                onChangeText={(t) => set({ amountMax: t.replace(/[^0-9.]/g, "") })}
                placeholder="Max"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>
            {amountInvalid && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          {/* Footer: Clear All + Cancel (secondary), Apply (primary) */}
          <View className="gap-3 mt-2">
            <View className="flex-row gap-3">
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  Clear All
                </Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onApply}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
              className="h-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">Apply</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
