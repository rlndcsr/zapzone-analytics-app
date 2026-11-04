import { Feather } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { Appear } from "./motion/Appear";
import { PressableScale } from "./motion/PressableScale";

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

// The `flat` look (Manage Attractions redesign): no shadow, a hairline border,
// sentence-case header labels, tighter rows and rounded-square checkboxes.
const FLAT_HEADER_MIN_HEIGHT = 44;
const FLAT_ROW_MIN_HEIGHT = 64;

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
  flat,
}: {
  state: "off" | "on" | "some";
  onPress: () => void;
  label: string;
  flat: boolean;
}) => (
  <View
    className="items-center justify-center"
    style={{ width: CHECKBOX_WIDTH }}
  >
    <PressableScale
      onPress={onPress}
      hitSlop={10}
      pressScale="icon"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "on" }}
      accessibilityLabel={label}
      className={
        flat
          ? `w-[18px] h-[18px] rounded-[5px] items-center justify-center border ${
              state === "off"
                ? "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                : "border-[#0644C7] bg-[#0644C7]"
            }`
          : undefined
      }
    >
      {flat ? (
        state !== "off" && (
          <Feather
            name={state === "on" ? "check" : "minus"}
            size={12}
            color="#FFFFFF"
          />
        )
      ) : (
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
      )}
    </PressableScale>
  </View>
);

type Props<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  /** Stable numeric id for a row (selection key + React key). */
  rowId: (row: T) => number;
  /**
   * Tapping a row (anywhere but the checkbox) opens its detail. Omit to make
   * rows inert — for tables where the detail is reached only from an explicit
   * row action, so a stray tap can't navigate.
   */
  onRowPress?: (row: T) => void;
  /**
   * Selected ids — the single source of truth lives in the parent screen.
   * Omit all three selection props for a table with no bulk actions: the
   * checkbox column disappears and the rows keep the same look everywhere else.
   */
  selectedIds?: Set<number>;
  onToggleRow?: (id: number) => void;
  /** Select / deselect every row on the current page. */
  onToggleAll?: () => void;
  /** Accessible verb for a row's checkbox, e.g. "booking for Jane". */
  rowLabel?: (row: T) => string;
  /**
   * The flatter Manage Attractions table look — opt-in so every other table
   * keeps its current style.
   */
  flat?: boolean;
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
  flat = false,
}: Props<T>) {
  // Selection is opt-in: a table given no `selectedIds` drops the checkbox
  // column entirely rather than showing one that does nothing.
  const selectable = !!selectedIds;
  const tableWidth =
    (selectable ? CHECKBOX_WIDTH : 0) +
    columns.reduce((sum, c) => sum + c.width, 0);

  const selectedOnPage = rows.reduce(
    (n, r) => (selectedIds?.has(rowId(r)) ? n + 1 : n),
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
      className={`rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border mb-3 ${
        flat
          ? "border-gray-200 dark:border-neutral-800"
          : "border-gray-100 dark:border-neutral-800"
      }`}
      style={flat ? undefined : CARD_SHADOW}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className={`flex-row items-center border-b ${
              flat
                ? "bg-gray-50 dark:bg-neutral-800/50 border-gray-200 dark:border-neutral-800"
                : "bg-gray-50 dark:bg-neutral-800/60 border-gray-100 dark:border-neutral-800"
            }`}
            style={{
              minHeight: flat ? FLAT_HEADER_MIN_HEIGHT : HEADER_MIN_HEIGHT,
            }}
          >
            {selectable && (
              <CheckboxCell
                flat={flat}
                state={headerState}
                onPress={() => onToggleAll?.()}
                label={
                  headerState === "on"
                    ? "Deselect all rows on this page"
                    : "Select all rows on this page"
                }
              />
            )}
            {columns.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className={
                    flat
                      ? "text-xs font-medium text-gray-500 dark:text-gray-400"
                      : "text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                  }
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {rows.map((row, i) => {
            const id = rowId(row);
            const selected = !!selectedIds?.has(id);
            return (
              // Rows cascade in rather than appearing all at once. Keyed by row
              // id, so the stagger plays when a page's rows actually mount —
              // paging, filtering, a first load — and not on an unrelated
              // re-render of the same rows.
              <Appear key={id} index={i}>
                {/* `flat`: a table row shares dividers with its neighbours, so
                    shrinking it would open a gap and flash the card behind. It
                    gets the animated dim instead of the instant opacity swap
                    the function style used to do. */}
                <PressableScale
                  onPress={onRowPress ? () => onRowPress(row) : undefined}
                  disabled={!onRowPress}
                  pressScale="flat"
                  dim={!!onRowPress}
                  accessibilityRole={onRowPress ? "button" : undefined}
                  accessibilityLabel={
                    onRowPress && rowLabel ? `View ${rowLabel(row)}` : undefined
                  }
                  className={`flex-row items-center ${
                    selected
                      ? flat
                        ? "bg-blue-50/70 dark:bg-blue-900/20"
                        : "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  } ${
                    i < rows.length - 1
                      ? "border-b border-gray-100 dark:border-neutral-800"
                      : ""
                  }`}
                  style={{
                    minHeight: flat ? FLAT_ROW_MIN_HEIGHT : ROW_MIN_HEIGHT,
                  }}
                >
                  {selectable && (
                    <CheckboxCell
                      flat={flat}
                      state={selected ? "on" : "off"}
                      onPress={() => onToggleRow?.(id)}
                      label={`${selected ? "Deselect" : "Select"} ${
                        rowLabel ? rowLabel(row) : "row"
                      }`}
                    />
                  )}
                  {columns.map((col) => (
                    <View
                      key={col.key}
                      className={`justify-center px-4 ${flat ? "py-3" : "py-4"}`}
                      style={{ width: col.width }}
                    >
                      {col.render(row)}
                    </View>
                  ))}
                </PressableScale>
              </Appear>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export const SelectableTable = SelectableTableInner;
