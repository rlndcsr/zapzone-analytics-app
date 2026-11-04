import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BookingsBulkBar,
  type BookingBulkAction,
} from "../../components/ui/BookingsBulkBar";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import {
  EMPTY_EVENT_PURCHASE_FILTERS,
  EventPurchaseFiltersSheet,
  countActiveEventPurchaseFilters,
  type EventPurchaseDateTarget,
  type EventPurchaseFilterValues,
} from "../../components/ui/EventPurchaseFiltersSheet";
import {
  DotBadge,
  EventPurchasesTable,
  EventStatusBadge,
  eventStatusTone,
  prettyEventMethod,
} from "../../components/ui/EventPurchasesTable";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  formatMoney,
  formatPurchaseDateTime,
  formatScheduled,
  prettyStatus,
} from "../../lib/attractions/purchaseDisplay";
import {
  consumeEventPurchasesStale,
  useEventPurchases,
} from "../../lib/hooks/useEventPurchases";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { countTransactions } from "../../lib/purchaseMetrics";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  bulkCompleteConfirmMessage,
  describeFollowUp,
} from "../../lib/visitFollowUp/visitFollowUp";
import {
  deleteEventPurchase,
  fetchTrashedEventPurchases,
  updateEventPurchaseStatus,
  type EventPaymentStatus,
  type EventPurchaseRow,
  type EventPurchaseStatus,
} from "../../services/eventPurchasesService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 15];

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

// Status options offered by the per-row "Set Status" picker, matching the web
// event purchase status dropdown.
const STATUS_PICKER_OPTIONS: EventPurchaseStatus[] = [
  "confirmed",
  "pending",
  "checked-in",
  "completed",
  "cancelled",
];

// Default list ordering — mirrors the web Event Purchases page exactly: sort by
// status priority first, then newest-created first within the same status.
// (Includes refunded/voided for forward-parity even though the mobile status
// union omits them; unknown statuses fall back to 3, like the web.)
const STATUS_PRIORITY: Record<string, number> = {
  confirmed: 0,
  pending: 1,
  completed: 2,
  "checked-in": 3,
  cancelled: 4,
  refunded: 5,
  voided: 6,
};

// Statuses the web excludes from its event transaction count and revenue.
const ENDED_STATUSES = ["cancelled", "refunded", "voided"];

// Card payment-status badge — the stored `payment_status`, in the same colours
// the card has always used, now drawn as a dot pill.
const PAYMENT_STATUS_TONE: Record<
  EventPaymentStatus,
  { bg: string; dot: string; text: string }
