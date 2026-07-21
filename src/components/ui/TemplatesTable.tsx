import { Feather } from "@expo/vector-icons";
import { memo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { WaiverTemplate } from "../../services/waiversService";
import { StatusBadge } from "./StatusBadge";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type RowContext = {
  deleted: boolean;
  canManage: boolean;
  isCompanyAdmin: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onForceDelete: () => void;
};

/** Small square icon button used in the Actions cell. */
const IconButton = ({
  icon,
  color,
  bg,
  label,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  bg: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 rounded-lg items-center justify-center ${bg} ${
      disabled ? "opacity-40" : "active:opacity-70"
    }`}
  >
    <Feather name={icon} size={15} color={color} />
  </Pressable>
);

type Column = {
  key: string;
  label: string;
  width: number;
  render: (t: WaiverTemplate, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "title",
    label: "Template",
    width: 240,
    render: (t) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {t.title}
        </Text>
        {!!t.internalDescription && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
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
    render: (t, ctx) => (
      <View className="flex-row">
        <StatusBadge status={ctx.deleted ? "deleted" : t.status} />
      </View>
    ),
  },
  {
    key: "version",
    label: "Version",
    width: 100,
    render: (t) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        v{t.currentVersion}
      </Text>
    ),
  },
  {
    key: "default",
    label: "Default",
    width: 100,
    render: (t) =>
      t.isDefault ? (
        <View className="flex-row">
          <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
              Default
            </Text>
          </View>
        </View>
      ) : (
        <Text className={CELL_TEXT}>—</Text>
      ),
  },
  {
    key: "assigned",
    label: "Assigned",
    width: 120,
    render: (t) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {t.assignmentCount} assigned
      </Text>
    ),
  },
  {
    key: "updated",
    label: "Updated",
    width: 140,
    render: (t, ctx) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {ctx.deleted ? "Deleted " : ""}
        {formatDate(t.updatedAt)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 150,
    render: (_t, ctx) => {
      // Active view: edit · power · delete (manage only). Trash view: restore
      // (manage) · delete-forever (admin). Mirrors the web row action icons.
      if (!ctx.deleted) {
        if (!ctx.canManage) return <Text className={CELL_TEXT}>—</Text>;
        return (
          <View className="flex-row items-center gap-2">
            <IconButton
              icon="edit-2"
              color="#6B7280"
              bg="bg-gray-100 dark:bg-neutral-800"
              label="Edit template"
              disabled={ctx.busy}
              onPress={ctx.onEdit}
            />
            <IconButton
              icon="power"
              color="#F59E0B"
              bg="bg-amber-50 dark:bg-amber-900/20"
              label="Toggle template status"
              disabled={ctx.busy}
              onPress={ctx.onToggleStatus}
            />
            <IconButton
              icon="trash-2"
              color="#EF4444"
              bg="bg-red-50 dark:bg-red-900/30"
              label="Delete template"
              disabled={ctx.busy}
              onPress={ctx.onDelete}
            />
          </View>
        );
      }
      if (!ctx.canManage && !ctx.isCompanyAdmin)
        return <Text className={CELL_TEXT}>—</Text>;
      return (
        <View className="flex-row items-center gap-2">
          {ctx.canManage && (
            <IconButton
              icon="rotate-ccw"
              color="#10B981"
              bg="bg-emerald-50 dark:bg-emerald-900/20"
              label="Restore template"
              disabled={ctx.busy}
              onPress={ctx.onRestore}
            />
          )}
          {ctx.isCompanyAdmin && (
            <IconButton
              icon="trash"
              color="#EF4444"
              bg="bg-red-50 dark:bg-red-900/30"
              label="Delete template permanently"
              disabled={ctx.busy}
              onPress={ctx.onForceDelete}
            />
          )}
        </View>
      );
    },
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for the Waiver Templates list. Horizontally scrollable with
 * fixed column widths. Each row is a Pressable (same tap target as the card);
 * the trailing Actions cell opens the per-template actions sheet.
 */
export const TemplatesTable = memo(function TemplatesTable({
  templates,
  deleted,
  canManage,
  isCompanyAdmin,
  busy,
  onRowPress,
  onEdit,
  onToggleStatus,
  onDelete,
  onRestore,
  onForceDelete,
}: {
  templates: WaiverTemplate[];
  deleted: boolean;
  canManage: boolean;
  isCompanyAdmin: boolean;
  busy: boolean;
  onRowPress: (t: WaiverTemplate) => void;
  onEdit: (t: WaiverTemplate) => void;
  onToggleStatus: (t: WaiverTemplate) => void;
  onDelete: (t: WaiverTemplate) => void;
  onRestore: (t: WaiverTemplate) => void;
  onForceDelete: (t: WaiverTemplate) => void;
}) {
  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: TABLE_WIDTH }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {COLUMNS.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {templates.map((t, i) => {
            const ctx: RowContext = {
              deleted,
              canManage,
              isCompanyAdmin,
              busy,
              onEdit: () => onEdit(t),
              onToggleStatus: () => onToggleStatus(t),
              onDelete: () => onDelete(t),
              onRestore: () => onRestore(t),
              onForceDelete: () => onForceDelete(t),
            };
            return (
              <Pressable
                key={t.id}
                onPress={() => onRowPress(t)}
                accessibilityRole="button"
                accessibilityLabel={`Template ${t.title}`}
                className={`flex-row items-center ${
                  i < templates.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={({ pressed }) => ({
                  minHeight: ROW_MIN_HEIGHT,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {COLUMNS.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(t, ctx)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
