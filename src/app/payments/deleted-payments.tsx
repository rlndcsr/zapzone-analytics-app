import { Feather } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import {
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import { fmtDateTime, money, statusPill } from "../../lib/payments/paymentDisplay";
import { markPaymentsStale } from "../../lib/paymentsStale";
import { getToken } from "../../lib/session";
import {
  fetchTrashedPayments,
  forceDeletePayment,
  restorePayment,
  type PaymentRow,
} from "../../services/paymentsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 64;

/* ------------------------------------------------------------------ */
/* Row pieces                                                          */
/* ------------------------------------------------------------------ */

function StatusPill({ p }: { p: PaymentRow }) {
  const pill = statusPill(p.status);
  return (
    <View className={`self-start rounded-full px-3 py-1 ${pill.pill}`}>
      <Text className={`text-xs font-semibold ${pill.text}`}>
        {p.statusLabel}
      </Text>
    </View>
  );
}

/** Restore + Delete Forever, as the old sheet had them under each card. */
function RowActions({
  p,
  busy,
  compact = false,
  onRestore,
  onDelete,
}: {
  p: PaymentRow;
  busy: boolean;
  compact?: boolean;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const pad = compact ? "px-3 py-2" : "flex-1 py-3";
  return (
    <View className="flex-row gap-2">
      <Pressable
        onPress={() => onRestore(p.id)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Restore payment ${p.reference}`}
        className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-green-200 active:opacity-70 dark:border-green-900/50 ${pad} ${
          busy ? "opacity-60" : ""
        }`}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#16A34A" />
        ) : (
          <Feather name="rotate-ccw" size={15} color="#16A34A" />
        )}
        <Text className="text-sm font-semibold text-green-700 dark:text-green-400">
          Restore
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onDelete(p.id)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Delete payment ${p.reference} forever`}
        className={`flex-row items-center justify-center gap-1.5 rounded-xl bg-red-500 active:opacity-90 ${pad} ${
          busy ? "opacity-60" : ""
        }`}
      >
        <Feather name="trash-2" size={15} color="#FFFFFF" />
        <Text className="text-sm font-semibold text-white">Delete Forever</Text>
      </Pressable>
    </View>
  );
}

/** One deleted payment as a card — every field the old sheet's card showed. */
function DeletedPaymentCard({
  p,
  busy,
  onRestore,
  onDelete,
}: {
  p: PaymentRow;
  busy: boolean;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <View className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-start justify-between">
        <View className="mr-2 flex-1">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {p.reference}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            ID: {p.id}
          </Text>
        </View>
        <StatusPill p={p} />
      </View>

      <View className="mt-3">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {p.customerName}
        </Text>
        {!!p.customerEmail && (
          <Text
            className="text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            {p.customerEmail}
          </Text>
        )}
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="mr-2 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Feather name="tag" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {p.typeLabel}
              {p.countLabel ? ` • ${p.countLabel}` : ""}
            </Text>
          </View>
          {!!p.payableReference && (
            <Text className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {p.payableReference}
            </Text>
          )}
        </View>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {money(p.amount)}
        </Text>
      </View>

      <View className="mt-3 gap-1.5 border-t border-gray-100 pt-3 dark:border-neutral-800">
        <View className="flex-row items-center gap-1.5">
          <Feather name="credit-card" size={13} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {p.methodLabel}
          </Text>
        </View>
        {!!p.cardLabel && (
          <Text className="ml-[19px] text-[11px] text-gray-400 dark:text-gray-500">
            {p.cardLabel}
          </Text>
        )}
        {!!p.locationName && (
          <View className="flex-row items-center gap-1.5">
            <Feather name="map-pin" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {p.locationName}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-1.5">
          <Feather name="trash-2" size={13} color="#9CA3AF" />
          <Text className="text-xs text-red-500 dark:text-red-400">
            Deleted {fmtDateTime(p.deletedAt)}
          </Text>
        </View>
      </View>

      <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
        <RowActions
          p={p}
          busy={busy}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      </View>
    </View>
  );
}

type Column = {
  key: string;
  label: string;
  width: number;
  render: (p: PaymentRow) => ReactNode;
};

const CELL = "text-sm text-gray-700 dark:text-gray-300";
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

const COLUMNS: Column[] = [
  {
    key: "transaction",
    label: "Transaction",
    width: 190,
    render: (p) => (
      <>
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {p.reference}
        </Text>
        <Text numberOfLines={1} className={CELL_HINT}>
          ID: {p.id}
        </Text>
      </>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    width: 200,
    render: (p) => (
      <>
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {p.customerName}
        </Text>
        {!!p.customerEmail && (
          <Text numberOfLines={1} className={CELL_HINT}>
            {p.customerEmail}
          </Text>
        )}
      </>
    ),
  },
  {
    key: "type",
    label: "Type",
    width: 170,
    render: (p) => (
      <>
        <Text numberOfLines={1} className={CELL}>
          {p.typeLabel}
          {p.countLabel ? ` • ${p.countLabel}` : ""}
        </Text>
        {!!p.payableReference && (
          <Text numberOfLines={1} className={CELL_HINT}>
            {p.payableReference}
          </Text>
        )}
      </>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    width: 110,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
        {money(p.amount)}
      </Text>
    ),
  },
  {
    key: "method",
    label: "Method",
    width: 160,
    render: (p) => (
      <>
        <Text numberOfLines={1} className={CELL}>
          {p.methodLabel}
        </Text>
        {!!p.cardLabel && (
          <Text numberOfLines={1} className={CELL_HINT}>
            {p.cardLabel}
          </Text>
        )}
      </>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 130,
    render: (p) => <StatusPill p={p} />,
  },
  {
    key: "location",
    label: "Location",
    width: 160,
    render: (p) => (
      <Text numberOfLines={2} className={CELL}>
        {p.locationName || "—"}
      </Text>
    ),
  },
  {
    key: "deleted",
    label: "Deleted",
    width: 190,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm text-red-500 dark:text-red-400">
        {fmtDateTime(p.deletedAt)}
      </Text>
    ),
  },
];

const ACTIONS_WIDTH = 260;

function DeletedPaymentsTable({
  rows,
  busyId,
  onRestore,
  onDelete,
}: {
  rows: PaymentRow[];
  busyId: number | null;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const width = COLUMNS.reduce((s, c) => s + c.width, 0) + ACTIONS_WIDTH;
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width }}>
          <View
            className="flex-row items-center border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/50"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {[...COLUMNS, { key: "actions", label: "Actions", width: ACTIONS_WIDTH }].map(
              (col) => (
                <View key={col.key} className="justify-center px-4 py-3" style={{ width: col.width }}>
                  <Text numberOfLines={1} className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {col.label}
                  </Text>
                </View>
              ),
            )}
          </View>
          {rows.map((p, i) => (
            <View
              key={p.id}
              className={`flex-row items-center ${
                i < rows.length - 1 ? "border-b border-gray-100 dark:border-neutral-800" : ""
              }`}
              style={{ minHeight: ROW_MIN_HEIGHT }}
            >
              {COLUMNS.map((col) => (
                <View key={col.key} className="justify-center px-4 py-3" style={{ width: col.width }}>
                  {col.render(p)}
                </View>
              ))}
              <View className="justify-center px-4 py-3" style={{ width: ACTIONS_WIDTH }}>
                <RowActions
                  p={p}
                  busy={busyId === p.id}
                  compact
                  onRestore={onRestore}
                  onDelete={onDelete}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

const matches = (p: PaymentRow, q: string) =>
  [
    p.reference,
    String(p.id),
    p.customerName,
    p.customerEmail,
    p.typeLabel,
    p.payableReference ?? "",
    p.methodLabel,
    p.locationName,
  ].some((v) => v.toLowerCase().includes(q));

export default function DeletedPayments() {
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  // Same request as the old sheet: every page of GET /api/payments/trashed.
  const requestIdRef = useRef(0);
  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { rows: list, total: t } = await fetchTrashedPayments(token);
      if (requestId !== requestIdRef.current) return;
      setRows(list);
      setTotal(t);
      setLoaded(true);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load deleted payments");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const restore = useCallback(
    async (id: number) => {
      const token = getToken();
      if (!token) return;
      setBusyId(id);
      try {
        await restorePayment(token, id);
        markPaymentsStale();
        await load();
      } catch (err) {
        Alert.alert("Restore failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const deleteForever = useCallback(
    (id: number) => {
      Alert.alert(
        "Delete forever?",
        "This permanently removes the payment. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete Forever",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              setBusyId(id);
              try {
                await forceDeletePayment(token, id);
                markPaymentsStale();
                await load();
              } catch (err) {
                Alert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
              } finally {
                setBusyId(null);
              }
            },
          },
        ],
      );
    },
    [load],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((p) => matches(p, q)) : rows;
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search, perPage]);

  // Keep the page in range when a restore / delete shrinks the list.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    setPage((p) => Math.min(p, last));
  }, [filtered.length, perPage]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  const amountTotal = useMemo(
    () => rows.reduce((sum, p) => sum + p.amount, 0),
    [rows],
  );
  // The amount is summed over the rows loaded; say so if that's not all of them.
  const allLoaded = rows.length >= total;

  const showInitialLoader = loading && !loaded;
  const showError = !!error && !loaded;

  const moreShortcuts: HubQuickLink[] = [
    { label: "Manage Payments", icon: "credit-card", route: "/payments/payments" },
    { label: "Package Invoices", icon: "file-text", route: "/payments/package-invoices" },
    { label: "Refresh", icon: "refresh-cw", onPress: () => void onRefresh() },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader title="Deleted Payments" />

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
        <View className="mt-4 px-4">
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Deleted payments and their totals, to restore or remove.
          </Text>

          {!!error && (
            <ListErrorBanner
              title="Could not load deleted payments"
              message={error}
              onRetry={() => void load()}
            />
          )}

          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <SummaryPanel
                figures={[
                  {
                    icon: "trash-2",
                    title: "Deleted Payments",
                    value: String(total),
                    hint: "In the trash",
                  },
                  {
                    icon: "dollar-sign",
                    title: "Deleted Amount",
                    value: money(amountTotal),
                    hint: allLoaded
                      ? "Across all deleted payments"
                      : `Across the ${rows.length} loaded`,
                  },
                ]}
              />
            )
          )}

          <View className="mt-5">
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          <View className="mb-3 mt-4 flex-row items-center gap-2">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search by transaction, customer or ID"
            />
          </View>

          {!showInitialLoader && !showError && (
            <ListHeader title="Deleted Payments" count={filtered.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? <AttractionsTableSkeleton /> : <AttractionsListSkeleton />}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            rows.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="trash-2"
                  title="No deleted payments"
                  message="Payments you delete show up here, ready to restore or remove for good."
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No deleted payments found"
                  message="No deleted payments match your search."
                  actionLabel="Clear search"
                  onAction={() => setSearch("")}
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <DeletedPaymentsTable
                  rows={paged}
                  busyId={busyId}
                  onRestore={restore}
                  onDelete={deleteForever}
                />
              ) : (
                paged.map((p) => (
                  <DeletedPaymentCard
                    key={p.id}
                    p={p}
                    busy={busyId === p.id}
                    onRestore={restore}
                    onDelete={deleteForever}
                  />
                ))
              )}
              <Pagination
                page={page}
                perPage={perPage}
                total={filtered.length}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
