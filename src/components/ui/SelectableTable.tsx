import { Feather } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

// Comfortable, SaaS-style row rhythm (shared with the Attractions table look).
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 68;
const CHECKBOX_WIDTH = 48;

export type TableColumn<T> = {
  key: string;
  label: string;
  width: number;
  render: (row: T) => ReactNode;
};

/**
 * Selection checkbox cell. A nested Pressable so it handles its own touch —
 * toggling selection without triggering the row's press. `state` drives the
 * icon: unchecked / checked / the header's indeterminate dash.
 */
const CheckboxCell = ({
  state,
  onPress,
  label,
}: {
  state: "off" | "on" | "some";
  onPress: () => void;
  label: string;
}) => (
  <View
    className="items-center justify-center"
    style={{ width: CHECKBOX_WIDTH }}
  >
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "on" }}
      accessibilityLabel={label}
      className="active:opacity-60"
    >
      <Feather
        name={
          state === "on"
            ? "check-square"
            : state === "some"
              ? "minus-square"
              : "square"
        }
        size={19}
        color={state === "off" ? "#9CA3AF" : "#0644C7"}
      />
    </Pressable>
  </View>
);

type Props<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  /** Stable numeric id for a row (selection key + React key). */
  rowId: (row: T) => number;
  /** Tapping a row (anywhere but the checkbox) opens its detail. */
  onRowPress: (row: T) => void;
  /** Selected ids — the single source of truth lives in the parent screen. */
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll: () => void;
  /** Accessible verb for a row's checkbox, e.g. "booking for Jane". */
  rowLabel?: (row: T) => string;
};

/**
 * Generic, horizontally-scrollable, selectable data table — the shared table
 * architecture behind the Attractions/Bookings table views. Fixed per-column
 * widths keep the header and rows aligned; each row is a single Pressable that
 * opens its detail (the checkbox cell handles its own touch), and a header
 * checkbox drives current-page select-all with an indeterminate state. Renders
 * from whatever row array it's given — no data fetching of its own.
 */
function SelectableTableInner<T>({
  columns,
  rows,
  rowId,
  onRowPress,
  selectedIds,
  onToggleRow,
  onToggleAll,
  rowLabel,
}: Props<T>) {
  const tableWidth =
    CHECKBOX_WIDTH + columns.reduce((sum, c) => sum + c.width, 0);

  const selectedOnPage = rows.reduce(
    (n, r) => (selectedIds.has(rowId(r)) ? n + 1 : n),
    0,
  );
  const headerState: "off" | "on" | "some" =
    rows.length > 0 && selectedOnPage === rows.length
      ? "on"
      : selectedOnPage > 0
        ? "some"
        : "off";

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
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            <CheckboxCell
              state={headerState}
              onPress={onToggleAll}
              label={
                headerState === "on"
                  ? "Deselect all rows on this page"
                  : "Select all rows on this page"
              }
            />
            {columns.map((col) => (
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
            const id = rowId(row);
            const selected = selectedIds.has(id);
            return (
              <Pressable
                key={id}
                onPress={() => onRowPress(row)}
                accessibilityRole="button"
                accessibilityLabel={
                  rowLabel ? `View ${rowLabel(row)}` : undefined
                }
                className={`flex-row items-center ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                } ${
                  i < rows.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={({ pressed }) => ({
                  minHeight: ROW_MIN_HEIGHT,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <CheckboxCell
                  state={selected ? "on" : "off"}
                  onPress={() => onToggleRow(id)}
                  label={`${selected ? "Deselect" : "Select"} ${
                    rowLabel ? rowLabel(row) : "row"
                  }`}
                />
                {columns.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-4"
                    style={{ width: col.width }}
                  >
                    {col.render(row)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export const SelectableTable = SelectableTableInner;
