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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { FieldLabel } from "../../components/ui/FormControls";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import { SheetSelect } from "../../components/ui/SheetSelect";
import {
  AppliedFiltersHint,
  FilterChip,
  FilterChipGroup,
  FilterSheetFooter,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SpecCell,
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
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
  AcceptTokenizationError,
  tokenizeCardWithAccept,
} from "../../lib/payments/acceptTokenize";
import {
  formatCardNumber,
  getCardType,
  getPaymentErrorMessage,
  isTestCardNumber,
  validateCardNumber,
} from "../../lib/payments/cardUtils";
import { isMembershipChargeReady } from "../../lib/payments/membershipChargeGate";
import {
  cancelMembership,
  createMembership,
  deleteMembership,
  fetchMembershipGatewayKey,
  freezeMembership,
  unfreezeMembership,
  type MembershipRow,
  type MembershipStatus,
  type PaymentType,
} from "../../services/membershipsService";
import type { AuthorizeNetPublicKey } from "../../services/paymentsService";
import {
  searchCustomers,
  type CustomerHit,
} from "../../services/customersService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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

/** A membership as a card — the Cards layout of the list. */
function MembershipCard({
  membership: m,
  onPress,
}: {
  membership: MembershipRow;
  onPress: () => void;
}) {
  const meta = STATUS_META[m.status];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View membership for ${m.memberName}`}
      className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 active:opacity-90 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {m.memberName}
          </Text>
          {!!m.memberEmail && (
            <Text
              className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              {m.memberEmail}
            </Text>
          )}
        </View>
        <View className={`rounded-full px-2.5 py-0.5 ${meta.pill}`}>
          <Text className={`text-xs font-medium ${meta.dot}`}>{meta.label}</Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-center gap-1.5">
        <Feather name="tag" size={13} color="#9CA3AF" />
        <Text
          numberOfLines={1}
          className="shrink text-xs text-gray-500 dark:text-gray-400"
        >
          Plan {m.planLabel}
        </Text>
      </View>

      <View className="mt-3 flex-row overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800">
        <SpecCell label="Started" value={formatDate(m.startedAt)} />
        <SpecCell label="Renews" value={formatDate(m.renewsAt)} divider />
      </View>
    </Pressable>
  );
}

const Memberships = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
  const { openId, add } = useLocalSearchParams<{
    openId?: string;
    add?: string;
  }>();
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

  // From the Memberships hub's "Add Member" shortcut (?add=1): open the Add
  // Member sheet once, as the "Add Member" button does.
  useEffect(() => {
    if (add !== "1") return;
    setShowAdd(true);
    router.setParams({ add: undefined });
  }, [add, router]);

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
  const [perPage, setPerPage] = useState(5);
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

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

  const activeFilterCount = statusFilter !== "all" ? 1 : 0;
  const showInitialLoader = loading && memberships.length === 0;
  const showError = !loading && !!error && memberships.length === 0;

  // Per-status counts for the chips, over everything loaded for this location.
  const statusCounts = useMemo(() => {
    const map = new Map<MembershipStatus, number>();
    memberships.forEach((m) => map.set(m.status, (map.get(m.status) ?? 0) + 1));
    return map;
  }, [memberships]);

  const goAdd = useCallback(() => setShowAdd(true), []);
  const clearSearchAndFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
  }, []);

  // Sibling Memberships screens plus the old Filters · Refresh pill's
  // Refresh, as module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Membership Plans", icon: "layers", route: "/memberships/membership-plan" },
    { label: "New Plan", icon: "plus", route: "/memberships/membership-plan?create=1" },
    {
      label: "Membership Reports",
      icon: "bar-chart-2",
      route: "/memberships/membership-reports",
    },
    { label: "Check-in", icon: "maximize", route: "/check-in" },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary Add action. */}
      <ModuleHeader
        title="Memberships"
        action={{
          onPress: goAdd,
          label: "Add",
          icon: "user-plus",
          accessibilityLabel: "Add member",
        }}
      />

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
            View and manage all member subscriptions
          </Text>

          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state (nothing loaded to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load memberships"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* Summary — one panel, four figures. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            <SummaryPanel
              figures={[
                {
                  icon: "users",
                  title: "Total",
                  value: String(counts.total),
                  hint: "All memberships",
                },
                {
                  icon: "check-circle",
                  title: "Active",
                  value: String(counts.active),
                  hint: "Currently active",
                },
                {
                  icon: "alert-triangle",
                  title: "Past Due",
                  value: String(counts.pastDue),
                  hint: "Payment overdue",
                },
                {
                  icon: "pause-circle",
                  title: "Frozen",
                  value: String(counts.frozen),
                  hint: "Paused memberships",
                },
              ]}
            />
          )}

          {/* More — sibling Memberships screens as hub shortcuts. */}
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
              placeholder="Search by name, email, or QR token"
            />
            <FiltersButton
              count={activeFilterCount}
              onPress={() => setShowFilters(true)}
            />
          </View>

          <AppliedFiltersHint
            count={activeFilterCount}
            onClear={() => setStatusFilter("all")}
          />

          {/* Status chips — a visible surface over the sheet's Status filter,
              not a second one: both write the same `statusFilter`. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s.key}
                label={s.label}
                count={
                  showInitialLoader
                    ? undefined
                    : s.key === "all"
                      ? memberships.length
                      : (statusCounts.get(s.key) ?? 0)
                }
                selected={statusFilter === s.key}
                onPress={() => setStatusFilter(s.key)}
              />
            ))}
          </ScrollView>

          {/* List header — title + count, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Members" count={filtered.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {/* Bulk actions — table view only, while a selection exists. */}
          {!showInitialLoader &&
            !showError &&
            viewMode === "table" &&
            selectedIds.size > 0 && (
              <View className="mb-3">
                <MembershipsBulkBar
                  count={selectedIds.size}
                  busy={bulkBusy}
                  onStatus={runBulkStatus}
                  onDelete={confirmBulkDelete}
                  onClear={clearSelection}
                />
              </View>
            )}

          {/* List / states — each keyed so switching remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? (
                <AttractionsTableSkeleton />
              ) : (
                <AttractionsListSkeleton />
              )}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            memberships.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="credit-card"
                  title="No memberships yet"
                  message="Add your first member to start a subscription."
                  actionLabel="Add Member"
                  actionIcon="user-plus"
                  primary
                  onAction={goAdd}
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No members found"
                  message="No members match your search or filters."
                  actionLabel="Clear search & filters"
                  onAction={clearSearchAndFilters}
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {/* Table (default) and cards render from the same `paged` slice. */}
              {viewMode === "table" ? (
                <MembershipsTable
                  memberships={paged}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onRowPress={(m) => openDetails(m.id)}
                />
              ) : (
                paged.map((m) => (
                  <MembershipCard
                    key={m.id}
                    membership={m}
                    onPress={() => openDetails(m.id)}
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

      {/* Filters sheet */}
      <FiltersSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
        resultCount={filtered.length}
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
  resultCount,
}: {
  visible: boolean;
  onClose: () => void;
  statusFilter: MembershipStatus | "all";
  onStatus: (s: MembershipStatus | "all") => void;
  resultCount: number;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView className="px-4 pb-8" showsVerticalScrollIndicator={false}>
        <FilterChipGroup
          label="Status"
          options={STATUS_FILTERS.map((s) => ({ label: s.label, value: s.key }))}
          value={statusFilter}
          onChange={onStatus}
        />
        <FilterSheetFooter
          canReset={statusFilter !== "all"}
          onReset={() => onStatus("all")}
          onDone={onClose}
          doneLabel={`Show ${resultCount} ${resultCount === 1 ? "member" : "members"}`}
        />
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

  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [gateway, setGateway] = useState<AuthorizeNetPublicKey | null>(null);
  // The (plan, location) signature the loaded `gateway` was resolved for —
  // any change to either invalidates it, so a merchant can never be reused
  // across a different plan/location than it was resolved for.
  const [gatewayFor, setGatewayFor] = useState("");
  const [gatewayError, setGatewayError] = useState("");

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setCustomer(null);
    setHolderName("");
    setPlanId(null);
    setLocationId(null);
    setPaymentType("charge");
    setSubmitting(false);
    setCardNumber("");
    setCardMonth("");
    setCardYear("");
    setCardCvv("");
    setGateway(null);
    setGatewayFor("");
    setGatewayError("");
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
  const chargeRequested = paymentType === "charge" && !isFreePlan;
  // What the server resolves the merchant from — the plan (its own billing
  // account, else its home location's) — so a plan OR location change must
  // both invalidate an already-loaded gateway.
  const gatewayRequest =
    chargeRequested && planId != null
      ? JSON.stringify({ plan_id: planId, home_location_id: locationId ?? undefined })
      : "";

  // Ask the server which merchant this plan/location combination charges
  // through — the exact resolution POST /memberships uses to charge the card
  // (its own billing account when the plan has one, else the home location's).
  // Never guessed client-side. Refetched whenever plan or location changes,
  // and cleared immediately so a stale merchant's credentials can't be reused.
  useEffect(() => {
    setGateway(null);
    setGatewayFor("");
    setGatewayError("");
    if (!gatewayRequest || planId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchMembershipGatewayKey(
      token,
      { planId, homeLocationId: locationId ?? undefined },
      controller.signal,
    )
      .then((creds) => {
        if (controller.signal.aborted) return;
        if (creds.apiLoginId) {
          setGateway(creds);
          setGatewayFor(gatewayRequest);
        } else {
          setGatewayError("Card payment is not set up for this membership yet.");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "";
        setGatewayError(message || "Could not load the payment gateway for this plan.");
      });
    return () => controller.abort();
  }, [gatewayRequest, planId, locationId]);

  const cardValid = validateCardNumber(cardNumber);
  const chargeReady = isMembershipChargeReady({
    chargeRequested,
    hasGateway: !!gateway,
    gatewayRequestSignature: gatewayFor,
    currentRequestSignature: gatewayRequest,
    cardNumberValid: cardValid,
    cardMonth,
    cardYear,
    cardCvv,
  });
  const chargeBlocked = chargeRequested && !chargeReady;
  const canSubmit =
    !!customer && planId != null && !chargeBlocked && !submitting;

  const paymentNote = (() => {
    if (isFreePlan) return "This plan is free — no card needed.";
    if (paymentType === "charge" && gatewayError) return gatewayError;
    if (paymentType === "external")
      return "Records a cash/external payment — no card is charged.";
    if (paymentType === "comp")
      return "Creates a complimentary membership at no charge.";
    return null;
  })();

  const handleCreate = async () => {
    const token = getToken();
    if (!token || !customer || planId == null || submitting) return;
    setSubmitting(true);
    try {
      let opaqueData: { dataDescriptor: string; dataValue: string } | undefined;
      if (chargeRequested) {
        if (!chargeReady || !gateway) {
          Alert.alert("Payment not ready", gatewayError || "Enter the card details and try again.");
          setSubmitting(false);
          return;
        }
        if (isTestCardNumber(cardNumber)) {
          Alert.alert("Invalid card", "Test card numbers are not allowed.");
          setSubmitting(false);
          return;
        }
        try {
          opaqueData = await tokenizeCardWithAccept(
            { cardNumber, month: cardMonth, year: cardYear, cardCode: cardCvv },
            gateway,
          );
        } catch (err) {
          const message =
            err instanceof AcceptTokenizationError
              ? err.message
              : getPaymentErrorMessage(err);
          Alert.alert("Card could not be processed", message);
          setSubmitting(false);
          return;
        }
      }
      await createMembership(token, {
        customerId: customer.id,
        membershipPlanId: planId,
        holderName: holderName.trim() || undefined,
        homeLocationId: locationId ?? undefined,
        ...(chargeRequested && opaqueData && selectedPlan
          ? { opaqueData, amount: selectedPlan.price }
          : {}),
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

        {/* Plan — SheetSelect, since an inline list can't grow this sheet. */}
        <View className="mt-5">
          <FieldLabel required>Plan</FieldLabel>
          <SheetSelect
            title="Plan"
            placeholder={
              plans.length === 0 ? "No active plans available" : "Select..."
            }
            disabled={plans.length === 0}
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
          <FieldLabel>Home Location</FieldLabel>
          <SheetSelect
            title="Home Location"
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

        {/* Card entry — only for a charge on a paid plan */}
        {chargeRequested && (
          <View className="mt-3">
            <Text className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-200">
              Card Number
            </Text>
            <View
              className={`h-11 flex-row items-center rounded-lg border px-3 ${
                cardNumber && cardValid
                  ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                  : cardNumber
                    ? "border-red-400"
                    : "border-gray-300 dark:border-neutral-700"
              }`}
            >
              <TextInput
                value={cardNumber}
                onChangeText={(v) => setCardNumber(formatCardNumber(v))}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={19}
                className="flex-1 py-0 text-sm text-gray-900 dark:text-white"
              />
              {!!cardNumber && cardValid && (
                <Feather name="check-circle" size={15} color="#16A34A" />
              )}
            </View>
            {!!cardNumber && (
              <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {getCardType(cardNumber)}
              </Text>
            )}
            <View className="mt-3 flex-row gap-2">
              {(
                [
                  { label: "Month", value: cardMonth, set: setCardMonth, ph: "MM", max: 2 },
                  { label: "Year", value: cardYear, set: setCardYear, ph: "YYYY", max: 4 },
                  { label: "CVV", value: cardCvv, set: setCardCvv, ph: "123", max: 4 },
                ] as const
              ).map((f) => (
                <View key={f.label} className="flex-1">
                  <Text className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                    {f.label}
                  </Text>
                  <View className="h-11 justify-center rounded-lg border border-gray-300 px-3 dark:border-neutral-700">
                    <TextInput
                      value={f.value}
                      onChangeText={(v) =>
                        f.set(v.replace(/\D/g, "").substring(0, f.max))
                      }
                      placeholder={f.ph}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      className="py-0 text-sm text-gray-900 dark:text-white"
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
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
