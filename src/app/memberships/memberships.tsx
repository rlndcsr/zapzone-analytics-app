import { Feather } from "@expo/vector-icons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
import { SelectField } from "../../components/ui/FormControls";
import { MembershipsListSkeleton } from "../../components/ui/skeleton/MembershipsSkeleton";
import { MembershipsTable } from "../../components/ui/MembershipsTable";
import {
  MembershipsBulkBar,
  type MembershipBulkAction,
} from "../../components/ui/MembershipsBulkBar";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { consumeMembershipsStale } from "../../lib/membershipsStale";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { useMemberships } from "../../lib/hooks/useMemberships";
import { useMembershipPlans } from "../../lib/hooks/useMembershipPlans";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import {
  cancelMembership,
  createMembership,
  deleteMembership,
  freezeMembership,
  unfreezeMembership,
  type MembershipStatus,
  type PaymentType,
} from "../../services/membershipsService";
import {
  searchCustomers,
  type CustomerHit,
} from "../../services/customersService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

type FeatherName = ComponentProps<typeof Feather>["name"];

/** Per-status pill styling + label used across the list and action sheet. */
const STATUS_META: Record<
  MembershipStatus,
  { label: string; pill: string; dot: string }
> = {
  active: {
    label: "Active",
    pill: "bg-green-100 dark:bg-green-900/40",
    dot: "text-green-700 dark:text-green-300",
  },
  pending: {
    label: "Pending",
    pill: "bg-amber-100 dark:bg-amber-900/40",
    dot: "text-amber-700 dark:text-amber-300",
  },
  past_due: {
    label: "Past Due",
    pill: "bg-orange-100 dark:bg-orange-900/40",
    dot: "text-orange-700 dark:text-orange-300",
  },
  suspended: {
    label: "Suspended",
    pill: "bg-red-100 dark:bg-red-900/40",
    dot: "text-red-700 dark:text-red-300",
  },
  frozen: {
    label: "Frozen",
    pill: "bg-blue-100 dark:bg-blue-900/40",
    dot: "text-blue-700 dark:text-blue-300",
  },
  canceled: {
    label: "Canceled",
    pill: "bg-gray-200 dark:bg-neutral-700",
    dot: "text-gray-600 dark:text-gray-300",
  },
  expired: {
    label: "Expired",
    pill: "bg-gray-200 dark:bg-neutral-700",
    dot: "text-gray-600 dark:text-gray-300",
  },
};

const STATUS_FILTERS: { key: MembershipStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "past_due", label: "Past Due" },
  { key: "frozen", label: "Frozen" },
  { key: "suspended", label: "Suspended" },
  { key: "canceled", label: "Canceled" },
  { key: "expired", label: "Expired" },
];

const PAYMENT_OPTIONS: {
  key: PaymentType;
  label: string;
  icon: FeatherName;
}[] = [
  { key: "charge", label: "Charge card", icon: "credit-card" },
  { key: "external", label: "Cash / external", icon: "dollar-sign" },
  { key: "comp", label: "Comp (free)", icon: "gift" },
];

