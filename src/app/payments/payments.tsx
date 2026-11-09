import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import {
  EMPTY_PAYMENT_FILTERS,
  PaymentFiltersSheet,
  countActivePaymentFilters,
  type PaymentFilterValues,
} from "../../components/ui/PaymentFiltersSheet";
import { Pagination } from "../../components/ui/Pagination";
import {
  DEFAULT_PAYMENT_COLUMNS,
  PAYMENT_COLUMN_META,
  PaymentsTable,
} from "../../components/ui/PaymentsTable";
import {
  AppliedFiltersHint,
  FilterChip,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  ToolbarIconButton,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import { mediaUrl } from "../../lib/api";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { payableRoute } from "../../lib/payments/payableRoute";
import { consumePaymentsStale } from "../../lib/paymentsStale";
import { getToken } from "../../lib/session";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  bulkInvoicesUrl,
  canManualRefund,
  canRefund,
  canVoid,
  deletePayment,
  fetchPayments,
  invoiceUrl,
  manualRefundPayment,
  refundPayment,
  isRefundRecord,
  isVoidRecord,
  voidPayment,
  type PaymentRow,
} from "../../services/paymentsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/** Status chips above the list — the Filters sheet's Status options. */
const STATUS_CHIPS = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Earliest `created_at` a row may have to pass the Time Period filter, phrased
 * exactly as the web's `period` predicate: today starts at midnight, and the
 * other windows count back from now (a week is the last seven days).
 */
function periodStart(period: PaymentFilterValues["period"]): number | null {
  if (period === "all") return null;
  const now = new Date();
  const back = new Date(now);
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case "week":
      back.setDate(now.getDate() - 7);
      return back.getTime();
    case "month":
      back.setMonth(now.getMonth() - 1);
      return back.getTime();
    case "year":
      back.setFullYear(now.getFullYear() - 1);
      return back.getTime();
    default:
      return null;
  }
}

/** ISO -> "Jul 9, 2026, 4:05 PM". */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

/** Pill classes for a payment status. */
function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "pending":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "refunded":
    case "voided":
      return { pill: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}

