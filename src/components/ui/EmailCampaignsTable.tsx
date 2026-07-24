import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { EmailCampaignRow } from "../../services/emailService";
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO -> "Jan 3, 2026, 8:22 AM". */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

// Same status colors as the Campaigns card view.
function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "sending":
      return { pill: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" };
    case "scheduled":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}

type Handlers = {
  onView: (c: EmailCampaignRow) => void;
  onCancel: (c: EmailCampaignRow) => void;
  onDelete: (c: EmailCampaignRow) => void;
};

// Columns mirror the web `/admin/email/campaigns` default-visible set + order:
// Campaign (name + subject) · Recipients · Status · Progress · Sent At · Actions.
function buildColumns(h: Handlers): TableColumn<EmailCampaignRow>[] {
  return [
  {
    key: "campaign",
    label: "Campaign",
    width: 220,
    render: (c) => (
      <View>
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {c.name}
        </Text>
        {!!c.subject && (
          <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {c.subject}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "recipients",
    label: "Recipients",
    width: 120,
    render: (c) => (
      <View className="flex-row items-center gap-1.5">
        <Feather name="users" size={13} color="#9CA3AF" />
        <Text className="text-sm text-gray-600 dark:text-gray-300">{c.recipients}</Text>
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 130,
    render: (c) => {
      const p = statusPill(c.status);
      return (
        <View className="flex-row">
          <View className={`px-2.5 py-1 rounded-full ${p.pill}`}>
            <Text className={`text-xs font-semibold ${p.text}`}>{c.statusLabel}</Text>
          </View>
        </View>
      );
    },
  },
  {
    key: "progress",
    label: "Progress",
    width: 170,
    render: (c) => {
      const pct = c.recipients > 0 ? Math.round((c.sentCount / c.recipients) * 100) : 0;
      return (
        <View>
          <Text numberOfLines={1} className="text-xs text-gray-600 dark:text-gray-300">
            {c.sentCount}/{c.recipients} sent
            {c.failedCount > 0 ? (
              <Text className="text-red-500"> ({c.failedCount} failed)</Text>
            ) : null}
          </Text>
          <View className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 mt-1.5 overflow-hidden">
            <View
              className={`h-full rounded-full ${c.failedCount > 0 ? "bg-amber-500" : "bg-[#0644C7]"}`}
              style={{ width: `${pct}%` }}
            />
          </View>
        </View>
      );
    },
  },
  {
    key: "sentAt",
    label: "Sent At",
    width: 170,
    render: (c) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {fmtDateTime(c.sentAt)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 140,
    render: (c) => {
      const canCancel = c.status === "pending" || c.status === "sending";
      const canDelete =
        c.status === "completed" || c.status === "cancelled" || c.status === "failed";
      return (
        <View className="flex-row items-center gap-0.5">
          <IconAction icon="eye" tint={PRIMARY} label={`View ${c.name}`} onPress={() => h.onView(c)} />
          {canCancel && (
            <IconAction icon="slash" tint="#D97706" label={`Cancel ${c.name}`} onPress={() => h.onCancel(c)} />
          )}
          {canDelete && (
            <IconAction icon="trash-2" tint="#EF4444" label={`Delete ${c.name}`} onPress={() => h.onDelete(c)} />
          )}
        </View>
      );
    },
  },
  ];
}

/** Table view for Email Campaigns — thin wrapper over the shared SelectableTable. */
export function EmailCampaignsTable({
  campaigns,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onCancel,
  onDelete,
}: {
  campaigns: EmailCampaignRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (c: EmailCampaignRow) => void;
  onCancel: (c: EmailCampaignRow) => void;
  onDelete: (c: EmailCampaignRow) => void;
}) {
  const columns = useMemo(
    () => buildColumns({ onView: onRowPress, onCancel, onDelete }),
    [onRowPress, onCancel, onDelete],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={campaigns}
      rowId={(c) => c.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
    />
  );
}
