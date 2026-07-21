import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import type {
  SpecialPricingEntityType,
  SpecialPricingRow,
} from "../../services/specialPricingService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

// Comfortable, SaaS-style row rhythm (matches AttractionsTable). These are
// floors — real cell padding does the breathing so rows stay centered.
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const ENTITY_META: Record<
  SpecialPricingEntityType,
  { icon: ComponentIconName; label: string }
> = {
  attraction: { icon: "zap", label: "Attraction" },
  package: { icon: "package", label: "Package" },
  event: { icon: "calendar", label: "Event" },
  all: { icon: "grid", label: "All Entities" },
};

/** Interactive status pill — same behaviour as the card's status toggle. */
const StatusBadge = ({
  status,
  busy,
  onPress,
}: {
  status: SpecialPricingRow["status"];
  busy: boolean;
  onPress: () => void;
}) => {
  const active = status === "active";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={active ? "Deactivate" : "Activate"}
      className={`flex-row items-center gap-1 self-start px-2.5 py-1 rounded-full ${
        active
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={active ? "#16A34A" : "#9CA3AF"} />
      ) : (
        <Feather name="power" size={11} color={active ? "#16A34A" : "#9CA3AF"} />
      )}
      <Text
        className={`text-xs font-semibold ${
          active
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </Text>
    </Pressable>
  );
};

const Chip = ({
  icon,
  label,
}: {
  icon: ComponentIconName;
  label: string;
}) => (
  <View className="flex-row items-center gap-1 self-start bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
    <Feather name={icon} size={11} color={PRIMARY} />
    <Text
      numberOfLines={1}
      className="text-xs font-medium text-[#0644C7] dark:text-blue-300"
    >
      {label}
    </Text>
  </View>
);

/** Column-visibility toggles shared with the card view. */
export type SpColKey =
  | "discount"
  | "recurrence"
  | "entity"
  | "priority"
  | "stackable"
  | "status";
export type SpCols = Record<SpColKey, boolean>;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

type Column = {
  key: SpColKey | "name" | "actions";
  label: string;
  width: number;
  /** Undefined for always-on columns (name / actions). */
  toggle?: SpColKey;
  render: (row: SpecialPricingRow, ctx: RowContext) => ReactNode;
};

type RowContext = {
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Name",
    width: 220,
    render: (row) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {row.name}
        </Text>
        {!!row.description && (
          <Text
            numberOfLines={2}
            className="text-xs text-gray-500 dark:text-gray-400 leading-4 mt-0.5"
          >
            {row.description}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "discount",
    label: "Discount",
    width: 140,
    toggle: "discount",
    render: (row) => (
      <Chip
        icon={row.discountType === "percentage" ? "percent" : "dollar-sign"}
        label={row.discountLabel}
      />
    ),
  },
  {
    key: "recurrence",
    label: "Recurrence",
    width: 150,
    toggle: "recurrence",
    render: (row) =>
      row.recurrenceDisplay ? (
        <Chip icon="repeat" label={row.recurrenceDisplay} />
      ) : (
        <Text className={CELL_TEXT}>—</Text>
      ),
  },
  {
    key: "entity",
    label: "Entity Type",
    width: 150,
    toggle: "entity",
    render: (row) => {
      const entity = ENTITY_META[row.entityType];
      return <Chip icon={entity.icon} label={entity.label} />;
    },
  },
  {
    key: "priority",
    label: "Priority",
    width: 90,
    toggle: "priority",
    render: (row) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {row.priority}
      </Text>
    ),
  },
  {
    key: "stackable",
    label: "Stackable",
    width: 100,
    toggle: "stackable",
    render: (row) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {row.isStackable ? "Yes" : "No"}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 120,
    toggle: "status",
    render: (row, ctx) => (
      <StatusBadge status={row.status} busy={ctx.busy} onPress={ctx.onToggle} />
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 110,
    render: (_row, ctx) => (
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={ctx.onEdit}
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Edit special pricing"
        >
          <Feather name="edit-2" size={15} color="#6B7280" />
        </Pressable>
        <Pressable
          onPress={ctx.onDelete}
          className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Delete special pricing"
        >
          <Feather name="trash-2" size={15} color="#EF4444" />
        </Pressable>
      </View>
    ),
  },
];

/**
 * Table layout for the Special Pricing list. The whole grid scrolls
 * horizontally (fixed per-column widths keep header + rows aligned); columns
 * respect the same visibility toggles as the card view. Renders from the same
 * `SpecialPricingRow[]` — no separate data source, no refetch on layout switch.
 */
export const SpecialPricingTable = memo(function SpecialPricingTable({
  rows,
  cols,
  busyId,
  onToggle,
  onEdit,
  onDelete,
}: {
  rows: SpecialPricingRow[];
  cols: SpCols;
  busyId: number | null;
  onToggle: (row: SpecialPricingRow) => void;
  onEdit: (row: SpecialPricingRow) => void;
  onDelete: (row: SpecialPricingRow) => void;
}) {
  const visible = COLUMNS.filter((c) => !c.toggle || cols[c.toggle]);
  const tableWidth = visible.reduce((sum, c) => sum + c.width, 0);

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {visible.map((col) => (
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
          {rows.map((row, i) => {
            const ctx: RowContext = {
              busy: busyId === row.id,
              onToggle: () => onToggle(row),
              onEdit: () => onEdit(row),
              onDelete: () => onDelete(row),
            };
            return (
              <View
                key={row.id}
                className={`flex-row items-center ${
                  i < rows.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={{ minHeight: ROW_MIN_HEIGHT }}
              >
                {visible.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(row, ctx)}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