/** One payment card in the main list (Deleted Payments has its own screen). */
function PaymentCard({ p, deleted }: { p: PaymentRow; deleted?: boolean }) {
  const pill = statusPill(p.status);
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-200 dark:border-neutral-800">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {p.reference}
          </Text>
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            ID: {p.id}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${pill.pill}`}>
          <Text className={`text-xs font-semibold ${pill.text}`}>{p.statusLabel}</Text>
        </View>
      </View>

      <View className="mt-3">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {p.customerName}
        </Text>
        {!!p.customerEmail && (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {p.customerEmail}
          </Text>
        )}
      </View>

      <View className="flex-row items-center justify-between mt-3">
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-1.5">
            <Feather name="tag" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {p.typeLabel}
              {p.countLabel ? ` • ${p.countLabel}` : ""}
            </Text>
          </View>
          {!!p.payableReference && (
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {p.payableReference}
            </Text>
          )}
        </View>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {money(p.amount)}
        </Text>
      </View>

      <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Feather name="credit-card" size={13} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">{p.methodLabel}</Text>
        </View>
        {!!p.cardLabel && (
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 ml-[19px]">
            {p.cardLabel}
          </Text>
        )}
        {!!p.locationName && (
          <View className="flex-row items-center gap-1.5">
            <Feather name="map-pin" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">{p.locationName}</Text>
          </View>
        )}
        <View className="flex-row items-center gap-1.5">
          <Feather name={deleted ? "trash-2" : "calendar"} size={13} color="#9CA3AF" />
          <Text className={`text-xs ${deleted ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            {deleted ? `Deleted ${fmtDateTime(p.deletedAt)}` : fmtDateTime(p.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const Payments = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Scope to the global workspace location (company_admin). Payments has no
  // backend location param, so filtering stays client-side, keyed off the id.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? null : activeLocation.id;

  const [search, setSearch] = useState("");
  // Every list filter lives in one object behind the toolbar's "Filters"
  // segment (the web's filter panel), instead of a row of status chips.
  const [filters, setFilters] = useState<PaymentFilterValues>(
    EMPTY_PAYMENT_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  // Presentation layout only — table by default, card view on toggle. Both read
  // the same `visible` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // The payment-date range lives in a second sheet: this one is a native Modal,
  // and two stacked native Modals crash Android's new architecture.
  const [showDateSheet, setShowDateSheet] = useState(false);

  // Table selection (checkbox column) — ids, so it survives re-sorts and paging.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Which columns the table renders (the web's Columns dropdown).
  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(DEFAULT_PAYMENT_COLUMNS),
  );
  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Row actions: the signature sheet, and the "more actions" menu.
  const [signaturePayment, setSignaturePayment] = useState<PaymentRow | null>(null);
  const [actionsPayment, setActionsPayment] = useState<PaymentRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [invoiceBusyId, setInvoiceBusyId] = useState<number | null>(null);
  /** Which bulk-invoice button is running, so only it shows a spinner. */
  const [bulkBusy, setBulkBusy] = useState<"view" | "download" | null>(null);
  /** Which header-menu export is running ("csv" / "invoices"), or null. */
  const [exporting, setExporting] = useState<"csv" | "invoices" | null>(null);

  // The payment whose detail sheet is open (null = closed). Opened from the
  // actions menu or by deep link (/payments/payments?openId=123).
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === selectedPaymentId) ?? null,
    [payments, selectedPaymentId],
  );

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await fetchPayments(token);
      setPayments(list.rows);
      setTotal(list.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Deep link: open a payment's detail sheet directly when navigated here from a
  // notification (e.g. /payments/payments?openId=123). Wait until the list has
  // loaded before resolving; if the record is gone, tell the user and stay put.
  const { openId, sheet } = useLocalSearchParams<{
    openId?: string;
    sheet?: string;
  }>();
  useEffect(() => {
    if (!openId || loading) return;
    const match = payments.find((p) => String(p.id) === openId);
    if (match) {
      setSelectedPaymentId(match.id);
    } else {
      Alert.alert("Payment unavailable", "This payment is no longer available.");
    }
    router.setParams({ openId: undefined });
  }, [openId, loading, payments, router]);

  // Package Invoices and Deleted Payments are their own screens now. An old
  // ?sheet=invoices / ?sheet=deleted link still lands on the right one.
  useEffect(() => {
    if (sheet === "invoices") router.push("/payments/package-invoices");
    else if (sheet === "deleted") router.push("/payments/deleted-payments");
    else return;
    router.setParams({ sheet: undefined });
  }, [sheet, router]);

  // A restore / permanent delete on Deleted Payments changes this list; refetch
  // when coming back so the restored payment shows without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumePaymentsStale()) void load();
    }, [load]),
  );

  // Stat cards — counts + revenue over the full fetched set.
  const stats = useMemo(() => {
    const sum = (rows: PaymentRow[]) => rows.reduce((acc, p) => acc + p.amount, 0);
    const completed = payments.filter((p) => p.status === "completed");
    const pending = payments.filter((p) => p.status === "pending");
    const returned = payments.filter((p) => p.status === "refunded" || p.status === "voided");
    return {
      total,
      totalRevenue: sum(payments),
      completedCount: completed.length,
      collected: sum(completed),
      pendingCount: pending.length,
      awaiting: sum(pending),
      returnedCount: returned.length,
      returned: sum(returned),
    };
  }, [payments, total]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const since = periodStart(filters.period);
    const min = filters.amountMin === "" ? null : parseFloat(filters.amountMin);
    const max = filters.amountMax === "" ? null : parseFloat(filters.amountMax);
    const { createdFrom, createdTo } = filters;

    return payments.filter((p) => {
      const matchesSearch =
        !q ||
        p.reference.toLowerCase().includes(q) ||
        (p.payableReference?.toLowerCase().includes(q) ?? false) ||
        p.customerName.toLowerCase().includes(q) ||
        p.customerEmail.toLowerCase().includes(q) ||
        p.typeLabel.toLowerCase().includes(q) ||
        p.methodLabel.toLowerCase().includes(q) ||
        p.locationName.toLowerCase().includes(q) ||
        p.statusLabel.toLowerCase().includes(q) ||
        p.amount.toFixed(2).includes(q);
      if (!matchesSearch) return false;

      if (activeLocationId != null && p.locationId !== activeLocationId) {
        return false;
      }
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.method !== "all" && p.method !== filters.method) return false;
      if (
        filters.payableType !== "all" &&
        p.payableType !== filters.payableType
      ) {
        return false;
      }

      // Refund and void bookkeeping rows sit in the list beside the payments
      // they undo, so "Payments" means neither of the two.
      if (filters.recordType !== "all") {
        const refund = isRefundRecord(p);
        const voided = isVoidRecord(p);
        if (filters.recordType === "refund" && !refund) return false;
        if (filters.recordType === "void" && !voided) return false;
        if (filters.recordType === "payment" && (refund || voided)) return false;
      }

      if (since != null) {
        const when = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
        if (Number.isNaN(when) || when < since) return false;
      }
      if (createdFrom || createdTo) {
        const day = p.createdAt ? p.createdAt.substring(0, 10) : null;
        if (!day) return false;
        if (createdFrom && day < createdFrom) return false;
        if (createdTo && day > createdTo) return false;
      }

      if (min != null && !Number.isNaN(min) && p.amount < min) return false;
      if (max != null && !Number.isNaN(max) && p.amount > max) return false;

      return true;
    });
  }, [payments, search, filters, activeLocationId]);

  // Reset to page 1 whenever the filters change the result set. Selection is
  // cleared too — keeping ids that are no longer on screen reads as a bug.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, filters, activeLocationId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);

  /* ---- row actions ---- */

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const everySelected =
        visible.length > 0 && visible.every((p) => next.has(p.id));
      visible.forEach((p) => (everySelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }, [visible]);

  /**
   * Pull an invoice PDF and hand it to the share sheet. The endpoints stream a
   * PDF, so this goes through expo-file-system with the bearer header rather
   * than the JSON client (same flow as the package invoices export).
   */
  const shareInvoicePdf = useCallback(
    async (url: string, filename: string, dialogTitle: string) => {
      const token = getToken();
      if (!token) return;
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const { status: httpStatus, uri } = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      });
      if (httpStatus !== 200) {
        let message = "Could not generate the invoice.";
        try {
          const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri));
          if (parsed?.message) message = parsed.message;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        Alert.alert("Invoice unavailable", message);
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Invoice ready", `Saved to ${uri}`);
      }
    },
    [],
  );

  /** Row action — one payment's invoice. */
  const downloadInvoice = useCallback(
    async (p: PaymentRow) => {
      setInvoiceBusyId(p.id);
      try {
        await shareInvoicePdf(
          invoiceUrl(p.id),
          `invoice-${p.id}.pdf`,
          `Invoice #${p.id}`,
        );
      } catch (err) {
        Alert.alert(
          "Download failed",
          err instanceof Error ? err.message : "Could not download the invoice.",
        );
      } finally {
        setInvoiceBusyId(null);
      }
    },
    [shareInvoicePdf],
  );

  /**
   * Bulk action — one PDF holding every selected payment's invoice. `stream`
   * asks the server to render inline ("View Selected") instead of as an
   * attachment ("Download Selected"), matching the web's two buttons.
   */
  const exportSelectedInvoices = useCallback(
    async (stream: boolean) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      setBulkBusy(stream ? "view" : "download");
      try {
        await shareInvoicePdf(
          bulkInvoicesUrl(ids, stream),
          `invoices-${ids.length}.pdf`,
          `${ids.length} invoice${ids.length === 1 ? "" : "s"}`,
        );
        setSelectedIds(new Set());
      } catch (err) {
        Alert.alert(
          "Export failed",
          err instanceof Error ? err.message : "Could not export the invoices.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, shareInvoicePdf],
  );

  /**
   * Header menu action — the whole filtered list as a spreadsheet (the web's
   * "Export CSV"). The native modules load lazily, as everywhere else here.
   */
  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "No payments match the current filters.");
      return;
    }
    setExporting("csv");
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "Payment ID",
        "Transaction",
        "Type",
        "Reference",
        "Customer",
        "Email",
        "Amount",
        "Method",
        "Card",
        "Status",
        "Location",
        "Date",
        "Paid At",
        "Refunded At",
        "Updated At",
        "Notes",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const when = (iso: string | null) =>
        formatDateTimeET(iso, { month: "short", showZone: false, fallback: "" });
      const lines = filtered.map((row) =>
        [
          row.id,
          row.reference,
          row.typeLabel,
          row.payableReference ?? "",
          row.customerName,
          row.customerEmail,
          row.amount.toFixed(2),
          row.methodLabel,
          row.cardLabel ?? "",
          row.statusLabel,
          row.locationName,
          when(row.createdAt),
          when(row.paidAt),
          when(row.refundedAt),
          when(row.updatedAt),
          row.notes ?? "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}payments-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Payments",
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
      setExporting(null);
    }
  }, [filtered]);

  /**
   * Header menu action — one PDF holding every invoice in play: the checked
   * rows when the table has a selection, otherwise the whole filtered list.
   */
  const exportInvoices = useCallback(async () => {
    const ids =
      selectedIds.size > 0 ? [...selectedIds] : filtered.map((row) => row.id);
    if (ids.length === 0) {
      Alert.alert("Nothing to export", "No payments match the current filters.");
      return;
    }
    setExporting("invoices");
    try {
      await shareInvoicePdf(
        bulkInvoicesUrl(ids, false),
        `invoices-${ids.length}.pdf`,
        `${ids.length} invoice${ids.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export the invoices.",
      );
    } finally {
      setExporting(null);
    }
  }, [filtered, selectedIds, shareInvoicePdf]);

  /** Run one of the menu's mutations, then close the sheet and refresh. */
  const runAction = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setActionBusy(true);
      try {
        await fn();
        setActionsPayment(null);
        await load();
      } catch (err) {
        Alert.alert(
          `${label} failed`,
          err instanceof Error ? err.message : `Could not ${label.toLowerCase()}.`,
        );
      } finally {
        setActionBusy(false);
      }
    },
    [load],
  );

  /** Destructive menu entries confirm first — they move money or hide records. */
  const confirmAction = useCallback(
    (title: string, message: string, verb: string, fn: () => Promise<void>) => {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: "destructive",
          onPress: () => runAction(title, fn),
        },
      ]);
    },
    [runAction],
  );

  const tableActions = useMemo(
    () => ({
      onSignature: (p: PaymentRow) => setSignaturePayment(p),
      onInvoice: (p: PaymentRow) => downloadInvoice(p),
      onMore: (p: PaymentRow) => setActionsPayment(p),
    }),
    [downloadInvoice],
  );

  const activeFilterCount = countActivePaymentFilters(filters);

  // The filter sheet closes fully before the calendar opens (and reopens after),
  // so the two native Modals are never mounted at the same time.
  const openDateRange = useCallback(() => {
    setShowFilterSheet(false);
    setTimeout(() => setShowDateSheet(true), 280);
  }, []);
  const closeDateRange = useCallback(() => {
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyDateRange = useCallback((start: string, end: string) => {
    setFilters((f) => ({ ...f, createdFrom: start, createdTo: end }));
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);

  // Status chips — a visible surface over the sheet's Status filter, not a
  // second one: both write `filters.status`. Counts are over the
  // location-scoped list, so each chip says how many it would show.
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    payments.forEach((p) => {
      if (activeLocationId != null && p.locationId !== activeLocationId) return;
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    });
    return counts;
  }, [payments, activeLocationId]);
  const scopedCount = useMemo(
    () =>
      activeLocationId == null
        ? payments.length
        : payments.filter((p) => p.locationId === activeLocationId).length,
    [payments, activeLocationId],
  );

  // More — the page's exports and the two sibling sheets (the hub's quick
  // links), as module-hub shortcuts. Exports read "Exporting…" while running.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: exporting === "csv" ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (exporting == null) exportCsv();
      },
    },
    {
      label: exporting === "invoices" ? "Exporting…" : "Export Invoices",
      icon: "printer",
      onPress: () => {
        if (exporting == null) exportInvoices();
      },
    },
    {
      label: "Package Invoices",
      icon: "file-text",
      route: "/payments/package-invoices",
    },
    {
      label: "Deleted Payments",
      icon: "trash-2",
      route: "/payments/deleted-payments",
    },
  ];

  const showInitialLoader = loading && payments.length === 0;
  const showError = !loading && !!error && payments.length === 0;

  const clearSearchAndFilters = () => {
    setSearch("");
    setFilters(EMPTY_PAYMENT_FILTERS);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back and title; nothing to create here. */}
      <ModuleHeader title="Manage Payments" />

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
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Every payment transaction, with status, refunds and invoices at a
            glance
          </Text>

          {/* Global workspace location selector (company-admin only). The
              list is already scoped to it client-side. */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state (nothing loaded to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load payments"
              message={error ?? ""}
              onRetry={load}
            />
          )}

          {/* Summary — one panel, four figures over the full fetched set. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <SummaryPanel
                figures={[
                  {
                    icon: "credit-card",
                    title: "Total Payments",
                    value: String(stats.total),
                    hint: `${money(stats.totalRevenue)} total revenue`,
                  },
                  {
                    icon: "check-circle",
                    title: "Completed",
                    value: String(stats.completedCount),
                    hint: `${money(stats.collected)} collected`,
                  },
                  {
                    icon: "clock",
                    title: "Pending",
                    value: String(stats.pendingCount),
                    hint: `${money(stats.awaiting)} awaiting`,
                  },
                  {
                    icon: "rotate-ccw",
                    title: "Refunded / Voided",
                    value: String(stats.returnedCount),
                    hint: `${money(stats.returned)} returned`,
                  },
                ]}
              />
            )
          )}

          {/* More — exports and sibling sheets as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search payments"
            />
            <FiltersButton
              count={activeFilterCount}
              onPress={() => setShowFilterSheet(true)}
            />
          </View>

          <AppliedFiltersHint
            count={activeFilterCount}
            onClear={() => setFilters(EMPTY_PAYMENT_FILTERS)}
          />

          {/* Status chips — same `filters.status` as the Filters sheet. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {STATUS_CHIPS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={
                  showInitialLoader
                    ? undefined
                    : opt.value === "all"
                      ? scopedCount
                      : (statusCounts.get(opt.value) ?? 0)
                }
                selected={filters.status === opt.value}
                onPress={() =>
                  setFilters((f) => ({ ...f, status: opt.value }))
                }
              />
            ))}
          </ScrollView>

          {/* List header — title + count, Columns (table only), layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Payments" count={filtered.length}>
              <View className="flex-row items-center gap-2">
                {viewMode === "table" && (
                  <ToolbarIconButton
                    icon="columns"
                    label="Toggle columns"
                    active={showColumns}
                    onPress={() => setShowColumns(true)}
                  />
                )}
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </ListHeader>
          )}

          {/* Bulk actions — appears the moment a row is checked, as on the
              web (BulkActionsBar): count, View Selected, Download Selected. */}
          {viewMode === "table" && selectedIds.size > 0 && (
            <View className="flex-row items-center gap-3 flex-wrap rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 mb-3">
              <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                {selectedIds.size} payment{selectedIds.size === 1 ? "" : "s"}{" "}
                selected
              </Text>
              <View className="flex-1" />
              <Pressable
                onPress={() => exportSelectedInvoices(true)}
                disabled={bulkBusy != null}
                accessibilityRole="button"
                accessibilityLabel="View selected invoices"
                className={`flex-row items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70 ${
                  bulkBusy != null ? "opacity-60" : ""
                }`}
              >
                {bulkBusy === "view" ? (
                  <ActivityIndicator size="small" color={PRIMARY} />
                ) : (
                  <Feather name="eye" size={14} color="#374151" />
                )}
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  View Selected
                </Text>
              </Pressable>
              <Pressable
                onPress={() => exportSelectedInvoices(false)}
                disabled={bulkBusy != null}
                accessibilityRole="button"
                accessibilityLabel="Download selected invoices"
                className={`flex-row items-center gap-2 h-9 px-3 rounded-lg bg-[#0644C7] active:opacity-90 ${
                  bulkBusy != null ? "opacity-60" : ""
                }`}
              >
                {bulkBusy === "download" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="printer" size={14} color="#FFFFFF" />
                )}
                <Text className="text-xs font-semibold text-white">
                  Download Selected
                </Text>
              </Pressable>
            </View>
          )}

          {/* List — table (default) and card layouts render from the same
              `visible` slice, so switching is instant and never refetches.
              Table rows are inert: everything is reached from the Actions
              cell, so a stray tap while scrolling can't open a payment. Each
              state is keyed so switching between them remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? (
                <AttractionsTableSkeleton />
              ) : (
                <AttractionsListSkeleton />
              )}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            payments.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="credit-card"
                  title="No payments yet"
                  message="Payments taken on bookings, attractions, events and gift cards show up here."
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No payments found"
                  message="No payments match your search or filters."
                  actionLabel="Clear search & filters"
                  onAction={clearSearchAndFilters}
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <PaymentsTable
                  payments={visible}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllOnPage}
                  visibleKeys={visibleColumns}
                  actions={tableActions}
                  invoiceBusyId={invoiceBusyId}
                  flat
                />
              ) : (
                visible.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPaymentId(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View payment ${p.reference}`}
                    className="mb-3"
                  >
                    <PaymentCard p={p} />
                  </Pressable>
                ))
              )}

              <Pagination
                page={currentPage}
                perPage={perPage}
                total={filtered.length}
                onPageChange={setPage}
                onPerPageChange={(pp) => {
                  setPerPage(pp);
                  setPage(1);
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Full filter panel — every list filter in one sheet. */}
      <PaymentFiltersSheet
        visible={showFilterSheet}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_PAYMENT_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared range calendar for the Payment Date filter, opened only after
          the filter sheet has closed. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={filters.createdFrom || undefined}
        initialEnd={filters.createdTo || undefined}
        onClose={closeDateRange}
        onApply={applyDateRange}
      />

      <ColumnsSheet
        visible={showColumns}
        columns={PAYMENT_COLUMN_META}
        visibleKeys={visibleColumns}
        onToggle={toggleColumn}
        onShowAll={() =>
          setVisibleColumns(new Set(PAYMENT_COLUMN_META.map((c) => c.key)))
        }
        onReset={() => setVisibleColumns(new Set(DEFAULT_PAYMENT_COLUMNS))}
        onClose={() => setShowColumns(false)}
      />

      <SignatureSheet
        payment={signaturePayment}
        onClose={() => setSignaturePayment(null)}
      />

      <PaymentActionsSheet
        payment={actionsPayment}
        busy={actionBusy}
        onClose={() => (actionBusy ? undefined : setActionsPayment(null))}
        onRefund={(p) =>
          confirmAction(
            "Refund",
            `Refund ${money(p.amount)} to the original card via Authorize.Net? This cannot be undone.`,
            "Refund",
            () => refundPayment(getToken() ?? "", p.id),
          )
        }
        onManualRefund={(p) =>
          confirmAction(
            "Manual refund",
            `Record a ${p.methodLabel} refund of ${money(p.amount)}? No money moves through the gateway.`,
            "Record refund",
            () => manualRefundPayment(getToken() ?? "", p.id),
          )
        }
        onVoid={(p) =>
          confirmAction(
            "Void",
            "Cancel this transaction before it settles? No money moves — the charge is simply removed.",
            "Void",
            () => voidPayment(getToken() ?? "", p.id),
          )
        }
        onOpenPayable={(p) => {
          const route = payableRoute(p.payableType, p.payableId);
          if (!route) return;
          setActionsPayment(null);
          router.push(route);
        }}
        onViewDetails={(p) => {
          setActionsPayment(null);
          setSelectedPaymentId(p.id);
        }}
        onDelete={(p) =>
          confirmAction(
            "Delete",
            "Soft delete this payment? It can be restored later from View Deleted, and linked totals are recalculated.",
            "Delete",
            () => deletePayment(getToken() ?? "", p.id),
          )
        }
      />

      <PaymentDetailSheet
        payment={selectedPayment}
        visible={selectedPaymentId != null}
        onClose={() => setSelectedPaymentId(null)}
      />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Signature & Terms sheet                                            */
/* ------------------------------------------------------------------ */

/**
 * The web's "Signature & Terms" modal: whether the customer accepted the terms
 * at checkout, and the signature they drew. Both come straight off the payment
 * record (`terms_accepted` / `signature_image`) — no extra request. The image
 * may be a storage path or an inline data URI, which `mediaUrl` resolves.
 */
function SignatureSheet({
  payment,
  onClose,
}: {
  payment: PaymentRow | null;
  onClose: () => void;
}) {
  const src = payment?.signatureImage ? mediaUrl(payment.signatureImage) : null;
  return (
    <BottomSheet
      visible={payment != null}
      onClose={onClose}
      title="Signature & Terms"
      subtitle={payment ? `Payment #${payment.id} — ${payment.customerName}` : undefined}
      icon={
        <View
          className="w-9 h-9 rounded-lg items-center justify-center shrink-0"
          style={{ backgroundColor: "#0644C71A" }}
        >
          <Feather name="edit-3" size={18} color={PRIMARY} />
        </View>
      }
    >
      <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Terms &amp; Conditions
        </Text>
        {payment?.termsAccepted === true ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 px-3.5 py-3">
            <Feather name="check-circle" size={16} color="#16A34A" />
            <Text className="text-sm font-medium text-green-800 dark:text-green-300">
              Accepted
            </Text>
          </View>
        ) : payment?.termsAccepted === false ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3.5 py-3">
            <Feather name="x-circle" size={16} color="#DC2626" />
            <Text className="text-sm font-medium text-red-800 dark:text-red-300">
              Not accepted
            </Text>
          </View>
        ) : (
          <View className="rounded-xl border border-gray-200 dark:border-neutral-700 px-3.5 py-3">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Not recorded
            </Text>
          </View>
        )}

        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-5 mb-2">
          Signature
        </Text>
        <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/40 items-center justify-center p-3 min-h-[140px]">
          {src ? (
            <Image
              source={{ uri: src }}
              style={{ width: "100%", height: 140 }}
              contentFit="contain"
              transition={120}
              accessibilityLabel="Customer signature"
            />
          ) : (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              No signature provided
            </Text>
          )}
        </View>

        <Pressable
          onPress={onClose}
          className="h-12 rounded-xl items-center justify-center bg-[#0644C7] active:opacity-90 mt-5"
        >
          <Text className="text-base font-semibold text-white">Close</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* More actions sheet                                                 */
/* ------------------------------------------------------------------ */

/** One entry in the actions menu — title, explanatory line, and a tint. */
function ActionEntry({
  icon,
  title,
  desc,
  tint,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  desc: string;
  tint: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`flex-row items-start gap-3 px-4 py-3.5 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Feather name={icon} size={18} color={tint} style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-base font-medium" style={{ color: tint }}>
          {title}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {desc}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The web's per-row "more actions" dropdown, as a sheet. Which entries appear
 * is decided by the same eligibility rules the web uses (`canRefund` /
 * `canVoid` / `canManualRefund`), so the app can never offer an action the
 * gateway would reject.
 */
function PaymentActionsSheet({
  payment,
  busy,
  onClose,
  onRefund,
  onManualRefund,
  onVoid,
  onOpenPayable,
  onViewDetails,
  onDelete,
}: {
  payment: PaymentRow | null;
  busy: boolean;
  onClose: () => void;
  onRefund: (p: PaymentRow) => void;
  onManualRefund: (p: PaymentRow) => void;
  onVoid: (p: PaymentRow) => void;
  onOpenPayable: (p: PaymentRow) => void;
  onViewDetails: (p: PaymentRow) => void;
  onDelete: (p: PaymentRow) => void;
}) {
  return (
    <BottomSheet
      visible={payment != null}
      onClose={onClose}
      title={payment ? `Payment #${payment.id}` : "Payment"}
      subtitle={payment ? `${payment.reference} — ${money(payment.amount)}` : undefined}
    >
      <View className="px-4 pb-8">
        {busy ? (
          <View className="py-8 items-center">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : (
          payment && (
            <>
              {canRefund(payment) && (
                <ActionEntry
                  icon="rotate-ccw"
                  tint="#EA580C"
                  title="Refund (Authorize.Net)"
                  desc="Returns money to the original card via the payment gateway. Use for settled transactions."
                  onPress={() => onRefund(payment)}
                />
              )}
              {canVoid(payment) && (
                <ActionEntry
                  icon="slash"
                  tint="#DC2626"
                  title="Void Transaction"
                  desc="Cancels the transaction before it settles. No money moves — the charge is simply removed."
                  onPress={() => onVoid(payment)}
                />
              )}
              {canManualRefund(payment) && (
                <ActionEntry
                  icon="rotate-ccw"
                  tint="#EA580C"
                  title={`Manual Refund (${payment.methodLabel})`}
                  desc="Records a cash/in-store refund. No gateway involved — marks the refund in the system only."
                  onPress={() => onManualRefund(payment)}
                />
              )}
              {payableRoute(payment.payableType, payment.payableId) && (
                <ActionEntry
                  icon="external-link"
                  tint={PRIMARY}
                  title={`Open ${payment.typeLabel}`}
                  desc={
                    payment.payableType === "ticket_order"
                      ? "Part of a bulk order — take the payment on the order."
                      : "Open the record this payment was made against."
                  }
                  onPress={() => onOpenPayable(payment)}
                />
              )}
              <ActionEntry
                icon="file-text"
                tint="#374151"
                title="View Details"
                desc="Open the full payment record."
                onPress={() => onViewDetails(payment)}
              />
              <View className="h-px bg-gray-100 dark:bg-neutral-800 my-1" />
              <ActionEntry
                icon="trash-2"
                tint="#DC2626"
                title="Delete Payment"
                desc="Soft delete — can be restored later. Linked totals will be recalculated."
                onPress={() => onDelete(payment)}
              />
            </>
          )
        )}
      </View>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Payment detail sheet                                               */
/* ------------------------------------------------------------------ */

/** Read-only detail row used inside the payment detail sheet. */
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-2">
        <Feather name={icon} size={14} color="#9CA3AF" />
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</Text>
      </View>
      <Text className="text-sm text-gray-900 dark:text-white text-right flex-1" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function PaymentDetailSheet({
  payment,
  visible,
  onClose,
}: {
  payment: PaymentRow | null;
  visible: boolean;
  onClose: () => void;
}) {
  const pill = payment ? statusPill(payment.status) : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Payment Details">
      <ScrollView className="px-6 pb-6" showsVerticalScrollIndicator={false}>
        {payment ? (
          <View>
            {/* Amount + status hero */}
            <View className="items-center py-4">
              <Text className="text-3xl font-bold text-gray-900 dark:text-white">
                {money(payment.amount)}
              </Text>
              {pill && (
                <View className={`mt-2 px-3 py-1 rounded-full ${pill.pill}`}>
                  <Text className={`text-xs font-semibold ${pill.text}`}>
                    {payment.statusLabel}
                  </Text>
                </View>
              )}
            </View>

            <DetailRow icon="hash" label="Transaction" value={payment.reference} />
            <DetailRow icon="credit-card" label="Method" value={payment.methodLabel} />
            {!!payment.cardLabel && (
              <DetailRow icon="credit-card" label="Card" value={payment.cardLabel} />
            )}
            <DetailRow
              icon="tag"
              label="Type"
              value={
                payment.typeLabel + (payment.countLabel ? ` • ${payment.countLabel}` : "")
              }
            />
            {!!payment.payableReference && (
              <DetailRow icon="file-text" label="Reference" value={payment.payableReference} />
            )}
            <DetailRow icon="user" label="Customer" value={payment.customerName} />
            {!!payment.customerEmail && (
              <DetailRow icon="mail" label="Email" value={payment.customerEmail} />
            )}
            {!!payment.locationName && (
              <DetailRow icon="map-pin" label="Location" value={payment.locationName} />
            )}
            <DetailRow icon="calendar" label="Date" value={fmtDateTime(payment.createdAt)} />
          </View>
        ) : (
          <View className="items-center py-10">
            <Feather name="credit-card" size={36} color="#D1D5DB" />
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              Payment details unavailable.
            </Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

export default Payments;
