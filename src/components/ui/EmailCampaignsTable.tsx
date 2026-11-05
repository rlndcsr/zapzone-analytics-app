import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { campaignDisplayStatus, isScheduledCampaign } from "../../lib/email/campaignSchedule";
import type { EmailCampaignRow } from "../../services/emailService";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { ToneDotBadge, type DotTone } from "./SummaryPanel";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

// Same status colours the campaign pills have always used.
const CAMPAIGN_TONE: Record<string, DotTone> = {
  completed: "green",
  sending: "blue",
  scheduled: "amber",
  failed: "red",
};

/** Campaign status pill with a dot — used by the table and the card list. */
export const CampaignStatusBadge = ({ campaign }: { campaign: EmailCampaignRow }) => (
  <ToneDotBadge
    tone={CAMPAIGN_TONE[campaignDisplayStatus(campaign.status, campaign.scheduledAt)] ?? "gray"}
    label={campaign.statusLabel}
  />
);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO -> "Jan 3, 2026, 8:22 AM". */
export function fmtCampaignDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
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
        <Text className={CELL_TEXT}>{c.recipients}</Text>
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 130,
    render: (c) => (
      <View className="flex-row">
        <CampaignStatusBadge campaign={c} />
      </View>
    ),
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
    render: (c) =>
      isScheduledCampaign(c.status, c.scheduledAt) ? (
        <Text numberOfLines={2} className="text-sm text-amber-700 dark:text-amber-300">
          {`Scheduled for ${fmtCampaignDateTime(c.scheduledAt)}`}
        </Text>
      ) : (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {fmtCampaignDateTime(c.sentAt)}
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
        <RowActionGroup
          actions={[
            { key: "view", icon: "eye", color: "#6B7280", label: `View ${c.name}`, onPress: () => h.onView(c) },
            canCancel && {
              key: "cancel",
              icon: "slash",
              color: "#D97706",
              label: `Cancel ${c.name}`,
              onPress: () => h.onCancel(c),
            },
            canDelete && {
              key: "delete",
              icon: "trash-2",
              color: "#DC2626",
              label: `Delete ${c.name}`,
              onPress: () => h.onDelete(c),
            },
          ]}
        />
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
      rowLabel={(c) => c.name}
      flat
    />
  );
}
