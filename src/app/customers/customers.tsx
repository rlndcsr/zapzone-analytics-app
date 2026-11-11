import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import { AddTagSheet } from "../../components/ui/AddTagSheet";
import {
  CampaignExportSheet,
  EMPTY_CAMPAIGN_EXPORT_FILTERS,
  type CampaignExportFilters,
} from "../../components/ui/CampaignExportSheet";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import { ContactActionsSheet } from "../../components/ui/ContactActionsSheet";
import {
  CustomerFiltersSheet,
  EMPTY_CUSTOMER_FILTERS,
  countActiveCustomerFilters,
  type CustomerFilterValues,
} from "../../components/ui/CustomerFiltersSheet";
import {
  CUSTOMER_COLUMNS,
  CustomersTable,
  allCustomerColumnKeys,
  defaultCustomerColumnKeys,
} from "../../components/ui/CustomersTable";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { FilterOptionSheet } from "../../components/ui/FilterOptionSheet";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  AppliedFiltersHint,
  FilterChip,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  ToolbarIconButton,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
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

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const DEFAULT_SORT = "created_at:desc";

const SORT_OPTIONS = [
  { label: "Newest", value: "created_at:desc" },
  { label: "Oldest", value: "created_at:asc" },
  { label: "Name A–Z", value: "first_name:asc" },
  { label: "Email A–Z", value: "email:asc" },
  { label: "Status", value: "status:asc" },
];

