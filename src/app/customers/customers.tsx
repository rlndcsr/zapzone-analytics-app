import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { ContactActionsSheet } from "../../components/ui/ContactActionsSheet";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
import { type SheetSelectOption } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchAllContacts,
  fetchContactStats,
  fetchContactTags,
  type ContactRow,
  type ContactStats,
  type ContactStatus,
} from "../../services/contactsService";

const PRIMARY = "#0644C7";
const PAGE_SIZE = 15;
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const STATUS_FILTERS: { label: string; value: ContactStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const SMS_OPTIONS = [
  { label: "All SMS", value: "all" },
  { label: "Opted In", value: "opted_in" },
  { label: "Opted Out", value: "opted_out" },
];

const SORT_OPTIONS = [
  { label: "Newest", value: "created_at:desc" },
  { label: "Oldest", value: "created_at:asc" },
  { label: "Name A–Z", value: "first_name:asc" },
  { label: "Email A–Z", value: "email:asc" },
  { label: "Status", value: "status:asc" },
];

/** A FilterPill segment that opens its own options sheet (replaces SheetSelect
 *  inside the pills, so the customers filters match the app's pill design). */
function PillSelect({
  icon,
  title,
  value,
  options,
  onSelect,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  value: string;
  options: SheetSelectOption[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === value) ?? null;
  return (
    <>
      <PillSegment
        label={selected ? selected.label : title}
        active={open}
        onPress={() => setOpen(true)}
        renderIcon={(c) => <Feather name={icon} size={15} color={c} />}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {options.map((option) => {
            const isSelected = String(option.value) === value;
            return (
              <Pressable
                key={String(option.value)}
                onPress={() => {
                  onSelect(String(option.value));
                  setOpen(false);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
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
    </>
  );
}

const Customers = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const user = getCurrentUser();
  const companyId = user?.company_id ?? null;

  // The full auth-scoped contact set (loaded once, like the web); every filter,
  // sort and the page count operate over this in memory.
  const [allRows, setAllRows] = useState<ContactRow[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters (all client-side, mirroring the web admin).
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContactStatus | "all">("all");
  const [tag, setTag] = useState("all");
  const [source, setSource] = useState("all");
  const [company, setCompany] = useState("all");
  const [sms, setSms] = useState("all");
  const [dateStart, setDateStart] = useState<string | undefined>();
  const [dateEnd, setDateEnd] = useState<string | undefined>();
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [sort, setSort] = useState("created_at:desc");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);

  // undefined = sheet closed; null = create; row = actions for that contact.
  const [sheetContact, setSheetContact] = useState<ContactRow | null | undefined>(
    undefined,
  );

  // Deep link: open a contact's actions sheet directly when navigated here from
  // a notification (e.g. /customers/customers?openId=123). Wait until the list
  // has loaded before resolving so we don't clear the param prematurely; if the
  // record no longer exists, show a friendly message and stay put.
  const { openId } = useLocalSearchParams<{ openId?: string }>();
  useEffect(() => {
    if (!openId || loading) return;
    const match = allRows.find((c) => String(c.id) === openId);
    if (match) {
      setSheetContact(match);
    } else {
      Alert.alert("Customer unavailable", "This customer is no longer available.");
    }
    router.setParams({ openId: undefined });
  }, [openId, loading, allRows, router]);

  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    const rid = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [rows, s, tags] = await Promise.all([
        fetchAllContacts({ token, companyId: companyId ?? undefined }),
        fetchContactStats({ token, companyId: companyId ?? undefined }).catch(
          () => null,
        ),
        fetchContactTags({ token, companyId: companyId ?? undefined }).catch(
          () => [],
        ),
      ]);
      if (rid !== reqRef.current) return;
      setAllRows(rows);
      if (s) setStats(s);
      setTagOptions(tags);
    } catch (err) {
      if (rid === reqRef.current)
        setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Options derived from the loaded set (web derives Source/Company from data).
  const sourceOptions = useMemo(
    () =>
      Array.from(new Set(allRows.map((c) => c.source).filter(Boolean))).sort() as string[],
    [allRows],
  );
  const companyOptions = useMemo(
    () =>
      Array.from(
        new Set(allRows.map((c) => c.companyName).filter(Boolean)),
      ).sort() as string[],
    [allRows],
  );
  const tagChoices = useMemo(() => {
    if (tagOptions.length) return tagOptions;
    return Array.from(new Set(allRows.flatMap((c) => c.tags))).sort();
  }, [tagOptions, allRows]);

  // The full client-side filter + sort pipeline (mirrors the web's useAdminTable).
  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const result = allRows.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (tag !== "all" && !c.tags.includes(tag)) return false;
      if (source !== "all" && (c.source ?? "") !== source) return false;
      if (company !== "all" && (c.companyName ?? "") !== company) return false;
      if (sms === "opted_in" && !c.smsConsent) return false;
      if (sms === "opted_out" && c.smsConsent) return false;
      const created = c.createdAt ? c.createdAt.slice(0, 10) : null;
      if (dateStart && (!created || created < dateStart)) return false;
      if (dateEnd && (!created || created > dateEnd)) return false;
      if (terms.length) {
        const hay = [
          c.firstName,
          c.lastName,
          c.email,
          c.phone,
          c.companyName,
          c.jobTitle,
          c.source,
          c.tags.join(" "),
          c.locationName,
          String(c.id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });

    const [sortBy, sortOrder] = sort.split(":");
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "first_name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "email") cmp = a.email.localeCompare(b.email);
      else if (sortBy === "status") cmp = a.status.localeCompare(b.status);
      else
        cmp =
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime();
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, search, status, tag, source, company, sms, dateStart, dateEnd, sort]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => {
    setPage(1);
  }, [search, status, tag, source, company, sms, dateStart, dateEnd, sort, perPage]);

  const visible = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (tag !== "all" ? 1 : 0) +
    (source !== "all" ? 1 : 0) +
    (company !== "all" ? 1 : 0) +
    (sms !== "all" ? 1 : 0) +
    (dateStart || dateEnd ? 1 : 0);

  const clearFilters = () => {
    setStatus("all");
    setTag("all");
    setSource("all");
    setCompany("all");
    setSms("all");
    setDateStart(undefined);
    setDateEnd(undefined);
  };

  const afterMutation = () => load();

  const showInitialLoader = loading && allRows.length === 0 && !error;
  const showError = !loading && !!error && allRows.length === 0;

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
            Customers
          </Text>
          <View style={{ width: 36 }} />
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
          {/* Analytics link */}
          <Pressable
            onPress={() => router.push("/customers/analytics")}
            className="flex-row items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl p-4 mt-6"
            style={CARD_SHADOW}
          >
            <View className="w-10 h-10 rounded-xl bg-[#0644C7]/10 items-center justify-center">
              <Feather name="pie-chart" size={18} color={PRIMARY} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                Customer Analytics
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                KPIs, trends, top customers, and segments
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </Pressable>

          {/* KPI cards */}
          {(stats || allRows.length > 0) && (
            <View className="flex-row flex-wrap gap-3">
              <StatTile
                icon="users"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Total Customers"
                value={String(allRows.length)}
                hint="All registered customers"
              />
              <StatTile
                icon="user-check"
                iconBg="bg-green-50 dark:bg-green-900/30"
                iconColor="#16A34A"
                label="Active"
                value={String(stats?.active ?? 0)}
                hint="Currently active"
              />
              <StatTile
                icon="user-x"
                iconBg="bg-red-50 dark:bg-red-900/30"
                iconColor="#EF4444"
                label="Inactive"
                value={String(stats?.inactive ?? 0)}
                hint="Currently inactive"
              />
              <StatTile
                icon="calendar"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Recently Added"
                value={String(stats?.recentlyAdded ?? 0)}
                hint="New customers"
              />
            </View>
          )}

          {/* Add customer (above the filter pills) */}
          <Pressable
            onPress={() => setSheetContact(null)}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Add customer"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white" numberOfLines={1}>
              Add Customer
            </Text>
          </Pressable>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search customers..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Tags · Sources · Companies */}
          <FilterPill>
            <PillSelect
              icon="tag"
              title="All Tags"
              value={tag}
              options={[
                { label: "All Tags", value: "all" },
                ...tagChoices.map((t) => ({ label: t, value: t })),
              ]}
              onSelect={setTag}
            />
            <PillSelect
              icon="git-branch"
              title="All Sources"
              value={source}
              options={[
                { label: "All Sources", value: "all" },
                ...sourceOptions.map((s) => ({ label: s, value: s })),
              ]}
              onSelect={setSource}
            />
            <PillSelect
              icon="briefcase"
              title="All Companies"
              value={company}
              options={[
                { label: "All Companies", value: "all" },
                ...companyOptions.map((c) => ({ label: c, value: c })),
              ]}
              onSelect={setCompany}
            />
          </FilterPill>

          {/* SMS · Created Date · Sort */}
          <FilterPill>
            <PillSelect
              icon="message-square"
              title="All SMS"
              value={sms}
              options={SMS_OPTIONS}
              onSelect={setSms}
            />
            <PillSegment
              label={
                dateStart && dateEnd
                  ? `${formatShortDate(dateStart)} – ${formatShortDate(dateEnd)}`
                  : "Created Date"
              }
              active={showDateSheet}
              onPress={() => setShowDateSheet(true)}
              renderIcon={(c) => <Feather name="calendar" size={15} color={c} />}
            />
            <PillSelect
              icon="sliders"
              title="Newest"
              value={sort}
              options={SORT_OPTIONS}
              onSelect={setSort}
            />
          </FilterPill>


           {/* Status chips + clear */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row gap-2">
              {STATUS_FILTERS.map((s) => {
                const active = status === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => setStatus(s.value)}
                    className={`px-3.5 py-2 rounded-lg border ${
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
            {activeFilterCount > 0 && (
              <Pressable onPress={clearFilters} hitSlop={8}>
                <Text className="text-xs font-semibold text-[#0644C7]">
                  Clear ({activeFilterCount})
                </Text>
              </Pressable>
            )}
          </View>

          {/* Count */}
          {!showInitialLoader && !showError && (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Showing {visible.length} of {filtered.length} customers
            </Text>
          )}

          {showInitialLoader && <AnalyticsSkeleton tiles={0} panels={4} />}

          {showError && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
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

          {/* Cards */}
          {!showInitialLoader && !showError && (
            <View className="gap-3">
              {visible.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setSheetContact(c)}
                  className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                  style={CARD_SHADOW}
                >
                  <View className="flex-row items-start justify-between">
                    <Text
                      className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <StatusBadge status={c.status} />
                  </View>
                  {!!c.email && (
                    <View className="flex-row items-center gap-1.5 mt-2">
                      <Feather name="mail" size={13} color="#9CA3AF" />
                      <Text
                        className="text-xs text-gray-500 dark:text-gray-400 flex-1"
                        numberOfLines={1}
                      >
                        {c.email}
                      </Text>
                    </View>
                  )}
                  {!!c.phone && (
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Feather name="phone" size={13} color="#9CA3AF" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {c.phone}
                      </Text>
                    </View>
                  )}
                  {(!!c.companyName || !!c.jobTitle) && (
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Feather name="briefcase" size={13} color="#9CA3AF" />
                      <Text
                        className="text-xs text-gray-500 dark:text-gray-400 flex-1"
                        numberOfLines={1}
                      >
                        {[c.jobTitle, c.companyName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  )}
                  {!!c.locationName && (
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Feather name="map-pin" size={13} color="#9CA3AF" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {c.locationName}
                      </Text>
                    </View>
                  )}
                  {c.tags.length > 0 && (
                    <View className="flex-row flex-wrap gap-1.5 mt-2.5">
                      {c.tags.slice(0, 4).map((t) => (
                        <View
                          key={t}
                          className="bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md"
                        >
                          <Text className="text-[11px] font-medium text-[#0644C7] dark:text-blue-300">
                            {t}
                          </Text>
                        </View>
                      ))}
                      {c.tags.length > 4 && (
                        <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                          +{c.tags.length - 4}
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>
              ))}

              {/* Empty */}
              {filtered.length === 0 && (
                <View className="items-center py-12">
                  <Feather name="users" size={40} color="#D1D5DB" />
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    {search || activeFilterCount > 0
                      ? "No customers match your filters"
                      : "No customers yet"}
                  </Text>
                </View>
              )}

              {/* Pagination */}
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

      <ContactActionsSheet
        visible={sheetContact !== undefined}
        contact={sheetContact ?? null}
        companyId={companyId}
        locationId={user?.location_id ?? null}
        onClose={() => setSheetContact(undefined)}
        onChanged={afterMutation}
      />

      <DateRangeSheet
        visible={showDateSheet}
        initialStart={dateStart}
        initialEnd={dateEnd}
        onClose={() => setShowDateSheet(false)}
        onApply={(start, end) => {
          setDateStart(start);
          setDateEnd(end);
          setShowDateSheet(false);
        }}
      />
    </View>
  );
};

export default Customers;
