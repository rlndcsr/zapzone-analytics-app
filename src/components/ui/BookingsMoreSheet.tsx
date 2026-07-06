import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";

type FeatherName = ComponentProps<typeof Feather>["name"];

type Props = {
  visible: boolean;
  onClose: () => void;
  showDeleted: boolean;
  exporting?: boolean;
  onBulkImport: () => void;
  onExport: () => void;
  onGenerateReport: () => void;
  onToggleDeleted: () => void;
};

const MenuRow = ({
  icon,
  label,
  busy = false,
  dividerBefore = false,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  busy?: boolean;
  dividerBefore?: boolean;
  onPress: () => void;
}) => (
  <View>
    {dividerBefore && <View className="h-px bg-gray-100 dark:bg-neutral-800 my-1" />}
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl"
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
        {busy ? (
          <ActivityIndicator size="small" color="#0644C7" />
        ) : (
          <Feather name={icon} size={18} color="#374151" />
        )}
      </View>
      <Text className="text-base font-medium text-gray-800 dark:text-gray-100">{label}</Text>
    </Pressable>
  </View>
);

/**
 * Page-level "More" menu for Manage Bookings — the mobile equivalent of the web
 * admin's header ActionMenu beside "Manual Booking". A thin menu that emits
 * callbacks; the screen owns the export run, the report/import sheets, and the
 * deleted-view toggle so state stays in one place.
 */
export function BookingsMoreSheet({
  visible,
  onClose,
  showDeleted,
  exporting = false,
  onBulkImport,
  onExport,
  onGenerateReport,
  onToggleDeleted,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="More">
      <View className="px-3 pb-6">
        <MenuRow
          icon="upload"
          label="Bulk Import"
          onPress={() => {
            onClose();
            onBulkImport();
          }}
        />
        <MenuRow
          icon="download"
          label="Export Bookings"
          busy={exporting}
          onPress={onExport}
        />
        <MenuRow
          icon="file-text"
          label="Generate Report"
          onPress={() => {
            onClose();
            onGenerateReport();
          }}
        />
        <MenuRow
          icon={showDeleted ? "rotate-ccw" : "archive"}
          label={showDeleted ? "View Active" : "View Deleted"}
          dividerBefore
          onPress={() => {
            onClose();
            onToggleDeleted();
          }}
        />
      </View>
    </BottomSheet>
  );
}
