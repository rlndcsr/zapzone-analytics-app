import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
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
import { Pagination } from "../../components/ui/Pagination";
import { useDayOffs } from "../../lib/hooks/useDayOffs";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchRooms } from "../../services/bookingsService";
import { fetchPackages } from "../../services/packagesService";
import {
  bulkDeleteDayOffs,
  createDayOff,
  deleteDayOff,
  updateDayOff,
  type DayOff,
  type DayOffFilters,
  type DayOffPayload,
} from "../../services/dayOffsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [10, 25, 50];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ----------------------------------------------------------- filter options -- */

type DateRange = "upcoming" | "all";
type TypeFilter = "all" | "recurring" | "one-time";
type SortBy = "date" | "created_at";
type SortOrder = "asc" | "desc";

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Upcoming Only", value: "upcoming" },
  { label: "All Dates", value: "all" },
];
const TYPE_OPTIONS: { label: string; value: TypeFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Recurring Only", value: "recurring" },
  { label: "One-time Only", value: "one-time" },
];
const SORT_BY_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Date", value: "date" },
  { label: "Created", value: "created_at" },
];
const SORT_ORDER_OPTIONS: { label: string; value: SortOrder }[] = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" },
];

/** "What should be blocked?" scope (mirrors the web BlockingScope). */
type BlockingScope = "location" | "packages" | "rooms" | "both";
type ResourceOption = { id: number; name: string };

const SCOPE_OPTIONS: {
  value: BlockingScope;
  title: string;
  sub: string;
  icon: ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "location", title: "Entire Location", sub: "All packages & spaces", icon: "home" },
  { value: "packages", title: "Packages Only", sub: "Select packages", icon: "package" },
  { value: "rooms", title: "Spaces Only", sub: "Select spaces", icon: "grid" },
  { value: "both", title: "Both", sub: "Packages & spaces", icon: "layers" },
];

/* ------------------------------------------------------------------ dates -- */

/** Local date as YYYY-MM-DD. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/** Grid cells for a month: leading nulls + YYYY-MM-DD day keys. */
function monthGridCells(viewMonth: Date): (string | null)[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(ymd(new Date(year, month, d)));
  return cells;
}

function isPastYmd(dateStr: string): boolean {
  return dateStr < ymd(new Date());
}

const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;

/* ------------------------------------------------------------- components -- */

/** Single-select filter sheet reused by every day-off filter. */
function FilterOptionSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { label: string; value: T }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
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
  );
}

/** A bordered filter pill that opens a filter sheet. */
function FilterChip({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
    >
      <Feather name={icon} size={16} color={PRIMARY} />
      <Text
        className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Feather name="chevron-down" size={14} color="#9CA3AF" />
    </Pressable>
  );
}

const DayOffCard = ({
  dayOff,
  showLocation,
  canManage,
  selectionMode,
  selected,
  onEdit,
  onDelete,
  onToggleSelect,
}: {
  dayOff: DayOff;
  showLocation: boolean;
  canManage: boolean;
  selectionMode: boolean;
  selected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}) => (
  <Pressable
    onPress={selectionMode ? onToggleSelect : undefined}
    className={`bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm ${
      selectionMode && selected
        ? "border-2 border-[#0644C7]"
        : "border-2 border-transparent"
    }`}
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between">
      <View className="flex-row items-center gap-2.5 flex-1">
        <View
          className={`w-9 h-9 rounded-xl items-center justify-center ${
            selectionMode
              ? selected
                ? "bg-[#0644C7]"
                : "bg-gray-100 dark:bg-neutral-800"
              : "bg-blue-50 dark:bg-blue-900/20"
          }`}
        >
          <Feather
            name={
              selectionMode
                ? selected
                  ? "check"
                  : "square"
                : "calendar"
            }
            size={18}
            color={selectionMode && selected ? "#FFFFFF" : PRIMARY}
          />
        </View>
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          {prettyDate(dayOff.date)}
        </Text>
      </View>
      {canManage && !selectionMode && (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
            accessibilityLabel="Edit day off"
          >
            <Feather name="edit-2" size={16} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            className="p-2 rounded-full active:bg-red-50 dark:active:bg-red-900/20"
            accessibilityLabel="Delete day off"
          >
            <Feather name="trash-2" size={16} color="#EF4444" />
          </Pressable>
        </View>
      )}
    </View>

    <View className="flex-row items-center flex-wrap gap-1.5 mt-3">
      <View
        className={`px-2 py-1 rounded-full ${
          dayOff.isLocationWide
            ? "bg-rose-100 dark:bg-rose-900/30"
            : "bg-indigo-100 dark:bg-indigo-900/30"
        }`}
      >
        <View className="flex-row items-center gap-1">
          <Feather
            name={dayOff.isLocationWide ? "lock" : "layers"}
            size={10}
            color={dayOff.isLocationWide ? "#E11D48" : "#6366F1"}
          />
          <Text
            className={`text-[10px] font-semibold ${
              dayOff.isLocationWide
                ? "text-rose-700 dark:text-rose-400"
                : "text-indigo-700 dark:text-indigo-400"
            }`}
          >
            {dayOff.scopeLabel}
          </Text>
        </View>
      </View>
      <View className="px-2 py-1 rounded-full bg-gray-100 dark:bg-neutral-800">
        <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
          {dayOff.durationLabel}
        </Text>
      </View>
      {dayOff.isRecurring && (
        <View className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            Recurring
          </Text>
        </View>
      )}
    </View>

    {(!!dayOff.reason || (showLocation && !!dayOff.locationName)) && (
      <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        {!!dayOff.reason && (
          <Text className="text-sm text-gray-700 dark:text-gray-200">
            {dayOff.reason}
          </Text>
        )}
        {showLocation && !!dayOff.locationName && (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Feather name="map-pin" size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {dayOff.locationName}
            </Text>
          </View>
        )}
      </View>
    )}
  </Pressable>
);

