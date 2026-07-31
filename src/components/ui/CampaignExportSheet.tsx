import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { CheckboxRow } from "./FormControls";

/** What the sheet asks the server to include in the export. */
export type CampaignExportFilters = {
  statuses: string[];
  tags: string[];
  activeOnly: boolean;
};

export const EMPTY_CAMPAIGN_EXPORT_FILTERS: CampaignExportFilters = {
  statuses: [],
  tags: [],
  activeOnly: false,
};

type Props = {
  visible: boolean;
  values: CampaignExportFilters;
  /** Tags to choose from (the same list the Tag filter uses). */
  availableTags: string[];
  exporting: boolean;
  onChange: (next: CampaignExportFilters) => void;
  onClose: () => void;
  onExport: () => void;
};

/**
 * "Campaign Export" — the mobile version of the web's Export Customers modal.
 * Pick statuses and tags, then export a mailing-list CSV.
 */
export function CampaignExportSheet({
  visible,
  values,
  availableTags,
  exporting,
  onChange,
  onClose,
  onExport,
}: Props) {
  const toggleIn = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Export Customers">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Configure filters to export customer data
        </Text>

        <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Customer Status
        </Text>
        <View className="gap-3 mb-5">
          {["active", "inactive"].map((status) => (
            <CheckboxRow
              key={status}
              checked={values.statuses.includes(status)}
              onToggle={() =>
                onChange({
                  ...values,
                  statuses: toggleIn(values.statuses, status),
                })
              }
              label={status.charAt(0).toUpperCase() + status.slice(1)}
            />
          ))}
        </View>

        <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Filter by Tags
        </Text>
        <View className="gap-3 mb-5">
          {availableTags.length === 0 ? (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              No tags available
            </Text>
          ) : (
            availableTags.map((tag) => (
              <CheckboxRow
                key={tag}
                checked={values.tags.includes(tag)}
                onToggle={() =>
                  onChange({ ...values, tags: toggleIn(values.tags, tag) })
                }
                label={tag}
              />
            ))
          )}
        </View>

        <View className="mb-5">
          <CheckboxRow
            checked={values.activeOnly}
            onToggle={() => onChange({ ...values, activeOnly: !values.activeOnly })}
            alignTop
            label="Export only active (opted-in) customers"
          />
        </View>

        <View className="flex-row items-start gap-3 rounded-xl border-2 border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 p-4 mb-5">
          <Feather name="download" size={18} color="#0644C7" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-300">
              CSV Export Format
            </Text>
            <Text className="text-xs text-gray-700 dark:text-gray-300 mt-1">
              Your data will be exported in CSV format including customer ID,
              name, email, first name, and last name.
            </Text>
          </View>
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
      </ScrollView>
    </BottomSheet>
  );
}
