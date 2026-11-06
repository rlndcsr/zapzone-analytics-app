import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  formatNumber,
  type RankedRow,
  type SegmentRow,
  type StatusRow,
} from "../../lib/customers/customerAnalyticsDisplay";
import { dateKeyOf, formatShortDate } from "../../lib/date/calendar";
import type {
  RecentCustomer,
  TopCustomerRow,
} from "../../services/customersService";
import { ToneDotBadge, type DotTone } from "../ui/SummaryPanel";

type FeatherName = ComponentProps<typeof Feather>["name"];

const shortDate = (value: string | null): string =>
  formatShortDate(dateKeyOf(value)) || "—";

/** Small caps heading that groups related panels. */
export function SectionLabel({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View className="flex-row items-baseline justify-between mt-2 -mb-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </Text>
      {!!detail && (
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {detail}
        </Text>
      )}
    </View>
  );
}

export function AnalyticsPanel({
  icon,
  title,
  subtitle,
  info,
  children,
}: {
  icon: FeatherName;
  title: string;
  subtitle?: string;
  info?: string;
  children: ReactNode;
}) {
  const heading = (
    <View className="flex-row items-center gap-2">
      <Feather name={icon} size={15} color="#6B7280" />
      <Text className="shrink text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {!!info && <Feather name="info" size={13} color="#9CA3AF" />}
    </View>
  );
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4">
      <View className="mb-3">
        {info ? (
          <Pressable
            onPress={() => Alert.alert(title, info)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${title}, what this shows`}
            className="self-start"
          >
            {heading}
          </Pressable>
        ) : (
          heading
        )}
        {!!subtitle && (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function PanelEmpty({ message }: { message: string }) {
  return (
    <Text className="text-sm text-gray-400 dark:text-gray-500 py-3">
      {message}
    </Text>
  );
}

/**
 * One row per customer status, each with its own count. No pie and no shares:
 * the groups overlap, so they aren't parts of one whole.
 */
export function StatusCounts({ rows }: { rows: StatusRow[] }) {
  if (rows.length === 0)
    return <PanelEmpty message="No customer data available." />;
  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={`${r.key}-${i}`}
          className={`flex-row items-center gap-3 py-2.5 ${
            i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
          }`}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: r.color,
            }}
          />
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {r.label}
            </Text>
            {!!r.description && (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {r.description}
              </Text>
            )}
          </View>
          <Text className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatNumber(r.count)}
          </Text>
        </View>
      ))}
      <Text className="text-[11px] leading-4 text-gray-400 dark:text-gray-500 mt-2">
        A customer can be in more than one group, so these counts don&apos;t add
        up to a total.
      </Text>
    </View>
  );
}

/** One bar split by spend band, then a row per band with its share and definition. */
export function ValueSegments({ rows }: { rows: SegmentRow[] }) {
  const hasData = rows.some((r) => r.share > 0);
  if (!hasData)
    return <PanelEmpty message="No customer spend data available." />;
  return (
    <View>
      <View
        className="flex-row h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-neutral-800"
        accessibilityLabel={rows
          .map((r) => `${r.label} ${r.percent}%`)
          .join(", ")}
      >
        {rows.map((r) =>
          r.share > 0 ? (
            <View
              key={r.key}
              style={{ flex: r.share, backgroundColor: r.color }}
            />
          ) : null,
        )}
      </View>
      <View className="mt-3">
        {rows.map((r, i) => (
          <View
            key={`${r.key}-${i}`}
            className={`flex-row items-center gap-3 py-2 ${
              i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
            }`}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: r.color,
              }}
            />
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {r.label}
              </Text>
              {!!r.threshold && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {r.threshold}
                </Text>
              )}
            </View>
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              {r.percent}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Customers in the server's order, with rank, name, count and a bar scaled to #1. */
export function RankedList({
  rows,
  unit,
  emptyMessage,
}: {
  rows: RankedRow[];
  unit: [singular: string, plural: string];
  emptyMessage: string;
}) {
  if (rows.length === 0) return <PanelEmpty message={emptyMessage} />;
  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={`${r.rank}-${r.name}`}
          className={`flex-row items-center gap-3 py-2.5 ${
            i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
          }`}
        >
          <View
            className={`w-7 h-7 rounded-full items-center justify-center ${
              r.rank === 1
                ? "bg-blue-50 dark:bg-blue-900/30"
                : "bg-gray-100 dark:bg-neutral-800"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                r.rank === 1
                  ? "text-[#0644C7] dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {r.rank}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {r.name}
            </Text>
            <View className="h-1.5 mt-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
              <View
                style={{
                  width: `${Math.round(r.share * 100)}%`,
                  height: "100%",
                  backgroundColor: "#F59E0B",
                }}
              />
            </View>
          </View>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            {r.value}{" "}
            <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
              {r.value === 1 ? unit[0] : unit[1]}
            </Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A "top N by customer" table (activities / packages / events), as on the web. */
export function TopTable({
  rows,
  itemHeader,
  countHeader,
  emptyMessage,
}: {
  rows: TopCustomerRow[];
  itemHeader: string;
  countHeader: string;
  emptyMessage: string;
}) {
  return (
    <View>
      <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
        <Text className="flex-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
          Customer
        </Text>
        <Text className="flex-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
          {itemHeader}
        </Text>
        <Text className="w-20 text-right text-xs font-semibold text-gray-400 dark:text-gray-500">
          {countHeader}
        </Text>
      </View>
      {rows.length === 0 ? (
        <PanelEmpty message={emptyMessage} />
      ) : (
        // Names and item titles wrap onto as many lines as they need — nothing
        // is cut off with "...".
        rows.map((r, i) => (
          <View
            key={i}
            className="flex-row py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
          >
            <Text className="flex-1 pr-2 text-sm text-gray-900 dark:text-white">
              {r.customer}
            </Text>
            <Text className="flex-1 pr-2 text-sm text-gray-600 dark:text-gray-300">
              {r.item}
            </Text>
            <Text className="w-20 text-right text-sm font-semibold text-gray-900 dark:text-white">
              {r.count}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const RECENT_TONE: Record<string, DotTone> = {
  active: "green",
  new: "blue",
  inactive: "gray",
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Recent customers with everything the web table shows, including Last Activity. */
export function RecentCustomerList({
  customers,
}: {
  customers: RecentCustomer[];
}) {
  if (customers.length === 0)
    return <PanelEmpty message="No customer data available." />;
  return (
    <View>
      {customers.map((c, i) => (
        <View
          key={`${c.id || c.email}-${i}`}
          className={`py-3 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
        >
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {c.name}
              </Text>
              {!!c.email && (
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {c.email}
                </Text>
              )}
            </View>
            <ToneDotBadge
              tone={RECENT_TONE[c.status.toLowerCase()] ?? "gray"}
              label={titleCase(c.status)}
            />
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
            <Meta
              icon="dollar-sign"
              text={`$${c.totalSpent.toFixed(2)} spent`}
            />
            <Meta
              icon="calendar"
              text={`${c.bookings} ${c.bookings === 1 ? "booking" : "bookings"}`}
            />
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-1">
            <Meta
              icon="activity"
              text={`Last active ${shortDate(c.lastActivity)}`}
              strong
            />
            <Meta icon="user-plus" text={`Joined ${shortDate(c.joinDate)}`} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Meta({
  icon,
  text,
  strong = false,
}: {
  icon: FeatherName;
  text: string;
  strong?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Feather name={icon} size={11} color="#9CA3AF" />
      <Text
        className={
          strong
            ? "text-xs font-medium text-gray-700 dark:text-gray-200"
            : "text-xs text-gray-500 dark:text-gray-400"
        }
      >
        {text}
      </Text>
    </View>
  );
}
