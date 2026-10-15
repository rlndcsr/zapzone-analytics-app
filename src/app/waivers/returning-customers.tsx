import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckboxRow } from "../../components/ui/FormControls";
import { Pagination } from "../../components/ui/Pagination";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { WaiversListSkeleton } from "../../components/ui/skeleton/WaiversSkeleton";
import { ReviewBadge } from "../../components/waivers/ReviewBadge";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { getToken } from "../../lib/session";
import {
  emptyListMessage,
  listCountParts,
  recordName,
  type ReturningCustomerRow,
} from "../../lib/waivers/returningCustomers";
import { consumeReturningCustomersStale } from "../../lib/waivers/returningCustomersStale";
import { fetchReturningCustomers } from "../../services/waiverProfilesService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

const openRecord = (row: ReturningCustomerRow) =>
  router.push(`/waivers/returning-customer?id=${row.id}` as never);

/** Customer cell: name, review pill, email — as the web's first column. */
const CustomerCell = ({ row }: { row: ReturningCustomerRow }) => (
  <View>
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="shrink text-sm font-semibold text-gray-900 dark:text-white">
        {recordName(row)}
      </Text>
      {row.needsStaffReview && <ReviewBadge />}
    </View>
    {!!row.email && (
      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {row.email}
      </Text>
    )}
  </View>
);

type Column = {
  key: string;
  label: string;
  width: number;
  render: (row: ReturningCustomerRow) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "customer",
    label: "Customer",
    width: 260,
    render: (r) => <CustomerCell row={r} />,
  },
  {
    key: "phone",
    label: "Phone",
    width: 140,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {r.phone || "—"}
      </Text>
    ),
  },
  {
    key: "dependents",
    label: "Dependents",
    width: 110,
    render: (r) => <Text className={CELL_TEXT}>{r.dependentsCount}</Text>,
  },
  {
    key: "submissions",
    label: "Submissions",
    width: 110,
    render: (r) => <Text className={CELL_TEXT}>{r.submissionsCount}</Text>,
  },
  {
    key: "lastVisit",
    label: "Last visit",
    width: 230,
    render: (r) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatDateTimeET(r.lastWaiverAt)}
      </Text>
    ),
  },
  {
    key: "lastLocation",
    label: "Last location",
    width: 220,
    render: (r) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {r.lastLocationName || "—"}
      </Text>
    ),
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

