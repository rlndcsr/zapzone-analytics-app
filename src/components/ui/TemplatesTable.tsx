import { Ionicons } from "@expo/vector-icons";
import { DoorOpen } from "lucide-react-native";
import { memo, useMemo } from "react";
import { Text, View } from "react-native";

import { formatDateET } from "../../lib/date/venueTime";
import {
  isEscapeRoomTemplate,
  templateAssignmentLabel,
  templateDefaultLabel,
} from "../../lib/waivers/templateDisplay";
import type { TemplateStatus, WaiverTemplate } from "../../services/waiversService";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { ToneDotBadge, type DotTone } from "./SummaryPanel";

const PRIMARY = "#0644C7";
const NEUTRAL = "#6B7280";

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Instant → the venue's calendar date (see lib/date/venueTime). */
export function formatTemplateDate(dateStr: string | null): string {
  return formatDateET(dateStr, { month: "short", fallback: dateStr ?? "—" });
}

// Same colour families as the web admin's template status pills.
const STATUS_TONE: Record<TemplateStatus | "deleted", DotTone> = {
  active: "green",
  draft: "amber",
  inactive: "gray",
  archived: "gray",
  deleted: "red",
};

export const TemplateStatusPill = ({
  status,
}: {
  status: TemplateStatus | "deleted";
}) => (
  <ToneDotBadge
    tone={STATUS_TONE[status] ?? "gray"}
    label={status.charAt(0).toUpperCase() + status.slice(1)}
  />
);

/** The web's violet "Escape room" tag beside an escape-room template's title. */
export const EscapeRoomTag = () => (
  <View className="self-start px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30">
    <Text className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
      Escape room
    </Text>
  </View>
);

export const doorIcon = (color: string, size: number) => (
  <DoorOpen size={size} color={color} />
);

const megaphoneIcon = (color: string, size: number) => (
  <Ionicons name="megaphone-outline" size={size} color={color} />
);

type Handlers = {
  deleted: boolean;
  canManage: boolean;
  isCompanyAdmin: boolean;
  busy: boolean;
  onKiosk: (t: WaiverTemplate) => void;
  onEscapeRooms: (t: WaiverTemplate) => void;
  onEdit: (t: WaiverTemplate) => void;
  onAds: (t: WaiverTemplate) => void;
  onToggleStatus: (t: WaiverTemplate) => void;
  onDelete: (t: WaiverTemplate) => void;
  onRestore: (t: WaiverTemplate) => void;
  onForceDelete: (t: WaiverTemplate) => void;
};

