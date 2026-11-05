import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LaunchKioskSheet } from "../../components/ui/LaunchKioskSheet";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { Pagination } from "../../components/ui/Pagination";
import {
  AttractionsListSkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  AppliedFiltersHint,
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
} from "../../components/ui/SummaryPanel";
import {
  doorIcon,
  EscapeRoomTag,
  formatTemplateDate,
  TemplatesTable,
  TemplateStatusPill,
} from "../../components/ui/TemplatesTable";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  consumeTemplatesStale,
  markTemplatesStale,
  useWaiverTemplates,
} from "../../lib/hooks/useWaiverTemplates";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  isEscapeRoomTemplate,
  templateAssignmentLabel,
  templateDefaultLabel,
} from "../../lib/waivers/templateDisplay";
import {
  deleteTemplate,
  fetchTemplates,
  forceDeleteTemplate,
  restoreTemplate,
  setTemplateStatus,
  type TemplateStatus,
  type WaiverTemplate,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

// The web Templates page's status select, as chips.
const STATUS_OPTIONS: { label: string; value: TemplateStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
];

const TemplateCard = ({
  template,
  onPress,
  onMore,
}: {
  template: WaiverTemplate;
  onPress: () => void;
  onMore: () => void;
}) => {
  const defaultLabel = templateDefaultLabel(template);
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`Template ${template.title}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {template.title}
        </Text>
        <TemplateStatusPill status={template.status} />
      </View>
      {!!template.internalDescription && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1" numberOfLines={1}>
          {template.internalDescription}
        </Text>
      )}

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
        {isEscapeRoomTemplate(template) && <EscapeRoomTag />}
        <View className="flex-row items-center gap-1.5">
          <Feather name="git-commit" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            v{template.currentVersion}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Feather name="link" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {templateAssignmentLabel(template)}
          </Text>
        </View>
        {!!defaultLabel && (
          <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
            {defaultLabel}
          </Text>
        )}
      </View>

      <View className="flex-row items-center justify-between gap-3 mt-3">
        <Text className="shrink text-xs text-gray-400 dark:text-gray-500" numberOfLines={1}>
          Updated {formatTemplateDate(template.updatedAt)}
        </Text>
        <Pressable
          onPress={onMore}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${template.title}`}
          className="p-1.5 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
        >
          <Feather name="more-horizontal" size={18} color="#9CA3AF" />
        </Pressable>
      </View>
    </Pressable>
  );
};

