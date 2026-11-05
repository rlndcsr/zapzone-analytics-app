import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { EmailBulkBar, type EmailBulkChip } from "../../components/ui/EmailBulkBar";
import {
  DefaultNotificationBadge,
  EmailNotificationsTable,
} from "../../components/ui/EmailNotificationsTable";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SendTestEmailSheet } from "../../components/ui/SendTestEmailSheet";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  AppliedFiltersHint,
  FilterChip,
  FilterChipGroup,
  FiltersButton,
  FilterSheetFooter,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  StatusDotBadge,
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { VisitPromoBadge } from "../../components/ui/VisitEmailSettings";
import {
  BULK_TOGGLE_ALL_LOCKED,
  bulkToggleSkippedNote,
  planBulkToggle,
} from "../../lib/email/visitEmail";
import { consumeEmailNotificationsStale } from "../../lib/emailStale";
import { getToken } from "../../lib/session";
import {
  deleteEmailNotification,
  duplicateEmailNotification,
  fetchEmailNotifications,
  resetDefaultNotification,
  sendTestEmailNotification,
  toggleEmailNotificationStatus,
  type EmailNotificationRow,
  type EmailNotificationStats,
} from "../../services/emailService";

// Bulk actions mirror the web Notifications page (Activate / Deactivate).
const NOTIFICATION_BULK_CHIPS: EmailBulkChip[] = [
  { key: "activate", label: "Activate", icon: "check-circle", tint: "#16A34A" },
  { key: "deactivate", label: "Deactivate", icon: "slash", tint: "#6B7280" },
];

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type StatusFilter = "all" | "active" | "inactive";
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/** Card layout for one notification, matching the flat module cards. */
const NotificationCard = ({
  notification: n,
  onPress,
}: {
  notification: EmailNotificationRow;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
    accessibilityRole="button"
    accessibilityLabel={`View notification ${n.name}`}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2 flex-wrap">
        <Text className="shrink text-base font-semibold text-gray-900 dark:text-white">
          {n.name}
        </Text>
        {n.isDefault && <DefaultNotificationBadge />}
        {n.triggerType === "visit_completed" && <VisitPromoBadge summary={n.promoSummary} />}
      </View>
      <StatusDotBadge on={n.isActive} label={n.isActive ? "Active" : "Inactive"} />
    </View>

    {/* Trigger */}
    {!!n.triggerLabel && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="bell" size={13} color="#9CA3AF" />
        <Text className="shrink text-[13px] font-medium text-gray-700 dark:text-gray-200" numberOfLines={1}>
          {n.triggerLabel}
        </Text>
      </View>
    )}

    {/* Entity + recipients */}
    <View className="flex-row items-center justify-between gap-3 mt-3">
      <View className="flex-row items-center gap-4 shrink">
        <View className="flex-row items-center gap-1.5">
          <Feather name="box" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">{n.entityLabel}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {n.recipientCount} type{n.recipientCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-0.5">
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Details</Text>
        <Feather name="chevron-right" size={14} color="#9CA3AF" />
      </View>
    </View>
  </Pressable>
);

