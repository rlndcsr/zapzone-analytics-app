import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SOURCE_LABELS } from "../../services/waiversService";
import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { SelectField, type SelectOption } from "./FormControls";

/**
 * Every filter the web admin's Waivers page offers in its Filters dropdown
 * (`filterDefs` in WaiversSearch.tsx): Check-In, Source, Marketing Consent,
 * Template, Location and a Submitted date range. "all" means the filter is off;
 * empty strings mean no date limit.
 *
 * The waiver Status and the All-dates/Today scope stay on their own pill — those
 * are server-side query params, matching the web's separate scope controls.
 */
export type WaiverFilterValues = {
  checkIn: string;
  source: string;
  marketing: string;
  template: string;
  location: string;
  submittedStart: string;
  submittedEnd: string;
};

export const EMPTY_WAIVER_FILTERS: WaiverFilterValues = {
  checkIn: "all",
  source: "all",
  marketing: "all",
  template: "all",
  location: "all",
  submittedStart: "",
  submittedEnd: "",
};

/** How many filters are switched on — shown as the count on the Filters pill. */
export function countActiveWaiverFilters(v: WaiverFilterValues): number {
  let n = 0;
  if (v.checkIn !== "all") n++;
  if (v.source !== "all") n++;
  if (v.marketing !== "all") n++;
  if (v.template !== "all") n++;
  if (v.location !== "all") n++;
  if (v.submittedStart !== "" || v.submittedEnd !== "") n++;
  return n;
}

const CHECK_IN_OPTS: SelectOption[] = [
  { label: "Any check-in status", value: "all" },
  { label: "Checked in", value: "checked_in" },
  { label: "Not checked in", value: "not_checked_in" },
];

// Built from the shared SOURCE_LABELS, the same map the web filter iterates.
const SOURCE_OPTS: SelectOption[] = [
  { label: "Any source", value: "all" },
  ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({ label, value })),
];

const MARKETING_OPTS: SelectOption[] = [
  { label: "Any marketing consent", value: "all" },
  { label: "Opted in", value: "opted_in" },
  { label: "Not opted in", value: "not_opted_in" },
  { label: "Withdrawn", value: "withdrawn" },
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
  values: WaiverFilterValues;
  /** Template titles present in the loaded page (the web derives these too). */
  templates: string[];
  /** Location names present in the loaded page. */
  locations: string[];
  /**
   * The workspace location, when one is pinned. Waivers has no location query
   * param, so the pin already narrows the page — this just says so, instead of
   * leaving the user wondering why Location looks like it did nothing.
   */
  pinnedLocationName?: string | null;
  onChange: (next: WaiverFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
  /** Ask the parent to open the shared calendar for the Submitted range. */
  onOpenSubmittedRange: () => void;
};

/**
 * Waivers filter panel — one bottom sheet holding every filter from the web
 * page's Filters dropdown, in the same order. Picks apply straight to the list
 * behind it; "Done" just closes. The date range reuses the shared calendar,
 * opened by the parent so two native sheets are never stacked.
 */
export function WaiverFiltersSheet({
  visible,
  values,
  templates,
  locations,
  pinnedLocationName,
  onChange,
  onClear,
  onClose,
  onOpenSubmittedRange,
}: Props) {
  const set = (patch: Partial<WaiverFilterValues>) =>
    onChange({ ...values, ...patch });

  const templateOptions: SelectOption[] = [
    { label: "Any template", value: "all" },
    ...templates.map((t) => ({ label: t, value: t })),
  ];

  const locationOptions: SelectOption[] = [
    { label: "Any location", value: "all" },
    ...locations.map((l) => ({ label: l, value: l })),
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
            label="Check-In"
            value={values.checkIn}
            options={CHECK_IN_OPTS}
            onSelect={(v) => set({ checkIn: String(v) })}
          />
          <SelectField
            label="Source"
            value={values.source}
            options={SOURCE_OPTS}
            onSelect={(v) => set({ source: String(v) })}
          />
          <SelectField
            label="Marketing Consent"
            value={values.marketing}
            options={MARKETING_OPTS}
            onSelect={(v) => set({ marketing: String(v) })}
          />
          <SelectField
            label="Template"
            value={values.template}
            options={templateOptions}
            onSelect={(v) => set({ template: String(v) })}
          />

          <View>
            <SelectField
              label="Location"
              value={values.location}
              options={locationOptions}
              onSelect={(v) => set({ location: String(v) })}
            />
            {!!pinnedLocationName && (
              <Text className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Records are already limited to {pinnedLocationName} by the
                workspace selector.
              </Text>
            )}
          </View>

          <View>
            <FieldLabel>Submitted Date</FieldLabel>
            <DateRangeRow
              start={values.submittedStart}
              end={values.submittedEnd}
              onPress={onOpenSubmittedRange}
              onClear={() => set({ submittedStart: "", submittedEnd: "" })}
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
