import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DetailActionButton } from "../../components/ui/DetailKit";
import { EmailBulkBar, type EmailBulkChip } from "../../components/ui/EmailBulkBar";
import { EmailPreviewSheet } from "../../components/ui/EmailPreviewSheet";
import {
  EmailTemplatesTable,
  fmtTemplateDate,
  TemplateCategoryTag,
  TemplateStatusBadge,
} from "../../components/ui/EmailTemplatesTable";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { Pagination } from "../../components/ui/Pagination";
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
  SummaryPanel,
  ToolbarIconButton,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { canDuplicateTemplate, templateLocationSummary } from "../../lib/email/emailTemplateOptions";
import { consumeEmailTemplatesStale } from "../../lib/emailStale";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  fetchEmailTemplateDetail,
  fetchEmailTemplates,
  updateEmailTemplateStatus,
  type EmailTemplateDetail,
  type EmailTemplateRow,
  type EmailTemplateStatus,
} from "../../services/emailService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type StatusFilter = "all" | EmailTemplateStatus;
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

// Bulk actions mirror the web "Change Status" dropdown (Active / Draft / Archive).
const TEMPLATE_BULK_CHIPS: EmailBulkChip[] = [
  { key: "active", label: "Mark Active", icon: "check-circle", tint: "#16A34A" },
  { key: "draft", label: "Mark Draft", icon: "clock", tint: "#B45309" },
  { key: "archived", label: "Archive", icon: "archive", tint: "#6B7280" },
];

type TColKey = "subject" | "category" | "locations" | "date" | "status";
type TCols = Record<TColKey, boolean>;
const DEFAULT_TCOLS: TCols = {
  subject: true,
  category: true,
  locations: true,
  date: true,
  status: true,
};
const TCOLUMN_META: { key: TColKey; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "category", label: "Category" },
  { key: "locations", label: "Locations" },
  { key: "date", label: "Created Date" },
  { key: "status", label: "Status" },
];

/**
 * Card layout for one template, matching the flat module cards. Which lines
 * show still follows the Columns sheet, exactly as before.
 */
const TemplateCard = ({
  template: t,
  cols,
  onPress,
}: {
  template: EmailTemplateRow;
  cols: TCols;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
    accessibilityRole="button"
    accessibilityLabel={`View template ${t.name}`}
  >
    <View className="flex-row items-start justify-between gap-3">
      <Text
        className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
        numberOfLines={1}
      >
        {t.name}
      </Text>
      {cols.status && <TemplateStatusBadge status={t.status} />}
    </View>
    {cols.subject && !!t.subject && (
      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1" numberOfLines={1}>
        {t.subject}
      </Text>
    )}
    {cols.locations && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="map-pin" size={12} color="#9CA3AF" />
        <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {templateLocationSummary(t)}
        </Text>
      </View>
    )}
    {(cols.category || cols.date) && (
      <View className="flex-row items-center justify-between gap-3 mt-3">
        {cols.category ? <TemplateCategoryTag category={t.category} /> : <View />}
        {cols.date && (
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            {fmtTemplateDate(t.createdAt)}
          </Text>
        )}
      </View>
    )}
  </Pressable>
);

