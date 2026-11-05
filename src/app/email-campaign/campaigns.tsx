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

import { EmailBulkBar, type EmailBulkChip } from "../../components/ui/EmailBulkBar";
import {
  CampaignStatusBadge,
  EmailCampaignsTable,
  fmtCampaignDateTime,
} from "../../components/ui/EmailCampaignsTable";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { Pagination } from "../../components/ui/Pagination";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { campaignDisplayStatus, isScheduledCampaign } from "../../lib/email/campaignSchedule";
import { consumeEmailCampaignsStale } from "../../lib/emailStale";
import { getToken } from "../../lib/session";
import {
  cancelEmailCampaign,
  deleteEmailCampaign,
  fetchEmailCampaigns,
  fetchEmailCampaignStats,
  type EmailCampaignRow,
  type EmailCampaignStats,
} from "../../services/emailService";

// Bulk actions mirror the web Campaigns page (Export Selected only).
const CAMPAIGN_BULK_CHIPS: EmailBulkChip[] = [
  { key: "export", label: "Export Selected", icon: "download", tint: "#0644C7" },
];

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

// Scheduled campaigns (pending with a send time) show and filter apart from other pending ones.
const shownStatus = (c: EmailCampaignRow) => campaignDisplayStatus(c.status, c.scheduledAt);

/**
 * Card layout for one campaign, matching the flat module cards: name + status,
 * the subject, recipients with send progress, and a quiet sent/scheduled footer.
 */
