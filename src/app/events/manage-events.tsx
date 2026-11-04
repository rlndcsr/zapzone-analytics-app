import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import {
  EMPTY_EVENT_FILTERS,
  EventFiltersSheet,
  countActiveEventFilters,
  type EventDateTarget,
  type EventFilterValues,
} from "../../components/ui/EventFiltersSheet";
import { EventsTable } from "../../components/ui/EventsTable";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  EventsListSkeleton,
  EventsTableSkeleton,
} from "../../components/ui/skeleton/EventsSkeleton";
import {
  AttractionStatusBadge,
  type FeatherIconName,
} from "../../lib/attractions/attractionDisplay";
import { formatDateTimeET } from "../../lib/date/venueTime";
import {
  consumeEventsStale,
  markEventsStale,
  useEvents,
} from "../../lib/hooks/useEvents";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteEvent,
  toggleEventStatus,
  type EventRow,
} from "../../services/eventsService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 15];

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/** Local "today" as YYYY-MM-DD (matches the web Events `localToday`). */
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Schedule bucket for an event, mirroring the web `scheduleState`. */
const scheduleState = (event: EventRow): "upcoming" | "ongoing" | "past" => {
  const today = localToday();
  const start = (event.startDate || "").substring(0, 10);
  const end = (event.endDate || event.startDate || "").substring(0, 10);
  if (start > today) return "upcoming";
  if (end < today) return "past";
  return "ongoing";
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    let hour = Number(hStr);
    const meridian = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${mStr ?? "00"} ${meridian}`;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return "";
  return `${s} – ${e}`;
}

function dateLabel(event: EventRow): string {
  if (event.dateType === "date_range") {
    return `${formatDate(event.startDate)} – ${event.endDate ? formatDate(event.endDate) : "…"}`;
  }
  return formatDate(event.startDate);
}

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile — the same panel as Manage Attractions.
 */
const SummaryCell = ({
  icon,
  title,
  value,
  hint,
  divideLeft = false,
  divideTop = false,
}: {
  icon: FeatherIconName;
  title: string;
  value: string;
  hint: string;
  divideLeft?: boolean;
  divideTop?: boolean;
}) => (
  <View
    className={`flex-1 p-4 ${
      divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
    } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
      </Text>
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
    >
      {value}
    </Text>
    <Text
      numberOfLines={1}
      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
    >
      {hint}
    </Text>
  </View>
);