/** Format an ISO timestamp as "6/2/2026"; "—" when unparseable/absent. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** A stat card in the 2×2 overview grid. */
function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: FeatherName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
}) {
  return (
    <View
      className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center ${iconBg}`}
      >
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-3">
        {label}
      </Text>
      <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
        {value}
      </Text>
    </View>
  );
}

const Memberships = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  // Scope to the global workspace location (company_admin); managers stay
  // backend-scoped. Reactive so switching location refetches server-side.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const { memberships, counts, loading, error, refetch } = useMemberships({
    locationId: activeLocationId,
  });
  const { plans } = useMembershipPlans();
  // Metrics rollup still powers the Add-Member location picker options.
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "all">(
    "all",
  );
  const [refreshing, setRefreshing] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Table is the default view; card view stays available via the toggle.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<MembershipBulkAction | null>(null);

  // Open a membership's dedicated details screen (replaces the old action sheet).
  const openDetails = useCallback(
    (id: number) => {
      router.push({
        pathname: "/memberships/membership-details",
        params: { id: String(id) },
      });
    },
    [router],
  );

  // Deep link: open a member's details screen when navigated here from a
  // notification (e.g. ?openId=123). Wait until the list has loaded to verify
  // the record exists; otherwise show a friendly message.
  const { openId } = useLocalSearchParams<{ openId?: string }>();
  useEffect(() => {
    if (!openId || loading) return;
    const match = memberships.find((m) => String(m.id) === openId);
    if (match) openDetails(match.id);
    else
      Alert.alert(
        "Membership unavailable",
        "This membership is no longer available.",
      );
    router.setParams({ openId: undefined });
  }, [openId, loading, memberships, router, openDetails]);

  // Locations for the filter + Add Member picker come from the dashboard
  // metrics rollup (the /api/locations endpoint is too heavy for mobile).
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [] as { id: number; name: string }[];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memberships.filter((m) => {
      const matchesSearch =
        !q ||
        m.memberName.toLowerCase().includes(q) ||
        m.memberEmail.toLowerCase().includes(q) ||
        (m.qrToken?.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [memberships, search, statusFilter]);

  // Client-side pagination over the filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the search / filters move.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Clear selection whenever the visible set changes or we leave the table.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, page, perPage, viewMode, activeLocationId]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = paged.length > 0 && paged.every((m) => prev.has(m.id));
      return all ? new Set() : new Set(paged.map((m) => m.id));
    });
  }, [paged]);

  // Bulk status change (freeze / unfreeze / cancel-at-term) over the selection.
  const runBulkStatus = useCallback(
    async (action: Exclude<MembershipBulkAction, "delete">) => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      setBulkBusy(action);
      try {
        await Promise.all(
          ids.map((id) =>
            action === "freeze"
              ? freezeMembership(token, id)
              : action === "unfreeze"
                ? unfreezeMembership(token, id)
                : cancelMembership(token, id, "end_of_term"),
          ),
        );
        setSelectedIds(new Set());
        await refetch();
      } catch (err) {
        Alert.alert(
          "Action failed",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, refetch],
  );

  const confirmBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Delete memberships",
      "Only canceled memberships can be deleted. Continue?",
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
              await Promise.all(ids.map((id) => deleteMembership(token, id)));
              setSelectedIds(new Set());
              await refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Please try again.",
              );
            } finally {
              setBulkBusy(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // Refetch when returning from the details screen after a mutation.
  useFocusEffect(
    useCallback(() => {
      if (consumeMembershipsStale()) refetch();
    }, [refetch]),
  );

  const filterActive = statusFilter !== "all";
  const showInitialLoader = loading && memberships.length === 0;
  const showError = !loading && !!error && memberships.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white items-center text-lg font-bold">
            Memberships
          </Text>
          <View className="flex-row  gap-2"></View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Memberships
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View and manage all member subscriptions
            </Text>
          </View>

          {/* Actions: Scan · Plans · Reports pill, then Add Member */}
          <FilterPill>
            <PillSegment
              label="Scan Member"
              onPress={() => router.push("/memberships/membership-check-in")}
              renderIcon={(c) => <Feather name="maximize" size={15} color={c} />}
            />
            <PillSegment
              label="Plans"
              onPress={() => router.push("/memberships/membership-plan")}
              renderIcon={(c) => <Feather name="layers" size={15} color={c} />}
            />
            <PillSegment
              label="Reports"
              onPress={() => router.push("/memberships/membership-reports")}
              renderIcon={(c) => <Feather name="bar-chart-2" size={15} color={c} />}
            />
          </FilterPill>

          <Pressable
            onPress={() => setShowAdd(true)}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-5"
            accessibilityRole="button"
            accessibilityLabel="Add member"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white" numberOfLines={1}>
              Add Member
            </Text>
          </Pressable>

          {/* Stat cards */}
          <View className="flex-row flex-wrap gap-3 mb-5">
            <StatCard
              icon="users"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor={PRIMARY}
              label="Total"
              value={counts.total}
            />
            <StatCard
              icon="check-circle"
              iconBg="bg-green-50 dark:bg-green-900/30"
              iconColor="#16A34A"
              label="Active"
              value={counts.active}
            />
            <StatCard
              icon="alert-triangle"
              iconBg="bg-orange-50 dark:bg-orange-900/30"
              iconColor="#EA580C"
              label="Past Due"
              value={counts.pastDue}
            />
            <StatCard
              icon="pause-circle"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor="#2563EB"
              label="Frozen"
              value={counts.frozen}
            />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-3">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, email, or QR token..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters · Refresh pill */}
          <FilterPill>
            <PillSegment
              label="Filters"
              active={showFilters || filterActive}
              onPress={() => setShowFilters(true)}
              renderIcon={(c) => <Feather name="filter" size={15} color={c} />}
            />
            <PillSegment
              label="Refresh"
              onPress={onRefresh}
              renderIcon={(c) => <Feather name="refresh-cw" size={15} color={c} />}
            />
          </FilterPill>

          {/* Count + view toggle (Table default / Cards) */}
          {!showInitialLoader && !showError && (
            <View className="flex-row items-center justify-between mt-4">
              <Text className="shrink text-sm text-gray-500 dark:text-gray-400">
                Showing {filtered.length} of {memberships.length} members
              </Text>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          )}

          {/* Bulk actions — table view only, while a selection exists. */}
          {!showInitialLoader &&
            !showError &&
            viewMode === "table" &&
            selectedIds.size > 0 && (
              <View className="mt-3">
                <MembershipsBulkBar
                  count={selectedIds.size}
                  busy={bulkBusy}
                  onStatus={runBulkStatus}
                  onDelete={confirmBulkDelete}
                  onClear={clearSelection}
                />
              </View>
            )}

          {/* Loading */}
          {showInitialLoader && (
            <View className="mt-5">
              <MembershipsListSkeleton />
            </View>
          )}

          {/* Error */}
          {showError && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={onRefresh}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* List — table (default) or cards, both from the same `paged` slice */}
          {!showInitialLoader && !showError && filtered.length > 0 && (
            <View className="mt-3 gap-3">
              {viewMode === "table" ? (
                <MembershipsTable
                  memberships={paged}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onRowPress={(m) => openDetails(m.id)}
                />
              ) : (
                paged.map((m) => {
                  const meta = STATUS_META[m.status];
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => openDetails(m.id)}
                      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 active:opacity-90"
                      style={CARD_SHADOW}
                    >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-2">
                        <Text
                          className="text-base font-bold text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {m.memberName}
                        </Text>
                        {!!m.memberEmail && (
                          <Text
                            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                            numberOfLines={1}
                          >
                            {m.memberEmail}
                          </Text>
                        )}
                      </View>
                      <View className={`px-3 py-1 rounded-full ${meta.pill}`}>
                        <Text className={`text-xs font-semibold ${meta.dot}`}>
                          {meta.label}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between mt-3">
                      <View className="flex-row items-center gap-1.5">
                        <Feather name="tag" size={13} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          Plan {m.planLabel}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </View>

                    <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
                      <View>
                        <Text className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          Started
                        </Text>
                        <Text className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
                          {formatDate(m.startedAt)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          Renews
                        </Text>
                        <Text className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">
                          {formatDate(m.renewsAt)}
                        </Text>
                      </View>
                    </View>
                    </Pressable>
                  );
                })
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

          {/* Empty */}
          {!showInitialLoader && !showError && filtered.length === 0 && (
            <View className="items-center py-14">
              <Feather name="credit-card" size={40} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3 text-center">
                {memberships.length === 0
                  ? "No memberships yet"
                  : "No members match your filters"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Filters sheet */}
      <FiltersSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
      />

      {/* Add Member sheet */}
      <AddMemberSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        plans={plans.filter((p) => p.isActive)}
        locations={locationOptions}
        onCreated={() => {
          setShowAdd(false);
          refetch();
        }}
      />

    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Filters sheet                                                       */
/* ------------------------------------------------------------------ */

function FiltersSheet({
  visible,
  onClose,
  statusFilter,
  onStatus,
}: {
  visible: boolean;
  onClose: () => void;
  statusFilter: MembershipStatus | "all";
  onStatus: (s: MembershipStatus | "all") => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView className="px-6 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Status
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => onStatus(s.key)}
                className={`px-4 py-2 rounded-lg border ${
                  active
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    active ? "text-white" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row gap-3 mt-8">
          <Pressable
            onPress={() => {
              onStatus("all");
            }}
            className="flex-1 items-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Clear
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            className="flex-1 items-center py-3.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Add Member sheet                                                    */
/* ------------------------------------------------------------------ */

type PlanOption = { id: number; name: string; price: number };

function AddMemberSheet({
  visible,
  onClose,
  plans,
  locations,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  plans: PlanOption[];
  locations: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [holderName, setHolderName] = useState("");
  const [planId, setPlanId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("charge");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setCustomer(null);
    setHolderName("");
    setPlanId(null);
    setLocationId(null);
    setPaymentType("charge");
    setSubmitting(false);
  }, []);

  // Reset the form whenever the sheet closes so it opens fresh next time.
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  // Debounced search-as-you-type against GET /api/customers/search.
  useEffect(() => {
    const q = query.trim();
    if (customer || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const token = getToken();
    if (!token) return;

    const controller = new AbortController();
    setSearching(true);
    const handle = setTimeout(() => {
      searchCustomers(token, q, controller.signal)
        .then((hits) => setResults(hits.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, customer]);

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const isFreePlan = selectedPlan ? selectedPlan.price <= 0 : false;
  // The app can't capture a card (no Accept.js), so charging a paid plan must
  // happen on the terminal — allow only comp/external here for paid plans.
  const chargeBlocked =
    !!selectedPlan && !isFreePlan && paymentType === "charge";
  const canSubmit =
    !!customer && planId != null && !chargeBlocked && !submitting;

  const paymentNote = (() => {
    if (isFreePlan) return "This plan is free — no card needed.";
    if (chargeBlocked)
      return "Card entry happens on the payment terminal. Choose Cash / external or Comp to record this membership here.";
    if (paymentType === "external")
      return "Records a cash/external payment — no card is charged.";
    if (paymentType === "comp")
      return "Creates a complimentary membership at no charge.";
    return null;
  })();

  const handleCreate = async () => {
    const token = getToken();
    if (!token || !customer || planId == null) return;
    setSubmitting(true);
    try {
      await createMembership(token, {
        customerId: customer.id,
        membershipPlanId: planId,
        holderName: holderName.trim() || undefined,
        homeLocationId: locationId ?? undefined,
        paymentType,
      });
      onCreated();
    } catch (err) {
      Alert.alert(
        "Could not create membership",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Member">
      <ScrollView
        className="px-6 pb-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Customer */}
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Customer
        </Text>
        {customer ? (
          <View className="flex-row items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded-xl px-3.5 py-3">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {`${customer.firstName} ${customer.lastName}`.trim() ||
                  customer.email}
              </Text>
              {!!customer.email && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {customer.email}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                setCustomer(null);
                setQuery("");
              }}
              hitSlop={8}
            >
              <Feather name="x" size={18} color="#6B7280" />
            </Pressable>
          </View>
        ) : (
          <>
            <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name or email..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                className="flex-1 text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
              />
              {searching && <ActivityIndicator size="small" color="#9CA3AF" />}
            </View>
            {results.length > 0 && (
              <View className="mt-2 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                {results.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCustomer(c);
                      setResults([]);
                    }}
                    className="px-3.5 py-3 border-b border-gray-100 dark:border-neutral-800 active:bg-gray-50 dark:active:bg-neutral-800"
                  >
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      {`${c.firstName} ${c.lastName}`.trim() || c.email}
                    </Text>
                    {!!c.email && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {c.email}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {/* Pass holder name */}
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-5 mb-2">
          Pass Holder Name{" "}
          <Text className="text-gray-400 dark:text-gray-500">(optional)</Text>
        </Text>
        <TextInput
          value={holderName}
          onChangeText={setHolderName}
          placeholder="Name shown on the pass"
          placeholderTextColor="#9CA3AF"
          className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
        />
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          Leave blank to use the account holder&apos;s name.
        </Text>

        {/* Plan */}
        <View className="mt-5">
          <SelectField
            label="Plan"
            required
            placeholder={
              plans.length === 0 ? "No active plans available" : "Select..."
            }
            value={planId}
            options={plans.map((p) => ({
              label: `${p.name} — ${p.price <= 0 ? "Free" : `$${p.price.toFixed(2)}`}`,
              value: p.id,
            }))}
            onSelect={(v) => setPlanId(Number(v))}
          />
        </View>

        {/* Home location */}
        <View className="mt-5">
          <SelectField
            label="Home Location"
            value={locationId ?? "any"}
            options={[
              { label: "Any", value: "any" },
              ...locations.map((l) => ({ label: l.name, value: l.id })),
            ]}
            onSelect={(v) => setLocationId(v === "any" ? null : Number(v))}
          />
        </View>

        {/* Payment */}
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-5 mb-2">
          Payment
        </Text>
        <View className="flex-row gap-2">
          {PAYMENT_OPTIONS.map((opt) => {
            const active = paymentType === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPaymentType(opt.key)}
                className={`flex-1 items-center justify-center gap-1 py-3 rounded-xl border ${
                  active
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
                }`}
              >
                <Feather
                  name={opt.icon}
                  size={16}
                  color={active ? "#FFFFFF" : "#6B7280"}
                />
                <Text
                  className={`text-[11px] font-medium text-center ${
                    active ? "text-white" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!!paymentNote && (
          <Text
            className={`text-xs mt-2 ${
              chargeBlocked
                ? "text-orange-600 dark:text-orange-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {paymentNote}
          </Text>
        )}

        {/* Submit */}
        <View className="flex-row gap-3 mt-7">
          <Pressable
            onPress={onClose}
            className="flex-1 items-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleCreate}
            disabled={!canSubmit}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
              canSubmit ? "bg-[#0644C7]" : "bg-gray-300 dark:bg-neutral-700"
            }`}
          >
            {submitting && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className="text-sm font-semibold text-white">
              Create Membership
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export default Memberships;
