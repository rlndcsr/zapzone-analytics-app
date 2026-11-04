import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { ViewMode } from "../ViewToggle";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const LIST_COUNT = 5;

// Mirror SelectableTable's row rhythm so the table skeleton doesn't shift.
const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 68;
const CHECKBOX_WIDTH = 48;

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** A skeleton bar vertically centered within a text line's height. */
function SkeletonLine({
  pulse,
  width,
  line,
  bar = "h-3",
  className = "",
}: {
  pulse: SharedValue<number>;
  width: string;
  line: string;
  bar?: string;
  className?: string;
}) {
  return (
    <View className={`${line} justify-center ${className}`}>
      <SkeletonBlock pulse={pulse} className={`${width} ${bar}`} />
    </View>
  );
}

/** Matches PurchaseCard: customer + status, contact, attraction, stats, footer. */
function PurchaseCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* customer name (left) + status pill (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
          <SkeletonLine pulse={pulse} width="w-32" line="h-4" className="mt-1" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-full" />
      </View>

      {/* attraction name */}
      <SkeletonLine pulse={pulse} width="w-48" line="h-5" bar="h-3.5" />

      {/* stats row (qty / total / paid) */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
      </View>

      {/* footer (payment chip + date) */}
      <View className="flex-row items-center justify-between mt-3">
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-lg" />
        <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2.5" />
      </View>
    </View>
  );
}

/** Leading selection-checkbox cell, matching SelectableTable's fixed width. */
function CheckboxCellSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="items-center justify-center" style={{ width: CHECKBOX_WIDTH }}>
      <SkeletonBlock pulse={pulse} className="w-5 h-5 rounded" />
    </View>
  );
}

/** Matches SelectableTable: rounded card, header row, then fixed-height rows. */
function PurchaseTableSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      {/* header */}
      <View
        className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
        style={{ minHeight: HEADER_MIN_HEIGHT }}
      >
        <CheckboxCellSkeleton pulse={pulse} />
        <View className="flex-1 flex-row items-center gap-6 px-2">
          <SkeletonBlock pulse={pulse} className="w-20 h-2.5 rounded" />
          <SkeletonBlock pulse={pulse} className="w-16 h-2.5 rounded" />
          <SkeletonBlock pulse={pulse} className="w-12 h-2.5 rounded" />
        </View>
      </View>

      {/* rows */}
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <View
          key={i}
          className={`flex-row items-center ${
            i < LIST_COUNT - 1
              ? "border-b border-gray-100 dark:border-neutral-800"
              : ""
          }`}
          style={{ minHeight: ROW_MIN_HEIGHT }}
        >
          <CheckboxCellSkeleton pulse={pulse} />
          <View className="flex-1 px-2">
            <SkeletonBlock pulse={pulse} className="w-40 h-3.5 rounded" />
            <SkeletonBlock pulse={pulse} className="w-28 h-2.5 rounded mt-2" />
          </View>
          <View className="px-4">
            <SkeletonBlock pulse={pulse} className="w-16 h-3 rounded" />
          </View>
          <View className="px-4">
            <SkeletonBlock pulse={pulse} className="w-14 h-6 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Records-only placeholder: a table skeleton (default) or card skeletons for the
 * current layout. The page header/controls stay real above it (no skeleton).
 * Shared by Manage Purchases and Event Purchases so both load identically.
 */
export function PurchasesListSkeleton({
  view = "table",
  flat = false,
  selectable = true,
}: {
  view?: ViewMode;
  /** Manage Purchases' flatter look (matches SelectableTable `flat`). */
  flat?: boolean;
  /** Flat table only: false drops the checkbox column (Bulk Orders). */
  selectable?: boolean;
} = {}) {
  const pulse = usePulse();
  return (
    <View>
      {view === "table" ? (
        flat ? (
          <FlatPurchaseTableSkeleton pulse={pulse} selectable={selectable} />
        ) : (
          <PurchaseTableSkeleton pulse={pulse} />
        )
      ) : (
        Array.from({ length: LIST_COUNT }).map((_, i) =>
          flat ? (
            <FlatPurchaseCardSkeleton key={i} pulse={pulse} />
          ) : (
            <PurchaseCardSkeleton key={i} pulse={pulse} />
          ),
        )
      )}
    </View>
  );
}

/** Matches the flat Manage Purchases card: name + status, contact line,
 *  attraction, the Qty / Total / Paid strip, and the purchased footer. */
function FlatPurchaseCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
        <SkeletonBlock pulse={pulse} className="w-20 h-5 rounded-full" />
      </View>
      <SkeletonLine
        pulse={pulse}
        width="w-36"
        line="h-4"
        bar="h-2.5"
        className="mt-1"
      />
      <SkeletonLine
        pulse={pulse}
        width="w-44"
        line="h-5"
        bar="h-3"
        className="mt-2"
      />
      <SkeletonBlock pulse={pulse} className="w-full h-14 rounded-xl mt-3" />
      <SkeletonLine
        pulse={pulse}
        width="w-28"
        line="h-4"
        bar="h-2.5"
        className="mt-3"
      />
    </View>
  );
}

/** Matches SelectableTable's `flat` look: hairline border, no shadow, rounded
 *  square checkboxes and the tighter 44 / 64 row rhythm. */
function FlatPurchaseTableSkeleton({
  pulse,
  selectable,
}: {
  pulse: SharedValue<number>;
  selectable: boolean;
}) {
  // Without a checkbox column the first cell still sits at the table's px-4.
  const leading = selectable ? (
    <View className="items-center" style={{ width: CHECKBOX_WIDTH }}>
      <SkeletonBlock pulse={pulse} className="w-[18px] h-[18px] rounded-[5px]" />
    </View>
  ) : (
    <View className="w-2" />
  );
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden mb-3">
      <View
        className="flex-row items-center bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800"
        style={{ minHeight: 44 }}
      >
        {leading}
        <View className="flex-1 flex-row items-center gap-6 px-2">
          <SkeletonBlock pulse={pulse} className="w-16 h-2.5" />
          <SkeletonBlock pulse={pulse} className="w-20 h-2.5" />
          <SkeletonBlock pulse={pulse} className="w-12 h-2.5" />
        </View>
      </View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <View
          key={i}
          className={`flex-row items-center ${
            i < LIST_COUNT - 1
              ? "border-b border-gray-100 dark:border-neutral-800"
              : ""
          }`}
          style={{ minHeight: 64 }}
        >
          {leading}
          <View className="flex-1 px-2">
            <SkeletonLine pulse={pulse} width="w-36" line="h-5" bar="h-3" />
            <SkeletonLine pulse={pulse} width="w-28" line="h-4" bar="h-2" />
          </View>
          <View className="px-4">
            <SkeletonBlock pulse={pulse} className="w-14 h-3" />
          </View>
          <View className="px-4">
            <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}
