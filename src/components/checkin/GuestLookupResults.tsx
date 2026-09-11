import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { GuestResults } from "../../lib/hooks/useGuestLookup";
import { guestResultCount } from "../../lib/hooks/useGuestLookup";
import { Pagination } from "../ui/Pagination";
import { StatusBadge } from "../ui/StatusBadge";

const PRIMARY = "#0644C7";

type IconName = React.ComponentProps<typeof Feather>["name"];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

function fmtShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** One tappable match, whatever kind of record it is. */
function ResultRow({
  title,
  subtitle,
  meta,
  status,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta: string;
  status?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-gray-100 px-4 py-3 active:opacity-70 dark:border-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View className="flex-1">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-xs text-gray-500 dark:text-gray-400">{meta}</Text>
          {!!status && <StatusBadge status={status} />}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={PRIMARY} />
    </Pressable>
  );
}

/** Per-page choices inside a group — 5 first, as on every list in the app. */
const GROUP_PER_PAGE_OPTIONS = [5, 10, 25];

/**
 * A titled block of matches for one record kind, paged on its own.
 *
 * Each kind keeps its own page because the groups are independent: turning the
 * page on Bookings should not move Waivers off the row the desk was reading.
 */
function Group<T>({
  icon,
  title,
  items,
  keyOf,
  renderItem,
}: {
  icon: IconName;
  title: string;
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(GROUP_PER_PAGE_OPTIONS[0]);

  // A fresh search replaces the rows under us; start that group at page 1
  // rather than on whatever page the previous guest's results reached.
  useEffect(() => {
    setPage(1);
  }, [items, perPage]);

  const paged = useMemo(
    () => items.slice((page - 1) * perPage, page * perPage),
    [items, page, perPage],
  );

  if (items.length === 0) return null;

  // Only worth a pager once there is more than one page's worth; below that it
  // is chrome on a three-row list.
  const showPager = items.length > GROUP_PER_PAGE_OPTIONS[0];

  return (
    <View className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-neutral-900">
      <View className="flex-row items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-neutral-800">
        <Feather name={icon} size={14} color={PRIMARY} />
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          ({items.length})
        </Text>
      </View>

      {paged.map((item) => (
        <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>
      ))}

      {showPager && (
        <View className="px-4 pt-3">
          <Pagination
            compact
            page={page}
            perPage={perPage}
            total={items.length}
            options={GROUP_PER_PAGE_OPTIONS}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </View>
      )}
    </View>
  );
}

export type GuestLookupHandlers = {
  onBooking: (reference: string | null) => void;
  onWaiver: (reference: string | null) => void;
  onTicket: (purchaseId: number) => void;
  onOrder: (orderId: number) => void;
  onEvent: (reference: string) => void;
};

/**
 * Everything a guest's name turned up, grouped by record kind — the web's
 * "No ticket or QR? Find the guest" results.
 *
 * Each row opens the same verify surface its QR code would, so a guest who lost
 * their ticket is checked in through exactly the flow a scan would have run.
 */
export function GuestLookupResults({
  results,
  searched,
  handlers,
}: {
  results: GuestResults;
  searched: boolean;
  handlers: GuestLookupHandlers;
}) {
  if (!searched) return null;

  if (guestResultCount(results) === 0) {
    return (
      <View className="mb-4 rounded-xl bg-white px-6 py-8 shadow-sm dark:bg-neutral-900">
        <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
          Nothing matched that name. Try a phone number, email, or part of the
          reference.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Group
        icon="calendar"
        title="Bookings"
        items={results.bookings}
        keyOf={(b) => `bk-${b.id}`}
        renderItem={(b) => (
          <ResultRow
            title={b.customerName || "Guest"}
            subtitle={`#${b.referenceNumber ?? "—"} · ${b.packageName || "N/A"}`}
            meta={`${fmtShort(b.date)} · ${b.participants} participant${b.participants === 1 ? "" : "s"}`}
            status={b.status}
            onPress={() => handlers.onBooking(b.referenceNumber)}
          />
        )}
      />

      <Group
        icon="file-text"
        title="Waivers"
        items={results.waivers}
        keyOf={(w) => `wv-${w.id}`}
        renderItem={(w) => (
          <ResultRow
            title={w.adultName}
            subtitle={w.templateTitle || "Waiver"}
            meta={`Visit ${fmtShort(w.selectedDate)}${w.minorsCount > 0 ? ` · ${w.minorsCount} minor${w.minorsCount === 1 ? "" : "s"}` : ""}`}
            status={w.status}
            onPress={() => handlers.onWaiver(w.referenceNumber)}
          />
        )}
      />

      <Group
        icon="tag"
        title="Attraction Tickets"
        items={results.tickets}
        keyOf={(t) => `at-${t.id}`}
        renderItem={(t) => (
          <ResultRow
            title={t.customerName || "Guest"}
            subtitle={t.attractionName}
            meta={`${t.quantity} ticket${t.quantity === 1 ? "" : "s"} · ${money(t.totalAmount)}`}
            status={t.status}
            onPress={() => handlers.onTicket(t.id)}
          />
        )}
      />

      <Group
        icon="package"
        title="Bulk Orders"
        items={results.orders}
        keyOf={(o) => `or-${o.id}`}
        renderItem={(o) => (
          <ResultRow
            title={o.customerName || "Guest"}
            subtitle={`#${o.referenceNumber} · ${o.ticketCount} ticket${o.ticketCount === 1 ? "" : "s"}`}
            meta={`${fmtShort(o.purchaseDate)} · ${money(o.totalAmount)}`}
            status={o.status}
            onPress={() => handlers.onOrder(o.id)}
          />
        )}
      />

      <Group
        icon="star"
        title="Event Tickets"
        items={results.events}
        keyOf={(e) => `ev-${e.id}`}
        renderItem={(e) => (
          <ResultRow
            title={e.customerName || "Guest"}
            subtitle={`#${e.referenceNumber} · ${e.eventName}`}
            meta={`${e.quantity} ticket${e.quantity === 1 ? "" : "s"} · ${money(e.totalAmount)}`}
            status={e.status}
            onPress={() => handlers.onEvent(e.referenceNumber)}
          />
        )}
      />
    </View>
  );
}
