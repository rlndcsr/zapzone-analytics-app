import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Text, View } from "react-native";

import type { EmailNotificationRow } from "../../services/emailService";
import {
  canDeleteNotification,
  canDuplicateNotification,
  canResetNotification,
  canSetUpVisitEmail,
} from "../../lib/email/visitEmail";
import { getCurrentUser } from "../../lib/session";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusDotBadge } from "./SummaryPanel";
import { VisitPromoBadge } from "./VisitEmailSettings";

const PRIMARY = "#0644C7";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** "Default" marker on a built-in notification — table and card list. */
export const DefaultNotificationBadge = () => (
  <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
    <Feather name="shield" size={10} color={PRIMARY} />
    <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300">
      Default
    </Text>
  </View>
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
  const user = getCurrentUser();
  const canSetUpVisit = canSetUpVisitEmail(user?.role, user?.location_id);
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
        {n.isDefault && <DefaultNotificationBadge />}
        {n.triggerType === "visit_completed" && <VisitPromoBadge summary={n.promoSummary} />}
      </View>
    ),
  },
  {
    key: "trigger",
    label: "Trigger",
    width: 170,
    render: (n) => (
      <View className="self-start max-w-full flex-row items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
        <Feather name="bell" size={11} color="#6B7280" />
        <Text numberOfLines={1} className="shrink text-xs font-medium text-gray-700 dark:text-gray-300">
          {n.triggerLabel || "—"}
        </Text>
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
        <Text numberOfLines={1} className={CELL_TEXT}>
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
        <Text className={CELL_TEXT}>
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
        <StatusDotBadge on={n.isActive} label={n.isActive ? "Active" : "Inactive"} />
      </View>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    // Up to six 32px buttons in the group, plus the cell's horizontal padding.
    width: 230,
    // Same buttons, order and conditions as the web row: Send test · Reset (a
    // customized default only) · Duplicate · View · Edit · Delete (not on
    // defaults). Neutral icons; only edit, reset and delete are tinted.
    render: (n) => (
      <RowActionGroup
        actions={[
          { key: "test", icon: "send", color: "#6B7280", label: `Send test for ${n.name}`, onPress: () => h.onTest(n) },
          canResetNotification(n) && {
            key: "reset",
            icon: "rotate-ccw",
            color: "#D97706",
            label: `Reset ${n.name}`,
            onPress: () => h.onReset(n),
          },
          canDuplicateNotification(n.isDefault, n.triggerType, canSetUpVisit) && {
            key: "duplicate",
            icon: "copy",
            color: "#6B7280",
            label: `Duplicate ${n.name}`,
            onPress: () => h.onDuplicate(n),
          },
          { key: "view", icon: "eye", color: "#6B7280", label: `View ${n.name}`, onPress: () => h.onView(n) },
          { key: "edit", icon: "edit-2", color: PRIMARY, label: `Edit ${n.name}`, onPress: () => h.onEdit(n) },
          canDeleteNotification(n) && {
            key: "delete",
            icon: "trash-2",
            color: "#DC2626",
            label: `Delete ${n.name}`,
            onPress: () => h.onDelete(n),
          },
        ]}
      />
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
      rowLabel={(n) => n.name}
      flat
    />
  );
}