const CustomersTable = ({ rows }: { rows: ReturningCustomerRow[] }) => (
  <View
    className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
    style={CARD_SHADOW}
  >
    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
      <View style={{ width: TABLE_WIDTH }}>
        <View
          className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
          style={{ minHeight: 48 }}
        >
          {COLUMNS.map((col) => (
            <View key={col.key} className="justify-center px-4 py-3" style={{ width: col.width }}>
              <Text
                numberOfLines={1}
                className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
              >
                {col.label}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, i) => (
          <Pressable
            key={row.id}
            onPress={() => openRecord(row)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${recordName(row)}`}
            className={`flex-row items-center active:bg-gray-50 dark:active:bg-neutral-800 ${
              i < rows.length - 1 ? "border-b border-gray-100 dark:border-neutral-800" : ""
            }`}
            style={{ minHeight: 64 }}
          >
            {COLUMNS.map((col) => (
              <View key={col.key} className="justify-center px-4 py-3" style={{ width: col.width }}>
                {col.render(row)}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  </View>
);

const Stat = ({ icon, label }: { icon: "phone" | "users" | "file-text"; label: string }) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={12} color="#9CA3AF" />
    <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
  </View>
);

const CustomerCard = ({ row }: { row: ReturningCustomerRow }) => (
  <Pressable
    onPress={() => openRecord(row)}
    accessibilityRole="button"
    accessibilityLabel={`Open ${recordName(row)}`}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <CustomerCell row={row} />
      </View>
      <Feather name="chevron-right" size={16} color="#9CA3AF" />
    </View>
    <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 mt-3">
      <Stat icon="phone" label={row.phone || "—"} />
      <Stat
        icon="users"
        label={`${row.dependentsCount} dependent${row.dependentsCount === 1 ? "" : "s"}`}
      />
      <Stat
        icon="file-text"
        label={`${row.submissionsCount} submission${row.submissionsCount === 1 ? "" : "s"}`}
      />
    </View>
    <View className="flex-row items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text numberOfLines={1} className="shrink text-xs text-gray-500 dark:text-gray-400">
        {row.lastLocationName || "—"}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {formatDateTimeET(row.lastWaiverAt, { month: "short" })}
      </Text>
    </View>
  </Pressable>
);

/**
 * Returning Customers (web parity: `/waivers/profiles`, WaiverProfiles.tsx) —
 * the saved customer and dependent records behind the kiosk phone lookup.
 * Server-paged; a row opens the record on its own screen.
 */
const ReturningCustomersScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [rows, setRows] = useState<ReturningCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const requestIdRef = useRef(0);

  // Same 350 ms settle as the web before a search hits the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (withSpinner = true) => {
      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;

      const token = getToken();
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      if (withSpinner) setLoading(true);
      try {
        const res = await fetchReturningCustomers(token, {
          page,
          perPage,
          search,
          needsReview: reviewOnly,
        });
        if (!isCurrent()) return;
        setRows(res.rows);
        setTotal(res.total);
        setError(null);
      } catch (err) {
        if (!isCurrent()) return;
        setRows([]);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Failed to load returning customers",
        );
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [page, perPage, search, reviewOnly],
  );

  useEffect(() => {
    load();
    // A new search/page/filter (or leaving) outdates whatever reply is on its way.
    const requests = requestIdRef;
    return () => {
      requests.current++;
    };
  }, [load]);

  // A record changed on its own screen: re-read this page on the way back,
  // keeping the rows on screen meanwhile.
  const loadRef = useRef(load);
  loadRef.current = load;
  useFocusEffect(
    useCallback(() => {
      if (consumeReturningCustomersStale()) void loadRef.current(false);
    }, []),
  );

  // Clearing a flag under "Needs review only" can shrink the list under the
  // current page — step back rather than strand the user on an empty one.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / perPage));
    setPage((p) => Math.min(p, last));
  }, [total, perPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(false);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const reviewCount = useMemo(
    () => rows.filter((r) => r.needsStaffReview).length,
    [rows],
  );
  const countParts = listCountParts(total, reviewCount);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Back to Waivers"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Returning Customers
          </Text>
          <View style={{ width: 36 }} />
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
        <View className="px-5">
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Returning Customers
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Saved customer and dependent details behind the kiosk phone
              lookup. Guests cannot change these — you can.
            </Text>
          </View>

          {/* Search + filters */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-5 shadow-sm gap-3">
            <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="Search by name, email or phone — any format"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search returning customers"
                className="flex-1 text-sm text-gray-900 dark:text-white"
              />
              {searchInput.length > 0 && (
                <Pressable
                  onPress={() => setSearchInput("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <CheckboxRow
                  label="Needs review only"
                  checked={reviewOnly}
                  onToggle={() => {
                    setReviewOnly((v) => !v);
                    setPage(1);
                  }}
                />
              </View>
              <Pressable
                onPress={() => void load()}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
                className={`flex-row items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-2 active:opacity-70 ${
                  loading ? "opacity-50" : ""
                }`}
              >
                <Feather name="refresh-cw" size={13} color={PRIMARY} />
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Refresh
                </Text>
              </Pressable>
            </View>

            <Text
              className="text-sm text-gray-600 dark:text-gray-400"
              accessibilityLiveRegion="polite"
            >
              {loading ? (
                "Counting…"
              ) : (
                <>
                  <Text className="font-semibold text-gray-900 dark:text-white">
                    {countParts.total}
                  </Text>
                  {` ${countParts.noun}`}
                  {countParts.review && (
                    <Text className="text-amber-700 dark:text-amber-400">
                      {countParts.review}
                    </Text>
                  )}
                </>
              )}
            </Text>
          </View>

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Couldn&apos;t load returning customers
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {!loading && !error && rows.length > 0 && (
            <View className="flex-row items-center justify-between gap-2 mb-4">
              <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                Customers
              </Text>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          )}

          {loading ? (
            <WaiversListSkeleton />
          ) : error ? null : rows.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="users" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-xs">
                {emptyListMessage(!!search || reviewOnly)}
              </Text>
            </View>
          ) : (
            <>
              {viewMode === "table" ? (
                <CustomersTable rows={rows} />
              ) : (
                rows.map((row) => <CustomerCard key={row.id} row={row} />)
              )}
              <Pagination
                page={page}
                perPage={perPage}
                total={total}
                options={PER_PAGE_OPTIONS}
                onPageChange={setPage}
                onPerPageChange={(n) => {
                  setPerPage(n);
                  setPage(1);
                }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ReturningCustomersScreen;