const EmailTemplates = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cols, setCols] = useState<TCols>(DEFAULT_TCOLS);
  const toggleCol = (key: TColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { rows, total: t } = await fetchEmailTemplates(token);
      setTemplates(rows);
      setTotal(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Refetch when returning from Create Template so the new row appears.
  useFocusEffect(
    useCallback(() => {
      if (consumeEmailTemplatesStale()) load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts = useMemo(
    () => ({
      total,
      active: templates.filter((t) => t.status === "active").length,
      draft: templates.filter((t) => t.status === "draft").length,
      archived: templates.filter((t) => t.status === "archived").length,
    }),
    [templates, total],
  );

  const categoryOptions = useMemo(
    () => [
      { label: "All Categories", value: "all" },
      ...Array.from(new Set(templates.map((t) => t.category).filter(Boolean)))
        .sort()
        .map((c) => ({ label: c, value: c })),
    ],
    [templates],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      // the web also searches the category and the locations a template covers
      if (
        q &&
        ![t.name, t.subject, t.category, templateLocationSummary(t), ...t.locationNames].some((v) =>
          v.toLowerCase().includes(q),
        )
      )
        return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter]);

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
  }, [search, statusFilter, categoryFilter, perPage]);

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
      const all = paged.length > 0 && paged.every((t) => prev.has(t.id));
      return all ? new Set() : new Set(paged.map((t) => t.id));
    });
  }, [paged]);

  // Drop the selection whenever the visible set or view changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, categoryFilter, page, perPage, viewMode]);

  // Tapping a row/card opens the Template Details screen.
  const openDetails = useCallback(
    (id: number) =>
      router.push({
        pathname: "/email-campaign/template-details",
        params: { id: String(id) },
      }),
    [router],
  );

  // --- Row actions: Preview · Edit · Delete (web `renderActions`) ---
  // Preview reads the template fresh from GET /api/email-templates/{id}, so it shows
  // exactly what is saved — subject and body with its merge variables as written.
  const [preview, setPreview] = useState<{
    row: EmailTemplateRow;
    detail: EmailTemplateDetail | null;
    error: string | null;
  } | null>(null);
  // Kept apart from the data so the sheet keeps its content while it slides away.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewRequest = useRef(0);

  const loadPreview = useCallback(async (row: EmailTemplateRow) => {
    const request = ++previewRequest.current;
    setPreview({ row, detail: null, error: null });
    setPreviewOpen(true);
    const token = getToken();
    if (!token) {
      setPreview({ row, detail: null, error: "Not signed in" });
      return;
    }
    try {
      const detail = await fetchEmailTemplateDetail(token, row.id);
      // a later tap on another row wins
      if (request === previewRequest.current) setPreview({ row, detail, error: null });
    } catch (err) {
      if (request === previewRequest.current) {
        setPreview({
          row,
          detail: null,
          error: err instanceof Error ? err.message : "Failed to load template",
        });
      }
    }
  }, []);

  const closePreview = useCallback(() => {
    previewRequest.current += 1;
    setPreviewOpen(false);
  }, []);

  const editTemplate = useCallback(
    (id: number) =>
      router.push({
        pathname: "/email-campaign/create-template",
        params: { id: String(id) },
      }),
    [router],
  );

  // Duplicate makes a draft copy (for a manager, for their own location) and opens it.
  const role = getCurrentUser()?.role;
  const canDuplicate = useCallback((t: EmailTemplateRow) => canDuplicateTemplate(t, role), [role]);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const duplicateTemplate = useCallback(
    async (t: EmailTemplateRow) => {
      const token = getToken();
      if (!token || duplicatingId !== null) return;
      setDuplicatingId(t.id);
      try {
        const copyId = await duplicateEmailTemplate(token, t.id);
        await load();
        editTemplate(copyId);
      } catch (err) {
        Alert.alert(
          "The template could not be copied",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setDuplicatingId(null);
      }
    },
    [duplicatingId, editTemplate, load],
  );

  const confirmDelete = useCallback(
    (t: EmailTemplateRow) =>
      Alert.alert(
        "Delete Template",
        "Are you sure you want to delete this email template? Any campaigns using this template will not be affected.\n\nThis action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete Template",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              try {
                await deleteEmailTemplate(token, t.id);
                setSelectedIds((prev) => {
                  if (!prev.has(t.id)) return prev;
                  const next = new Set(prev);
                  next.delete(t.id);
                  return next;
                });
                await load();
                Alert.alert("Template deleted", `"${t.name}" was deleted.`);
              } catch (err) {
                Alert.alert(
                  "Failed to delete template",
                  err instanceof Error ? err.message : "Please try again.",
                );
              }
            },
          },
        ],
      ),
    [load],
  );

  // Bulk status change — mirrors the web "Change Status" action: one template at a
  // time (two event photo emails can't both be switched on for a location), then
  // says how many changed and why the first refusal happened.
  const runBulkStatus = useCallback(
    async (key: string) => {
      const token = getToken();
      if (!token || selectedIds.size === 0 || bulkBusy !== null) return;
      const ids = [...selectedIds];
      setBulkBusy(key);
      const failures: unknown[] = [];
      for (const id of ids) {
        try {
          await updateEmailTemplateStatus(token, id, key as EmailTemplateStatus);
        } catch (err) {
          failures.push(err);
        }
      }
      setBulkBusy(null);
      setSelectedIds(new Set());
      await load();
      if (failures.length > 0) {
        const first = failures[0];
        Alert.alert(
          "Some templates were not changed",
          `${ids.length - failures.length} updated, ${failures.length} not changed. ${
            first instanceof Error ? first.message : "Some templates could not be updated."
          }`,
        );
      }
    },
    [selectedIds, bulkBusy, load],
  );

  // Status lives in the chips on the page; the Filters sheet holds Category.
  const sheetFilterCount = categoryFilter !== "all" ? 1 : 0;
  const appliedFilterCount = (statusFilter !== "all" ? 1 : 0) + sheetFilterCount;
  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const statusCount = (value: StatusFilter) =>
    value === "all" ? templates.length : counts[value];

  const showInitialLoader = loading && templates.length === 0;
  const showError = !!error && templates.length === 0;

  const goCreate = useCallback(
    () => router.push("/email-campaign/create-template"),
    [router],
  );

  // The old Campaigns · Email Notifications nav plus the header's former
  // Refresh button, as module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Campaigns", icon: "send", route: "/email-campaign/campaigns" },
    { label: "Email Notifications", icon: "bell", route: "/email-campaign/email-notification" },
    { label: "SMS Notifications", icon: "message-square", route: "/email-campaign/sms-notifications" },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Email Templates"
        action={{ onPress: goCreate, accessibilityLabel: "Create template" }}
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
            Create and manage reusable email templates
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load templates"
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
                  icon: "layout",
                  title: "Total Templates",
                  value: String(counts.total),
                  hint: "All templates in system",
                },
                {
                  icon: "check-circle",
                  title: "Active",
                  value: String(counts.active),
                  hint: "Ready to use in campaigns",
                },
                {
                  icon: "clock",
                  title: "Draft",
                  value: String(counts.draft),
                  hint: "Work in progress",
                },
                {
                  icon: "archive",
                  title: "Archived",
                  value: String(counts.archived),
                  hint: "No longer in use",
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
              placeholder="Search name, subject or location"
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

          {/* List header — title + count, Columns, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Templates" count={filtered.length}>
              <View className="flex-row items-center gap-2">
                <ToolbarIconButton
                  icon="columns"
                  label="Toggle columns"
                  active={showColumns}
                  onPress={() => setShowColumns(true)}
                />
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </ListHeader>
          )}

          {viewMode === "table" && selectedIds.size > 0 && (
            <EmailBulkBar
              count={selectedIds.size}
              busyKey={bulkBusy}
              chips={TEMPLATE_BULK_CHIPS}
              onAction={runBulkStatus}
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
            templates.length === 0 ? (
              <View key="s-empty">
                <ListEmptyState
                  icon="mail"
                  title="No templates yet"
                  message="Create a reusable template to start your first campaign."
                  actionLabel="Create Template"
                  actionIcon="plus"
                  primary
                  onAction={goCreate}
                />
              </View>
            ) : (
              <View key="s-no-match">
                <ListEmptyState
                  icon="search"
                  title="No templates found"
                  message="No templates match your search or filters."
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
                <EmailTemplatesTable
                  templates={paged}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onRowPress={(t) => openDetails(t.id)}
                  onPreview={loadPreview}
                  onEdit={(t) => editTemplate(t.id)}
                  onDelete={confirmDelete}
                  onDuplicate={duplicateTemplate}
                  canDuplicate={canDuplicate}
                />
              ) : (
                paged.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    cols={cols}
                    onPress={() => openDetails(t.id)}
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

      {/* Filters — Category (status lives in the chips). */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <FilterChipGroup
            label="Category"
            options={categoryOptions.map((o) => ({
              ...o,
              label: o.value === "all" ? "All" : o.label,
            }))}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
          <FilterSheetFooter
            canReset={sheetFilterCount > 0}
            onReset={() => setCategoryFilter("all")}
            onDone={() => setShowFilters(false)}
            doneLabel={`Show ${filtered.length} template${filtered.length === 1 ? "" : "s"}`}
          />
        </ScrollView>
      </BottomSheet>

      {/* Template Preview — the web list's Preview modal */}
      <EmailPreviewSheet
        visible={previewOpen}
        onClose={closePreview}
        title={preview?.detail?.name ?? preview?.row.name ?? "Template"}
        subtitle="Template Preview"
        loading={!!preview && !preview.detail && !preview.error}
        error={preview?.error ?? null}
        onRetry={preview ? () => loadPreview(preview.row) : undefined}
        subject={preview?.detail?.subject ?? ""}
        body={preview?.detail?.body ?? ""}
        footer={
          <>
            <DetailActionButton icon="x" label="Close" onPress={closePreview} />
            {!!preview && (
              <DetailActionButton
                icon={preview.row.canManage ? "edit" : "eye"}
                label={preview.row.canManage ? "Edit Template" : "View Template"}
                variant="primary"
                onPress={() => {
                  const id = preview.row.id;
                  closePreview();
                  editTemplate(id);
                }}
              />
            )}
          </>
        }
      />

      {/* Toggle Columns */}
      <BottomSheet
        visible={showColumns}
        onClose={() => setShowColumns(false)}
        title="Toggle Columns"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {TCOLUMN_META.map((col) => {
            const on = cols[col.key];
            return (
              <Pressable
                key={col.key}
                onPress={() => toggleCol(col.key)}
                className="flex-row items-center gap-3 px-2 py-3.5"
              >
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center border ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "border-gray-300 dark:border-neutral-600"
                  }`}
                >
                  {on && (
                    <Feather name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  {col.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCols(DEFAULT_TCOLS)}
            className="mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2"
          >
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Show All
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default EmailTemplates;
