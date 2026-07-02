import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

// Mirrors the Section cards' shadow on the loaded screen (activity.tsx CARD_SHADOW).
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

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

/** Placeholder for ScreenTitleCard — p-5 box with a title + subtitle line. */
function TitleCardSkeleton({ pulse }: { pulse: Pulse }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
      {/* text-lg title (line 28) */}
      <Line pulse={pulse} h="h-7" bar="w-28 h-5" />
      {/* text-sm subtitle (line 20), mt-1 below the title */}
      <View className="mt-1">
        <Line pulse={pulse} h="h-5" bar="w-3/4 h-3.5" />
      </View>
    </View>
  );
}

/** Placeholder for a Section header: icon + title (+ optional badge / View All). */
function SectionHeaderSkeleton({
  pulse,
  withBadge,
  withViewAll,
}: {
  pulse: Pulse;
  withBadge?: boolean;
  withViewAll?: boolean;
}) {
  return (
    <View className="flex-row items-center mb-3">
      <SkeletonBlock pulse={pulse} className="w-7 h-7 rounded-lg mr-2" />
      <View className="flex-1">
        {/* text-base title (line 24) */}
        <Line pulse={pulse} h="h-6" bar="w-40 h-4" />
        {withBadge ? (
          // text-[11px] "count • timeframe" badge, mt-0.5 under the title.
          <View className="mt-0.5">
            <Line pulse={pulse} h="h-4" bar="w-24 h-3" />
          </View>
        ) : null}
      </View>
      {withViewAll ? (
        <SkeletonBlock pulse={pulse} className="w-20 h-7 rounded-full" />
      ) : null}
    </View>
  );
}

/** The white rounded card that wraps a section's rows. */
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-sm"
      style={CARD_SHADOW}
    >
      {children}
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
 * Full loading placeholder for the Activity screen. Mirrors the loaded layout
 * (title card + New Bookings / Recent Ticket Purchases / Recent Event Purchases)
 * one-for-one so nothing shifts when the data arrives. The blue DashboardHeader
 * stays rendered by the screen — only the scrollable content is replaced here.
 */
export function ActivityScreenSkeleton() {
  const pulse = usePulse();
  return (
    <View className="px-5 pt-0">
      <TitleCardSkeleton pulse={pulse} />

      {/* New Bookings — has the "count • timeframe" badge and a View All button. */}
      <View className="mb-5">
        <SectionHeaderSkeleton pulse={pulse} withBadge withViewAll />
        <SectionCard>
          {ROWS.map((i) => (
            <NewBookingRowSkeleton key={i} pulse={pulse} index={i} />
          ))}
        </SectionCard>
      </View>

      {/* Recent Ticket Purchases */}
      <View className="mb-5">
        <SectionHeaderSkeleton pulse={pulse} />
        <SectionCard>
          {ROWS.map((i) => (
            <PurchaseRowSkeleton key={i} pulse={pulse} index={i} />
          ))}
        </SectionCard>
      </View>

      {/* Recent Event Purchases */}
      <View className="mb-5">
        <SectionHeaderSkeleton pulse={pulse} />
        <SectionCard>
          {ROWS.map((i) => (
            <PurchaseRowSkeleton key={i} pulse={pulse} index={i} />
          ))}
        </SectionCard>
      </View>
    </View>
  );
}
