import { Text, View } from "react-native";

import type { MembershipRow } from "../../services/membershipsService";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusBadge } from "./StatusBadge";

/** "6/2/2026"; em-dash when absent/unparseable. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Columns mirror the web admin's default set: Member, Plan, Status, Started, Renews.
const COLUMNS: TableColumn<MembershipRow>[] = [
  {
    key: "member",
    label: "Member",
    width: 210,
    render: (m) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {m.memberName}
        </Text>
        {!!m.memberEmail && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            {m.memberEmail}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    width: 150,
    render: (m) => (
      <Text
        numberOfLines={1}
        className="text-sm text-gray-700 dark:text-gray-200"
      >
        {m.planLabel}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 120,
    render: (m) => (
      <View className="flex-row">
        <StatusBadge status={m.status} />
      </View>
    ),
  },
  {
    key: "started",
    label: "Started",
    width: 120,
    render: (m) => (
      <Text className="text-sm text-gray-700 dark:text-gray-200">
        {formatDate(m.startedAt)}
      </Text>
    ),
  },
  {
    key: "renews",
    label: "Renews",
    width: 120,
    render: (m) => (
      <Text className="text-sm text-gray-700 dark:text-gray-200">
        {formatDate(m.renewsAt)}
      </Text>
    ),
  },
];

/** Table view for the Memberships list — thin wrapper over SelectableTable. */
export function MembershipsTable({
  memberships,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
}: {
  memberships: MembershipRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (m: MembershipRow) => void;
}) {
  return (
    <SelectableTable
      columns={COLUMNS}
      rows={memberships}
      rowId={(m) => m.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(m) => `membership for ${m.memberName}`}
    />
  );
}
