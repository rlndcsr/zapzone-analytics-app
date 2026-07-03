import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock } from "./SkeletonBlock";

type Pulse = SharedValue<number>;

/**
 * A shimmer bar centred inside a box the exact height of the text line it stands
 * in for. Reserving the real line-height keeps the layout from shifting when the
 * data loads. `h` = the line box (matches the Tailwind text line-height); `bar` =
 * the visible bar (width + a slightly thinner height for the skeleton look).
 */
function Line({ pulse, h, bar }: { pulse: Pulse; h: string; bar: string }) {
  return (
    <View className={`${h} justify-center`}>
      <SkeletonBlock pulse={pulse} className={bar} />
    </View>
  );
}

/** px-4 py-3 row with a top divider from the second row on (matches `Row`). */
function RowShell({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <View
      className={`px-4 py-3 ${index > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
    >
      {children}
    </View>
  );
}

/** Placeholder for a NewBookingRow — name/badge, package, date·time + guests/View. */
function NewBookingRowSkeleton({
  pulse,
  index,
}: {
  pulse: Pulse;
  index: number;
}) {
  return (
    <RowShell index={index}>
      <View className="flex-row items-start justify-between mb-1">
        <Line pulse={pulse} h="h-5" bar="w-32 h-4" />
        <SkeletonBlock pulse={pulse} className="w-16 h-5 rounded-full" />
      </View>
      <View className="mb-1.5">
        <Line pulse={pulse} h="h-4" bar="w-40 h-3" />
      </View>
      <View className="flex-row items-center justify-between">
        <Line pulse={pulse} h="h-4" bar="w-24 h-3" />
        <View className="flex-row items-center gap-3">
          <Line pulse={pulse} h="h-4" bar="w-28 h-3" />
          <Line pulse={pulse} h="h-4" bar="w-10 h-3" />
        </View>
      </View>
    </RowShell>
  );
}

/**
 * Placeholder for a ticket/event purchase row — name/badge, sub-line, and two
 * bottom meta figures. Both purchase tables share this exact layout.
 */
function PurchaseRowSkeleton({
  pulse,
  index,
}: {
  pulse: Pulse;
  index: number;
}) {
  return (
    <RowShell index={index}>
      <View className="flex-row items-start justify-between mb-1">
        <Line pulse={pulse} h="h-5" bar="w-32 h-4" />
        <SkeletonBlock pulse={pulse} className="w-16 h-5 rounded-full" />
      </View>
      <View className="mb-1.5">
        <Line pulse={pulse} h="h-4" bar="w-44 h-3" />
      </View>
      <View className="flex-row items-center justify-between">
        <Line pulse={pulse} h="h-4" bar="w-24 h-3" />
        <Line pulse={pulse} h="h-4" bar="w-32 h-3" />
      </View>
    </RowShell>
  );
}

const ROWS = [0, 1, 2];

/**
 * The "count • timeframe" badge on the New Bookings header is data-driven, so it
 * shimmers while the fetch is in flight (the icon + title around it stay static).
 */
export function BadgeSkeleton({ pulse }: { pulse: Pulse }) {
  return (
    <View className="mt-0.5">
      <Line pulse={pulse} h="h-4" bar="w-24 h-3" />
    </View>
  );
}

/**
 * Row placeholders for the New Bookings list. Rendered inside the section card
 * (activity.tsx supplies the header + card shell) so only the data rows shimmer.
 */
export function NewBookingRowsSkeleton({ pulse }: { pulse: Pulse }) {
  return (
    <>
      {ROWS.map((i) => (
        <NewBookingRowSkeleton key={i} pulse={pulse} index={i} />
      ))}
    </>
  );
}

/**
 * Row placeholders for the ticket / event purchase lists. Both share the same
 * row layout, so this covers Recent Ticket Purchases and Recent Event Purchases.
 */
export function PurchaseRowsSkeleton({ pulse }: { pulse: Pulse }) {
  return (
    <>
      {ROWS.map((i) => (
        <PurchaseRowSkeleton key={i} pulse={pulse} index={i} />
      ))}
    </>
  );
}