/** One customer in the Cards layout — the Manage Attractions card shape. */
function CustomerCard({
  contact: c,
  onPress,
}: {
  contact: ContactRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${c.name}`}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:opacity-80"
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          className="text-base font-semibold text-gray-900 dark:text-white flex-1"
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
        <View className="flex-row flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
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
  );
}

const Customers = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const companyId = user?.company_id ?? null;

  // The full auth-scoped contact set (loaded once, like the web); every filter,
  // sort and the page count operate over this in memory.
  const [allRows, setAllRows] = useState<ContactRow[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  // `loading` clears as soon as the first page paints; `complete` marks the end
  // of the whole walk. Anything that must not decide against a partial list
  // (the openId deep link below) waits on `complete`, not `loading`.
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters (all client-side, mirroring the web admin).
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CustomerFilterValues>(
    EMPTY_CUSTOMER_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? SORT_OPTIONS[0].label;

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
  // a notification (e.g. /customers/customers?openId=123). Resolve as soon as
  // the contact turns up in a page that has landed, but only declare it missing
  // once the whole walk is done — the list paints progressively, so a contact
  // on a later page is "not here yet", not gone.
  const { openId, add } = useLocalSearchParams<{
    openId?: string;
    add?: string;
  }>();
  useEffect(() => {
    if (!openId) return;
    const match = allRows.find((c) => String(c.id) === openId);
    if (!match && !complete) return;
    if (match) {
      setSheetContact(match);
    } else {
      Alert.alert("Customer unavailable", "This customer is no longer available.");
    }
    router.setParams({ openId: undefined });
  }, [openId, complete, allRows, router]);

  // From the Customers hub's "Add Customer" shortcut (?add=1): open the add
  // form once, as the "Add Customer" button does.
  useEffect(() => {
    if (add !== "1") return;
    setSheetContact(null);
    router.setParams({ add: undefined });
  }, [add, router]);

  const reqRef = useRef(0);
  // Whether a full walk has ever finished. A ref, not state: `load` is rebuilt
  // from its deps and re-run by the effect below, so anything it both reads and
  // sets would refetch in a loop if it were a dependency.
  const loadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    const rid = ++reqRef.current;
    // Only the first load paints page by page. A refetch (pull-to-refresh, or
    // returning from the edit screen) already has the whole list on screen, and
    // publishing partial pages over it would collapse the list to 200 rows and
    // grow it back under the user.
    const progressive = !loadedOnceRef.current;
    // Skeletons only for the first load. A refetch (a status toggle, a delete,
    // a return from editing) keeps the rows on screen while the walk runs,
    // rather than hiding the whole CRM behind skeletons until its last page.
    if (progressive) setLoading(true);
    setComplete(false);
    setError(null);
    try {
      const [rows, s, tags] = await Promise.all([
        fetchAllContacts({
          token,
          companyId: companyId ?? undefined,
          // Paint each page as it lands. A large CRM is many pages even when
          // fetched concurrently, and the rows are already in server order, so
          // the list can fill in rather than hold a spinner until the last one.
          onPage: progressive
            ? (soFar) => {
                if (rid !== reqRef.current) return;
                setAllRows(soFar);
                setLoading(false);
              }
            : undefined,
        }),
        fetchContactStats({ token, companyId: companyId ?? undefined }).catch(
          () => null,
        ),
        fetchContactTags({ token, companyId: companyId ?? undefined }).catch(
          () => [],
        ),
      ]);
      if (rid !== reqRef.current) return;
      setAllRows(rows);
      setComplete(true);
      loadedOnceRef.current = true;
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

  // Filtering a large CRM on every keystroke made typing lag; the deferred copy
  // lets the input update first and the list catch up right after.
  const deferredSearch = useDeferredValue(search);

  // The full client-side filter + sort pipeline (mirrors the web's useAdminTable).
  const filtered = useMemo(() => {
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
  }, [allRows, deferredSearch, filters, sort]);

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
  // More — the two exports (formerly the header "more" menu) plus the sibling
  // Customers screens, as module-hub shortcuts like Manage Attractions.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: exportingCsv ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (!exportingCsv) exportCsv();
      },
    },
    {
      label: "Campaign Export",
      icon: "send",
      onPress: () => setShowCampaignSheet(true),
    },
    { label: "Customer Analytics", icon: "pie-chart", route: "/customers/analytics" },
    {
      label: "Customer Concerns",
      icon: "message-circle",
      route: "/customers/customer-concerns",
    },
    {
      label: "Visitor Tracking",
      icon: "activity",
      route: "/customers/visitor-tracking",
    },
  ];

  // Status chips — a visible surface over the Filters sheet's Status field,
  // not a second filter: both write the same `filters.status`.
  const statusChips = useMemo(() => {
    const active = allRows.filter((c) => c.status === "active").length;
    return [
      { label: "All", value: "all", count: allRows.length },
      { label: "Active", value: "active", count: active },
      { label: "Inactive", value: "inactive", count: allRows.length - active },
    ];
  }, [allRows]);

  // Show the page skeleton on the first load (refetches keep rows on screen).
  const showSkeleton = loading && !error;
  const showError = !loading && !!error && allRows.length === 0;
  const hasFilters = search.length > 0 || activeFilterCount > 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary Add action. */}
      <ModuleHeader
        title="Customers"
        action={{
          onPress: () => setSheetContact(null),
          label: "Add",
          accessibilityLabel: "Add customer",
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
            Every customer in your CRM, with their tags, status and contact details
          </Text>

          {/* Error state (nothing loaded to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load customers"
              message={error ?? ""}
              onRetry={load}
            />
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {showSkeleton ? (
            <AttractionsSummarySkeleton />
          ) : stats || allRows.length > 0 ? (
            <SummaryPanel
              figures={[
                {
                  icon: "users",
                  title: "Total Customers",
                  value: String(allRows.length),
                  hint: "All registered customers",
                },
                {
                  icon: "user-check",
                  title: "Active",
                  value: String(stats?.active ?? 0),
                  hint: "Currently active",
                },
                {
                  icon: "user-x",
                  title: "Inactive",
                  value: String(stats?.inactive ?? 0),
                  hint: "Currently inactive",
                },
                {
                  icon: "calendar",
                  title: "Recently Added",
                  value: String(stats?.recentlyAdded ?? 0),
                  hint: "New customers",
                },
              ]}
            />
          ) : null}

          {/* More — exports and the sibling Customers screens. */}
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
              placeholder="Search customers"
            />
            <FiltersButton
              count={activeFilterCount}
              onPress={() => setShowFilterSheet(true)}
            />
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          <AppliedFiltersHint
            count={activeFilterCount}
            onClear={() => setFilters(EMPTY_CUSTOMER_FILTERS)}
          />

          {/* Status chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {statusChips.map((chip) => (
              <FilterChip
                key={chip.value}
                label={chip.label}
                count={showSkeleton ? undefined : chip.count}
                selected={filters.status === chip.value}
                onPress={() =>
                  setFilters((prev) => ({ ...prev, status: chip.value }))
                }
              />
            ))}
          </ScrollView>

          {/* List header — title + count, Sort, Columns (table only), layout. */}
          {!showSkeleton && !showError && (
            <ListHeader title="All Customers" count={filtered.length}>
              <View className="flex-row items-center gap-2">
                <ToolbarIconButton
                  icon="bar-chart-2"
                  label={`Sort, ${sortLabel}`}
                  active={showSortSheet || sort !== DEFAULT_SORT}
                  onPress={() => setShowSortSheet(true)}
                />
                {viewMode === "table" && (
                  <ToolbarIconButton
                    icon="columns"
                    label="Toggle columns"
                    active={showColumnsSheet}
                    onPress={() => setShowColumnsSheet(true)}
                  />
                )}
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </ListHeader>
          )}

          {/* Bulk-action bar — table view only, shown while a selection exists. */}
          {!showSkeleton &&
            !showError &&
            viewMode === "table" &&
            selectedIds.size > 0 && (
              <View className="rounded-2xl border border-[#0644C7]/30 bg-blue-50 dark:bg-blue-900/20 p-3 mb-3 flex-row items-center justify-between">
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

          {/* List / states. Each state is keyed so switching remounts cleanly. */}
          {showSkeleton ? (
            <View key="s-loading">
              {viewMode === "table" ? (
                <AttractionsTableSkeleton />
              ) : (
                <AttractionsListSkeleton />
              )}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            <View key="s-empty">
              {hasFilters ? (
                <ListEmptyState
                  icon="search"
                  title="No customers found"
                  message="No customers match your search or filters."
                  actionLabel="Clear search & filters"
                  onAction={() => {
                    setSearch("");
                    setFilters(EMPTY_CUSTOMER_FILTERS);
                  }}
                />
              ) : (
                <ListEmptyState
                  icon="users"
                  title="No customers yet"
                  message="Add your first customer to start building your CRM."
                  actionLabel="Add Customer"
                  actionIcon="plus"
                  primary
                  onAction={() => setSheetContact(null)}
                />
              )}
            </View>
          ) : (
            <View key="s-list">
              {/* Table (default) and card layouts render from the same
                  `visible` slice, so switching is instant and never refetches. */}
              {viewMode === "table" ? (
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
              ) : (
                visible.map((c) => (
                  <CustomerCard
                    key={c.id}
                    contact={c}
                    onPress={() => setSheetContact(c)}
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

      {/* Sort — the web table's sort select. */}
      <FilterOptionSheet
        visible={showSortSheet}
        title="Sort by"
        value={sort}
        options={SORT_OPTIONS}
        onSelect={(v) => setSort(String(v))}
        onClose={() => setShowSortSheet(false)}
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
