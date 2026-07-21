import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import type {
  FeeSupportEntityType,
  FeeSupportRow,
} from "../../services/feeSupportService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

// Comfortable, SaaS-style row rhythm (matches AttractionsTable).
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const ENTITY_META: Record<
  FeeSupportEntityType,
  { icon: ComponentIconName; label: string }
> = {
  package: { icon: "package", label: "Package" },
  attraction: { icon: "zap", label: "Attraction" },
  event: { icon: "calendar", label: "Event" },
  membership: { icon: "credit-card", label: "Membership" },
};

/** Interactive status pill — same behaviour as the card's status toggle. */
const StatusBadge = ({
  status,
  busy,
  onPress,
}: {
  status: FeeSupportRow["status"];
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

/** Column-visibility toggles shared with the card view. */
export type FeeColKey =
  | "amount"
  | "calculation"
  | "application"
  | "entityType"
  | "entities"
  | "location"
  | "status";
export type FeeCols = Record<FeeColKey, boolean>;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

const locationLabel = (row: FeeSupportRow) =>
  row.locationName && row.companyName
    ? `${row.locationName} | ${row.companyName}`
    : row.locationName || row.companyName || "All Locations";

type RowContext = {
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type Column = {
  key: FeeColKey | "feeName" | "actions";
  label: string;
  width: number;
  /** Undefined for always-on columns (feeName / actions). */
  toggle?: FeeColKey;
  render: (row: FeeSupportRow, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "feeName",
    label: "Fee Name",
    width: 200,
    render: (row) => (
      <Text
        numberOfLines={2}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        {row.feeName}
      </Text>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    width: 120,
    toggle: "amount",
    render: (row) => (
      <Text
        numberOfLines={1}
        className="text-sm font-bold text-[#0644C7] dark:text-blue-300"
      >
        {row.amountLabel}
      </Text>
    ),
  },
  {
    key: "calculation",
    label: "Calculation",
    width: 130,
    toggle: "calculation",
    render: (row) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {row.calculationType === "percentage" ? "Percentage" : "Fixed"}
      </Text>
    ),
  },
  {
    key: "application",
    label: "Application",
    width: 130,
    toggle: "application",
    render: (row) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {row.applicationType === "additive" ? "Additive" : "Inclusive"}
      </Text>
    ),
  },
  {
    key: "entityType",
    label: "Entity Type",
    width: 150,
    toggle: "entityType",
    render: (row) => {
      const entity = ENTITY_META[row.entityType];
      return (
        <View className="flex-row items-center gap-1.5">
          <Feather name={entity.icon} size={13} color="#9CA3AF" />
          <Text numberOfLines={1} className={CELL_TEXT}>
            {entity.label}
          </Text>
        </View>
      );
    },
  },
  {
    key: "entities",
    label: "Entities",
    width: 110,
    toggle: "entities",
    render: (row) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {row.entityCount} item{row.entityCount === 1 ? "" : "s"}
      </Text>
    ),
  },
  {
    key: "location",
    label: "Location",
    width: 190,
    toggle: "location",
    render: (row) => (
      <View className="flex-row items-center gap-1.5">
        <Feather name="map-pin" size={13} color="#9CA3AF" />
        <Text numberOfLines={2} className={CELL_TEXT}>
          {locationLabel(row)}
        </Text>
      </View>
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
          accessibilityLabel="Edit fee support"
        >
          <Feather name="edit-2" size={15} color="#6B7280" />
        </Pressable>
        <Pressable
          onPress={ctx.onDelete}
          className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Delete fee support"
        >
          <Feather name="trash-2" size={15} color="#EF4444" />
        </Pressable>
      </View>
    ),
  },
];

/**
 * Table layout for the Fee Supports list. The whole grid scrolls horizontally
 * (fixed per-column widths keep header + rows aligned); columns respect the
 * same visibility toggles as the card view. Renders from the same
 * `FeeSupportRow[]` — no separate data source, no refetch on layout switch.
 */
export const FeeSupportTable = memo(function FeeSupportTable({
  rows,
  cols,
  busyId,
  onToggle,
  onEdit,
  onDelete,
}: {
  rows: FeeSupportRow[];
  cols: FeeCols;
  busyId: number | null;
  onToggle: (row: FeeSupportRow) => void;
  onEdit: (row: FeeSupportRow) => void;
  onDelete: (row: FeeSupportRow) => void;
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
