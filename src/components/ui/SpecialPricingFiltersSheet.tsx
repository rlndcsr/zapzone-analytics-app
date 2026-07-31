import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";
import { InputField } from "./InputField";

/** Which date range the parent's calendar is currently editing. */
export type SpecialPricingDateTarget = "effective" | "created";

/**
 * Every Special Pricing filter the web page offers. Empty strings mean
 * "no limit"; "all" means the filter is off.
 */
export type SpecialPricingFilterValues = {
  entityType: string;
  recurrence: string;
  discountType: string;
  status: string;
  location: string;
  stackable: string;
  amountMin: string;
  amountMax: string;
  effectiveStart: string;
  effectiveEnd: string;
  createdStart: string;
  createdEnd: string;
};

export const EMPTY_SPECIAL_PRICING_FILTERS: SpecialPricingFilterValues = {
  entityType: "all",
  recurrence: "all",
  discountType: "all",
  status: "all",
  location: "all",
  stackable: "all",
  amountMin: "",
  amountMax: "",
  effectiveStart: "",
  effectiveEnd: "",
  createdStart: "",
  createdEnd: "",
};

/** How many filters are switched on — shown as the count on the Filters pill. */
export function countActiveSpecialPricingFilters(
  v: SpecialPricingFilterValues,
): number {
  let n = 0;
  if (v.entityType !== "all") n++;
  if (v.recurrence !== "all") n++;
  if (v.discountType !== "all") n++;
  if (v.status !== "all") n++;
  if (v.location !== "all") n++;
  if (v.stackable !== "all") n++;
  if (v.amountMin !== "" || v.amountMax !== "") n++;
  if (v.effectiveStart !== "" || v.effectiveEnd !== "") n++;
  if (v.createdStart !== "" || v.createdEnd !== "") n++;
  return n;
}

const ENTITY_OPTS: SelectOption[] = [
  { label: "All Types", value: "all" },
  { label: "Package", value: "package" },
  { label: "Attraction", value: "attraction" },
  { label: "Event", value: "event" },
];

const RECURRENCE_OPTS: SelectOption[] = [
  { label: "All Recurrences", value: "all" },
  { label: "One-Time", value: "one_time" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const DISCOUNT_TYPE_OPTS: SelectOption[] = [
  { label: "All Discount Types", value: "all" },
  { label: "Fixed ($)", value: "fixed" },
  { label: "Percentage (%)", value: "percentage" },
];

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const STACKABLE_OPTS: SelectOption[] = [
  { label: "All", value: "all" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

/** A tappable row that shows the picked date range, or "Select dates". */
const DateRangeRow = ({
  start,
  end,
  onPress,
  onClear,
}: {
  start: string;
  end: string;
  onPress: () => void;
  onClear: () => void;
}) => {
  const picked = start !== "" || end !== "";
  const label = picked
    ? `${formatShortDate(start) || "…"} – ${formatShortDate(end) || "…"}`
    : null;
  return (
    <Pressable
      onPress={onPress}
      className="h-14 flex-row items-center gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
    >
      <Feather name="calendar" size={18} color="#9CA3AF" />
      <Text
        className={`flex-1 text-base ${
          label ? "text-gray-900 dark:text-white" : "text-gray-400"
        }`}
        numberOfLines={1}
      >
        {label ?? "Select dates"}
      </Text>
      {picked ? (
        <Pressable onPress={onClear} hitSlop={10}>
          <Feather name="x" size={18} color="#9CA3AF" />
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={18} color="#9CA3AF" />
      )}
    </Pressable>
  );
};

type Props = {
  visible: boolean;
  values: SpecialPricingFilterValues;
  /** Locations for the Location dropdown. */
  locations: { id: number; name: string }[];
  onChange: (next: SpecialPricingFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared calendar for one of the date ranges. */
  onOpenDateRange: (target: SpecialPricingDateTarget) => void;
};

/**
 * Special Pricing filter panel — one bottom sheet holding every filter the web
 * page has. Picks apply straight to the list behind it; "Done" just closes.
 * The two date ranges reuse the shared calendar, opened by the parent.
 */
export function SpecialPricingFiltersSheet({
  visible,
  values,
  locations,
  onChange,
  onClear,
  onClose,
  onOpenDateRange,
}: Props) {
  const set = (patch: Partial<SpecialPricingFilterValues>) =>
    onChange({ ...values, ...patch });

  const amountInvalid =
    values.amountMin !== "" &&
    values.amountMax !== "" &&
    Number(values.amountMin) > Number(values.amountMax);

  const locationOptions: SelectOption[] = [
    { label: "All Locations", value: "all" },
    { label: "Company-wide Only", value: "company" },
    ...locations.map((l) => ({ label: l.name, value: String(l.id) })),
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
            label="Entity Type"
            value={values.entityType}
            options={ENTITY_OPTS}
            onSelect={(v) => set({ entityType: String(v) })}
          />
          <SelectField
            label="Recurrence"
            value={values.recurrence}
            options={RECURRENCE_OPTS}
            onSelect={(v) => set({ recurrence: String(v) })}
          />
          <SelectField
            label="Discount Type"
            value={values.discountType}
            options={DISCOUNT_TYPE_OPTS}
            onSelect={(v) => set({ discountType: String(v) })}
          />
          <SelectField
            label="Status"
            value={values.status}
            options={STATUS_OPTS}
            onSelect={(v) => set({ status: String(v) })}
          />
          <SelectField
            label="Location"
            value={values.location}
            options={locationOptions}
            onSelect={(v) => set({ location: String(v) })}
          />
          <SelectField
            label="Stackable"
            value={values.stackable}
            options={STACKABLE_OPTS}
            onSelect={(v) => set({ stackable: String(v) })}
          />

          {/* Discount amount range */}
          <View>
            <FieldLabel>Discount Amount</FieldLabel>
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

          <View>
            <FieldLabel>Effective / Start Date</FieldLabel>
            <DateRangeRow
              start={values.effectiveStart}
              end={values.effectiveEnd}
              onPress={() => onOpenDateRange("effective")}
              onClear={() => set({ effectiveStart: "", effectiveEnd: "" })}
            />
          </View>

          <View>
            <FieldLabel>Created Date</FieldLabel>
            <DateRangeRow
              start={values.createdStart}
              end={values.createdEnd}
              onPress={() => onOpenDateRange("created")}
              onClear={() => set({ createdStart: "", createdEnd: "" })}
            />
          </View>

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
