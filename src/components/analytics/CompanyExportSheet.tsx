import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  PERIOD_PRESETS,
  type PeriodRange,
} from "../../lib/customers/customerAnalyticsDisplay";
import { BottomSheet } from "../ui/BottomSheet";
import { formatShortDate } from "../ui/DateRangeSheet";
import { CheckboxRow } from "../ui/FormControls";
import { FilterChip } from "../ui/SummaryPanel";

/** What the company export will cover — its own copy of the screen's filters. */
export type CompanyExportValues = {
  range: PeriodRange;
  /** Only used when the range is "custom". */
  start?: string;
  end?: string;
  /** Empty means every location, as on the screen and the web. */
  locationIds: number[];
  format: "json" | "csv";
};

const FORMATS: { label: string; value: CompanyExportValues["format"]; icon: "code" | "grid" }[] = [
  { label: "JSON (.json)", value: "json", icon: "code" },
  { label: "CSV (.csv)", value: "csv", icon: "grid" },
];

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

/**
 * "Export Analytics" for the company admin — the web modal's Time Period,
 * Locations (with Clear All) and Export Format, then Export Data.
 */
export function CompanyExportSheet({
  visible,
  values,
  locations,
  exporting,
  onChange,
  onClose,
  onExport,
  onOpenCustomRange,
}: {
  visible: boolean;
  values: CompanyExportValues;
  locations: { id: number; name: string }[];
  exporting: boolean;
  onChange: (next: CompanyExportValues) => void;
  onClose: () => void;
  onExport: () => void;
  /** Ask the parent to open the calendar for a custom range. */
  onOpenCustomRange: () => void;
}) {
  const set = (patch: Partial<CompanyExportValues>) => onChange({ ...values, ...patch });
  const toggleLocation = (id: number) =>
    set({
      locationIds: values.locationIds.includes(id)
        ? values.locationIds.filter((l) => l !== id)
        : [...values.locationIds, id],
    });

  const customLabel =
    values.start && values.end
      ? `${formatShortDate(values.start)} – ${formatShortDate(values.end)}`
      : "Custom";
  // The web asks for both dates before a custom export.
  const missingDates = values.range === "custom" && (!values.start || !values.end);
  const exportDisabled = exporting || missingDates;
  const count = values.locationIds.length;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Export Analytics">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-1">
          <FieldLabel>Time Period</FieldLabel>
          <View className="flex-row flex-wrap gap-2 mt-2 mb-5">
            {PERIOD_PRESETS.map((p) => (
              <FilterChip
                key={p.value}
                label={p.label}
                selected={values.range === p.value}
                onPress={() => set({ range: p.value })}
              />
            ))}
            <FilterChip
              label={customLabel}
              selected={values.range === "custom"}
              onPress={onOpenCustomRange}
            />
          </View>

          <View className="flex-row items-center justify-between mb-2">
            <FieldLabel>Locations</FieldLabel>
            {/* Keyed by whether it can act, so it remounts rather than
                restyling a live element. */}
            <Pressable
              key={`clear-${count > 0}`}
              onPress={() => set({ locationIds: [] })}
              disabled={count === 0}
              hitSlop={8}
              accessibilityRole="button"
              className={count > 0 ? "active:opacity-60" : "opacity-40"}
            >
              <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                Clear All
              </Text>
            </Pressable>
          </View>
          <View className="rounded-xl border border-gray-200 dark:border-neutral-800 px-3.5 py-1">
            {locations.length === 0 ? (
              <Text className="py-3 text-sm text-gray-400 dark:text-gray-500">
                No locations available.
              </Text>
            ) : (
              locations.map((loc, i) => (
                <View
                  key={loc.id}
                  className={`py-3 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
                >
                  <CheckboxRow
                    label={loc.name}
                    checked={values.locationIds.includes(loc.id)}
                    onToggle={() => toggleLocation(loc.id)}
                  />
                </View>
              ))
            )}
          </View>
          <Text className="mt-2 mb-5 text-xs text-gray-500 dark:text-gray-400">
            {count > 0 ? `${count} location(s) selected` : "All locations selected"}
          </Text>

          <FieldLabel>Export Format</FieldLabel>
          <View className="flex-row gap-3 mt-2 mb-5">
            {FORMATS.map((f) => {
              const active = values.format === f.value;
              return (
                <Pressable
                  key={`${f.value}-${active}`}
                  onPress={() => set({ format: f.value })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 items-center gap-1.5 py-3 rounded-xl border ${
                    active
                      ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  }`}
                >
                  <Feather name={f.icon} size={18} color={active ? "#0644C7" : "#6B7280"} />
                  <Text
                    className={`text-sm font-medium ${
                      active ? "text-[#0644C7] dark:text-blue-300" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {missingDates && (
            <View
              className="flex-row items-center gap-2 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
              accessibilityLiveRegion="polite"
            >
              <Feather name="alert-circle" size={15} color="#D97706" />
              <Text className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                Please select both start and end dates for custom range.
              </Text>
            </View>
          )}

          <View className="flex-row gap-3 pt-4 border-t border-gray-100 dark:border-neutral-800">
            {/* Keyed by their enabled state, so switching it remounts them
                instead of swapping a pseudo class on a live element. */}
            <Pressable
              key={`cancel-${exporting}`}
              onPress={onClose}
              disabled={exporting}
              accessibilityRole="button"
              className={`flex-1 h-12 items-center justify-center rounded-xl border border-gray-200 dark:border-neutral-700 ${
                exporting ? "opacity-50" : "active:opacity-70"
              }`}
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              key={`export-${exportDisabled}`}
              onPress={onExport}
              disabled={exportDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: exportDisabled }}
              className={`flex-1 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] ${
                exportDisabled ? "opacity-50" : "active:opacity-90"
              }`}
            >
              {exporting ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">Exporting...</Text>
                </>
              ) : (
                <>
                  <Feather name="download" size={16} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">Export Data</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