/** One row of the per-template actions sheet. */
const SheetAction = ({
  icon,
  label,
  danger = false,
  disabled = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
    accessibilityRole="button"
  >
    {icon}
    <Text
      className={`text-base font-medium ${
        danger ? "text-red-600" : "text-gray-800 dark:text-gray-100"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

const Templates = () => {
  const insets = useSafeAreaInsets();

  const role = getCurrentUser()?.role;
  const isCompanyAdmin = role === "company_admin";
  const { settings } = useWaiverSettings();
  // Template writes: admin, or manager when the company allows it.
  const canManage =
    isCompanyAdmin ||
    (role === "location_manager" &&
      (settings?.managerCanBuildTemplates ?? false));
  // Group Invites is an admin/manager screen, as on the web Manage menu.
  const canOpenGroupInvites = isCompanyAdmin || role === "location_manager";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">(
    "all",
  );
  /**
   * Deleted templates sit in their own collapsible section below the list, the
   * way the web presents them, rather than swapping the whole screen into a
   * "trash mode" — the live list stays on screen while you restore something.
   * Loaded on first expand, as the web does, so the extra request only happens
   * for someone who actually looks.
   */
  const [showTrashed, setShowTrashed] = useState(false);
  const [trashed, setTrashed] = useState<WaiverTemplate[]>([]);
  const [trashedLoading, setTrashedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsTemplate, setActionsTemplate] = useState<WaiverTemplate | null>(
    null,
  );
  const [kioskTemplate, setKioskTemplate] = useState<WaiverTemplate | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  // Presentation layout only — table by default, card view on toggle. Both
  // layouts read the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
    [debouncedSearch, statusFilter],
  );

  const { templates, loading, error, refetch } = useWaiverTemplates(filters);

  /** The trashed list, fetched separately so the live list is never replaced. */
  const loadTrashed = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setTrashedLoading(true);
    try {
      setTrashed(await fetchTemplates(token, { trashed: true }));
    } catch {
      // A failure leaves the section empty rather than blocking the screen;
      // pull-to-refresh or reopening it tries again.
      setTrashed([]);
    } finally {
      setTrashedLoading(false);
    }
  }, []);

  const toggleTrashed = useCallback(() => {
    setShowTrashed((open) => {
      if (!open) void loadTrashed();
      return !open;
    });
  }, [loadTrashed]);

  // Client-side pagination over the loaded templates list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const paged = useMemo(
    () => templates.slice((page - 1) * perPage, page * perPage),
    [templates, page, perPage],
  );

  // Reset to the first page whenever the result set changes / filters move.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, perPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), showTrashed ? loadTrashed() : null]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, showTrashed, loadTrashed]);

  useFocusEffect(
    useCallback(() => {
      if (consumeTemplatesStale()) refetch();
    }, [refetch]),
  );

  const runAction = async (fn: () => Promise<void>, failMsg: string) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setBusy(true);
    try {
      await fn();
      setActionsTemplate(null);
      markTemplatesStale();
      // Both lists can move on one action — deleting drops out of the live
      // list and into the trash, restoring goes the other way.
      await Promise.all([refetch(), showTrashed ? loadTrashed() : null]);
    } catch (e) {
      Alert.alert(
        failMsg,
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onToggleStatus = (t: WaiverTemplate) => {
    const token = getToken()!;
    const next: TemplateStatus = t.status === "active" ? "inactive" : "active";
    runAction(
      () => setTemplateStatus(token, t.id, next),
      "Could not update status",
    );
  };

  const onDelete = (t: WaiverTemplate) => {
    Alert.alert("Delete template?", `"${t.title}" will be moved to trash.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          runAction(
            () => deleteTemplate(getToken()!, t.id),
            "Could not delete template",
          ),
      },
    ]);
  };

  const onRestore = (t: WaiverTemplate) =>
    runAction(() => restoreTemplate(getToken()!, t.id), "Could not restore");

  const onForceDelete = (t: WaiverTemplate) => {
    Alert.alert(
      "Delete permanently?",
      `"${t.title}" will be permanently removed. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: () =>
            runAction(
              () => forceDeleteTemplate(getToken()!, t.id),
              "Could not delete permanently",
            ),
        },
      ],
    );
  };

  /** Post-waiver ads for a template — the table icon and the actions sheet
   *  both come through here so they cannot drift. */
  const openAds = (t: WaiverTemplate) => {
    router.push({
      pathname: "/waivers/template-ads",
      params: { templateId: String(t.id), title: t.title, kind: t.kind ?? "" },
    } as never);
  };

  const editTemplate = (t: WaiverTemplate) =>
    router.push(`/waivers/create-template?id=${t.id}` as never);

  // Escape-room waivers are signed from the escape-room check-in, not a staff
  // kiosk — the web sends staff to Escape Rooms for the link instead.
  const openEscapeRooms = () => router.push("/photos/escape-rooms" as never);

  // Card taps open the editor when the user can manage the template; otherwise
  // they open the actions sheet. Table rows are not tappable at all — there,
  // everything goes through the Actions cell.
  const openTemplate = (t: WaiverTemplate) => {
    if (canManage) {
      editTemplate(t);
    } else {
      setActionsTemplate(t);
    }
  };

  const statusFilterCount = statusFilter !== "all" ? 1 : 0;
  const showInitialLoader = loading;
  const showError = !loading && !!error;

  const moreShortcuts: HubQuickLink[] = [
    { label: "Waiver Records", icon: "file-text", route: "/waivers/waivers" },
    ...(canOpenGroupInvites
      ? [{ label: "Group Invites", icon: "users", route: "/waivers/group-invites" } as HubQuickLink]
      : []),
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Waiver Templates"
        action={{
          onPress: () => router.push("/waivers/create-template"),
          accessibilityLabel: "New template",
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
            Build legal waivers and assign them to packages, attractions, and events.
          </Text>

          {/* More — related Waivers screens as hub shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates"
            />
          </View>

          <AppliedFiltersHint
            count={statusFilterCount}
            onClear={() => setStatusFilter("all")}
          />

          {/* Status chips — the web's status select. The list is filtered on
              the server, so there are no per-status counts to show. */}
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
                selected={statusFilter === opt.value}
                onPress={() => setStatusFilter(opt.value)}
              />
            ))}
          </ScrollView>

          {showError && (
            <ListErrorBanner
              title="Could not load templates"
              message={error ?? ""}
              onRetry={() => void refetch()}
            />
          )}

          {!showInitialLoader && !showError && (
            <ListHeader title="All Templates" count={templates.length}>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </ListHeader>
          )}

          {/* Each state is keyed so switching between them remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? <AttractionsTableSkeleton /> : <AttractionsListSkeleton />}
            </View>
          ) : showError ? null : templates.length === 0 ? (
            debouncedSearch || statusFilter !== "all" ? (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No templates found"
                  message="No templates match your search or status."
                  actionLabel="Clear search & status"
                  onAction={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                />
              </View>
            ) : (
              <View key="s-empty">
                <ListEmptyState
                  icon="layout"
                  title="No templates yet"
                  message={
                    canManage
                      ? "Create your first waiver template to start collecting signatures."
                      : "No waiver templates have been created yet."
                  }
                  actionLabel={canManage ? "New Template" : undefined}
                  actionIcon="plus"
                  primary
                  onAction={
                    canManage ? () => router.push("/waivers/create-template") : undefined
                  }
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {/* Table (default) and card layouts render from the same
                  `paged` slice — switching is instant and never refetches. */}
              {viewMode === "table" ? (
                <TemplatesTable
                  templates={paged}
                  deleted={false}
                  canManage={canManage}
                  isCompanyAdmin={isCompanyAdmin}
                  busy={busy}
                  onKiosk={setKioskTemplate}
                  onEscapeRooms={openEscapeRooms}
                  onEdit={editTemplate}
                  onAds={openAds}
                  onToggleStatus={onToggleStatus}
                  onDelete={onDelete}
                  onRestore={onRestore}
                  onForceDelete={onForceDelete}
                />
              ) : (
                paged.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onPress={() => openTemplate(t)}
                    onMore={() => setActionsTemplate(t)}
                  />
                ))
              )}
              <Pagination
                page={page}
                perPage={perPage}
                total={templates.length}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </View>
          )}

          {/* Deleted templates — a disclosure below the live list, matching the
              web. Restore and permanent delete sit inline on each row there, so
              they do here too rather than behind a menu. */}
          <View className="mt-2 mb-6">
            <Pressable
              onPress={toggleTrashed}
              className="flex-row items-center gap-2 py-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityState={{ expanded: showTrashed }}
              accessibilityLabel="Deleted templates"
            >
              <Feather
                name={showTrashed ? "chevron-down" : "chevron-right"}
                size={16}
                color="#9CA3AF"
              />
              <Feather name="trash-2" size={14} color="#9CA3AF" />
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                Deleted templates
              </Text>
              {showTrashed && trashed.length > 0 && (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {trashed.length}
                </Text>
              )}
            </Pressable>

            {showTrashed && (
              <View className="mt-2">
                {trashedLoading ? (
                  <View
                    key="t-loading"
                    className="items-center rounded-2xl border border-gray-200 bg-white py-8 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <ActivityIndicator color="#9CA3AF" />
                  </View>
                ) : trashed.length === 0 ? (
                  <View
                    key="t-empty"
                    className="items-center rounded-2xl border border-gray-200 bg-white py-8 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <Text className="text-sm text-gray-400 dark:text-gray-500">
                      No deleted templates.
                    </Text>
                  </View>
                ) : (
                  <View key="t-list">
                    {trashed.map((t) => (
                      <View
                        key={t.id}
                        className="mb-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1">
                            <Text
                              className="text-sm font-semibold text-gray-600 dark:text-gray-300"
                              numberOfLines={1}
                            >
                              {t.title}
                            </Text>
                            {t.internalDescription ? (
                              <Text
                                className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
                                numberOfLines={1}
                              >
                                {t.internalDescription}
                              </Text>
                            ) : null}
                          </View>
                          <TemplateStatusPill status={t.status} />
                        </View>

                        <Text className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                          v{t.currentVersion} · Deleted{" "}
                          {t.deletedAt ? formatTemplateDate(t.deletedAt) : "—"}
                        </Text>

                        <View className="mt-3 flex-row gap-2">
                          {canManage && (
                            <Pressable
                              disabled={busy}
                              onPress={() => onRestore(t)}
                              className={`flex-row items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 active:opacity-70 dark:border-neutral-700 ${
                                busy ? "opacity-60" : ""
                              }`}
                              accessibilityRole="button"
                            >
                              <Feather name="rotate-ccw" size={13} color="#059669" />
                              <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                Restore
                              </Text>
                            </Pressable>
                          )}
                          {isCompanyAdmin && (
                            <Pressable
                              disabled={busy}
                              onPress={() => onForceDelete(t)}
                              className={`flex-row items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 active:opacity-70 dark:border-red-900/50 ${
                                busy ? "opacity-60" : ""
                              }`}
                              accessibilityRole="button"
                            >
                              <Feather name="trash-2" size={13} color="#DC2626" />
                              <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                                Delete permanently
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Per-template actions */}
      <BottomSheet
        visible={actionsTemplate !== null}
        onClose={() => (busy ? undefined : setActionsTemplate(null))}
        title={actionsTemplate?.title ?? "Template"}
      >
        <View className="px-4 pb-8">
          {busy && (
            <View className="items-center py-4">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}

          {actionsTemplate && (
            <>
              {isEscapeRoomTemplate(actionsTemplate) ? (
                <SheetAction
                  icon={doorIcon(PRIMARY, 18)}
                  label="Open Escape Rooms"
                  onPress={() => {
                    setActionsTemplate(null);
                    openEscapeRooms();
                  }}
                />
              ) : (
                <SheetAction
                  icon={<Feather name="tablet" size={18} color={PRIMARY} />}
                  label={actionsTemplate.status === "active" ? "Launch kiosk" : "Test kiosk"}
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    setKioskTemplate(t);
                  }}
                />
              )}
              {canManage && (
                <SheetAction
                  icon={<Feather name="edit-2" size={18} color={PRIMARY} />}
                  label="Edit template"
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    editTemplate(t);
                  }}
                />
              )}
              {canManage && (
                <SheetAction
                  // Ionicons, not Feather: the web marks post-waiver ads with a
                  // megaphone and Feather has no equivalent.
                  icon={<Ionicons name="megaphone-outline" size={18} color={PRIMARY} />}
                  label="Post-waiver ads"
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    openAds(t);
                  }}
                />
              )}
              {canManage && (
                <SheetAction
                  icon={<Feather name="power" size={18} color="#F59E0B" />}
                  label={actionsTemplate.status === "active" ? "Set inactive" : "Set active"}
                  disabled={busy}
                  onPress={() => onToggleStatus(actionsTemplate)}
                />
              )}
              {canManage && (
                <SheetAction
                  icon={<Feather name="trash-2" size={18} color="#DC2626" />}
                  label="Delete template"
                  danger
                  disabled={busy}
                  onPress={() => onDelete(actionsTemplate)}
                />
              )}
              {!canManage && (
                <Text className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  You do not have permission to manage templates.
                </Text>
              )}
            </>
          )}
        </View>
      </BottomSheet>

      {/* Launch Kiosk */}
      <LaunchKioskSheet
        template={kioskTemplate}
        visible={kioskTemplate !== null}
        onClose={() => setKioskTemplate(null)}
      />
    </View>
  );
};

export default Templates;
