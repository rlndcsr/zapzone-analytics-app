import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { LaunchKioskSheet } from "../../components/ui/LaunchKioskSheet";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TemplatesTable } from "../../components/ui/TemplatesTable";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { WaiversListSkeleton } from "../../components/ui/skeleton/WaiversSkeleton";
import { formatDateET } from "../../lib/date/venueTime";
import {
  consumeTemplatesStale,
  markTemplatesStale,
  useWaiverTemplates,
} from "../../lib/hooks/useWaiverTemplates";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { getCurrentUser, getToken } from "../../lib/session";
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

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const STATUS_OPTIONS: { label: string; value: TemplateStatus | "all" }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
];

/** updated_at is an instant, so it's dated on the venue's calendar, not the
 *  device's — a late-evening edit in Michigan is still "today" here. */
function formatDate(dateStr: string | null): string {
  return formatDateET(dateStr, { month: "short", fallback: dateStr ?? "—" });
}

const TemplateCard = ({
  template,
  deleted,
  onPress,
  onMore,
}: {
  template: WaiverTemplate;
  deleted: boolean;
  onPress: () => void;
  onMore: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={`Template ${template.title}`}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {template.title}
        </Text>
        {!!template.internalDescription && (
          <Text
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            numberOfLines={1}
          >
            {template.internalDescription}
          </Text>
        )}
      </View>
      <StatusBadge status={deleted ? "deleted" : template.status} />
    </View>

    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center gap-1.5">
        <Feather name="git-commit" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          v{template.currentVersion}
        </Text>
      </View>
      {template.isDefault && (
        <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
          <Text className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Default
          </Text>
        </View>
      )}
      <View className="flex-row items-center gap-1.5">
        <Feather name="link" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {template.assignmentCount} assigned
        </Text>
      </View>
    </View>

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {deleted ? "Deleted" : "Updated"} {formatDate(template.updatedAt)}
      </Text>
      <Pressable
        onPress={onMore}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${template.title}`}
        className="p-1.5 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
      >
        <Feather name="more-vertical" size={18} color="#9CA3AF" />
      </Pressable>
    </View>
  </Pressable>
);

const Templates = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const role = getCurrentUser()?.role;
  const isCompanyAdmin = role === "company_admin";
  const { settings } = useWaiverSettings();
  // Template writes: admin, or manager when the company allows it.
  const canManage =
    isCompanyAdmin ||
    (role === "location_manager" &&
      (settings?.managerCanBuildTemplates ?? false));

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
  const [sheet, setSheet] = useState<null | "status">(null);
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
      params: { templateId: String(t.id), title: t.title },
    } as never);
  };

  // Card taps open the editor when the user can manage the template; otherwise
  // they open the actions sheet. Table rows are not tappable at all — there,
  // everything goes through the Actions cell.
  const openTemplate = (t: WaiverTemplate) => {
    if (canManage) {
      router.push(`/waivers/create-template?id=${t.id}` as never);
    } else {
      setActionsTemplate(t);
    }
  };

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ??
    "All Statuses";

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
            Templates
          </Text>
          {/* Deleted templates live in their own labelled section below the
              list, so the header needs no control — this keeps the title
              centred against the back button. */}
          <View className="h-9 w-9" />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
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
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Waiver Templates
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Reusable legal text assigned to activities
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/waivers/create-template")}
            className="flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text
              className="text-sm font-semibold text-white"
              numberOfLines={1}
            >
              New Template
            </Text>
          </Pressable>
          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Status filter */}
          <Pressable
            onPress={() => setSheet("status")}
            className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
          >
            <Feather name="check-circle" size={16} color={PRIMARY} />
            <Text
              className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
            <Feather name="chevron-down" size={14} color="#9CA3AF" />
          </Pressable>

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-4">
              <View className="flex-row items-center gap-2 shrink">
                <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                  All Templates
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {templates.length}
                  </Text>
                </View>
              </View>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          )}

          {loading ? (
            <WaiversListSkeleton />
          ) : !error && templates.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="layout" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No templates found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {canManage
                  ? "Tap + to create your first template."
                  : "No templates match your search."}
              </Text>
            </View>
          ) : (
            !error && (
              <View>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <TemplatesTable
                    templates={paged}
                    deleted={false}
                    canManage={canManage}
                    isCompanyAdmin={isCompanyAdmin}
                    busy={busy}
                    onView={setActionsTemplate}
                    onKiosk={setKioskTemplate}
                    onEdit={(t) =>
                      router.push(
                        `/waivers/create-template?id=${t.id}` as never,
                      )
                    }
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
                      deleted={false}
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
            )
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
                <View className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {trashed.length}
                  </Text>
                </View>
              )}
            </Pressable>

            {showTrashed && (
              <View className="mt-2">
                {trashedLoading ? (
                  <View className="items-center rounded-2xl border border-gray-100 bg-white py-8 dark:border-neutral-800 dark:bg-neutral-900">
                    <ActivityIndicator color="#9CA3AF" />
                  </View>
                ) : trashed.length === 0 ? (
                  <View className="items-center rounded-2xl border border-gray-100 bg-white py-8 dark:border-neutral-800 dark:bg-neutral-900">
                    <Text className="text-sm text-gray-400 dark:text-gray-500">
                      No deleted templates.
                    </Text>
                  </View>
                ) : (
                  trashed.map((t) => (
                    <View
                      key={t.id}
                      className="mb-2 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
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
                        <Text className="text-xs text-gray-400 dark:text-gray-500">
                          v{t.currentVersion}
                        </Text>
                      </View>

                      <Text className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Deleted {t.deletedAt ? formatDate(t.deletedAt) : "—"}
                      </Text>

                      <View className="mt-3 flex-row gap-2">
                        {canManage && (
                          <Pressable
                            disabled={busy}
                            onPress={() => onRestore(t)}
                            className={`flex-row items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 active:opacity-80 dark:bg-emerald-900/25 ${
                              busy ? "opacity-60" : ""
                            }`}
                            accessibilityRole="button"
                          >
                            <Feather name="rotate-ccw" size={13} color="#047857" />
                            <Text className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Restore
                            </Text>
                          </Pressable>
                        )}
                        {isCompanyAdmin && (
                          <Pressable
                            disabled={busy}
                            onPress={() => onForceDelete(t)}
                            className={`flex-row items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 active:opacity-80 dark:bg-red-900/25 ${
                              busy ? "opacity-60" : ""
                            }`}
                            accessibilityRole="button"
                          >
                            <Feather name="trash-2" size={13} color="#B91C1C" />
                            <Text className="text-xs font-medium text-red-700 dark:text-red-300">
                              Delete permanently
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Status filter sheet */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatusFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

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
              <Pressable
                onPress={() => {
                  const t = actionsTemplate;
                  setActionsTemplate(null);
                  setKioskTemplate(t);
                }}
                className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <Feather name="tablet" size={18} color={PRIMARY} />
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                  Launch kiosk
                </Text>
              </Pressable>
              {canManage && (
                <Pressable
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    router.push(`/waivers/create-template?id=${t.id}` as never);
                  }}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="edit-2" size={18} color={PRIMARY} />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Edit template
                  </Text>
                </Pressable>
              )}
              {canManage && (
                <Pressable
                  onPress={() => {
                    const t = actionsTemplate;
                    setActionsTemplate(null);
                    openAds(t);
                  }}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  {/* Ionicons, not Feather: the web marks post-waiver ads
                      with a megaphone and Feather has no equivalent. */}
                  <Ionicons name="megaphone-outline" size={18} color={PRIMARY} />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Post-waiver ads
                  </Text>
                </Pressable>
              )}
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onToggleStatus(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="power" size={18} color="#F59E0B" />
                  <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                    {actionsTemplate.status === "active"
                      ? "Set inactive"
                      : "Set active"}
                  </Text>
                </Pressable>
              )}
              {canManage && (
                <Pressable
                  disabled={busy}
                  onPress={() => onDelete(actionsTemplate)}
                  className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Feather name="trash-2" size={18} color="#DC2626" />
                  <Text className="text-base font-medium text-red-600">
                    Delete template
                  </Text>
                </Pressable>
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