const EmailNotifications = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<EmailNotificationRow[]>([]);
  const [stats, setStats] = useState<EmailNotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState("all");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { rows: list, stats: s } = await fetchEmailNotifications(token);
      setRows(list);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Refetch when returning from Create Notification so the new row appears.
  useFocusEffect(
    useCallback(() => {
      if (consumeEmailNotificationsStale()) load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const triggerOptions = useMemo(
    () => [
      { label: "All Triggers", value: "all" },
      ...Array.from(new Set(rows.map((n) => n.triggerLabel).filter(Boolean)))
        .sort()
        .map((t) => ({ label: t, value: t })),
    ],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((n) => {
      if (statusFilter === "active" && !n.isActive) return false;
      if (statusFilter === "inactive" && n.isActive) return false;
      if (triggerFilter !== "all" && n.triggerLabel !== triggerFilter)
        return false;
      if (q && !n.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, triggerFilter]);

  // Status lives in the chips on the page; the Filters sheet holds Trigger.
  const sheetFilterCount = triggerFilter !== "all" ? 1 : 0;
  const appliedFilterCount = (statusFilter !== "all" ? 1 : 0) + sheetFilterCount;
  const clearFilters = () => {
    setStatusFilter("all");
    setTriggerFilter("all");
  };

  // Per-status chip counts over every loaded notification.
  const activeCount = useMemo(() => rows.filter((n) => n.isActive).length, [rows]);
  const statusCount = (value: StatusFilter) =>
    value === "all"
      ? rows.length
      : value === "active"
        ? activeCount
        : rows.length - activeCount;

  // Reset to page 1 when the result set changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, triggerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * perPage,
    (currentPage - 1) * perPage + perPage,
  );

  // --- Table view + bulk selection (parallel to the card view; same `visible`) ---
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Header checkbox toggles every row on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = visible.length > 0 && visible.every((n) => prev.has(n.id));
      return all ? new Set() : new Set(visible.map((n) => n.id));
    });
  }, [visible]);

  // Drop the selection whenever the visible set or view changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, triggerFilter, page, perPage, viewMode]);

  // Row/card tap → details; the Actions column mirrors the web per-row actions.
  const [showTest, setShowTest] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testId, setTestId] = useState<number | null>(null);

  const openDetails = useCallback(
    (nid: number) =>
      router.push({
        pathname: "/email-campaign/notification-details",
        params: { id: String(nid) },
      }),
    [router],
  );

  const runRowAction = useCallback(
    async (fn: () => Promise<void>) => {
      const token = getToken();
      if (!token) return;
      try {
        await fn();
        await load();
      } catch (err) {
        Alert.alert("Action failed", err instanceof Error ? err.message : "Please try again.");
      }
    },
    [load],
  );

  const onDuplicate = useCallback(
    (n: EmailNotificationRow) => runRowAction(() => duplicateEmailNotification(getToken()!, n.id)),
    [runRowAction],
  );
  const onReset = useCallback(
    (n: EmailNotificationRow) => runRowAction(() => resetDefaultNotification(getToken()!, n.id)),
    [runRowAction],
  );
  const onEdit = useCallback(
    (n: EmailNotificationRow) =>
      router.push({
        pathname: "/email-campaign/create-notification",
        params: { id: String(n.id) },
      }),
    [router],
  );
  const onTest = useCallback((n: EmailNotificationRow) => {
    setTestId(n.id);
    setShowTest(true);
  }, []);
  const onDeleteRow = useCallback(
    (n: EmailNotificationRow) =>
      Alert.alert("Delete notification?", `Permanently delete "${n.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => runRowAction(() => deleteEmailNotification(getToken()!, n.id)),
        },
      ]),
    [runRowAction],
  );

  const sendTest = useCallback(
    async (email: string) => {
      const token = getToken();
      if (!token || testId == null || !email) return;
      setSendingTest(true);
      try {
        await sendTestEmailNotification(token, testId, email);
        setShowTest(false);
        Alert.alert("Test sent", "A test email has been sent.");
      } catch (err) {
        Alert.alert("Send failed", err instanceof Error ? err.message : "Please try again.");
      } finally {
        setSendingTest(false);
      }
    },
    [testId],
  );

  // Bulk activate/deactivate — only toggles rows whose state differs (mirrors the web).
  const bulkSetActive = useCallback(
    async (key: string) => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const target = key === "activate";
      // Follow-up emails this user may not change are skipped (web parity).
      const { targets: ids, locked } = planBulkToggle(rows, selectedIds, target);
      if (ids.length === 0 && locked > 0) {
        Alert.alert(BULK_TOGGLE_ALL_LOCKED);
        setSelectedIds(new Set());
        return;
      }
      setBulkBusy(key);
      try {
        await Promise.all(ids.map((id) => toggleEmailNotificationStatus(token, id)));
        setSelectedIds(new Set());
        await load();
        if (locked > 0) {
          Alert.alert(
            `${ids.length} notification(s) ${target ? "activated" : "deactivated"} successfully${bulkToggleSkippedNote(locked)}`,
          );
        }
      } catch (err) {
        Alert.alert(
          "Action failed",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, rows, load],
  );

  const showInitialLoader = loading && rows.length === 0;
  const showError = !!error && rows.length === 0;

  const goCreate = useCallback(
    () => router.push("/email-campaign/create-notification"),
    [router],
  );

  // The old Templates · Campaigns nav plus the header's former Refresh
  // button, as module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Email Templates", icon: "mail", route: "/email-campaign/email-templates" },
    { label: "Campaigns", icon: "send", route: "/email-campaign/campaigns" },
    { label: "SMS Notifications", icon: "message-square", route: "/email-campaign/sms-notifications" },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Email Notifications"
        action={{ onPress: goCreate, accessibilityLabel: "Create notification" }}
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
            Automated email notifications for bookings, purchases, payments and the follow-up after each visit
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load notifications"
              message={error ?? ""}
              onRetry={load}
            />
          )}

          {/* Summary — one panel, four figures. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            <SummaryPanel
              figures={[
                {
                  icon: "bell",
                  title: "Total Notifications",
                  value: String(stats?.total ?? 0),
                  hint: "All configured notifications",
                },
                {
                  icon: "check-circle",
                  title: "Active",
                  value: String(stats?.active ?? 0),
                  hint: "Currently sending emails",
                },
                {
                  icon: "calendar",
                  title: "Booking Triggers",
                  value: String(stats?.bookingTriggers ?? 0),
                  hint: "Booking event notifications",
                },
                {
                  icon: "tag",
                  title: "Purchase Triggers",
                  value: String(stats?.purchaseTriggers ?? 0),
                  hint: "Purchase event notifications",
                },
              ]}
            />
          )}

          {/* More — sibling email screens as hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search notifications by name"
            />
            <FiltersButton count={sheetFilterCount} onPress={() => setShowFilters(true)} />
          </View>

          <AppliedFiltersHint count={appliedFilterCount} onClear={clearFilters} />

          {/* Status chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={showInitialLoader ? undefined : statusCount(opt.value)}
                selected={statusFilter === opt.value}
                onPress={() => setStatusFilter(opt.value)}
              />
            ))}
          </ScrollView>

          {/* List header — title + count, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Notifications" count={filtered.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {viewMode === "table" && selectedIds.size > 0 && (
            <EmailBulkBar
              count={selectedIds.size}
              busyKey={bulkBusy}
              chips={NOTIFICATION_BULK_CHIPS}
              onAction={bulkSetActive}
              onClear={clearSelection}
            />
          )}

          {/* List — Table (default) or Cards over the same visible slice. Each
              state is keyed so switching between them remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? <AttractionsTableSkeleton /> : <AttractionsListSkeleton />}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            rows.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="bell"
                  title="No notifications yet"
                  message="Create an automated email for bookings, purchases or payments."
                  actionLabel="Create Notification"
                  actionIcon="plus"
                  primary
                  onAction={goCreate}
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No notifications found"
                  message="No notifications match your search or filters."
                  actionLabel="Clear search & filters"
                  onAction={() => {
                    setSearch("");
                    clearFilters();
                  }}
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <EmailNotificationsTable
                  notifications={visible}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onRowPress={(n) => openDetails(n.id)}
                  onTest={onTest}
                  onDuplicate={onDuplicate}
                  onEdit={onEdit}
                  onReset={onReset}
                  onDelete={onDeleteRow}
                />
              ) : (
                visible.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onPress={() => openDetails(n.id)}
                  />
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

      {/* Filters — Trigger (status lives in the chips). */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <FilterChipGroup
            label="Trigger"
            options={triggerOptions.map((o) => ({
              ...o,
              label: o.value === "all" ? "All" : o.label,
            }))}
            value={triggerFilter}
            onChange={setTriggerFilter}
          />
          <FilterSheetFooter
            canReset={sheetFilterCount > 0}
            onReset={() => setTriggerFilter("all")}
            onDone={() => setShowFilters(false)}
            doneLabel={`Show ${filtered.length} notification${filtered.length === 1 ? "" : "s"}`}
          />
        </ScrollView>
      </BottomSheet>

      <SendTestEmailSheet
        visible={showTest}
        sending={sendingTest}
        onClose={() => setShowTest(false)}
        onSend={sendTest}
      />
    </View>
  );
};

export default EmailNotifications;
