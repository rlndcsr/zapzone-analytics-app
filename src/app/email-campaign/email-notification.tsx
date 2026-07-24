import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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

import { EmailBulkBar, type EmailBulkChip } from "../../components/ui/EmailBulkBar";
import { EmailNotificationsTable } from "../../components/ui/EmailNotificationsTable";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
import { SendTestEmailSheet } from "../../components/ui/SendTestEmailSheet";
import { StatTile } from "../../components/ui/StatTile";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
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

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

const EmailNotifications = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [rows, setRows] = useState<EmailNotificationRow[]>([]);
  const [stats, setStats] = useState<EmailNotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
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

  const filtersActive = statusFilter !== "all" || triggerFilter !== "all";

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
      const ids = rows
        .filter((n) => selectedIds.has(n.id) && n.isActive !== target)
        .map((n) => n.id);
      setBulkBusy(key);
      try {
        await Promise.all(ids.map((id) => toggleEmailNotificationStatus(token, id)));
        setSelectedIds(new Set());
        await load();
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Email Notifications
          </Text>
          <Pressable
            onPress={onRefresh}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6" style={CARD_SHADOW}>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Email Notifications
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automated email notifications for bookings, purchases, and payments
            </Text>
          </View>

          {/* Nav: Templates · Campaigns pill */}
          <FilterPill>
            <PillSegment
              label="Templates"
              onPress={() => router.push("/email-campaign/email-templates")}
              renderIcon={(c) => <Feather name="mail" size={15} color={c} />}
            />
            <PillSegment
              label="Campaigns"
              onPress={() => router.push("/email-campaign/campaigns")}
              renderIcon={(c) => <Feather name="send" size={15} color={c} />}
            />
          </FilterPill>

          <Pressable
            onPress={() => router.push("/email-campaign/create-notification")}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Notification
            </Text>
          </Pressable>

          {/* Stats */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile icon="bell" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Total Notifications" value={String(stats?.total ?? 0)} hint="All configured notifications" />
            <StatTile icon="check-circle" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Active" value={String(stats?.active ?? 0)} hint="Currently sending emails" />
            <StatTile icon="calendar" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Booking Triggers" value={String(stats?.bookingTriggers ?? 0)} hint="Booking event notifications" />
            <StatTile icon="tag" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Purchase Triggers" value={String(stats?.purchaseTriggers ?? 0)} hint="Purchase event notifications" />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search notifications by name..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          {/* Filters pill */}
          <FilterPill>
            <PillSegment
              label="Filters"
              active={showFilters || filtersActive}
              onPress={() => setShowFilters((v) => !v)}
              renderIcon={(c) => <Feather name="filter" size={15} color={c} />}
            />
          </FilterPill>
          {showFilters && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Status
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {[
                  { label: "All Statuses", value: "all" as const },
                  { label: "Active", value: "active" as const },
                  { label: "Inactive", value: "inactive" as const },
                ].map((opt) => {
                  const on = statusFilter === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setStatusFilter(opt.value)}
                      className={`px-3.5 py-2 rounded-lg border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          on ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Trigger
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {triggerOptions.map((opt) => {
                  const on = triggerFilter === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setTriggerFilter(opt.value)}
                      className={`px-3.5 py-2 rounded-lg border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          on ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {filtersActive && (
                <Pressable
                  onPress={() => {
                    setStatusFilter("all");
                    setTriggerFilter("all");
                  }}
                  className="self-end mt-3"
                >
                  <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* View toggle — Table is the default, Cards optional */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {filtered.length} notification{filtered.length === 1 ? "" : "s"}
            </Text>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </View>

          {viewMode === "table" && selectedIds.size > 0 && (
            <EmailBulkBar
              count={selectedIds.size}
              busyKey={bulkBusy}
              chips={NOTIFICATION_BULK_CHIPS}
              onAction={bulkSetActive}
              onClear={clearSelection}
            />
          )}

          {/* States */}
          {loading && rows.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Loading notifications…
            </Text>
          )}
          {error && rows.length === 0 && (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable onPress={load} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* List — Table (default) or Cards over the same visible slice */}
          {filtered.length > 0 &&
            (viewMode === "table" ? (
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
            <Pressable
              key={n.id}
              onPress={() => openDetails(n.id)}
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 active:opacity-80"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2 flex-row items-center gap-2 flex-wrap">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    {n.name}
                  </Text>
                  {n.isDefault && (
                    <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      <Feather name="shield" size={10} color={PRIMARY} />
                      <Text className="text-[10px] font-semibold text-[#0644C7] dark:text-blue-300">
                        Default
                      </Text>
                    </View>
                  )}
                </View>
                <View
                  className={`flex-row items-center gap-1 px-3 py-1 rounded-full ${
                    n.isActive
                      ? "bg-green-100 dark:bg-green-900/40"
                      : "bg-gray-200 dark:bg-neutral-700"
                  }`}
                >
                  <Feather
                    name={n.isActive ? "check-circle" : "slash"}
                    size={11}
                    color={n.isActive ? "#16A34A" : "#6B7280"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      n.isActive
                        ? "text-green-700 dark:text-green-300"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {n.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              {/* Trigger */}
              {!!n.triggerLabel && (
                <View className="flex-row items-center gap-1.5 mt-3">
                  <Feather name="bell" size={13} color={PRIMARY} />
                  <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                    {n.triggerLabel}
                  </Text>
                </View>
              )}

              {/* Entity + recipients */}
              <View className="flex-row items-center gap-4 mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="box" size={13} color="#9CA3AF" />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {n.entityLabel}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Feather name="users" size={13} color="#9CA3AF" />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {n.recipientCount} type{n.recipientCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
            </Pressable>
              ))
            ))}

          {!loading && !error && filtered.length === 0 && (
            <View className="items-center py-10">
              <Feather name="bell" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {rows.length === 0 ? "No notifications yet" : "No notifications match your search"}
              </Text>
            </View>
          )}

          {!loading && !error && (
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
          )}
        </View>
      </ScrollView>

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
