import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";

/** Every Customers filter the web page offers. "all" means the filter is off. */
export type CustomerFilterValues = {
  status: string;
  tag: string;
  source: string;
  company: string;
  sms: string;
  createdStart: string;
  createdEnd: string;
};

export const EMPTY_CUSTOMER_FILTERS: CustomerFilterValues = {
  status: "all",
  tag: "all",
  source: "all",
  company: "all",
  sms: "all",
  createdStart: "",
  createdEnd: "",
};

/** How many filters are switched on — shown as the count on the Filters pill. */
export function countActiveCustomerFilters(v: CustomerFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.tag !== "all") n++;
  if (v.source !== "all") n++;
  if (v.company !== "all") n++;
  if (v.sms !== "all") n++;
  if (v.createdStart !== "" || v.createdEnd !== "") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const SMS_OPTS: SelectOption[] = [
  { label: "All SMS Consent", value: "all" },
  { label: "Opted In", value: "opted_in" },
  { label: "Not Opted In", value: "not_opted_in" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

type Props = {
  visible: boolean;
  values: CustomerFilterValues;
  /** Choices pulled from the loaded customers, like the web does. */
  tags: string[];
  sources: string[];
  companies: string[];
  onChange: (next: CustomerFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared calendar for Created Date. */
  onOpenCreatedDate: () => void;
};

/**
 * Customers filter panel — one bottom sheet holding every filter the web page
 * has. Picks apply straight to the list behind it; "Done" just closes.
 * Created Date reuses the shared calendar, opened by the parent.
 */
export function CustomerFiltersSheet({
  visible,
  values,
  tags,
  sources,
  companies,
  onChange,
  onClear,
  onClose,
  onOpenCreatedDate,
}: Props) {
  const set = (patch: Partial<CustomerFilterValues>) =>
    onChange({ ...values, ...patch });

  const hasCreated = values.createdStart !== "" || values.createdEnd !== "";
  const createdLabel = hasCreated
    ? `${formatShortDate(values.createdStart) || "…"} – ${formatShortDate(values.createdEnd) || "…"}`
    : null;

  const listOptions = (allLabel: string, items: string[]): SelectOption[] => [
    { label: allLabel, value: "all" },
    ...items.map((i) => ({ label: i, value: i })),
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
            label="Tag"
            value={values.tag}
            options={listOptions("All Tags", tags)}
            onSelect={(v) => set({ tag: String(v) })}
          />
          <SelectField
            label="Source"
            value={values.source}
            options={listOptions("All Sources", sources)}
            onSelect={(v) => set({ source: String(v) })}
          />
          <SelectField
            label="Company"
            value={values.company}
            options={listOptions("All Companies", companies)}
            onSelect={(v) => set({ company: String(v) })}
          />
          <SelectField
            label="SMS Consent"
            value={values.sms}
            options={SMS_OPTS}
            onSelect={(v) => set({ sms: String(v) })}
          />

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
