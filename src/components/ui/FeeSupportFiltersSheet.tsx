import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";
import { InputField } from "./InputField";

/**
 * Every Fee Support filter the web page offers. Empty strings mean "no limit";
 * "all" means the filter is off.
 */
export type FeeSupportFilterValues = {
  entityType: string;
  calculation: string;
  application: string;
  status: string;
  location: string;
  amountMin: string;
  amountMax: string;
  createdStart: string;
  createdEnd: string;
};

export const EMPTY_FEE_SUPPORT_FILTERS: FeeSupportFilterValues = {
  entityType: "all",
  calculation: "all",
  application: "all",
  status: "all",
  location: "all",
  amountMin: "",
  amountMax: "",
  createdStart: "",
  createdEnd: "",
};

/** How many filters are switched on — shown as the count on the Filters pill. */
export function countActiveFeeSupportFilters(v: FeeSupportFilterValues): number {
  let n = 0;
  if (v.entityType !== "all") n++;
  if (v.calculation !== "all") n++;
  if (v.application !== "all") n++;
  if (v.status !== "all") n++;
  if (v.location !== "all") n++;
  if (v.amountMin !== "" || v.amountMax !== "") n++;
  if (v.createdStart !== "" || v.createdEnd !== "") n++;
  return n;
}

const ENTITY_OPTS: SelectOption[] = [
  { label: "All Types", value: "all" },
  { label: "Package", value: "package" },
  { label: "Attraction", value: "attraction" },
  { label: "Event", value: "event" },
  { label: "Membership", value: "membership" },
];

const CALCULATION_OPTS: SelectOption[] = [
  { label: "All Calculations", value: "all" },
  { label: "Fixed", value: "fixed" },
  { label: "Percentage", value: "percentage" },
];

const APPLICATION_OPTS: SelectOption[] = [
  { label: "All Applications", value: "all" },
  { label: "Additive", value: "additive" },
  { label: "Inclusive", value: "inclusive" },
];

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

type Props = {
  visible: boolean;
  values: FeeSupportFilterValues;
  /** Locations for the Location dropdown. */
  locations: { id: number; name: string }[];
  onChange: (next: FeeSupportFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared calendar for Created Date. */
  onOpenCreatedDate: () => void;
};

/**
 * Fee Supports filter panel — one bottom sheet holding every filter the web
 * page has. Picks apply straight to the list behind it; "Done" just closes.
 * Created Date reuses the shared calendar, opened by the parent.
 */
export function FeeSupportFiltersSheet({
  visible,
  values,
  locations,
  onChange,
  onClear,
  onClose,
  onOpenCreatedDate,
}: Props) {
  const set = (patch: Partial<FeeSupportFilterValues>) =>
    onChange({ ...values, ...patch });

  const amountInvalid =
    values.amountMin !== "" &&
    values.amountMax !== "" &&
    Number(values.amountMin) > Number(values.amountMax);

  const hasCreated = values.createdStart !== "" || values.createdEnd !== "";
  const createdLabel = hasCreated
    ? `${formatShortDate(values.createdStart) || "…"} – ${formatShortDate(values.createdEnd) || "…"}`
    : null;

  const locationOptions: SelectOption[] = [
    { label: "All Locations", value: "all" },
    { label: "Company-wide (All Locations)", value: "company-wide" },
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
            label="Calculation Type"
            value={values.calculation}
            options={CALCULATION_OPTS}
            onSelect={(v) => set({ calculation: String(v) })}
          />
          <SelectField
            label="Application Type"
            value={values.application}
            options={APPLICATION_OPTS}
            onSelect={(v) => set({ application: String(v) })}
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

          {/* Fee amount range */}
          <View>
            <FieldLabel>Fee Amount</FieldLabel>
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

          {/* Created Date — opens the shared range calendar */}
          <View>
            <FieldLabel>Created Date</FieldLabel>
            <Pressable
              onPress={onOpenCreatedDate}
              className="h-14 flex-row items-center gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
            >
              <Feather name="calendar" size={18} color="#9CA3AF" />
              <Text
                className={`flex-1 text-base ${
                  createdLabel ? "text-gray-900 dark:text-white" : "text-gray-400"
                }`}
                numberOfLines={1}
              >
                {createdLabel ?? "Select dates"}
              </Text>
              {hasCreated ? (
                <Pressable
                  onPress={() => set({ createdStart: "", createdEnd: "" })}
                  hitSlop={10}
                >
                  <Feather name="x" size={18} color="#9CA3AF" />
                </Pressable>
              ) : (
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              )}
            </Pressable>
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