/** One labelled cell in the card's Date / Time / Price strip. */
const Spec = ({
  label,
  value,
  hint,
  divider = false,
}: {
  label: string;
  value: string;
  hint?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"
    >
      {value}
    </Text>
    {!!hint && (
      <Text
        numberOfLines={1}
        className="text-[11px] text-gray-400 dark:text-gray-500"
      >
        {hint}
      </Text>
    )}
  </View>
);

/** One button of the card's segmented action group (matches EventsTable). */
const CardAction = ({
  icon,
  color,
  label,
  divider = false,
  onPress,
}: {
  icon: FeatherIconName;
  color: string;
  label: string;
  divider?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      divider ? "border-l border-gray-200 dark:border-neutral-700" : ""
    }`}
  >
    <Feather name={icon} size={15} color={color} />
  </Pressable>
);

/**
 * Card layout for a single event, matching the Manage Attractions card: name +
 * status, a meta line, description, a Date / Time / Price strip and a quiet
 * footer. Events have no details sheet, so the card itself stays inert and
 * Edit / Registration form live in the footer's action group.
 */
const EventCard = ({
  event,
  onEdit,
  onRegistrationForm,
}: {
  event: EventRow;
  onEdit: () => void;
  onRegistrationForm?: () => void;
}) => {
  const timeRange = formatTimeRange(event.timeStart, event.timeEnd);
  // a count of separate parties, not people — say so beside the people icon
  const capacityLabel =
    event.maxBookingsPerSlot == null
      ? "Unlimited groups/slot"
      : `${event.maxBookingsPerSlot} group${event.maxBookingsPerSlot === 1 ? "" : "s"}/slot`;

  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3">
      {/* Name + status */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {event.name}
        </Text>
        <AttractionStatusBadge status={event.status} />
      </View>

      {/* Date type · location */}
      <View className="flex-row items-center gap-1.5 mt-1">
        <Text
          numberOfLines={1}
          className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          {event.dateType === "date_range" ? "Date Range" : "One Time"}
        </Text>
        {!!event.locationName && (
          <>
            <Text className="text-xs text-gray-300 dark:text-neutral-600">
              •
            </Text>
            <Text
              numberOfLines={1}
              className="shrink text-xs text-gray-500 dark:text-gray-400"
            >
              {event.locationName}
            </Text>
          </>
        )}
      </View>

      {!!event.description && (
        <Text
          className="text-[13px] text-gray-500 dark:text-gray-400 leading-5 mt-2"
          numberOfLines={2}
        >
          {event.description}
        </Text>
      )}

      {/* Date / Time / Price */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec label="Date" value={dateLabel(event) || "—"} />
        <Spec
          divider
          label="Time"
          value={timeRange || "—"}
          hint={`Every ${event.intervalMinutes} min`}
        />
        <Spec
          divider
          label="Price"
          value={formatMoney(event.price)}
          hint="/ticket"
        />
      </View>

      {/* Capacity + actions */}
      <View className="flex-row items-center justify-between gap-3 mt-3">
        <View className="shrink flex-row items-center gap-1.5">
          <Feather name="users" size={12} color="#9CA3AF" />
          <Text
            numberOfLines={1}
            className="shrink text-xs text-gray-400 dark:text-gray-500"
          >
            {capacityLabel}
          </Text>
        </View>
        <View className="flex-row items-center rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
          <CardAction
            icon="edit-2"
            color={PRIMARY}
            label={`Edit ${event.name}`}
            onPress={onEdit}
          />
          {onRegistrationForm && (
            <CardAction
              divider
              icon="clipboard"
              color="#6B7280"
              label={`Registration form for ${event.name}`}
              onPress={onRegistrationForm}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const ManageEvents = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  // Scope to the global workspace location (company_admin); managers stay
  // backend-scoped. Reactive so switching location refetches server-side.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const role = getCurrentUser()?.role;
  const canManageRegistrationForms =
    role === "company_admin" || role === "location_manager";

  const { events, loading, error, refetch, applyStatus, remove } = useEvents({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  // Presentation layout only — table by default (like the other catalog
  // screens), cards on toggle. Both read the same `paged` slice, so switching
  // never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Row with a status-toggle or delete request in flight.
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filters, setFilters] =
    useState<EventFilterValues>(EMPTY_EVENT_FILTERS);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [dateTarget, setDateTarget] = useState<EventDateTarget>("start");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [exporting, setExporting] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // After creating an event, refetch on return so the new item + KPIs show
  // without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumeEventsStale()) refetch();
    }, [refetch]),
  );

  // The global workspace location already scopes the fetch server-side, so the
  // loaded list is the location-scoped set for the KPIs and the list.
  const locationScoped = events;

  // KPI values, computed over the location-scoped set.
  const kpis = useMemo(() => {
    const total = locationScoped.length;
    const active = locationScoped.filter((e) => e.status === "active").length;
    const inactive = total - active;
    const avgPrice =
      total > 0 ? locationScoped.reduce((s, e) => s + e.price, 0) / total : 0;
    const dateRange = locationScoped.filter(
      (e) => e.dateType === "date_range",
    ).length;
    const oneTime = locationScoped.filter(
      (e) => e.dateType === "one_time",
    ).length;
    return { total, active, inactive, avgPrice, dateRange, oneTime };
  }, [locationScoped]);

  // Search + the full web-admin filter set over the location-scoped data.
  // Predicate semantics mirror the web `useAdminTable` exactly (select equality,
  // inclusive numeric/date ranges with empty = unbounded, schedule buckets,
  // add-ons presence, time-of-day by start hour). All client-side, like the web.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const priceMin =
      filters.priceMin === "" ? null : parseFloat(filters.priceMin);
    const priceMax =
      filters.priceMax === "" ? null : parseFloat(filters.priceMax);
    const { startFrom, startTo, createdFrom, createdTo } = filters;

    return locationScoped.filter((e) => {
      if (filters.status !== "all" && e.status !== filters.status) return false;
      if (filters.dateType !== "all" && e.dateType !== filters.dateType)
        return false;
      if (filters.schedule !== "all" && scheduleState(e) !== filters.schedule)
        return false;

      if (startFrom || startTo) {
        const d = e.startDate ? e.startDate.substring(0, 10) : null;
        if (!d) return false;
        if (startFrom && d < startFrom) return false;
        if (startTo && d > startTo) return false;
      }
      if (createdFrom || createdTo) {
        const d = e.createdAt ? e.createdAt.substring(0, 10) : null;
        if (!d) return false;
        if (createdFrom && d < createdFrom) return false;
        if (createdTo && d > createdTo) return false;
      }

      if (priceMin != null && !Number.isNaN(priceMin) && e.price < priceMin)
        return false;
      if (priceMax != null && !Number.isNaN(priceMax) && e.price > priceMax)
        return false;

      if (filters.addOns !== "all") {
        const hasAddOns = (e.addOns?.length ?? 0) > 0;
        if (filters.addOns === "with" && !hasAddOns) return false;
        if (filters.addOns === "without" && hasAddOns) return false;
      }

      if (filters.timeOfDay !== "all") {
        const hour = parseInt((e.timeStart || "0").split(":")[0], 10) || 0;
        if (filters.timeOfDay === "morning" && hour >= 12) return false;
        if (filters.timeOfDay === "afternoon" && !(hour >= 12 && hour < 17))
          return false;
        if (filters.timeOfDay === "evening" && hour < 17) return false;
      }

      if (term) {
        const haystack =
          `${e.name} ${e.description} ${e.locationName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [locationScoped, search, filters]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters, activeLocationId, perPage]);

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no events to export.");
      return;
    }
    setExporting(true);
    try {
      // Loaded lazily so these native modules never run at app startup (Expo
      // Router evaluates route modules eagerly on boot).
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "ID",
        "Name",
        "Category",
        "Location",
        "Price",
        "Status",
        "Date Type",
        "Start Date",
        "End Date",
        "Created",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((e) =>
        [
          e.id,
          e.name,
          e.dateType,
          e.locationName,
          e.price,
          e.status,
          e.dateType,
          e.startDate,
          e.endDate ?? "",
          e.createdAt
            ? formatDateTimeET(e.createdAt, { month: "short", showZone: false })
            : "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}events-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Events",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  const activeFilterCount = countActiveEventFilters(filters);

  // Date ranges reuse the shared range calendar. The filter sheet is a native
  // Modal, so we fully close it before opening the calendar (and reopen it
  // after) — two stacked native Modals crash Android's new architecture.
  const openDateRange = useCallback((target: EventDateTarget) => {
    setDateTarget(target);
    setShowFilterSheet(false);
    setTimeout(() => setShowDateSheet(true), 280);
  }, []);
  const closeDateRange = useCallback(() => {
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyDateRange = useCallback(
    (start: string, end: string) => {
      setFilters((f) =>
        dateTarget === "start"
          ? { ...f, startFrom: start, startTo: end }
          : { ...f, createdFrom: start, createdTo: end },
      );
      setShowDateSheet(false);
      setTimeout(() => setShowFilterSheet(true), 280);
    },
    [dateTarget],
  );

  const hasResults = filtered.length > 0;

  // Status pill — PATCH /events/{id}/toggle-status, optimistic + reconcile with
  // whatever flag the backend reports back (it echoes the updated event).
  const handleToggleStatus = useCallback(
    async (event: EventRow) => {
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again to update events.");
        return;
      }
      const next = event.status !== "active";
      applyStatus(event.id, next);
      setBusyId(event.id);
      try {
        const confirmed = await toggleEventStatus(token, event.id);
        if (confirmed != null) applyStatus(event.id, confirmed);
        markEventsStale();
      } catch (err) {
        applyStatus(event.id, !next); // revert on failure
        Alert.alert(
          "Update failed",
          err instanceof Error ? err.message : "Could not update status.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [applyStatus],
  );

  // Delete action — same confirm-then-DELETE flow the web table's trash uses.
  // The web table's pencil → Edit Event. The list refreshes on return, since a
  // save marks events stale.
  const handleEdit = useCallback((event: EventRow) => {
    router.push(`/events/edit-event?id=${event.id}`);
  }, []);

  // Web d5a759e: a linked form opens; otherwise a new event starts from it, offering any existing one to join.
  const handleRegistrationForm = useCallback((event: EventRow) => {
    router.push({
      pathname: "/events/registration-forms",
      params: { fromEvent: String(event.id) },
    } as never);
  }, []);

  const handleDelete = useCallback(
    (event: EventRow) => {
      Alert.alert(
        "Delete event",
        `Delete "${event.name}"? This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) {
                Alert.alert(
                  "Not signed in",
                  "Please sign in again to delete events.",
                );
                return;
              }
              setBusyId(event.id);
              try {
                await deleteEvent(token, event.id);
                remove(event.id);
                markEventsStale();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete the event.",
                );
              } finally {
                setBusyId(null);
              }
            },
          },
        ],
      );
    },
    [remove],
  );

  // Handed to the table so its cells format exactly like the cards.
  const formatters = useMemo(
    () => ({ dateLabel, timeRange: formatTimeRange, money: formatMoney }),
    [],
  );

  // The page's secondary actions as module-hub shortcuts, like the Manage
  // Attractions "More" row. Registration Forms keeps the Events hub's role gate.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Event Purchases", icon: "shopping-bag", route: "/events/purchases" },
    {
      label: "Onsite Purchase",
      icon: "plus-circle",
      route: "/events/create-purchase",
    },
    ...(canManageRegistrationForms
      ? [
          {
            label: "Registration Forms",
            icon: "clipboard",
            route: "/events/registration-forms",
          } as HubQuickLink,
        ]
      : []),
    {
      label: "Export CSV",
      icon: "file-text",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text
            numberOfLines={1}
            className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
          >
            Manage Events
          </Text>
          <Pressable
            onPress={() => router.push("/events/create-event")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New event"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>

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
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state */}
          {!loading && error && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load events
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {error}
                </Text>
                <Pressable
                  onPress={onRefresh}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {loading ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="star"
                  title="Total Events"
                  value={String(kpis.total)}
                  hint={`${kpis.active} active`}
                />
                <SummaryCell
                  divideLeft
                  icon="zap"
                  title="Active Events"
                  value={String(kpis.active)}
                  hint={`${kpis.inactive} inactive`}
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="dollar-sign"
                  title="Avg. Price"
                  value={formatMoney(kpis.avgPrice)}
                  hint="Per ticket"
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="calendar"
                  title="Date Range Events"
                  value={String(kpis.dateRange)}
                  hint={`${kpis.oneTime} one-time`}
                />
              </View>
            </View>
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search events"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setShowFilterSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterCount} applied`
                  : "Filters"
              }
              className={`flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border active:opacity-70 ${
                activeFilterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-[#0644C7]/40"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
              }`}
            >
              <Feather
                name="sliders"
                size={15}
                color={activeFilterCount > 0 ? PRIMARY : "#6B7280"}
              />
              <Text
                className={`text-sm font-medium ${
                  activeFilterCount > 0
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          {activeFilterCount > 0 && (
            <View className="flex-row items-center justify-between mb-3 -mt-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {activeFilterCount}{" "}
                {activeFilterCount === 1 ? "filter" : "filters"} applied
              </Text>
              <Pressable
                onPress={() => setFilters(EMPTY_EVENT_FILTERS)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* List header — title + count, layout toggle. */}
          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  All Events
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          )}

          {/* List / states */}
          {loading ? (
            viewMode === "table" ? (
              <EventsTableSkeleton />
            ) : (
              <EventsListSkeleton />
            )
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={events.length === 0 ? "calendar" : "search"}
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {events.length === 0 ? "No events yet" : "No events found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {events.length === 0
                  ? "There are no events for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
              {events.length === 0 ? (
                <Pressable
                  onPress={() => router.push("/events/create-event")}
                  className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    New Event
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setFilters(EMPTY_EVENT_FILTERS);
                  }}
                  className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Clear search & filters
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            !error && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <EventsTable
                    events={paged}
                    formatters={formatters}
                    busyId={busyId}
                    onToggleStatus={handleToggleStatus}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRegistrationForm={
                      canManageRegistrationForms
                        ? handleRegistrationForm
                        : undefined
                    }
                  />
                ) : (
                  paged.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEdit={() => handleEdit(event)}
                      onRegistrationForm={
                        canManageRegistrationForms
                          ? () => handleRegistrationForm(event)
                          : undefined
                      }
                    />
                  ))
                )}

                {/* Pagination — shared control (same as Attractions/Purchases). */}
                <PaginationControls
                  page={page}
                  lastPage={lastPage}
                  perPage={perPage}
                  perPageOptions={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Full filter panel — every web-admin filter in one sheet. */}
      <EventFiltersSheet
        visible={showFilterSheet}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_EVENT_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared range calendar for Event Start / Created date, opened after the
          filter sheet closes so two native Modals are never mounted at once. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={
          (dateTarget === "start" ? filters.startFrom : filters.createdFrom) ||
          undefined
        }
        initialEnd={
          (dateTarget === "start" ? filters.startTo : filters.createdTo) ||
          undefined
        }
        onClose={closeDateRange}
        onApply={applyDateRange}
      />
    </View>
  );
};

export default ManageEvents;
