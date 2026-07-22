import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { roleLabel, type StaffUser } from "../../services/usersService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

// Role → pill tint (mirrors the web "Type" badges and the card view's RoleBadge).
const ROLE_TONE: Record<string, string> = {
  company_admin:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  location_manager:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  attendant:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

const STATUS_TONE: Record<string, string> = {
  active:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  inactive: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
};

function formatLastLogin(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RoleBadge = ({ role }: { role: string }) => {
  const tone =
    ROLE_TONE[role] ??
    "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300";
  return (
    <View className="flex-row">
      <View className={`px-2 py-1 rounded-full ${tone}`}>
        <Text className={`text-[10px] font-semibold ${tone}`}>
          {roleLabel(role)}
        </Text>
      </View>
    </View>
  );
};

/** A small circular icon button for the Actions column. */
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
  currentUserId: number | undefined;
  canManage: boolean;
  isCompanyAdmin: boolean;
  onView: (u: StaffUser) => void;
  onEdit: (u: StaffUser) => void;
  onStatusPress: (u: StaffUser) => void;
  onResend: (u: StaffUser) => void;
  onDelete: (u: StaffUser) => void;
};

function buildColumns(h: Handlers): TableColumn<StaffUser>[] {
  return [
    {
      key: "account",
      label: "Account",
      width: 170,
      render: (u) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {u.name}
          </Text>
          {!!u.employeeId && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            >
              {u.employeeId}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      width: 210,
      render: (u) => (
        <View>
          <View className="flex-row items-center gap-1.5">
            <Feather name="mail" size={12} color="#9CA3AF" />
            <Text
              numberOfLines={1}
              className="text-sm text-gray-600 dark:text-gray-300 flex-1"
            >
              {u.email}
            </Text>
          </View>
          {!!u.phone && (
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Feather name="phone" size={12} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="text-xs text-gray-500 dark:text-gray-400"
              >
                {u.phone}
              </Text>
            </View>
          )}
        </View>
      ),
    },
    {
      key: "typeLocation",
      label: "Type & Location",
      width: 180,
      render: (u) => (
        <View>
          <RoleBadge role={u.role} />
          {!!u.locationName && (
            <View className="flex-row items-center gap-1.5 mt-1.5">
              <Feather name="map-pin" size={12} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="text-xs text-gray-500 dark:text-gray-400 flex-1"
              >
                {u.locationName}
              </Text>
            </View>
          )}
        </View>
      ),
    },
    {
      key: "department",
      label: "Department",
      width: 140,
      render: (u) =>
        u.department ? (
          <View className="flex-row">
            <View className="px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20">
              <Text
                numberOfLines={1}
                className="text-[10px] font-medium text-blue-700 dark:text-blue-300"
              >
                {u.department}
              </Text>
            </View>
          </View>
        ) : (
          <Text className="text-sm text-gray-400 dark:text-gray-500">—</Text>
        ),
    },
    {
      key: "lastLogin",
      label: "Last Login",
      width: 110,
      render: (u) => (
        <Text
          numberOfLines={1}
          className="text-sm text-gray-600 dark:text-gray-300"
        >
          {formatLastLogin(u.lastLogin)}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (u) => {
        const tone = STATUS_TONE[u.status] ?? STATUS_TONE.inactive;
        const canChange = h.canManage && u.id !== h.currentUserId;
        return (
          <Pressable
            onPress={() => canChange && h.onStatusPress(u)}
            disabled={!canChange}
            className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${tone} ${
              canChange ? "active:opacity-70" : ""
            }`}
          >
            <Text className={`text-[11px] font-semibold capitalize ${tone}`}>
              {u.status}
            </Text>
            {canChange && (
              <Feather name="chevron-down" size={12} color="#6B7280" />
            )}
          </Pressable>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      width: 150,
      render: (u) => {
        const isSelf = u.id === h.currentUserId;
        return (
          <View className="flex-row items-center gap-0.5">
            <IconAction
              icon="eye"
              tint={PRIMARY}
              label={`View ${u.name}`}
              onPress={() => h.onView(u)}
            />
            {h.canManage && !isSelf && (
              <IconAction
                icon="edit-2"
                tint="#6B7280"
                label={`Edit ${u.name}`}
                onPress={() => h.onEdit(u)}
              />
            )}
            {h.isCompanyAdmin && !isSelf && (
              <IconAction
                icon="key"
                tint={PRIMARY}
                label={`Resend credentials to ${u.name}`}
                onPress={() => h.onResend(u)}
              />
            )}
            {h.isCompanyAdmin && !isSelf && (
              <IconAction
                icon="trash-2"
                tint="#EF4444"
                label={`Delete ${u.name}`}
                onPress={() => h.onDelete(u)}
              />
            )}
          </View>
        );
      },
    },
  ];
}

/**
 * Table layout for Manage Accounts — a thin wrapper over the generic
 * SelectableTable defining the web-parity account columns (Account · Contact ·
 * Type & Location · Department · Last Login · Status · Actions). The Status cell
 * is a tap-to-change dropdown and the Actions cell carries the same inline
 * view / edit / resend-credentials / delete controls as the web admin table.
 * Selection checkboxes and the header select-all come from SelectableTable.
 */
export function AccountsTable({
  accounts,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  ...handlers
}: {
  accounts: StaffUser[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (u: StaffUser) => void;
} & Handlers) {
  const columns = useMemo(
    () => buildColumns(handlers),
    // Rebuild when the permission flags / current user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      handlers.canManage,
      handlers.isCompanyAdmin,
      handlers.currentUserId,
      handlers.onView,
      handlers.onEdit,
      handlers.onStatusPress,
      handlers.onResend,
      handlers.onDelete,
    ],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={accounts}
      rowId={(u) => u.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(u) => u.name}
    />
  );
}