const CampaignCard = ({
  campaign: c,
  onPress,
}: {
  campaign: EmailCampaignRow;
  onPress: () => void;
}) => {
  const scheduled = isScheduledCampaign(c.status, c.scheduledAt);
  const pct = c.recipients > 0 ? Math.round((c.sentCount / c.recipients) * 100) : 0;
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`View campaign ${c.name}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {c.name}
        </Text>
        <CampaignStatusBadge campaign={c} />
      </View>
      {!!c.subject && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1" numberOfLines={1}>
          {c.subject}
        </Text>
      )}

      {/* Recipients + progress */}
      <View className="flex-row items-center gap-4 mt-3">
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={13} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {c.recipients} recipient{c.recipients === 1 ? "" : "s"}
          </Text>
        </View>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {c.sentCount}/{c.recipients} sent
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 mt-2 overflow-hidden">
        <View className="h-full rounded-full bg-[#0644C7]" style={{ width: `${pct}%` }} />
      </View>

      <View className="flex-row items-center justify-between gap-3 mt-3">
        <Text numberOfLines={1} className="shrink text-xs text-gray-400 dark:text-gray-500">
          {scheduled ? "Scheduled for" : "Sent at"}{" "}
          {fmtCampaignDateTime(scheduled ? c.scheduledAt : c.sentAt)}
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Details</Text>
          <Feather name="chevron-right" size={14} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};

const EmailCampaigns = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [campaigns, setCampaigns] = useState<EmailCampaignRow[]>([]);
  const [stats, setStats] = useState<EmailCampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, s] = await Promise.all([
        fetchEmailCampaigns(token),
        fetchEmailCampaignStats(token).catch(() => null),
      ]);
      setCampaigns(list.rows);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Refetch when returning from Create Campaign so the new row appears.
  useFocusEffect(
    useCallback(() => {
      if (consumeEmailCampaignsStale()) load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const statusOptions = useMemo(
    () => [
      { label: "All Statuses", value: "all" },
      ...Array.from(new Set(campaigns.map(shownStatus).filter(Boolean)))
        .sort()
        .map((s) => ({
          label:
            campaigns.find((c) => shownStatus(c) === s)?.statusLabel ??
            s.charAt(0).toUpperCase() + s.slice(1),
          value: s,
        })),
    ],
    [campaigns],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && shownStatus(c) !== statusFilter) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.subject.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [campaigns, search, statusFilter]);

  // Client-side pagination over the filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the result set changes size / filters move.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  // --- Table view + bulk selection (parallel to the card view; same `paged`) ---
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
      const all = paged.length > 0 && paged.every((c) => prev.has(c.id));
      return all ? new Set() : new Set(paged.map((c) => c.id));
    });
  }, [paged]);

  // Drop the selection whenever the visible set or view changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, page, perPage, viewMode]);

  // Tapping a row/card opens the Campaign Details screen.
  const openDetails = useCallback(
    (cid: number) =>
      router.push({
        pathname: "/email-campaign/campaign-details",
        params: { id: String(cid) },
      }),
    [router],
  );

  // Per-row Cancel/Delete (mirrors the web Actions), confirmed then reloads.
  const confirmRowCancel = useCallback(
    (c: EmailCampaignRow) => {
      const scheduled = isScheduledCampaign(c.status, c.scheduledAt);
      Alert.alert(
        scheduled ? "Cancel scheduled campaign?" : "Cancel campaign?",
        scheduled ? `Nothing has gone out yet. Nobody will get "${c.name}".` : `Stop sending "${c.name}"?`,
        [
          { text: scheduled ? "Keep it scheduled" : "Keep sending", style: "cancel" },
          {
            text: "Cancel campaign",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              try {
                await cancelEmailCampaign(token, c.id);
                await load();
              } catch (err) {
                Alert.alert("Action failed", err instanceof Error ? err.message : "Please try again.");
                // e.g. it finished meanwhile (409): show where it stands now
                void load();
              }
            },
          },
        ],
      );
    },
    [load],
  );
  const confirmRowDelete = useCallback(
    (c: EmailCampaignRow) =>
      Alert.alert("Delete campaign?", `Permanently delete "${c.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            try {
              await deleteEmailCampaign(token, c.id);
              await load();
            } catch (err) {
              Alert.alert("Action failed", err instanceof Error ? err.message : "Please try again.");
            }
          },
        },
      ]),
    [load],
  );

  // Export the selected campaigns to CSV + share — mirrors the web "Export Selected".
  const exportSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const rows = campaigns.filter((c) => selectedIds.has(c.id));
    setBulkBusy("export");
    try {
      // Lazy-loaded so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const header = ["ID", "Campaign", "Subject", "Recipients", "Sent", "Failed", "Status", "Sent At"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = rows.map((c) =>
        [c.id, c.name, c.subject, c.recipients, c.sentCount, c.failedCount, c.statusLabel, c.sentAt ? formatDateTimeET(c.sentAt, { month: "short", showZone: false }) : ""]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}email-campaigns-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Email Campaigns",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      }
    } catch (err) {
      Alert.alert("Export failed", err instanceof Error ? err.message : "Could not export.");
    } finally {
      setBulkBusy(null);
    }
  }, [selectedIds, campaigns]);

  // Per-status chip counts over every loaded campaign (same buckets as the filter).
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of campaigns) {
      const s = shownStatus(c);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [campaigns]);

  const showInitialLoader = loading && campaigns.length === 0;
  const showError = !!error && campaigns.length === 0;

  const goCreate = useCallback(
    () => router.push("/email-campaign/create-campaign"),
    [router],
  );

  // Sibling email screens (the old Templates · Notifications nav) plus the
  // header's former Refresh button, as module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Email Templates", icon: "mail", route: "/email-campaign/email-templates" },
    { label: "Email Notifications", icon: "bell", route: "/email-campaign/email-notification" },
    { label: "SMS Notifications", icon: "message-square", route: "/email-campaign/sms-notifications" },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Manage Campaigns"
        action={{ onPress: goCreate, accessibilityLabel: "Create campaign" }}
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
            Bulk emails to customers and staff, with delivery stats at a glance
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load campaigns"
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
                  icon: "send",
                  title: "Total Campaigns",
                  value: String(stats?.totalCampaigns ?? 0),
                  hint: "All time campaigns created",
                },
                {
                  icon: "check-circle",
                  title: "Emails Sent",
                  value: String(stats?.emailsSent ?? 0),
                  hint: "Successfully delivered emails",
                },
                {
                  icon: "x-circle",
                  title: "Failed Emails",
                  value: String(stats?.failedEmails ?? 0),
                  hint: "Delivery failures",
                },
                {
                  icon: "bar-chart-2",
                  title: "Success Rate",
                  value: `${stats?.successRate ?? 0}%`,
                  hint: "Email delivery success rate",
                },
              ]}
            />
          )}

          {/* More — sibling email screens as hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or subject"
            />
          </View>

          {/* Status chips — the screen's only filter. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {statusOptions.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.value === "all" ? "All" : opt.label}
                count={
                  showInitialLoader
                    ? undefined
                    : opt.value === "all"
                      ? campaigns.length
                      : (statusCounts.get(opt.value) ?? 0)
                }
                selected={statusFilter === opt.value}
                onPress={() => setStatusFilter(opt.value)}
              />
            ))}
          </ScrollView>

          {/* List header — title + count, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Campaigns" count={filtered.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {viewMode === "table" && selectedIds.size > 0 && (
            <EmailBulkBar
              count={selectedIds.size}
              busyKey={bulkBusy}
              chips={CAMPAIGN_BULK_CHIPS}
              onAction={() => exportSelected()}
              onClear={clearSelection}
            />
          )}

          {/* List — Table (default) or Cards over the same paged slice. Each
              state is keyed so switching between them remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? <AttractionsTableSkeleton /> : <AttractionsListSkeleton />}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            campaigns.length === 0 ? (
              <View key="s-empty">
              <ListEmptyState
                icon="send"
                title="No campaigns yet"
                message="Create your first campaign to email your guests."
                actionLabel="Create Campaign"
                actionIcon="plus"
                primary
                onAction={goCreate}
              />
              </View>
            ) : (
              <View key="s-no-match">
              <ListEmptyState
                icon="search"
                title="No campaigns found"
                message="No campaigns match your search or status."
                actionLabel="Clear search & filters"
                onAction={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              />
              </View>
            )
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <EmailCampaignsTable
                  campaigns={paged}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onRowPress={(c) => openDetails(c.id)}
                  onCancel={confirmRowCancel}
                  onDelete={confirmRowDelete}
                />
              ) : (
                paged.map((c) => (
                  <CampaignCard key={c.id} campaign={c} onPress={() => openDetails(c.id)} />
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
};

export default EmailCampaigns;
