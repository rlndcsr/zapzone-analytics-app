import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { AddTagSheet } from "../../components/ui/AddTagSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  CampaignExportSheet,
  EMPTY_CAMPAIGN_EXPORT_FILTERS,
  type CampaignExportFilters,
} from "../../components/ui/CampaignExportSheet";
import { ContactActionsSheet } from "../../components/ui/ContactActionsSheet";
import {
  CustomerFiltersSheet,
  EMPTY_CUSTOMER_FILTERS,
  countActiveCustomerFilters,
  type CustomerFilterValues,
} from "../../components/ui/CustomerFiltersSheet";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import {
  CUSTOMER_COLUMNS,
  CustomersTable,
  allCustomerColumnKeys,
  defaultCustomerColumnKeys,
} from "../../components/ui/CustomersTable";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
import { type SheetSelectOption } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import { consumeContactsStale } from "../../lib/contactsStale";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteContact,
  exportContactsForCampaign,
  fetchAllContacts,
  fetchContactStats,
  fetchContactTags,
  updateContact,
  type ContactRow,
  type ContactStats,
} from "../../services/contactsService";

const PRIMARY = "#0644C7";
const PAGE_SIZE = 5;
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

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
  const [filters, setFilters] = useState<CustomerFilterValues>(
    EMPTY_CUSTOMER_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [sort, setSort] = useState("created_at:desc");

  // Exports — the plain CSV and the campaign mailing list.
  const [exportingCsv, setExportingCsv] = useState(false);
  const [showCampaignSheet, setShowCampaignSheet] = useState(false);
  const [campaignFilters, setCampaignFilters] = useState<CampaignExportFilters>(
    EMPTY_CAMPAIGN_EXPORT_FILTERS,
  );
  const [campaignExporting, setCampaignExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  // Presentation layout only — table by default, card view on toggle. Both read
  // the same `visible` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Which row has an inline table delete in flight.
  const [busyRowId, setBusyRowId] = useState<number | null>(null);
  // Bulk selection (table view only) + the in-flight bulk delete flag.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // "Toggle Columns" — which table columns are on (web default set to start).
  const [showColumnsSheet, setShowColumnsSheet] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    defaultCustomerColumnKeys,
  );
  // The contact whose Add Tag sheet is open (null = closed).
  const [addTagContact, setAddTagContact] = useState<ContactRow | null>(null);

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

  // After editing on the dedicated screen, refetch on return so the list + KPIs
  // reflect the saved changes (mirrors the other modules' stale-flag pattern).
  useFocusEffect(
    useCallback(() => {
      if (consumeContactsStale()) load();
    }, [load]),
  );

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
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.tag !== "all" && !c.tags.includes(filters.tag)) return false;
      if (filters.source !== "all" && (c.source ?? "") !== filters.source)
        return false;
      if (filters.company !== "all" && (c.companyName ?? "") !== filters.company)
        return false;
      if (filters.sms === "opted_in" && !c.smsConsent) return false;
      if (filters.sms === "not_opted_in" && c.smsConsent) return false;
      const created = c.createdAt ? c.createdAt.slice(0, 10) : null;
      if (filters.createdStart && (!created || created < filters.createdStart))
        return false;
      if (filters.createdEnd && (!created || created > filters.createdEnd))
        return false;
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
  }, [allRows, search, filters, sort]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => {
    setPage(1);
  }, [search, filters, sort, perPage]);

  const visible = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Selection is scoped to what's visible: clear it whenever the visible set
  // changes (filters / page / page-size) or the layout toggles away, so a bulk
  // action never touches off-screen rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filters, sort, page, perPage, viewMode]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every row on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        visible.length > 0 && visible.every((c) => prev.has(c.id));
      return allSelected ? new Set() : new Set(visible.map((c) => c.id));
    });
  }, [visible]);
  const activeFilterCount = countActiveCustomerFilters(filters);

  // The calendar is a native sheet too, so close the filters first (two stacked
  // sheets crash Android).
  const openCreatedDate = useCallback(() => {
    setShowFilterSheet(false);
    setTimeout(() => setShowDateSheet(true), 280);
  }, []);
  const closeCreatedDate = useCallback(() => {
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyCreatedDate = useCallback((start: string, end: string) => {
    setFilters((f) => ({ ...f, createdStart: start, createdEnd: end }));
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);

  const afterMutation = () => load();

  // Inline table delete — confirm, then DELETE and reload (mirrors the web
  // contacts row trash button). The actions sheet remains the richer path.
  const handleDelete = useCallback(
    (c: ContactRow) => {
      Alert.alert(
        "Delete customer",
        `Delete ${c.name}? This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) {
                Alert.alert("Not signed in", "Please sign in again to delete.");
                return;
              }
              setBusyRowId(c.id);
              try {
                await deleteContact(token, c.id);
                await load();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete this customer.",
                );
              } finally {
                setBusyRowId(null);
              }
            },
          },
        ],
      );
    },
    [load],
  );

  /**
   * Flip a customer between active and inactive — the same PUT the web's
   * clickable status pill fires (`updateContact(id, { status })`). The row is
   * patched in place first so the pill responds immediately, then rolled back
   * if the request fails.
   */
  const handleToggleStatus = useCallback(
    async (c: ContactRow) => {
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }
      const next = c.status === "active" ? "inactive" : "active";
      setBusyRowId(c.id);
      setAllRows((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, status: next } : row)),
      );
      try {
        await updateContact(token, c.id, { status: next });
        await load();
      } catch (err) {
        setAllRows((prev) =>
          prev.map((row) =>
            row.id === c.id ? { ...row, status: c.status } : row,
          ),
        );
        Alert.alert(
          "Update failed",
          err instanceof Error ? err.message : "Could not update the status.",
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [load],
  );

  // Bulk delete — confirm, then fan out per-id DELETE calls (no bulk endpoint),
  // reload and clear the selection. Mirrors the web bulk delete.
  const confirmBulkDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    Alert.alert(
      "Delete customers",
      `Delete ${ids.length} customer(s)? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again to delete.");
              return;
            }
            setBulkBusy(true);
            try {
              await Promise.all(ids.map((id) => deleteContact(token, id)));
              setSelectedIds(new Set());
              await load();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the selected customers.",
              );
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ],
    );
  }, [selectedIds, load]);

  // Write a CSV to a temp file and hand it to the share sheet.
  const shareCsv = useCallback(async (csv: string, dialogTitle: string) => {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");
    const date = new Date().toISOString().split("T")[0];
    const uri = `${FileSystem.cacheDirectory}customers-export-${date}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle,
        UTI: "public.comma-separated-values-text",
      });
    } else {
      Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
    }
  }, []);

  // Export CSV — the rows currently on screen, with the web's column set.
  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no customers to export.");
      return;
    }
    setExportingCsv(true);
    try {
      const header = [
        "ID", "Name", "Email", "Phone", "Company", "Job Title", "Location",
        "Tags", "Source", "Status", "SMS", "Address", "City", "State", "ZIP",
        "Country", "Notes", "Created", "Updated", "First Name", "Last Name",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      // Venue time, so an export reads the same wherever the phone is.
      const stamp = (v: string | null) =>
        v ? formatDateTimeET(v, { month: "short", showZone: false }) : "";
      const lines = filtered.map((c) =>
        [
          c.id, c.name, c.email, c.phone, c.companyName, c.jobTitle,
          c.locationName, c.tags.join("; "), c.source, c.status,
          c.smsConsent ? "Opted In" : "No", c.address, c.city, c.state, c.zip,
          c.country, c.notes, stamp(c.createdAt), stamp(c.updatedAt),
          c.firstName, c.lastName,
        ]
          .map(esc)
          .join(","),
      );
      await shareCsv(
        [header.map(esc).join(","), ...lines].join("\n"),
        "Export Customers",
      );
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExportingCsv(false);
    }
  }, [filtered, shareCsv]);

  // Campaign Export — asks the server for the mailing list, then shares it.
  const runCampaignExport = useCallback(async () => {
    const token = getToken();
    if (!token || companyId == null) {
      Alert.alert("Not available", "No company is linked to this account.");
      return;
    }
    setCampaignExporting(true);
    try {
      const contacts = await exportContactsForCampaign(token, {
        companyId,
        locationId: user?.location_id ?? null,
        tags: campaignFilters.tags.length ? campaignFilters.tags : undefined,
        // The web only sends a status when exactly one box is ticked.
        status:
          campaignFilters.statuses.length === 1
            ? (campaignFilters.statuses[0] as "active" | "inactive")
            : undefined,
        activeOnly: campaignFilters.activeOnly,
      });
      if (contacts.length === 0) {
        Alert.alert("Nothing to export", "No customers matched those filters.");
        return;
      }
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["ID", "Name", "Email", "First Name", "Last Name"];
      const lines = contacts.map((c) =>
        [c.id, c.name, c.email, c.firstName, c.lastName].map(esc).join(","),
      );
      await shareCsv(
        [header.map(esc).join(","), ...lines].join("\n"),
        "Export Customers",
      );
      setShowCampaignSheet(false);
      setCampaignFilters(EMPTY_CAMPAIGN_EXPORT_FILTERS);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error
          ? err.message
          : "Failed to export customers. Please try again.",
      );
    } finally {
      setCampaignExporting(false);
    }
  }, [companyId, user?.location_id, campaignFilters, shareCsv]);

  // Show the page skeleton on initial load AND pull-to-refresh (not just when empty).
  const showSkeleton = loading && !error;
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

          {/* KPI cards — skeleton while loading (tiles match StatTile exactly). */}
          {showSkeleton ? (
            <AnalyticsSkeleton tiles={4} panels={0} />
          ) : (stats || allRows.length > 0) ? (
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
          ) : null}

          {/* Export CSV + Campaign Export, then Add Customer — same order as web. */}
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={exportCsv}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Export CSV"
            >
              {exportingCsv ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <Feather name="download" size={16} color="#6B7280" />
              )}
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Export CSV
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowCampaignSheet(true)}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Campaign Export"
            >
              <Feather name="send" size={16} color="#6B7280" />
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Campaign Export
              </Text>
            </Pressable>
          </View>

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

          {/* Controls — segmented pill (Filters · Sort) */}
          <FilterPill>
            <PillSegment
              label={
                activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"
              }
              active={showFilterSheet || activeFilterCount > 0}
              onPress={() => setShowFilterSheet(true)}
              renderIcon={(c) => <Feather name="sliders" size={15} color={c} />}
            />
            <PillSelect
              icon="bar-chart-2"
              title="Newest"
              value={sort}
              options={SORT_OPTIONS}
              onSelect={setSort}
            />
            {/* Columns — table view only, like the web table toolbar. */}
            {viewMode === "table" && (
              <PillSegment
                label="Columns"
                active={showColumnsSheet}
                onPress={() => setShowColumnsSheet(true)}
                renderIcon={(c) => (
                  <Feather name="columns" size={15} color={c} />
                )}
              />
            )}
          </FilterPill>

          {/* Count + layout toggle (Table default / Cards) */}
          {!showSkeleton && !showError && (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="shrink text-sm text-gray-500 dark:text-gray-400">
                Showing {visible.length} of {filtered.length} customers
              </Text>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          )}

          {/* List skeleton — table/card aware, in the same spot as the real list. */}
          {showSkeleton && !showError && (
            <PurchasesListSkeleton view={viewMode} />
          )}

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

          {/* List — table (default) and card layouts render from the same
              `visible` slice, so switching is instant and never refetches. */}
          {!showSkeleton && !showError && viewMode === "table" && (
            <View className="gap-3">
              {/* Bulk-action bar — shown while a selection exists. */}
              {selectedIds.size > 0 && (
                <View className="rounded-2xl border border-[#0644C7]/30 bg-blue-50 dark:bg-blue-900/20 p-3 flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                    {selectedIds.size} selected
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={confirmBulkDelete}
                      disabled={bulkBusy}
                      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 active:opacity-70 ${
                        bulkBusy ? "opacity-50" : ""
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel="Delete selected customers"
                    >
                      {bulkBusy ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <Feather name="trash-2" size={15} color="#DC2626" />
                      )}
                      <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                        Delete
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={clearSelection}
                      disabled={bulkBusy}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Clear selection"
                      className="flex-row items-center gap-1 active:opacity-70"
                    >
                      <Feather name="x" size={14} color="#6B7280" />
                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {visible.length > 0 && (
                <CustomersTable
                  contacts={visible}
                  busyId={busyRowId}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllVisible}
                  onView={(c) => setSheetContact(c)}
                  onEdit={(c) =>
                    router.push(`/customers/edit-customer?id=${c.id}`)
                  }
                  onDelete={handleDelete}
                  onAddTag={(c) => setAddTagContact(c)}
                  onToggleStatus={handleToggleStatus}
                  visibleColumns={visibleColumns}
                />
              )}

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

          {/* Cards */}
          {!showSkeleton && !showError && viewMode === "cards" && (
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
        availableTags={tagChoices}
        onClose={() => setSheetContact(undefined)}
        onChanged={afterMutation}
      />

      {/* Add Tag — opened from the Tags cell's square "+" button. */}
      <AddTagSheet
        contact={addTagContact}
        allTags={tagChoices}
        onClose={() => setAddTagContact(null)}
        onAdded={load}
      />

      {/* Toggle Columns — mirrors the web table toolbar's Columns dropdown. */}
      <ColumnsSheet
        visible={showColumnsSheet}
        columns={CUSTOMER_COLUMNS}
        visibleKeys={visibleColumns}
        onToggle={(key) =>
          setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onShowAll={() => setVisibleColumns(allCustomerColumnKeys())}
        onReset={() => setVisibleColumns(defaultCustomerColumnKeys())}
        onClose={() => setShowColumnsSheet(false)}
      />

      {/* All filters in one sheet, same as the other list screens. */}
      <CustomerFiltersSheet
        visible={showFilterSheet}
        values={filters}
        tags={tagChoices}
        sources={sourceOptions}
        companies={companyOptions}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_CUSTOMER_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenCreatedDate={openCreatedDate}
      />

      {/* Shared calendar for Created Date, opened once the filter sheet is
          closed so two sheets are never stacked. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={filters.createdStart || undefined}
        initialEnd={filters.createdEnd || undefined}
        onClose={closeCreatedDate}
        onApply={applyCreatedDate}
      />

      <CampaignExportSheet
        visible={showCampaignSheet}
        values={campaignFilters}
        availableTags={tagChoices}
        exporting={campaignExporting}
        onChange={setCampaignFilters}
        onClose={() => {
          setShowCampaignSheet(false);
          setCampaignFilters(EMPTY_CAMPAIGN_EXPORT_FILTERS);
        }}
        onExport={runCampaignExport}
      />
    </View>
  );
};

export default Customers;
