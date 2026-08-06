import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { experienceMonths, type StaffUser } from "../../services/usersService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

const STATUS_TONE: Record<string, string> = {
  active:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  inactive: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
};

const departmentTone = (department: string) =>
  department === "Security"
    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
    : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";

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
  onView: (u: StaffUser) => void;
  onEdit: (u: StaffUser) => void;
  onStatusPress: (u: StaffUser) => void;
  onDelete: (u: StaffUser) => void;
};

function buildColumns(h: Handlers): TableColumn<StaffUser>[] {
  return [
    {
      key: "attendant",
      label: "Attendant",
      width: 180,
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
              ID: {u.employeeId}
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
      key: "position",
      label: "Position",
      width: 150,
      render: (u) => (
        <Text
          numberOfLines={1}
          className="text-sm text-gray-900 dark:text-white"
        >
          {u.position || "—"}
        </Text>
      ),
    },
    {
      key: "department",
      label: "Department",
      width: 160,
      render: (u) =>
        u.department ? (
          <View className="flex-row">
            <View
              className={`px-2.5 py-1 rounded-full ${departmentTone(u.department)}`}
            >
              <Text
                numberOfLines={1}
                className={`text-[11px] font-medium ${departmentTone(u.department)}`}
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
      key: "experience",
      label: "Experience",
      width: 120,
      render: (u) => (
        <View className="flex-row items-center gap-1.5">
          <Feather name="award" size={12} color="#9CA3AF" />
          <Text
            numberOfLines={1}
            className="text-sm text-gray-600 dark:text-gray-300"
          >
            {experienceMonths(u.hireDate)} months
          </Text>
        </View>
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
      width: 130,
      render: (u) => {
        const manageable = h.canManage && u.id !== h.currentUserId;
        return (
          <View className="flex-row items-center gap-0.5">
            <IconAction
              icon="eye"
              tint={PRIMARY}
              label={`View ${u.name}`}
              onPress={() => h.onView(u)}
            />
            {manageable && (
              <IconAction
                icon="edit-2"
                tint="#6B7280"
                label={`Edit ${u.name}`}
                onPress={() => h.onEdit(u)}
              />
            )}
            {manageable && (
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

export function AttendantsTable({
  attendants,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  ...handlers
}: {
  attendants: StaffUser[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (u: StaffUser) => void;
} & Handlers) {
  const columns = useMemo(
    () => buildColumns(handlers),
    [
      handlers.canManage,
      handlers.currentUserId,
      handlers.onView,
      handlers.onEdit,
      handlers.onStatusPress,
      handlers.onDelete,
    ],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={attendants}
      rowId={(u) => u.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(u) => u.name}
    />
  );
}
