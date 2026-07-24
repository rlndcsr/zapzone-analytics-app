import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { EmailNotificationRow } from "../../services/emailService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

/** Small circular icon button for the Actions column (matches the other tables). */
const IconAction = ({
  icon,
  tint,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="w-8 h-8 rounded-full items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
  >
    <Feather name={icon} size={16} color={tint} />
  </Pressable>
);

type Handlers = {
  onView: (n: EmailNotificationRow) => void;
  onTest: (n: EmailNotificationRow) => void;
  onDuplicate: (n: EmailNotificationRow) => void;
  onEdit: (n: EmailNotificationRow) => void;
  onReset: (n: EmailNotificationRow) => void;
  onDelete: (n: EmailNotificationRow) => void;
};

// Columns mirror the web `/admin/email/notifications` default-visible set + order:
// Notification (name + Default badge) · Trigger · Entity · Recipients · Status · Actions.
function buildColumns(h: Handlers): TableColumn<EmailNotificationRow>[] {
  return [
  {
    key: "name",
    label: "Notification",
    width: 220,
    render: (n) => (
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {n.name}
        </Text>
        {n.isDefault && (
          <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
            <Feather name="shield" size={10} color={PRIMARY} />
            <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300">
              Default
            </Text>
          </View>
        )}
      </View>
    ),
  },
  {
    key: "trigger",
    label: "Trigger",
    width: 170,
    render: (n) => (
      <View className="flex-row">
        <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
          <Feather name="bell" size={11} color={PRIMARY} />
          <Text numberOfLines={1} className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
            {n.triggerLabel || "—"}
          </Text>
        </View>
      </View>
    ),
  },
  {
    key: "entity",
    label: "Entity",
    width: 130,
    render: (n) => (
      <View className="flex-row items-center gap-1.5">
        <Feather name="box" size={13} color="#9CA3AF" />
        <Text numberOfLines={1} className="text-sm text-gray-600 dark:text-gray-300">
          {n.entityLabel}
        </Text>
      </View>
    ),
  },
  {
    key: "recipients",
    label: "Recipients",
    width: 120,
    render: (n) => (
      <View className="flex-row items-center gap-1.5">
        <Feather name="users" size={13} color="#9CA3AF" />
        <Text className="text-sm text-gray-600 dark:text-gray-300">
          {n.recipientCount} type{n.recipientCount === 1 ? "" : "s"}
        </Text>
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 120,
    render: (n) => (
      <View className="flex-row">
        <View
          className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
            n.isActive ? "bg-green-100 dark:bg-green-900/40" : "bg-gray-200 dark:bg-neutral-700"
          }`}
        >
          <Feather
            name={n.isActive ? "check-circle" : "slash"}
            size={11}
            color={n.isActive ? "#16A34A" : "#6B7280"}
          />
          <Text
            className={`text-xs font-semibold ${
              n.isActive ? "text-green-700 dark:text-green-300" : "text-gray-600 dark:text-gray-300"
            }`}
          >
            {n.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 200,
    render: (n) => (
      <View className="flex-row items-center gap-0.5">
        <IconAction icon="eye" tint={PRIMARY} label={`View ${n.name}`} onPress={() => h.onView(n)} />
        <IconAction icon="send" tint={PRIMARY} label={`Send test for ${n.name}`} onPress={() => h.onTest(n)} />
        <IconAction icon="copy" tint={PRIMARY} label={`Duplicate ${n.name}`} onPress={() => h.onDuplicate(n)} />
        <IconAction icon="edit-2" tint={PRIMARY} label={`Edit ${n.name}`} onPress={() => h.onEdit(n)} />
        {n.isDefault ? (
          <IconAction icon="rotate-ccw" tint="#D97706" label={`Reset ${n.name}`} onPress={() => h.onReset(n)} />
        ) : (
          <IconAction icon="trash-2" tint="#EF4444" label={`Delete ${n.name}`} onPress={() => h.onDelete(n)} />
        )}
      </View>
    ),
  },
  ];
}

/** Table view for Email Notifications — thin wrapper over the shared SelectableTable. */
export function EmailNotificationsTable({
  notifications,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onTest,
  onDuplicate,
  onEdit,
  onReset,
  onDelete,
}: {
  notifications: EmailNotificationRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (n: EmailNotificationRow) => void;
  onTest: (n: EmailNotificationRow) => void;
  onDuplicate: (n: EmailNotificationRow) => void;
  onEdit: (n: EmailNotificationRow) => void;
  onReset: (n: EmailNotificationRow) => void;
  onDelete: (n: EmailNotificationRow) => void;
}) {
  const columns = useMemo(
    () =>
      buildColumns({
        onView: onRowPress,
        onTest,
        onDuplicate,
        onEdit,
        onReset,
        onDelete,
      }),
    [onRowPress, onTest, onDuplicate, onEdit, onReset, onDelete],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={notifications}
      rowId={(n) => n.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
    />
  );
}