> = {
  paid: {
    bg: "bg-green-50 dark:bg-green-900/30",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
  },
  partial: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  pending: {
    bg: "bg-gray-100 dark:bg-neutral-800",
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
  },
  refunded: {
    bg: "bg-purple-50 dark:bg-purple-900/30",
    dot: "bg-purple-500",
    text: "text-purple-700 dark:text-purple-400",
  },
  voided: {
    bg: "bg-red-50 dark:bg-red-900/30",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
};

function prettyPaymentStatus(status: EventPaymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile — the same panel as Manage Attractions.
 */
const SummaryCell = ({
  icon,
  title,
  value,
  hint,
  divideLeft = false,
  divideTop = false,
}: {
  icon: FeatherIconName;
  title: string;
  value: string;
  hint: string;
  divideLeft?: boolean;
  divideTop?: boolean;
}) => (
  <View
    className={`flex-1 p-4 ${
      divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
    } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
      </Text>
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
    >
      {value}
    </Text>
    <Text
      numberOfLines={1}
      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
    >
      {hint}
    </Text>
  </View>
);

/** One labelled cell in the card's Tickets / Total / Paid strip. */
const Spec = ({
  label,
  value,
  valueClass = "text-gray-900 dark:text-white",
  divider = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className={`text-sm font-semibold mt-0.5 ${valueClass}`}
    >
      {value}
    </Text>
  </View>
);

/**
 * Card layout for a single event purchase, matching the Manage Attractions
 * card: name + status, email · reference, the event, a Tickets / Total / Paid
 * strip and a quiet footer with the payment status. Tapping anywhere opens
 * Purchase Details.
 */
const PurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: EventPurchaseRow;
  onPress: () => void;
}) => {
  const paidInFull = purchase.amountPaid >= purchase.totalAmount;
  const contact = [purchase.email, purchase.referenceNumber]
    .filter(Boolean)
    .join("  ·  ");
  const paymentTone =
    PAYMENT_STATUS_TONE[purchase.paymentStatus] ?? PAYMENT_STATUS_TONE.pending;
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`View purchase for ${purchase.customerName}`}
    >
      {/* Customer + status */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
        <EventStatusBadge status={purchase.status} />
      </View>

      {/* Email · reference */}
      {!!contact && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1"
          numberOfLines={1}
        >
          {contact}
        </Text>
      )}

      {/* Event */}
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="calendar" size={13} color="#9CA3AF" />
        <Text
          className="shrink text-[13px] font-medium text-gray-700 dark:text-gray-200"
          numberOfLines={1}
        >
          {purchase.eventName}
        </Text>
      </View>

      {/* Tickets / Total / Paid */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec label="Tickets" value={String(purchase.quantity)} />
        <Spec
          divider
          label="Total"
          value={formatMoney(purchase.totalAmount)}
        />
        <Spec
          divider
          label="Paid"
          value={formatMoney(purchase.amountPaid)}
          valueClass={
            paidInFull
              ? "text-green-700 dark:text-green-400"
              : "text-amber-700 dark:text-amber-400"
          }
        />
      </View>

      {/* Event date */}
      {!!purchase.purchaseDate && (
        <View className="flex-row items-center gap-1.5 mt-3">
          <Feather name="clock" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Event{" "}
            {formatScheduled(purchase.purchaseDate, purchase.purchaseTime)}
          </Text>
        </View>
      )}

      {/* Deleted timestamp (trashed view) */}
      {!!purchase.deletedAt && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="trash-2" size={12} color="#DC2626" />
          <Text className="text-xs text-red-600 dark:text-red-400">
            Deleted {formatPurchaseDateTime(purchase.deletedAt)}
          </Text>
        </View>
      )}

      {/* Payment status · method · created + affordance */}
      <View className="flex-row items-center justify-between gap-3 mt-3">
        <View className="shrink flex-row items-center gap-2">
          <DotBadge
            tone={paymentTone}
            label={prettyPaymentStatus(purchase.paymentStatus)}
          />
          <Text
            numberOfLines={1}
            className="shrink text-xs text-gray-400 dark:text-gray-500"
          >
            {prettyEventMethod(purchase.paymentMethod)}
            {purchase.createdAt
              ? `  ·  ${formatPurchaseDateTime(purchase.createdAt)}`
              : ""}
          </Text>
        </View>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Details
          </Text>
          <Feather name="chevron-right" size={14} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};

const EventPurchases = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();

  // The global workspace location drives the fetch (server-side), exactly like
  // the web — the purchase's own location_id is unreliable for client filtering.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const { purchases, loading, error, refetch } = useEventPurchases({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  // Committed filters (drive the list) + the sheet's draft (committed on Apply).
  const [filters, setFilters] = useState<EventPurchaseFilterValues>(
    EMPTY_EVENT_PURCHASE_FILTERS,
  );
  const [draft, setDraft] = useState<EventPurchaseFilterValues>(
    EMPTY_EVENT_PURCHASE_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [dateTarget, setDateTarget] =
    useState<EventPurchaseDateTarget>("created");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  // Presentation layout for the active list — table by default (cards via
  // toggle). Both render the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Bulk-selection (active list, table view); `bulkBusy` marks the in-flight action.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<BookingBulkAction | null>(null);
  // Row whose "Set Status" picker sheet is open; `statusBusy` locks it while
  // the status update is in flight.
  const [statusPurchase, setStatusPurchase] =
    useState<EventPurchaseRow | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  // Deleted ("trashed") view — loaded lazily when toggled on.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedItems, setDeletedItems] = useState<EventPurchaseRow[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadDeleted = useCallback(async () => {
    const token = getToken();
    if (!token || !user?.id) return;
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const data = await fetchTrashedEventPurchases({
        token,
        userId: user.id,
        locationId: activeLocationId,
      });
      setDeletedItems(data);
    } catch (err) {
      setDeletedError(
        err instanceof Error ? err.message : "Failed to load deleted purchases",
      );
    } finally {
      setDeletedLoading(false);
    }
  }, [user?.id, activeLocationId]);

  // Load / reload the trashed list whenever it's shown or the location changes.
  useEffect(() => {
    if (showDeleted) loadDeleted();
  }, [showDeleted, loadDeleted]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await (showDeleted ? loadDeleted() : refetch());
    } finally {
      setRefreshing(false);
    }
  }, [showDeleted, loadDeleted, refetch]);

  // Refetch when returning from Create Purchase so the new purchase + KPIs
  // appear without a manual pull-to-refresh (filters are preserved in state).
  useFocusEffect(
    useCallback(() => {
      if (consumeEventPurchasesStale()) refetch();
    }, [refetch]),
  );

  // KPI values — computed over the active set (already location-scoped by the
  // fetch), like the web metrics.
  // KPI math mirrors the web EventPurchases metrics exactly: revenue is what
  // was collected (amount_paid) on live lines only — cancelled/refunded/voided
  // are left out of both the count and the money — and Avg. Purchase =
  // revenue / count.
  const kpis = useMemo(() => {
    const lines = purchases.length;
    const confirmed = purchases.filter((p) => p.status === "confirmed").length;
    const live = purchases.filter(
      (p) => !ENDED_STATUSES.includes(String(p.status)),
    );
    const total = countTransactions(live);
    const revenue = live.reduce((sum, p) => sum + p.amountPaid, 0);
    const avg = total > 0 ? revenue / total : 0;
    const customers = new Set(purchases.map((p) => p.email)).size;
    return { total, lines, confirmed, revenue, avg, customers };
  }, [purchases]);

  // The list uses the active or deleted set (both already location-scoped by
  // the fetch), then narrowed by search/status/payment/date — like the web.
  const listSource = showDeleted ? deletedItems : purchases;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  // Search + the full web-admin filter set over the active/deleted set (already
  // location-scoped by the fetch). Predicate semantics mirror the web
  // `useAdminTable` exactly (select equality, guest/balance derivations,
  // inclusive date ranges on created_at + purchase_date, inclusive amount range
  // with empty = unbounded). All client-side, like the web.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const amountMin =
      filters.amountMin === "" ? null : parseFloat(filters.amountMin);
    const amountMax =
      filters.amountMax === "" ? null : parseFloat(filters.amountMax);
    const { createdFrom, createdTo, scheduledFrom, scheduledTo } = filters;

    return (
      listSource
        .filter((p) => {
          if (filters.status !== "all" && p.status !== filters.status)
            return false;
          if (filters.event !== "all" && p.eventName !== filters.event)
            return false;
          if (
            filters.paymentMethod !== "all" &&
            p.paymentMethod !== filters.paymentMethod
          )
            return false;
          if (
            filters.paymentStatus !== "all" &&
            p.paymentStatus !== filters.paymentStatus
          )
            return false;
          if (filters.customerType !== "all") {
            if (filters.customerType === "guest" && !p.isGuest) return false;
            if (filters.customerType === "registered" && p.isGuest)
              return false;
          }
          if (filters.balance !== "all") {
            const due = p.amountPaid < p.totalAmount;
            if (filters.balance === "due" && !due) return false;
            if (filters.balance === "paid" && due) return false;
          }
          if (createdFrom || createdTo) {
            const d = p.createdAt ? p.createdAt.substring(0, 10) : null;
            if (!d) return false;
            if (createdFrom && d < createdFrom) return false;
            if (createdTo && d > createdTo) return false;
          }
          if (scheduledFrom || scheduledTo) {
            const d = p.purchaseDate ? p.purchaseDate.substring(0, 10) : null;
            if (!d) return false;
            if (scheduledFrom && d < scheduledFrom) return false;
            if (scheduledTo && d > scheduledTo) return false;
          }
          if (
            amountMin != null &&
            !Number.isNaN(amountMin) &&
            p.totalAmount < amountMin
          )
            return false;
          if (
            amountMax != null &&
            !Number.isNaN(amountMax) &&
            p.totalAmount > amountMax
          )
            return false;
          if (term) {
            const haystack =
              `${p.customerName} ${p.email} ${p.eventName} ${p.phone} ${p.referenceNumber}`.toLowerCase();
            if (!haystack.includes(term)) return false;
          }
          return true;
        })
        // Default ordering identical to the web: status priority, then newest first.
        .sort((a, b) => {
          const priorityDiff =
            (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3);
          if (priorityDiff !== 0) return priorityDiff;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })
    );
  }, [listSource, search, filters]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters, activeLocationId, showDeleted, perPage]);

  // Keep the current page valid after the list shrinks (e.g. a bulk delete).
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  // Selection is scoped to the visible active-list page: clear it whenever the
  // visible set changes or we leave the table.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filters, activeLocationId, perPage, page, viewMode, showDeleted]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every purchase on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = paged.length > 0 && paged.every((p) => prev.has(p.id));
      return all ? new Set() : new Set(paged.map((p) => p.id));
    });
  }, [paged]);

  // Bulk status — mirrors the web bulk bar (per-id updateStatus). Refetches +
  // clears selection; filters, search and the current page are preserved.
  const runBulkStatus = useCallback(
    async (
      status: Exclude<BookingBulkAction, "delete">,
      confirmed = false,
    ): Promise<void> => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      if (status === "completed" && !confirmed) {
        // Completing emails guests, so ask first (web parity) and re-enter on OK.
        Alert.alert(
          "Complete",
          bulkCompleteConfirmMessage(ids.length, "purchase"),
          [
            { text: "Cancel", style: "cancel" },
            { text: "OK", onPress: () => void runBulkStatus(status, true) },
          ],
        );
        return;
      }
      setBulkBusy(status);
      try {
        await Promise.all(
          ids.map((id) =>
            updateEventPurchaseStatus(token, id, status as EventPurchaseStatus),
          ),
        );
        setSelectedIds(new Set());
        await refetch();
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error
            ? err.message
            : "Could not update the selected purchases.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, refetch],
  );

  // Bulk delete — same confirmation + per-id soft-delete the web bulk bar uses.
  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      "Delete purchases",
      `Are you sure you want to delete ${count} purchase record(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            const ids = [...selectedIds];
            setBulkBusy("delete");
            try {
              await Promise.all(
                ids.map((id) => deleteEventPurchase(token, id)),
              );
              setSelectedIds(new Set());
              await refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the selected purchases.",
              );
            } finally {
              setBulkBusy(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // Per-row delete (table Actions) — same soft-delete endpoint as the bulk bar.
  const handleRowDelete = useCallback(
    (p: EventPurchaseRow) => {
      Alert.alert(
        "Delete purchase",
        `Are you sure you want to delete the purchase for ${p.customerName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              try {
                await deleteEventPurchase(token, p.id);
                await refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete the purchase.",
                );
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

  // Per-row status — the pill opens a "Set Status" picker sheet (consistent
  // with the Manage Accounts table). Applying calls the same per-id status
  // endpoint the bulk bar loops over.
  const applyPurchaseStatus = useCallback(
    async (status: EventPurchaseStatus) => {
      const p = statusPurchase;
      if (!p) return;
      if (p.status === status) {
        setStatusPurchase(null);
        return;
      }
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }
      setStatusBusy(true);
      try {
        const followUp = await updateEventPurchaseStatus(token, p.id, status);
        await refetch();
        setStatusPurchase(null);
        const notice =
          status === "completed" ? describeFollowUp(followUp) : null;
        if (notice) Alert.alert(`Status updated. ${notice}`);
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error
            ? err.message
            : "Could not update the purchase status.",
        );
      } finally {
        setStatusBusy(false);
      }
    },
    [statusPurchase, refetch],
  );

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no purchases to export.");
      return;
    }
    setExporting(true);
    try {
      const header = [
        "ID",
        "Reference",
        "Customer Name",
        "Email",
        "Phone",
        "Event",
        "Tickets",
        "Total Amount",
        "Status",
        "Payment Method",
        "Date",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id,
          p.referenceNumber,
          p.customerName,
          p.email,
          p.phone,
          p.eventName,
          p.quantity,
          p.totalAmount,
          p.status,
          p.paymentMethod,
          p.createdAt ? formatPurchaseDateTime(p.createdAt) : "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}event-purchases-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Event Purchases",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  const activeFilterCount = countActiveEventPurchaseFilters(filters);

  // Event options for the Event filter — unique event names from the active set
  // (mirrors the web `eventOptions`).
  const eventOptions = useMemo(
    () =>
      [...new Set(listSource.map((p) => p.eventName).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [listSource],
  );

  // Open the sheet on a fresh draft seeded from the committed filters.
  const openFilters = useCallback(() => {
    setDraft(filters);
    setShowFilterSheet(true);
  }, [filters]);

  // Date ranges reuse the shared range calendar. The filter sheet is a native
  // Modal, so we fully close it before opening the calendar (two stacked Modals
  // crash Android), writing the picked range into the draft.
  const openDateRange = useCallback((target: EventPurchaseDateTarget) => {
    setDateTarget(target);
    setShowFilterSheet(false);
    setTimeout(() => setShowDateSheet(true), 280);
  }, []);
  const closeDateRange = useCallback(() => {
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyDateRange = useCallback(
    (start: string, end: string) => {
      setDraft((f) =>
        dateTarget === "created"
          ? { ...f, createdFrom: start, createdTo: end }
          : { ...f, scheduledFrom: start, scheduledTo: end },
      );
      setShowDateSheet(false);
      setTimeout(() => setShowFilterSheet(true), 280);
    },
    [dateTarget],
  );

  // Apply commits the draft; Cancel just closes (draft discarded on next open).
  const applyFilters = useCallback(() => {
    setFilters(draft);
    setShowFilterSheet(false);
  }, [draft]);

  const hasResults = filtered.length > 0;

  const openPurchaseDetails = useCallback((purchase: EventPurchaseRow) => {
    router.push({
      pathname: "/events/purchase-details",
      params: { id: String(purchase.id) },
    });
  }, []);

  // The page's secondary actions as module-hub shortcuts, like the Manage
  // Attractions "More" row. Deleted Purchases flips the list to the trashed
  // view (and back); Export CSV shares the filtered rows.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Manage Events", icon: "calendar", route: "/events/manage-events" },
    { label: "Check-In", icon: "check-square", route: "/check-in" },
    {
      label: showDeleted ? "Active Purchases" : "Deleted Purchases",
      icon: showDeleted ? "rotate-ccw" : "archive",
      onPress: () => setShowDeleted((v) => !v),
    },
    {
      label: "Export CSV",
      icon: "file-text",
      onPress: () => {
        if (!exporting) exportCsv();
      },
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text
            numberOfLines={1}
            className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
          >
            Event Purchases
          </Text>
          <Pressable
            onPress={() => router.push("/events/create-purchase")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New purchase"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-4 mt-4">
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state */}
          {!listLoading && listError && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {showDeleted
                    ? "Could not load deleted purchases"
                    : "Could not load purchases"}
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {listError}
                </Text>
                <Pressable
                  onPress={onRefresh}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {loading ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="shopping-bag"
                  title="Total Purchases"
                  value={String(kpis.total)}
                  hint={`${kpis.lines} lines · ${kpis.confirmed} confirmed`}
                />
                <SummaryCell
                  divideLeft
                  icon="dollar-sign"
                  title="Total Revenue"
                  value={formatMoney(kpis.revenue)}
                  hint="Excl. cancelled / refunded"
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="trending-up"
                  title="Avg. Purchase"
                  value={formatMoney(kpis.avg)}
                  hint="Per transaction"
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="users"
                  title="Unique Customers"
                  value={String(kpis.customers)}
                  hint="Total customers"
                />
              </View>
            </View>
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search purchases"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={openFilters}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterCount} applied`
                  : "Filters"
              }
              className={`flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border active:opacity-70 ${
                activeFilterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-[#0644C7]/40"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
              }`}
            >
              <Feather
                name="sliders"
                size={15}
                color={activeFilterCount > 0 ? PRIMARY : "#6B7280"}
              />
              <Text
                className={`text-sm font-medium ${
                  activeFilterCount > 0
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          {activeFilterCount > 0 && (
            <View className="flex-row items-center justify-between mb-3 -mt-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {activeFilterCount}{" "}
                {activeFilterCount === 1 ? "filter" : "filters"} applied
              </Text>
              <Pressable
                onPress={() => setFilters(EMPTY_EVENT_PURCHASE_FILTERS)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* Deleted-view hint — the More shortcut switched the list to the
              trashed purchases; this is the one-tap way back. */}
          {showDeleted && (
            <View className="flex-row items-center gap-2 mb-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="archive" size={14} color="#6B7280" />
              <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
                Showing deleted purchases
              </Text>
              <Pressable
                onPress={() => setShowDeleted(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to active purchases"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Back to active
                </Text>
              </Pressable>
            </View>
          )}

          {/* List header — title + count, layout toggle (active list only;
              the deleted list stays cards). Stays visible during loading;
              only the records below skeletonize. */}
          {!listError && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  {showDeleted ? "Deleted Purchases" : "All Purchases"}
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              {!showDeleted && (
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              )}
            </View>
          )}

          {/* Bulk-action toolbar — table view of the active list, shown while a
              selection exists (the shared Bookings bulk bar, in its flat look). */}
          {!showDeleted && viewMode === "table" && selectedIds.size > 0 && (
            <BookingsBulkBar
              flat
              count={selectedIds.size}
              busy={bulkBusy}
              onStatus={runBulkStatus}
              onDelete={confirmBulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* List / states */}
          {listLoading ? (
            <PurchasesListSkeleton
              flat
              view={showDeleted ? "cards" : viewMode}
            />
          ) : !listError && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={
                    listSource.length > 0
                      ? "search"
                      : showDeleted
                        ? "archive"
                        : "shopping-bag"
                  }
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {showDeleted
                  ? "No deleted purchases found"
                  : listSource.length === 0
                    ? "No purchases yet"
                    : "No purchases found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {listSource.length === 0
                  ? showDeleted
                    ? "There are no deleted purchases."
                    : "There are no event purchases for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
              {listSource.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setFilters(EMPTY_EVENT_PURCHASE_FILTERS);
                  }}
                  className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Clear search & filters
                  </Text>
                </Pressable>
              ) : (
                !showDeleted && (
                  <Pressable
                    onPress={() => router.push("/events/create-purchase")}
                    className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={15} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      New Purchase
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          ) : (
            !listError && (
              <>
                {/* Table (default) and card layouts render from the same `paged`
                    slice — switching is instant and never refetches. Deleted list
                    keeps cards. The eye action / card tap open Purchase Details. */}
                {!showDeleted && viewMode === "table" ? (
                  <EventPurchasesTable
                    purchases={paged}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
                    onView={openPurchaseDetails}
                    onEdit={(purchase) =>
                      router.push({
                        pathname: "/events/edit-purchase",
                        params: { id: String(purchase.id), from: "purchases" },
                      })
                    }
                    onStatusPress={setStatusPurchase}
                    onDelete={handleRowDelete}
                  />
                ) : (
                  paged.map((purchase) => (
                    <PurchaseCard
                      key={purchase.id}
                      purchase={purchase}
                      onPress={() => openPurchaseDetails(purchase)}
                    />
                  ))
                )}

                {/* Pagination — shared control (same as the other admin tables). */}
                <PaginationControls
                  page={page}
                  lastPage={lastPage}
                  perPage={perPage}
                  perPageOptions={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Full filter panel — every web-admin filter in one sheet (draft model). */}
      <EventPurchaseFiltersSheet
        visible={showFilterSheet}
        values={draft}
        events={eventOptions}
        onChange={setDraft}
        onApply={applyFilters}
        onClear={() => setDraft(EMPTY_EVENT_PURCHASE_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared range calendar for Created / Scheduled date, opened after the
          filter sheet closes so two native Modals are never mounted at once. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={
          (dateTarget === "created"
            ? draft.createdFrom
            : draft.scheduledFrom) || undefined
        }
        initialEnd={
          (dateTarget === "created" ? draft.createdTo : draft.scheduledTo) ||
          undefined
        }
        onClose={closeDateRange}
        onApply={applyDateRange}
      />

      {/* Per-row status picker (table Actions). Same sheet-based pattern as the
          Manage Accounts "Set Status" picker, so the style stays consistent. */}
      <BottomSheet
        visible={statusPurchase !== null}
        onClose={() => (statusBusy ? undefined : setStatusPurchase(null))}
        title="Set Status"
      >
        <View className="px-4 pb-8">
          {statusBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            STATUS_PICKER_OPTIONS.map((option) => {
              const isSelected = statusPurchase?.status === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => applyPurchaseStatus(option)}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className={`w-2 h-2 rounded-full ${
                        eventStatusTone(option).dot
                      }`}
                    />
                    <Text
                      className={`text-base font-medium ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {prettyStatus(option)}
                    </Text>
                  </View>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default EventPurchases;