// Columns mirror the web Templates table: Title · Status · Version · Default ·
// Assignments · Updated, then the row actions.
function buildColumns(h: Handlers): TableColumn<WaiverTemplate>[] {
  return [
    {
      key: "title",
      label: "Template",
      width: 240,
      render: (t) => (
        <View className="gap-0.5">
          <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
            {t.title}
          </Text>
          {isEscapeRoomTemplate(t) && <EscapeRoomTag />}
          {!!t.internalDescription && (
            <Text numberOfLines={1} className="text-xs text-gray-400 dark:text-gray-500">
              {t.internalDescription}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (t) => (
        <View className="flex-row">
          <TemplateStatusPill status={h.deleted ? "deleted" : t.status} />
        </View>
      ),
    },
    {
      key: "version",
      label: "Version",
      width: 90,
      render: (t) => <Text className={CELL_TEXT}>v{t.currentVersion}</Text>,
    },
    {
      key: "default",
      label: "Default",
      width: 160,
      render: (t) => {
        const label = templateDefaultLabel(t);
        return label ? (
          <Text numberOfLines={1} className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
            {label}
          </Text>
        ) : (
          <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>
        );
      },
    },
    {
      key: "assigned",
      label: "Assignments",
      width: 140,
      render: (t) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {templateAssignmentLabel(t)}
        </Text>
      ),
    },
    {
      key: "updated",
      label: h.deleted ? "Deleted" : "Updated",
      width: 130,
      render: (t) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {formatTemplateDate(h.deleted ? (t.deletedAt ?? null) : t.updatedAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: 210,
      render: (t) =>
        h.deleted ? (
          <RowActionGroup
            actions={[
              h.canManage && {
                key: "restore",
                icon: "rotate-ccw",
                color: "#059669",
                label: `Restore ${t.title}`,
                disabled: h.busy,
                onPress: () => h.onRestore(t),
              },
              h.isCompanyAdmin && {
                key: "force-delete",
                icon: "trash-2",
                color: "#DC2626",
                label: `Delete ${t.title} permanently`,
                disabled: h.busy,
                onPress: () => h.onForceDelete(t),
              },
            ]}
          />
        ) : (
          <RowActionGroup
            actions={[
              // Escape-room waivers are signed from the escape-room check-in,
              // so the web swaps the kiosk button for a link to Escape Rooms.
              isEscapeRoomTemplate(t)
                ? {
                    key: "escape-rooms",
                    icon: "log-in",
                    renderIcon: doorIcon,
                    color: NEUTRAL,
                    label: `Open Escape Rooms for ${t.title}`,
                    disabled: h.busy,
                    onPress: () => h.onEscapeRooms(t),
                  }
                : {
                    key: "kiosk",
                    icon: "tablet",
                    color: NEUTRAL,
                    label: t.status === "active" ? `Launch kiosk for ${t.title}` : `Test kiosk for ${t.title}`,
                    disabled: h.busy,
                    onPress: () => h.onKiosk(t),
                  },
              h.canManage && {
                key: "power",
                icon: "power",
                color: t.status === "active" ? "#059669" : "#9CA3AF",
                label: t.status === "active" ? `Deactivate ${t.title}` : `Activate ${t.title}`,
                disabled: h.busy,
                onPress: () => h.onToggleStatus(t),
              },
              h.canManage && {
                key: "edit",
                icon: "edit-2",
                color: PRIMARY,
                label: `Edit ${t.title}`,
                disabled: h.busy,
                onPress: () => h.onEdit(t),
              },
              h.canManage && {
                key: "ads",
                icon: "volume-2",
                renderIcon: megaphoneIcon,
                color: NEUTRAL,
                label: `Post-waiver ads for ${t.title}`,
                disabled: h.busy,
                onPress: () => h.onAds(t),
              },
              h.canManage && {
                key: "delete",
                icon: "trash-2",
                color: "#DC2626",
                label: `Delete ${t.title}`,
                disabled: h.busy,
                onPress: () => h.onDelete(t),
              },
            ]}
          />
        ),
    },
  ];
}

/**
 * Table layout for the Waiver Templates list, on the shared flat table. Rows
 * are deliberately not tappable — a whole-row target makes it too easy to open
 * the editor while scrolling sideways — so everything goes through Actions.
 */
export const TemplatesTable = memo(function TemplatesTable({
  templates,
  ...handlers
}: { templates: WaiverTemplate[] } & Handlers) {
  const {
    deleted,
    canManage,
    isCompanyAdmin,
    busy,
    onKiosk,
    onEscapeRooms,
    onEdit,
    onAds,
    onToggleStatus,
    onDelete,
    onRestore,
    onForceDelete,
  } = handlers;
  const columns = useMemo(
    () =>
      buildColumns({
        deleted,
        canManage,
        isCompanyAdmin,
        busy,
        onKiosk,
        onEscapeRooms,
        onEdit,
        onAds,
        onToggleStatus,
        onDelete,
        onRestore,
        onForceDelete,
      }),
    [
      deleted,
      canManage,
      isCompanyAdmin,
      busy,
      onKiosk,
      onEscapeRooms,
      onEdit,
      onAds,
      onToggleStatus,
      onDelete,
      onRestore,
      onForceDelete,
    ],
  );
  return <SelectableTable columns={columns} rows={templates} rowId={(t) => t.id} flat />;
});
