import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { InputField } from "./InputField";
import { SelectField, type SelectOption } from "./FormControls";

/** Which of the two date ranges an "open calendar" request targets. */
export type EventDateTarget = "start" | "created";

/**
 * Full set of Manage Events filter values — one field per web Events filter
 * (status / date type / schedule / event-start range / created range / price /
 * add-ons / time of day). Empty strings mean "unbounded"/"any", matching the
 * web `useAdminTable`.
 */
export type EventFilterValues = {
  status: "all" | "active" | "inactive";
  dateType: "all" | "one_time" | "date_range";
  schedule: "all" | "upcoming" | "ongoing" | "past";
  startFrom: string;
  startTo: string;
  createdFrom: string;
  createdTo: string;
  priceMin: string;
  priceMax: string;
  addOns: "all" | "with" | "without";
  timeOfDay: "all" | "morning" | "afternoon" | "evening";
};

export const EMPTY_EVENT_FILTERS: EventFilterValues = {
  status: "all",
  dateType: "all",
  schedule: "all",
  startFrom: "",
  startTo: "",
  createdFrom: "",
  createdTo: "",
  priceMin: "",
  priceMax: "",
  addOns: "all",
  timeOfDay: "all",
};

/** Number of non-default filters — drives the "Filters" pill count badge. */
export function countActiveEventFilters(v: EventFilterValues): number {
  let n = 0;
  if (v.status !== "all") n++;
  if (v.dateType !== "all") n++;
  if (v.schedule !== "all") n++;
  if (v.startFrom !== "" || v.startTo !== "") n++;
  if (v.createdFrom !== "" || v.createdTo !== "") n++;
  if (v.priceMin !== "" || v.priceMax !== "") n++;
  if (v.addOns !== "all") n++;
  if (v.timeOfDay !== "all") n++;
  return n;
}

const STATUS_OPTS: SelectOption[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const DATE_TYPE_OPTS: SelectOption[] = [
  { label: "All Types", value: "all" },
  { label: "One Time", value: "one_time" },
  { label: "Date Range", value: "date_range" },
];

const SCHEDULE_OPTS: SelectOption[] = [
  { label: "All Schedules", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Ongoing", value: "ongoing" },
  { label: "Past", value: "past" },
];

const ADDONS_OPTS: SelectOption[] = [
  { label: "All Events", value: "all" },
  { label: "With Add-ons", value: "with" },
  { label: "Without Add-ons", value: "without" },
];

const TIME_OF_DAY_OPTS: SelectOption[] = [
  { label: "All Times", value: "all" },
  { label: "Morning (before 12 PM)", value: "morning" },
  { label: "Afternoon (12–5 PM)", value: "afternoon" },
  { label: "Evening (after 5 PM)", value: "evening" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

/** A tappable row that shows a selected date range (or "Any date"). */
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
          <Pressable onPress={onClear} hitSlop={10}>
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
  values: EventFilterValues;
  onChange: (next: EventFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared range calendar for one of the ranges. */
  onOpenDateRange: (target: EventDateTarget) => void;
};

/**
 * Manage Events filter panel — one BottomSheet with every web-admin filter.
 * Values apply live to the list behind it (like the web); "Done" closes and
 * "Clear Filters" resets. Date ranges reuse the shared range calendar (opened by
 * the parent to avoid stacking two native Modals).
 */
export function EventFiltersSheet({
  visible,
  values,
  onChange,
  onClear,
  onClose,
  onOpenDateRange,
}: Props) {
  const set = (patch: Partial<EventFilterValues>) =>
    onChange({ ...values, ...patch });

  const priceInvalid =
    values.priceMin !== "" &&
    values.priceMax !== "" &&
    Number(values.priceMin) > Number(values.priceMax);

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
            onSelect={(v) => set({ status: v as EventFilterValues["status"] })}
          />
          <SelectField
            label="Date Type"
            value={values.dateType}
            options={DATE_TYPE_OPTS}
            onSelect={(v) => set({ dateType: v as EventFilterValues["dateType"] })}
          />
          <SelectField
            label="Schedule"
            value={values.schedule}
            options={SCHEDULE_OPTS}
            onSelect={(v) => set({ schedule: v as EventFilterValues["schedule"] })}
          />

          <DateRangeRow
            label="Event Start Date"
            from={values.startFrom}
            to={values.startTo}
            onOpen={() => onOpenDateRange("start")}
            onClear={() => set({ startFrom: "", startTo: "" })}
          />
          <DateRangeRow
            label="Created Date"
            from={values.createdFrom}
            to={values.createdTo}
            onOpen={() => onOpenDateRange("created")}
            onClear={() => set({ createdFrom: "", createdTo: "" })}
          />

          {/* Price range */}
          <View>
            <FieldLabel>Price ($)</FieldLabel>
            <View className="flex-row gap-3">
              <InputField
                label=""
                value={values.priceMin}
                onChangeText={(t) => set({ priceMin: t.replace(/[^0-9.]/g, "") })}
                placeholder="Min"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
              <InputField
                label=""
                value={values.priceMax}
                onChangeText={(t) => set({ priceMax: t.replace(/[^0-9.]/g, "") })}
                placeholder="Max"
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>
            {priceInvalid && (
              <Text className="ml-4 mt-1.5 text-xs text-red-500">
                Min cannot exceed Max
              </Text>
            )}
          </View>

          <SelectField
            label="Add-ons"
            value={values.addOns}
            options={ADDONS_OPTS}
            onSelect={(v) => set({ addOns: v as EventFilterValues["addOns"] })}
          />
          <SelectField
            label="Time of Day"
            value={values.timeOfDay}
            options={TIME_OF_DAY_OPTS}
            onSelect={(v) =>
              set({ timeOfDay: v as EventFilterValues["timeOfDay"] })
            }
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
