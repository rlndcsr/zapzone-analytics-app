import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { StatTile } from "../../components/ui/StatTile";
import { consumeEmailTemplatesStale } from "../../lib/emailStale";
import { getToken } from "../../lib/session";
import {
  fetchEmailTemplates,
  type EmailTemplateRow,
  type EmailTemplateStatus,
} from "../../services/emailService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const STATUS_PILL: Record<
  EmailTemplateStatus,
  { label: string; pill: string; text: string }
> = {
  active: {
    label: "Active",
    pill: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-300",
  },
  draft: {
    label: "Draft",
    pill: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
  },
  archived: {
    label: "Archived",
    pill: "bg-gray-200 dark:bg-neutral-700",
    text: "text-gray-600 dark:text-gray-300",
  },
};

type StatusFilter = "all" | EmailTemplateStatus;
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

type TColKey = "subject" | "category" | "date" | "status";
type TCols = Record<TColKey, boolean>;
const DEFAULT_TCOLS: TCols = {
  subject: true,
  category: true,
  date: true,
  status: true,
};
const TCOLUMN_META: { key: TColKey; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "category", label: "Category" },
  { key: "date", label: "Created Date" },
  { key: "status", label: "Status" },
];

/** A row of chip choices used inside the Filters panel. */
function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
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
    </View>
  );
}

const EmailTemplates = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

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
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !t.subject.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter]);

  // Client-side pagination over the filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the result set changes size / filters move.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, perPage]);

  const filtersActive = statusFilter !== "all" || categoryFilter !== "all";

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
            Email Templates
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Email Templates
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage reusable email templates
            </Text>
          </View>

          {/* Nav: Campaigns · Notifications pill */}
          <FilterPill>
            <PillSegment
              label="Campaigns"
              onPress={() => router.push("/email-campaign/campaigns")}
              renderIcon={(c) => <Feather name="send" size={15} color={c} />}
            />
            <PillSegment
              label="Notifications"
              onPress={() => router.push("/email-campaign/email-notification")}
              renderIcon={(c) => <Feather name="bell" size={15} color={c} />}
            />
          </FilterPill>

          <Pressable
            onPress={() => router.push("/email-campaign/create-template")}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Template
            </Text>
          </Pressable>

          {/* Stats */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile
              icon="layout"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor={PRIMARY}
              label="Total Templates"
              value={String(counts.total)}
              hint="All templates in system"
            />
            <StatTile
              icon="check-circle"
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor={PRIMARY}
              label="Active"
              value={String(counts.active)}
              hint="Ready to use in campaigns"
            />
            <StatTile
              icon="clock"
              iconBg="bg-amber-50 dark:bg-amber-900/30"
              iconColor="#D97706"
              label="Draft"
              value={String(counts.draft)}
              hint="Work in progress"
            />
            <StatTile
              icon="archive"
              iconBg="bg-gray-100 dark:bg-neutral-800"
              iconColor="#6B7280"
              label="Archived"
              value={String(counts.archived)}
              hint="No longer in use"
            />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates by name or subject..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          {/* Filters · Columns pill */}
          <FilterPill>
            <PillSegment
              label="Filters"
              active={showFilters || filtersActive}
              onPress={() => setShowFilters((v) => !v)}
              renderIcon={(c) => <Feather name="filter" size={15} color={c} />}
            />
            <PillSegment
              label="Columns"
              active={showColumns}
              onPress={() => setShowColumns(true)}
              renderIcon={(c) => <Feather name="columns" size={15} color={c} />}
            />
          </FilterPill>

          {/* Filters panel */}
          {showFilters && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <ChipRow
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <ChipRow
                label="Category"
                options={categoryOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              {filtersActive && (
                <Pressable
                  onPress={() => {
                    setStatusFilter("all");
                    setCategoryFilter("all");
                  }}
                  className="self-end"
                >
                  <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* States */}
          {loading && templates.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Loading templates…
            </Text>
          )}
          {error && templates.length === 0 && (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={load}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* List */}
          {paged.map((t) => {
            const pill = STATUS_PILL[t.status] ?? STATUS_PILL.draft;
            return (
              <View
                key={t.id}
                className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                style={CARD_SHADOW}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {t.name}
                    </Text>
                    {cols.subject && !!t.subject && (
                      <Text
                        className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                        numberOfLines={1}
                      >
                        {t.subject}
                      </Text>
                    )}
                  </View>
                  {cols.status && (
                    <View className={`px-3 py-1 rounded-full ${pill.pill}`}>
                      <Text className={`text-xs font-semibold ${pill.text}`}>
                        {pill.label}
                      </Text>
                    </View>
                  )}
                </View>
                {(cols.category || cols.date) && (
                  <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                    {cols.category ? (
                      <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                          {t.category}
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    {cols.date && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {fmtDate(t.createdAt)}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <Pagination
            page={page}
            perPage={perPage}
            total={filtered.length}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />

          {!loading && !error && filtered.length === 0 && (
            <View className="items-center py-10">
              <Feather name="mail" size={36} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {templates.length === 0
                  ? "No templates yet"
                  : "No templates match your search"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

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
