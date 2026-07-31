import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { BottomSheet } from "./BottomSheet";
import { formatShortDate } from "./DateRangeSheet";
import { CheckboxRow, SelectField, type SelectOption } from "./FormControls";
import type {
  AnalyticsExportFormat,
  AnalyticsExportSection,
} from "../../services/customersService";

/** What the sheet will ask the server to build. */
export type AnalyticsExportValues = {
  format: AnalyticsExportFormat;
  dateRange: string;
  sections: AnalyticsExportSection[];
  /** Only used when the date range is "custom". */
  start: string;
  end: string;
};

export const DEFAULT_ANALYTICS_EXPORT: AnalyticsExportValues = {
  format: "csv",
  dateRange: "all",
  sections: ["customers", "revenue", "bookings", "activities", "packages", "events"],
  start: "",
  end: "",
};

const FORMAT_OPTS: { label: string; value: AnalyticsExportFormat; icon: string }[] =
  [
    { label: "CSV", value: "csv", icon: "grid" },
    { label: "PDF", value: "pdf", icon: "file-text" },
    { label: "Receipt", value: "receipt", icon: "file" },
  ];

const DATE_RANGE_OPTS: SelectOption[] = [
  { label: "All Time", value: "all" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
  { label: "Custom Range", value: "custom" },
];

const SECTION_OPTS: { id: AnalyticsExportSection; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "revenue", label: "Revenue" },
  { id: "bookings", label: "Bookings" },
  { id: "activities", label: "Activities" },
  { id: "packages", label: "Packages" },
  { id: "events", label: "Events" },
];

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

type Props = {
  visible: boolean;
  values: AnalyticsExportValues;
  exporting: boolean;
  onChange: (next: AnalyticsExportValues) => void;
  onClose: () => void;
  onExport: () => void;
  /** Ask the parent to open the shared calendar for the custom range. */
  onOpenCustomRange: () => void;
};

/**
 * "Export Analytics" — the mobile version of the web's export modal. Pick a
 * file type, a date range and which sections to include, then export.
 */
export function AnalyticsExportSheet({
  visible,
  values,
  exporting,
  onChange,
  onClose,
  onExport,
  onOpenCustomRange,
}: Props) {
  const set = (patch: Partial<AnalyticsExportValues>) =>
    onChange({ ...values, ...patch });

  const rangePicked = values.start !== "" && values.end !== "";
  const rangeLabel = rangePicked
    ? `${formatShortDate(values.start)} – ${formatShortDate(values.end)}`
    : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Export Analytics">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-1">
          <FieldLabel>Export Format</FieldLabel>
          <View className="flex-row gap-3 mb-5">
            {FORMAT_OPTS.map((f) => {
              const active = values.format === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => set({ format: f.value })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 items-center gap-1.5 py-3 rounded-xl border ${
                    active
                      ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  }`}
                >
                  <Feather
                    name={f.icon as never}
                    size={18}
                    color={active ? "#0644C7" : "#6B7280"}
                  />
                  <Text
                    className={`text-sm font-medium ${
                      active
                        ? "text-[#0644C7] dark:text-blue-300"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mb-5">
            <SelectField
              label="Date Range"
              value={values.dateRange}
              options={DATE_RANGE_OPTS}
              onSelect={(v) => set({ dateRange: String(v) })}
            />
          </View>

          {values.dateRange === "custom" && (
            <View className="mb-5">
              <FieldLabel>Start / End Date</FieldLabel>
              <Pressable
                onPress={onOpenCustomRange}
                className="h-14 flex-row items-center gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
              >
                <Feather name="calendar" size={18} color="#9CA3AF" />
                <Text
                  className={`flex-1 text-base ${
                    rangeLabel ? "text-gray-900 dark:text-white" : "text-gray-400"
                  }`}
                  numberOfLines={1}
                >
                  {rangeLabel ?? "Select dates"}
                </Text>
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              </Pressable>
            </View>
          )}

          <FieldLabel>Include Sections</FieldLabel>
          <View className="gap-3 mb-5">
            {SECTION_OPTS.map((s) => (
              <CheckboxRow
                key={s.id}
                checked={values.sections.includes(s.id)}
                onToggle={() =>
                  set({
                    sections: values.sections.includes(s.id)
                      ? values.sections.filter((x) => x !== s.id)
                      : [...values.sections, s.id],
                  })
                }
                label={s.label}
              />
            ))}
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={onClose}
              disabled={exporting}
              className={`flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700 ${
                exporting ? "opacity-50" : "active:opacity-70"
              }`}
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onExport}
              disabled={exporting}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] ${
                exporting ? "opacity-50" : "active:opacity-90"
              }`}
            >
              {exporting ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">
                    Exporting...
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="download" size={16} color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">Export</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