/* --------------------------------------------------------------- form types -- */

type FormState = {
  id: number | null;
  date: string;
  reason: string;
  locationId: number | null;
  isRecurring: boolean;
  /** Partial-day (empty = full day). timeStart = close starting at,
   *  timeEnd = delayed opening until — matches the web's field inversion. */
  timeStart: string;
  timeEnd: string;
  scope: BlockingScope;
  packageIds: number[];
  roomIds: number[];
};

const emptyForm = (locationId: number | null): FormState => ({
  id: null,
  date: ymd(new Date()),
  reason: "",
  locationId,
  isRecurring: false,
  timeStart: "",
  timeEnd: "",
  scope: "location",
  packageIds: [],
  roomIds: [],
});

/* ------------------------------------------------------------------ screen -- */

const DayOffs = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  const canManage = isCompanyAdmin || role === "location_manager";
  const ownLocationId = currentUser?.location_id ?? null;

  // Filters
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("upcoming");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [sheet, setSheet] = useState<
    | null
    | "location"
    | "form"
    | "formLocation"
    | "daterange"
    | "type"
    | "sortby"
    | "sortorder"
    | "bulk"
    | "bulkLocation"
  >(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(ownLocationId));
  const [saving, setSaving] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Bulk add
  const [bulkDates, setBulkDates] = useState<Set<string>>(new Set());
  const [bulkMonth, setBulkMonth] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [bulkReason, setBulkReason] = useState("");
  const [bulkIsRecurring, setBulkIsRecurring] = useState(false);
  // Partial-day closure (empty = full day). timeEnd = delayed opening until,
  // timeStart = close starting at (matches the web field/name inversion).
  const [bulkTimeStart, setBulkTimeStart] = useState("");
  const [bulkTimeEnd, setBulkTimeEnd] = useState("");
  const [bulkLocationId, setBulkLocationId] = useState<number | null>(
    ownLocationId,
  );
  const [bulkCreating, setBulkCreating] = useState(false);
  // "What should be blocked?" scope + selectable resources for the location.
  const [bulkScope, setBulkScope] = useState<BlockingScope>("location");
  const [bulkPackageIds, setBulkPackageIds] = useState<Set<number>>(new Set());
  const [bulkRoomIds, setBulkRoomIds] = useState<Set<number>>(new Set());
  const [availablePackages, setAvailablePackages] = useState<ResourceOption[]>([]);
  const [availableRooms, setAvailableRooms] = useState<ResourceOption[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    locationFilter,
    dateRange,
    typeFilter,
    sortBy,
    sortOrder,
    debouncedSearch,
    perPage,
  ]);

  const filters = useMemo<DayOffFilters>(
    () => ({
      search: debouncedSearch || undefined,
      locationId:
        isCompanyAdmin && locationFilter != null ? locationFilter : undefined,
      upcomingOnly: dateRange === "upcoming",
      isRecurring: typeFilter === "all" ? undefined : typeFilter === "recurring",
      sortBy,
      sortOrder,
    }),
    [
      debouncedSearch,
      isCompanyAdmin,
      locationFilter,
      dateRange,
      typeFilter,
      sortBy,
      sortOrder,
    ],
  );

  const { dayOffs, total, loading, error, refetch } = useDayOffs({
    filters,
    page,
    perPage,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  /* ---- single create / edit ---- */

  const openCreate = useCallback(() => {
    setForm(emptyForm(isCompanyAdmin ? null : ownLocationId));
    setSheet("form");
  }, [isCompanyAdmin, ownLocationId]);

  const openEdit = useCallback((d: DayOff) => {
    const scope: BlockingScope =
      d.packageIds.length && d.roomIds.length
        ? "both"
        : d.packageIds.length
          ? "packages"
          : d.roomIds.length
            ? "rooms"
            : "location";
    setForm({
      id: d.id,
      date: d.date || ymd(new Date()),
      reason: d.reason ?? "",
      locationId: d.locationId,
      isRecurring: d.isRecurring,
      timeStart: d.timeStart ? d.timeStart.substring(0, 5) : "",
      timeEnd: d.timeEnd ? d.timeEnd.substring(0, 5) : "",
      scope,
      packageIds: [...d.packageIds],
      roomIds: [...d.roomIds],
    });
    setSheet("form");
  }, []);

  const confirmDelete = useCallback(
    (d: DayOff) => {
      Alert.alert(
        "Delete day off",
        `Remove the block on ${prettyDate(d.date)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteDayOff(getToken() ?? "", d.id);
                refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error ? err.message : "Could not delete this day off.",
                );
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

  const saveForm = useCallback(async () => {
    if (form.locationId == null) {
      Alert.alert("Location required", "Please choose a location for this day off.");
      return;
    }
    if (
      (form.scope === "packages" || form.scope === "both") &&
      form.packageIds.length === 0
    ) {
      Alert.alert("Select packages", "Please select at least one package.");
      return;
    }
    if (
      (form.scope === "rooms" || form.scope === "both") &&
      form.roomIds.length === 0
    ) {
      Alert.alert("Select spaces", "Please select at least one space.");
      return;
    }
    if (form.timeStart && !timeRe.test(form.timeStart)) {
      Alert.alert("Invalid time", '"Close Starting At" must be in 24-hour HH:mm format.');
      return;
    }
    if (form.timeEnd && !timeRe.test(form.timeEnd)) {
      Alert.alert("Invalid time", '"Delayed Opening Until" must be in 24-hour HH:mm format.');
      return;
    }

    // Derive package_ids / room_ids from the scope (same switch as the web).
    let packageIds: number[] | null = null;
    let roomIds: number[] | null = null;
    if (form.scope === "packages") packageIds = form.packageIds;
    else if (form.scope === "rooms") roomIds = form.roomIds;
    else if (form.scope === "both") {
      packageIds = form.packageIds;
      roomIds = form.roomIds;
    }

    const payload: DayOffPayload = {
      location_id: form.locationId,
      date: form.date,
      reason: form.reason.trim() || null,
      is_recurring: form.isRecurring,
      time_start: form.timeStart || null,
      time_end: form.timeEnd || null,
      package_ids: packageIds,
      room_ids: roomIds,
    };

    setSaving(true);
    try {
      if (form.id != null) {
        await updateDayOff(getToken() ?? "", form.id, payload);
      } else {
        await createDayOff(getToken() ?? "", payload);
      }
      setSheet(null);
      refetch();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save this day off.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, refetch]);

  /* ---- selection mode ---- */

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((m) => !m);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = dayOffs.length > 0 && selectedIds.size === dayOffs.length;
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === dayOffs.length ? new Set() : new Set(dayOffs.map((d) => d.id)),
    );
  }, [dayOffs]);

  const confirmBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    Alert.alert(
      "Delete day offs",
      `Delete ${ids.length} day off${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await bulkDeleteDayOffs(getToken() ?? "", ids);
              setSelectionMode(false);
              setSelectedIds(new Set());
              refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete the selected day offs.",
              );
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  /* ---- bulk add ---- */

  const openBulk = useCallback(() => {
    const n = new Date();
    setBulkMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setBulkDates(new Set());
    setBulkReason("");
    setBulkIsRecurring(false);
    setBulkTimeStart("");
    setBulkTimeEnd("");
    setBulkScope("location");
    setBulkPackageIds(new Set());
    setBulkRoomIds(new Set());
    setBulkLocationId(isCompanyAdmin ? (locations[0]?.id ?? null) : ownLocationId);
    setSheet("bulk");
  }, [isCompanyAdmin, ownLocationId, locations]);

  // Load packages + spaces for the "What should be blocked?" scope selector
  // whenever the create/edit form OR the bulk sheet is open (and on location
  // change). Mirrors the web's Promise.all fetch; reuses existing mobile
  // services — no backend change. Selections are cleared in the location
  // pickers (not here) so an edit's pre-selected ids survive the initial load.
  const resourceLocationId =
    sheet === "form" ? form.locationId : sheet === "bulk" ? bulkLocationId : null;
  useEffect(() => {
    if (resourceLocationId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    setLoadingResources(true);
    Promise.all([
      fetchPackages({
        token,
        userId: currentUser?.id,
        locationId: resourceLocationId,
        signal: controller.signal,
      }).catch(() => []),
      fetchRooms(token, resourceLocationId).catch(() => []),
    ])
      .then(([pkgs, rooms]) => {
        if (controller.signal.aborted) return;
        setAvailablePackages(pkgs.map((p) => ({ id: p.id, name: p.name })));
        setAvailableRooms(rooms.map((r) => ({ id: r.id, name: r.name })));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingResources(false);
      });
    return () => controller.abort();
  }, [resourceLocationId, currentUser?.id]);

  const toggleBulkDate = useCallback((key: string) => {
    setBulkDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const bulkCells = useMemo(() => monthGridCells(bulkMonth), [bulkMonth]);

  const toggleFormPackage = useCallback((id: number) => {
    setForm((f) => ({
      ...f,
      packageIds: f.packageIds.includes(id)
        ? f.packageIds.filter((x) => x !== id)
        : [...f.packageIds, id],
    }));
  }, []);

  const toggleFormRoom = useCallback((id: number) => {
    setForm((f) => ({
      ...f,
      roomIds: f.roomIds.includes(id)
        ? f.roomIds.filter((x) => x !== id)
        : [...f.roomIds, id],
    }));
  }, []);

  const toggleBulkPackage = useCallback((id: number) => {
    setBulkPackageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleBulkRoom = useCallback((id: number) => {
    setBulkRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkCreate = useCallback(async () => {
    if (bulkLocationId == null) {
      Alert.alert("Location required", "Please choose a location for these day offs.");
      return;
    }
    if (bulkDates.size === 0) {
      Alert.alert("No dates selected", "Please pick at least one date.");
      return;
    }
    // Scope validation — mirrors the web (require ≥1 package / ≥1 space).
    if (
      (bulkScope === "packages" || bulkScope === "both") &&
      bulkPackageIds.size === 0
    ) {
      Alert.alert("Select packages", "Please select at least one package.");
      return;
    }
    if (
      (bulkScope === "rooms" || bulkScope === "both") &&
      bulkRoomIds.size === 0
    ) {
      Alert.alert("Select spaces", "Please select at least one space.");
      return;
    }
    if (bulkTimeStart && !timeRe.test(bulkTimeStart)) {
      Alert.alert("Invalid time", '"Close Starting At" must be in 24-hour HH:mm format.');
      return;
    }
    if (bulkTimeEnd && !timeRe.test(bulkTimeEnd)) {
      Alert.alert("Invalid time", '"Delayed Opening Until" must be in 24-hour HH:mm format.');
      return;
    }

    // Derive package_ids / room_ids from the scope (same switch as the web).
    let packageIds: number[] | null = null;
    let roomIds: number[] | null = null;
    if (bulkScope === "packages") packageIds = [...bulkPackageIds];
    else if (bulkScope === "rooms") roomIds = [...bulkRoomIds];
    else if (bulkScope === "both") {
      packageIds = [...bulkPackageIds];
      roomIds = [...bulkRoomIds];
    }

    setBulkCreating(true);
    const dates = [...bulkDates].sort();
    let ok = 0;
    let fail = 0;
    // The web bulk-add loops createDayOff per selected date (no batch endpoint)
    // and tolerates partial failures — mirror that exactly.
    for (const date of dates) {
      try {
        await createDayOff(getToken() ?? "", {
          location_id: bulkLocationId,
          date,
          reason: bulkReason.trim() || null,
          is_recurring: bulkIsRecurring,
          time_start: bulkTimeStart || null,
          time_end: bulkTimeEnd || null,
          package_ids: packageIds,
          room_ids: roomIds,
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkCreating(false);
    setSheet(null);
    refetch();
    if (ok > 0) {
      Alert.alert(
        "Bulk add complete",
        `Created ${ok} day off${ok === 1 ? "" : "s"}${fail > 0 ? ` (${fail} failed)` : ""}.`,
      );
    } else {
      Alert.alert("Bulk add failed", "Could not create the selected day offs.");
    }
  }, [
    bulkLocationId,
    bulkDates,
    bulkScope,
    bulkPackageIds,
    bulkRoomIds,
    bulkTimeStart,
    bulkTimeEnd,
    bulkReason,
    bulkIsRecurring,
    refetch,
  ]);

  /* ---- filters ---- */

  const clearFilters = useCallback(() => {
    setDateRange("upcoming");
    setTypeFilter("all");
    setSortBy("date");
    setSortOrder("asc");
    setLocationFilter(null);
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }, []);

  const hasActiveFilters =
    dateRange !== "upcoming" ||
    typeFilter !== "all" ||
    sortBy !== "date" ||
    sortOrder !== "asc" ||
    locationFilter != null ||
    search.trim() !== "";

  /* ---- labels ---- */

  const locationLabel =
    locationFilter == null
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ?? "Location");
  const dateRangeLabel =
    DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? "Upcoming Only";
  const typeLabel =
    TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? "All Types";
  const sortByLabel =
    SORT_BY_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Date";
  const sortOrderLabel =
    SORT_ORDER_OPTIONS.find((o) => o.value === sortOrder)?.label ?? "Ascending";
  const formLocationLabel =
    form.locationId == null
      ? "Select location..."
      : (locations.find((l) => l.id === form.locationId)?.name ??
        currentUser?.location?.name ??
        `Location #${form.locationId}`);
  const bulkLocationLabel =
    bulkLocationId == null
      ? "Select location..."
      : (locations.find((l) => l.id === bulkLocationId)?.name ??
        currentUser?.location?.name ??
        `Location #${bulkLocationId}`);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Day Offs
          </Text>
          <View style={{ width: 36 }} />
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
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Day Offs
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage blocked dates and holidays for your locations
            </Text>
          </View>

          {/* Top actions — Select, Bulk Add, Add Day Off (mirrors the web toolbar) */}
          {canManage && (
            <View className="mb-5">
              <View className="flex-row gap-3 mb-3">
                {dayOffs.length > 0 && (
                  <Pressable
                    onPress={toggleSelectionMode}
                    className={`flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border ${
                      selectionMode
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Feather
                      name={selectionMode ? "x" : "check-square"}
                      size={16}
                      color={PRIMARY}
                    />
                    <Text
                      numberOfLines={1}
                      className="text-gray-700 dark:text-gray-200 font-semibold text-sm"
                    >
                      {selectionMode ? "Cancel" : "Select"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={openBulk}
                  className="flex-1 h-12 rounded-xl items-center justify-center flex-row gap-2 border border-gray-200 dark:border-neutral-700"
                >
                  <Feather name="calendar" size={16} color={PRIMARY} />
                  <Text
                    numberOfLines={1}
                    className="text-gray-700 dark:text-gray-200 font-semibold text-sm"
                  >
                    Bulk Add
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={openCreate}
                className="h-12 rounded-xl items-center justify-center flex-row gap-2 bg-[#0644C7]"
                accessibilityRole="button"
                accessibilityLabel="Add Day Off"
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text
                  numberOfLines={1}
                  className="text-white font-semibold text-base"
                >
                  Add Day Off
                </Text>
              </Pressable>
            </View>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by date or reason..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters — Date Range, Type, Sort By, Sort Order (mirrors web) */}
          <View className="flex-row gap-3 mb-3">
            <FilterChip
              icon="calendar"
              label={dateRangeLabel}
              onPress={() => setSheet("daterange")}
            />
            <FilterChip
              icon="repeat"
              label={typeLabel}
              onPress={() => setSheet("type")}
            />
          </View>
          <View className="flex-row gap-3 mb-3">
            <FilterChip
              icon="bar-chart-2"
              label={`Sort: ${sortByLabel}`}
              onPress={() => setSheet("sortby")}
            />
            <FilterChip
              icon={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
              label={sortOrderLabel}
              onPress={() => setSheet("sortorder")}
            />
          </View>

          {isCompanyAdmin && (
            <Pressable
              onPress={() => setSheet("location")}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3"
            >
              <Feather name="map-pin" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {locationLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          )}

          {hasActiveFilters && (
            <Pressable
              onPress={clearFilters}
              className="h-11 rounded-xl items-center justify-center flex-row gap-2 border border-gray-200 dark:border-neutral-700 mb-5"
            >
              <Feather name="x-circle" size={15} color="#6B7280" />
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-sm">
                Clear Filters
              </Text>
            </Pressable>
          )}
          {!hasActiveFilters && <View className="mb-2" />}

          {/* Selection bulk-action bar */}
          {selectionMode && dayOffs.length > 0 && (
            <View
              className="flex-row items-center justify-between bg-white dark:bg-neutral-900 rounded-xl px-4 py-3 border border-gray-100 dark:border-neutral-800 mb-4"
              style={CARD_SHADOW}
            >
              <Pressable
                onPress={toggleSelectAll}
                className="flex-row items-center gap-2"
                hitSlop={8}
              >
                <Feather
                  name={allSelected ? "check-square" : "square"}
                  size={18}
                  color={PRIMARY}
                />
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Select All
                </Text>
              </Pressable>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size} selected
              </Text>
              <Pressable
                onPress={confirmBulkDelete}
                disabled={selectedIds.size === 0}
                className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg ${
                  selectedIds.size === 0
                    ? "opacity-40"
                    : "bg-red-50 dark:bg-red-900/20"
                }`}
              >
                <Feather name="trash-2" size={15} color="#EF4444" />
                <Text className="text-sm font-semibold text-red-600">
                  Delete {selectedIds.size}
                </Text>
              </Pressable>
            </View>
          )}

          {/* List header */}
          {!loading && !error && !selectionMode && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Day Offs
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {total}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center shadow-sm">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !error && dayOffs.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="calendar" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No Day Offs found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {hasActiveFilters
                  ? "No day offs match your search criteria. Try adjusting your filters."
                  : canManage
                    ? "Get started by adding blocked dates or holidays for your location."
                    : "There are no blocked dates for your location yet."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {dayOffs.map((d) => (
                  <DayOffCard
                    key={d.id}
                    dayOff={d}
                    showLocation={isCompanyAdmin}
                    canManage={canManage}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(d.id)}
                    onEdit={() => openEdit(d)}
                    onDelete={() => confirmDelete(d)}
                    onToggleSelect={() => toggleSelect(d.id)}
                  />
                ))}

                {!selectionMode && (
                  <Pagination
                    page={page}
                    perPage={perPage}
                    total={total}
                    options={PER_PAGE_OPTIONS}
                    onPageChange={setPage}
                    onPerPageChange={setPerPage}
                  />
                )}
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Filter sheets */}
      <FilterOptionSheet
        visible={sheet === "daterange"}
        onClose={() => setSheet(null)}
        title="Date Range"
        options={DATE_RANGE_OPTIONS}
        value={dateRange}
        onSelect={setDateRange}
      />
      <FilterOptionSheet
        visible={sheet === "type"}
        onClose={() => setSheet(null)}
        title="Type"
        options={TYPE_OPTIONS}
        value={typeFilter}
        onSelect={setTypeFilter}
      />
      <FilterOptionSheet
        visible={sheet === "sortby"}
        onClose={() => setSheet(null)}
        title="Sort By"
        options={SORT_BY_OPTIONS}
        value={sortBy}
        onSelect={setSortBy}
      />
      <FilterOptionSheet
        visible={sheet === "sortorder"}
        onClose={() => setSheet(null)}
        title="Sort Order"
        options={SORT_ORDER_OPTIONS}
        value={sortOrder}
        onSelect={setSortOrder}
      />

      {/* Location filter (company admin) */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Filter by Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: null as number | null, name: "All Locations" }, ...locations].map(
            (option) => {
              const isSelected = locationFilter === option.id;
              return (
                <Pressable
                  key={String(option.id ?? "all")}
                  onPress={() => {
                    setLocationFilter(option.id);
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
                    {option.name}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            },
          )}
        </ScrollView>
      </BottomSheet>

      {/* Create / edit form */}
      <BottomSheet
        visible={sheet === "form"}
        onClose={() => (saving ? undefined : setSheet(null))}
        title={form.id != null ? "Edit Day Off" : "Add Day Off"}
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {/* Location (company admin) */}
          {isCompanyAdmin && (
            <>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Location
              </Text>
              <Pressable
                onPress={() => setSheet("formLocation")}
                className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 mb-4"
              >
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text
                  className={`text-sm flex-1 ${
                    form.locationId == null
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-900 dark:text-white"
                  }`}
                  numberOfLines={1}
                >
                  {formLocationLabel}
                </Text>
                <Feather name="chevron-down" size={14} color="#9CA3AF" />
              </Pressable>
            </>
          )}

          {/* Date stepper */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Date
          </Text>
          <View className="flex-row items-center gap-2 mb-2">
            <Pressable
              onPress={() => setForm((f) => ({ ...f, date: shiftDate(f.date, -1) }))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-neutral-800 items-center justify-center"
            >
              <Feather name="chevron-left" size={18} color={headerIcon} />
            </Pressable>
            <View className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-neutral-700 items-center justify-center">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {prettyDate(form.date)}
              </Text>
            </View>
            <Pressable
              onPress={() => setForm((f) => ({ ...f, date: shiftDate(f.date, 1) }))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-neutral-800 items-center justify-center"
            >
              <Feather name="chevron-right" size={18} color={headerIcon} />
            </Pressable>
          </View>
          <Pressable onPress={() => setForm((f) => ({ ...f, date: ymd(new Date()) }))}>
            <Text className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-4">
              Reset to today
            </Text>
          </Pressable>

          {/* Reason */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Reason
          </Text>
          <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 mb-4">
            <TextInput
              value={form.reason}
              onChangeText={(t) => setForm((f) => ({ ...f, reason: t }))}
              placeholder="e.g. Corporate Party, Holiday..."
              placeholderTextColor="#9CA3AF"
              className="text-sm text-gray-900 dark:text-white"
            />
          </View>

          {/* What should be blocked? (scope) */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            What should be blocked?
          </Text>
          <View className="flex-row flex-wrap -mx-1 mb-1">
            {SCOPE_OPTIONS.map((opt) => {
              const active = form.scope === opt.value;
              return (
                <View key={opt.value} className="w-1/2 px-1 mb-2">
                  <Pressable
                    onPress={() => setForm((f) => ({ ...f, scope: opt.value }))}
                    className={`rounded-xl border p-3 ${
                      active
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Feather
                      name={opt.icon}
                      size={16}
                      color={active ? PRIMARY : "#6B7280"}
                    />
                    <Text
                      className={`text-sm font-semibold mt-1.5 ${
                        active
                          ? "text-[#0644C7]"
                          : "text-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {opt.title}
                    </Text>
                    <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {opt.sub}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {(form.scope === "packages" || form.scope === "both") && (
            <View className="mb-4">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Select Packages
              </Text>
              {loadingResources ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  Loading packages...
                </Text>
              ) : availablePackages.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  No active packages found
                </Text>
              ) : (
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {availablePackages.map((p, idx) => {
                    const checked = form.packageIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => toggleFormPackage(p.id)}
                        className={`flex-row items-center gap-2.5 px-3.5 py-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
                          idx > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                        }`}
                      >
                        <Feather
                          name={checked ? "check-square" : "square"}
                          size={18}
                          color={checked ? PRIMARY : "#9CA3AF"}
                        />
                        <Text
                          className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {(form.scope === "rooms" || form.scope === "both") && (
            <View className="mb-4">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Select Spaces
              </Text>
              {loadingResources ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  Loading spaces...
                </Text>
              ) : availableRooms.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  No available spaces found
                </Text>
              ) : (
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {availableRooms.map((r, idx) => {
                    const checked = form.roomIds.includes(r.id);
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => toggleFormRoom(r.id)}
                        className={`flex-row items-center gap-2.5 px-3.5 py-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
                          idx > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                        }`}
                      >
                        <Feather
                          name={checked ? "check-square" : "square"}
                          size={18}
                          color={checked ? PRIMARY : "#9CA3AF"}
                        />
                        <Text
                          className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Partial Day Closure */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Partial Day Closure{" "}
            <Text className="text-gray-400 dark:text-gray-500">(Optional)</Text>
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Leave both empty for full day closure. Set one or both for partial closures.
          </Text>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Delayed Opening Until
              </Text>
              <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <TextInput
                  value={form.timeEnd}
                  onChangeText={(t) => setForm((f) => ({ ...f, timeEnd: t }))}
                  placeholder="HH:mm"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numbers-and-punctuation"
                  className="text-sm text-gray-900 dark:text-white"
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Closed until this time
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Close Starting At
              </Text>
              <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <TextInput
                  value={form.timeStart}
                  onChangeText={(t) => setForm((f) => ({ ...f, timeStart: t }))}
                  placeholder="HH:mm"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numbers-and-punctuation"
                  className="text-sm text-gray-900 dark:text-white"
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Closed from this time
              </Text>
            </View>
          </View>

          {/* Recurring */}
          <Pressable
            onPress={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
            className="flex-row items-center gap-2 mb-6"
          >
            <Feather
              name={form.isRecurring ? "check-square" : "square"}
              size={18}
              color={PRIMARY}
            />
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Recurring annually
            </Text>
          </Pressable>

          <Pressable
            onPress={saveForm}
            disabled={saving}
            className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather
                  name={form.id != null ? "check" : "plus"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text
                  numberOfLines={1}
                  className="text-base font-semibold text-white"
                >
                  {form.id != null ? "Save Changes" : "Add Day Off"}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Form location picker (company admin) */}
      <BottomSheet
        visible={sheet === "formLocation"}
        onClose={() => setSheet("form")}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {locations.map((option) => {
            const isSelected = form.locationId === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  // Changing location clears scope selections (they belong to
                  // the previous location's packages/spaces).
                  setForm((f) => ({
                    ...f,
                    locationId: option.id,
                    packageIds: f.locationId === option.id ? f.packageIds : [],
                    roomIds: f.locationId === option.id ? f.roomIds : [],
                  }));
                  setSheet("form");
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
                  {option.name}
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

      {/* Bulk Add */}
      <BottomSheet
        visible={sheet === "bulk"}
        onClose={() => (bulkCreating ? undefined : setSheet(null))}
        title="Bulk Add Day Offs"
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {/* Month navigation */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable
              onPress={() =>
                setBulkMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                )
              }
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
            >
              <Feather name="chevron-left" size={20} color={PRIMARY} />
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {MONTHS[bulkMonth.getMonth()]} {bulkMonth.getFullYear()}
            </Text>
            <Pressable
              onPress={() =>
                setBulkMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                )
              }
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
            >
              <Feather name="chevron-right" size={20} color={PRIMARY} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View className="flex-row mb-1">
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
                <Text className="text-[11px] font-medium text-gray-400">{w}</Text>
              </View>
            ))}
          </View>

          {/* Day grid (multi-select) */}
          <View className="flex-row flex-wrap">
            {bulkCells.map((key, i) => {
              if (!key) {
                return (
                  <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />
                );
              }
              const isSelected = bulkDates.has(key);
              const past = isPastYmd(key);
              return (
                <View
                  key={key}
                  style={{ width: `${100 / 7}%` }}
                  className="h-11 items-center justify-center"
                >
                  <Pressable
                    onPress={() => !past && toggleBulkDate(key)}
                    disabled={past}
                    className={`w-9 h-9 rounded-full items-center justify-center ${
                      isSelected
                        ? "bg-[#0644C7]"
                        : past
                          ? ""
                          : "active:bg-gray-100 dark:active:bg-neutral-800"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "text-white font-bold"
                          : past
                            ? "text-gray-300 dark:text-neutral-700"
                            : "text-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {Number(key.substring(8, 10))}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Selected count + clear */}
          <View className="flex-row items-center justify-between mt-3 mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {bulkDates.size} date{bulkDates.size === 1 ? "" : "s"} selected
            </Text>
            {bulkDates.size > 0 && (
              <Pressable onPress={() => setBulkDates(new Set())} hitSlop={8}>
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Clear all
                </Text>
              </Pressable>
            )}
          </View>

          {/* Location (company admin) */}
          {isCompanyAdmin && (
            <>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Location
              </Text>
              <Pressable
                onPress={() => setSheet("bulkLocation")}
                className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 mb-4"
              >
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text
                  className={`text-sm flex-1 ${
                    bulkLocationId == null
                      ? "text-gray-400 dark:text-gray-500"
                      : "text-gray-900 dark:text-white"
                  }`}
                  numberOfLines={1}
                >
                  {bulkLocationLabel}
                </Text>
                <Feather name="chevron-down" size={14} color="#9CA3AF" />
              </Pressable>
            </>
          )}

          {/* Reason */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Reason (applies to all selected dates)
          </Text>
          <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 mb-4">
            <TextInput
              value={bulkReason}
              onChangeText={setBulkReason}
              placeholder="e.g. Holiday, Maintenance..."
              placeholderTextColor="#9CA3AF"
              className="text-sm text-gray-900 dark:text-white"
            />
          </View>

          {/* What should be blocked? (scope) */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            What should be blocked?
          </Text>
          <View className="flex-row flex-wrap -mx-1 mb-1">
            {SCOPE_OPTIONS.map((opt) => {
              const active = bulkScope === opt.value;
              return (
                <View key={opt.value} className="w-1/2 px-1 mb-2">
                  <Pressable
                    onPress={() => setBulkScope(opt.value)}
                    className={`rounded-xl border p-3 ${
                      active
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Feather
                      name={opt.icon}
                      size={16}
                      color={active ? PRIMARY : "#6B7280"}
                    />
                    <Text
                      className={`text-sm font-semibold mt-1.5 ${
                        active
                          ? "text-[#0644C7]"
                          : "text-gray-800 dark:text-gray-100"
                      }`}
                    >
                      {opt.title}
                    </Text>
                    <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {opt.sub}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {(bulkScope === "packages" || bulkScope === "both") && (
            <View className="mb-4">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Select Packages
              </Text>
              {loadingResources ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  Loading packages...
                </Text>
              ) : availablePackages.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  No active packages found
                </Text>
              ) : (
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {availablePackages.map((p, idx) => {
                    const checked = bulkPackageIds.has(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => toggleBulkPackage(p.id)}
                        className={`flex-row items-center gap-2.5 px-3.5 py-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
                          idx > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                        }`}
                      >
                        <Feather
                          name={checked ? "check-square" : "square"}
                          size={18}
                          color={checked ? PRIMARY : "#9CA3AF"}
                        />
                        <Text
                          className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {(bulkScope === "rooms" || bulkScope === "both") && (
            <View className="mb-4">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Select Spaces
              </Text>
              {loadingResources ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  Loading spaces...
                </Text>
              ) : availableRooms.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  No available spaces found
                </Text>
              ) : (
                <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                  {availableRooms.map((r, idx) => {
                    const checked = bulkRoomIds.has(r.id);
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => toggleBulkRoom(r.id)}
                        className={`flex-row items-center gap-2.5 px-3.5 py-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
                          idx > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                        }`}
                      >
                        <Feather
                          name={checked ? "check-square" : "square"}
                          size={18}
                          color={checked ? PRIMARY : "#9CA3AF"}
                        />
                        <Text
                          className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Partial Day Closure */}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Partial Day Closure{" "}
            <Text className="text-gray-400 dark:text-gray-500">(Optional)</Text>
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Leave both empty for full day closure. Set one or both for partial closures.
          </Text>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Delayed Opening Until
              </Text>
              <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <TextInput
                  value={bulkTimeEnd}
                  onChangeText={setBulkTimeEnd}
                  placeholder="HH:mm"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numbers-and-punctuation"
                  className="text-sm text-gray-900 dark:text-white"
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Closed until this time
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Close Starting At
              </Text>
              <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <TextInput
                  value={bulkTimeStart}
                  onChangeText={setBulkTimeStart}
                  placeholder="HH:mm"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numbers-and-punctuation"
                  className="text-sm text-gray-900 dark:text-white"
                />
              </View>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Closed from this time
              </Text>
            </View>
          </View>

          {/* Recurring */}
          <Pressable
            onPress={() => setBulkIsRecurring((v) => !v)}
            className="flex-row items-center gap-2 mb-6"
          >
            <Feather
              name={bulkIsRecurring ? "check-square" : "square"}
              size={18}
              color={PRIMARY}
            />
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Recurring annually
            </Text>
          </Pressable>

          <Pressable
            onPress={bulkCreate}
            disabled={bulkCreating || bulkDates.size === 0}
            className={`h-14 flex-row items-center justify-center rounded-full bg-[#0644C7] active:opacity-90 ${
              bulkCreating || bulkDates.size === 0 ? "opacity-60" : ""
            }`}
          >
            {bulkCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-semibold text-white">
                Create {bulkDates.size} Day Off{bulkDates.size === 1 ? "" : "s"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Bulk location picker (company admin) */}
      <BottomSheet
        visible={sheet === "bulkLocation"}
        onClose={() => setSheet("bulk")}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {locations.map((option) => {
            const isSelected = bulkLocationId === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  if (option.id !== bulkLocationId) {
                    setBulkPackageIds(new Set());
                    setBulkRoomIds(new Set());
                  }
                  setBulkLocationId(option.id);
                  setSheet("bulk");
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
                  {option.name}
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
    </View>
  );
};

export default DayOffs;
