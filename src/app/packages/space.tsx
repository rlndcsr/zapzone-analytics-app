import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { Pagination } from "../../components/ui/Pagination";
import {
  breaksToPayload,
  createRoom,
  deleteRoom,
  fetchSpaceList,
  updateAreaGroupInterval,
  updateRoom,
  type RoomInput,
  type SpaceBreak,
  type SpaceRow,
} from "../../services/bookingsService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { getCurrentUser, getToken } from "../../lib/session";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type StatusFilter = "all" | "available" | "inactive";
type SortBy = "name" | "capacity" | "created";
type SortOrder = "asc" | "desc";
type SuffixType = "number" | "letter";

const DAYS: { label: string; value: string }[] = [
  { label: "Sun", value: "sunday" },
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
];

/** Compute the generated room names for the "Multiple Rooms" mode. */
function buildRoomNames(
  base: string,
  suffix: SuffixType,
  count: number,
  start: number,
): string[] {
  const names: string[] = [];
  const b = base.trim();
  for (let i = 0; i < count; i++) {
    if (suffix === "letter") {
      names.push(`${b} ${String.fromCharCode(65 + ((start - 1 + i) % 26))}`.trim());
    } else {
      names.push(`${b} ${start + i}`.trim());
    }
  }
  return names;
}

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Available", value: "available" },
  { label: "Unavailable", value: "inactive" },
];
const SORT_BY_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Name", value: "name" },
  { label: "Capacity", value: "capacity" },
  { label: "Date Created", value: "created" },
];
const SORT_ORDER_OPTIONS: { label: string; value: SortOrder }[] = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A row of chip choices used inside the collapsible Filters panel. */
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
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`px-3.5 py-2 rounded-lg border ${
                active
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? "text-white" : "text-gray-600 dark:text-gray-300"
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

/** Compact add/remove editor for a room's recurring break windows. */
function BreakTimesEditor({
  breaks,
  onChange,
  note,
}: {
  breaks: SpaceBreak[];
  onChange: (next: SpaceBreak[]) => void;
  note?: string;
}) {
  const update = (index: number, patch: Partial<SpaceBreak>) =>
    onChange(breaks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const toggleDay = (index: number, day: string) => {
    const cur = breaks[index].days;
    update(index, {
      days: cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day],
    });
  };

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          Break Times
        </Text>
        <Pressable
          onPress={() =>
            onChange([
              ...breaks,
              { days: [], startTime: "12:00", endTime: "13:00" },
            ])
          }
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700"
        >
          <Feather name="plus" size={13} color={PRIMARY} />
          <Text className="text-xs font-semibold text-[#0644C7]">
            Add Break Time
          </Text>
        </Pressable>
      </View>
      {!!note && (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {note}
        </Text>
      )}

      {breaks.map((b, i) => (
        <View
          key={i}
          className="bg-gray-50 dark:bg-neutral-800 rounded-xl p-3 mt-3 border border-gray-100 dark:border-neutral-700"
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Break {i + 1}
            </Text>
            <Pressable onPress={() => onChange(breaks.filter((_, j) => j !== i))} hitSlop={6}>
              <Feather name="trash-2" size={14} color="#E11D48" />
            </Pressable>
          </View>
          <View className="flex-row flex-wrap gap-1.5 mb-2">
            {DAYS.map((d) => {
              const active = b.days.includes(d.value);
              return (
                <Pressable
                  key={d.value}
                  onPress={() => toggleDay(i, d.value)}
                  className={`px-2 py-1 rounded-md border ${
                    active
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-[11px] font-medium ${
                      active ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                Start (HH:MM)
              </Text>
              <TextInput
                value={b.startTime}
                onChangeText={(t) => update(i, { startTime: t })}
                placeholder="12:00"
                placeholderTextColor="#9CA3AF"
                className="bg-white dark:bg-neutral-900 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                End (HH:MM)
              </Text>
              <TextInput
                value={b.endTime}
                onChangeText={(t) => update(i, { endTime: t })}
                placeholder="13:00"
                placeholderTextColor="#9CA3AF"
                className="bg-white dark:bg-neutral-900 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const SpaceCard = ({
  space,
  onEdit,
  onDelete,
}: {
  space: SpaceRow;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-2">
      <Text
        className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-3"
        numberOfLines={1}
      >
        {space.name}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onEdit}
          hitSlop={6}
          className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 items-center justify-center"
          accessibilityLabel={`Edit ${space.name}`}
        >
          <Feather name="edit-2" size={14} color={PRIMARY} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 items-center justify-center"
          accessibilityLabel={`Delete ${space.name}`}
        >
          <Feather name="trash-2" size={14} color="#E11D48" />
        </Pressable>
      </View>
    </View>

    <View
      className={`self-start px-2.5 py-1 rounded-full mb-2 ${
        space.isActive
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <Text
        className={`text-[11px] font-semibold ${
          space.isActive
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {space.isActive ? "Available" : "Inactive"}
      </Text>
    </View>

    <View className="flex-row items-center gap-1.5 mb-1.5">
      <Feather name="users" size={14} color="#9CA3AF" />
      <Text className="text-sm text-gray-600 dark:text-gray-300">
        {space.capacity != null ? `${space.capacity} people` : "—"}
      </Text>
    </View>

    {!!space.areaGroup && (
      <View className="flex-row items-center gap-1.5 mb-1.5">
        <Feather name="layers" size={14} color="#9CA3AF" />
        <Text
          className="text-sm text-gray-600 dark:text-gray-300 flex-1"
          numberOfLines={1}
        >
          {space.areaGroup}
          {space.bookingInterval != null
            ? ` (${space.bookingInterval}min interval)`
            : ""}
        </Text>
      </View>
    )}

    {!!formatDate(space.createdAt) && (
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {formatDate(space.createdAt)}
      </Text>
    )}
  </View>
);

const Space = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");

  // Edit form
  const [editTarget, setEditTarget] = useState<SpaceRow | null>(null);
  const [fName, setFName] = useState("");
  const [fCapacity, setFCapacity] = useState("");
  const [fAvailable, setFAvailable] = useState(true);
  const [fAreaGroup, setFAreaGroup] = useState("");
  const [fInterval, setFInterval] = useState("");
  const [fBreaks, setFBreaks] = useState<SpaceBreak[]>([]);
  const [saving, setSaving] = useState(false);

  // Create ("Add New Space") form
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"single" | "multiple">("single");
  const [cLocationId, setCLocationId] = useState<number | null>(null);
  const [cName, setCName] = useState("");
  const [cCapacity, setCCapacity] = useState("");
  const [cAvailable, setCAvailable] = useState(true);
  const [cAreaGroup, setCAreaGroup] = useState("");
  const [cInterval, setCInterval] = useState("15");
  const [cBreaks, setCBreaks] = useState<SpaceBreak[]>([]);
  const [cBaseName, setCBaseName] = useState("");
  const [cSuffix, setCSuffix] = useState<SuffixType>("number");
  const [cCount, setCCount] = useState("1");
  const [cStart, setCStart] = useState("1");
  const [creating, setCreating] = useState(false);

  // Locations for the create picker (lazy-loaded when the sheet opens).
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  // Area group settings
  const [showAreaGroup, setShowAreaGroup] = useState(false);
  const [agGroup, setAgGroup] = useState<string | null>(null);
  const [agInterval, setAgInterval] = useState("");
  const [agSaving, setAgSaving] = useState(false);

  const loader = useCallback(
    ({ token, userId }: { token: string; userId: number }) =>
      fetchSpaceList({ token, userId }),
    [],
  );
  const { data: spaces, loading, error, refetch } = useAsyncList(loader);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const areaGroups = useMemo(() => {
    const map = new Map<string, SpaceRow[]>();
    spaces.forEach((s) => {
      if (!s.areaGroup) return;
      const arr = map.get(s.areaGroup) ?? [];
      arr.push(s);
      map.set(s.areaGroup, arr);
    });
    return map;
  }, [spaces]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = spaces.filter((s) => {
      if (statusFilter === "available" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      if (locationFilter !== "all" && s.locationId !== locationFilter)
        return false;
      if (
        term &&
        !s.name.toLowerCase().includes(term) &&
        !(s.areaGroup ?? "").toLowerCase().includes(term)
      )
        return false;
      return true;
    });
    const dir = sortOrder === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === "capacity") return ((a.capacity ?? 0) - (b.capacity ?? 0)) * dir;
      if (sortBy === "created")
        return (
          (new Date(a.createdAt ?? 0).getTime() -
            new Date(b.createdAt ?? 0).getTime()) *
          dir
        );
      return a.name.localeCompare(b.name) * dir;
    });
    return list;
  }, [spaces, search, statusFilter, locationFilter, sortBy, sortOrder]);

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
  }, [search, statusFilter, locationFilter, sortBy, sortOrder, perPage]);

  const filtersActive =
    statusFilter !== "all" ||
    sortBy !== "name" ||
    sortOrder !== "asc" ||
    locationFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
    setSortBy("name");
    setSortOrder("asc");
    setLocationFilter("all");
  };

  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token || locations.length > 0) return;
    setLocationsLoading(true);
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal: the picker just stays empty and the field is required.
    } finally {
      setLocationsLoading(false);
    }
  }, [locations.length]);

  // Load the full location list up front so the filter can list every location
  // (not only those present on the loaded rooms).
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const openCreate = () => {
    setCreateMode("single");
    setCLocationId(getCurrentUser()?.location_id ?? null);
    setCName("");
    setCCapacity("");
    setCAvailable(true);
    setCAreaGroup("");
    setCInterval("15");
    setCBreaks([]);
    setCBaseName("");
    setCSuffix("number");
    setCCount("1");
    setCStart("1");
    setShowCreate(true);
    loadLocations();
  };

  const openEdit = (room: SpaceRow) => {
    setFName(room.name);
    setFCapacity(room.capacity != null ? String(room.capacity) : "");
    setFAvailable(room.isActive);
    setFAreaGroup(room.areaGroup ?? "");
    setFInterval(room.bookingInterval != null ? String(room.bookingInterval) : "");
    setFBreaks(room.breaks);
    setEditTarget(room);
  };

  const saveRoom = async () => {
    const token = getToken();
    if (!token || !editTarget) return;
    const name = fName.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter a space name.");
      return;
    }
    const input: RoomInput = {
      name,
      capacity: fCapacity.trim() ? Number(fCapacity) : null,
      is_active: fAvailable,
      area_group: fAreaGroup.trim() || null,
      booking_interval: fInterval.trim() ? Number(fInterval) : null,
      location_id: editTarget.locationId ?? undefined,
      break_time: breaksToPayload(fBreaks),
    };
    setSaving(true);
    try {
      await updateRoom(token, editTarget.id, input);
      setEditTarget(null);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save the space.",
      );
    } finally {
      setSaving(false);
    }
  };

  const createCount =
    createMode === "multiple" ? Math.max(0, Number(cCount) || 0) : 1;

  const saveCreate = async () => {
    const token = getToken();
    if (!token) return;
    if (cLocationId == null) {
      Alert.alert("Location required", "Please select a location.");
      return;
    }
    const base: Omit<RoomInput, "name"> = {
      capacity: cCapacity.trim() ? Number(cCapacity) : null,
      is_active: cAvailable,
      area_group: cAreaGroup.trim() || null,
      booking_interval: cInterval.trim() ? Number(cInterval) : null,
      location_id: cLocationId,
      break_time: breaksToPayload(cBreaks),
    };

    let names: string[];
    if (createMode === "multiple") {
      if (!cBaseName.trim()) {
        Alert.alert("Base name required", "Please enter a base name.");
        return;
      }
      if (createCount < 1) {
        Alert.alert("Count required", "Enter how many rooms to create.");
        return;
      }
      names = buildRoomNames(
        cBaseName,
        cSuffix,
        createCount,
        Number(cStart) || 1,
      );
    } else {
      if (!cName.trim()) {
        Alert.alert("Name required", "Please enter a space name.");
        return;
      }
      names = [cName.trim()];
    }

    setCreating(true);
    try {
      for (const name of names) {
        await createRoom(token, { ...base, name });
      }
      setShowCreate(false);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Create failed",
        err instanceof Error ? err.message : "Could not create the space(s).",
      );
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (room: SpaceRow) => {
    Alert.alert("Delete space", `Delete "${room.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          try {
            await deleteRoom(token, room.id);
            await refetch();
          } catch (err) {
            Alert.alert(
              "Delete failed",
              err instanceof Error ? err.message : "Could not delete the space.",
            );
          }
        },
      },
    ]);
  };

  const openAreaGroup = () => {
    const first = Array.from(areaGroups.keys())[0] ?? null;
    setAgGroup(first);
    setAgInterval(
      first
        ? String(areaGroups.get(first)?.[0]?.bookingInterval ?? 15)
        : "15",
    );
    setShowAreaGroup(true);
  };

  const saveAreaGroup = async () => {
    const token = getToken();
    if (!token || !agGroup) return;
    const rooms = areaGroups.get(agGroup) ?? [];
    if (rooms.length === 0) return;
    setAgSaving(true);
    try {
      await updateAreaGroupInterval(token, rooms, Number(agInterval) || 0);
      setShowAreaGroup(false);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update the rooms.",
      );
    } finally {
      setAgSaving(false);
    }
  };

  const locationLabel =
    locationFilter === "all"
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ??
        "All Locations");

  return (
    <View className="flex-1 bg-white dark:bg-black">
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
            Spaces
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
          />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Spaces
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your facility spaces and their availability
            </Text>
          </View>

          {/* Header actions */}
          <View className="flex-row gap-2 mb-4">
            <Pressable
              onPress={openAreaGroup}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 px-3 py-3 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Feather name="layers" size={15} color="#374151" />
              <Text
                className="text-xs font-semibold text-gray-700 dark:text-gray-200"
                numberOfLines={1}
              >
                Area Groups
              </Text>
            </Pressable>
            <Pressable
              onPress={openCreate}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] px-3 py-3 rounded-xl active:opacity-90"
            >
              <Feather name="plus" size={15} color="#FFFFFF" />
              <Text className="text-xs font-semibold text-white">Create Room</Text>
            </Pressable>
          </View>

          {/* Search + filters toggle */}
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={18} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search spaces by name..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Feather name="x" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setShowFilters((v) => !v)}
              className={`flex-row items-center gap-1.5 px-3.5 py-3 rounded-xl border ${
                showFilters || filtersActive
                  ? "bg-blue-50 dark:bg-blue-900/20 border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
              }`}
            >
              <Feather name="filter" size={15} color={PRIMARY} />
              <Text className="text-xs font-semibold text-[#0644C7]">Filters</Text>
            </Pressable>
          </View>

          {/* Filters panel */}
          {showFilters && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <ChipRow
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <ChipRow
                label="Sort By"
                options={SORT_BY_OPTIONS}
                value={sortBy}
                onChange={setSortBy}
              />
              <ChipRow
                label="Sort Order"
                options={SORT_ORDER_OPTIONS}
                value={sortOrder}
                onChange={setSortOrder}
              />
              {isCompanyAdmin && (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                    Location
                  </Text>
                  <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    <Pressable
                      onPress={() => setLocationFilter("all")}
                      className={`flex-row items-center gap-2.5 px-3 py-2.5 ${
                        locationFilter === "all" ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      }`}
                    >
                      <View className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                        <Feather name="grid" size={14} color={PRIMARY} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          All Locations
                        </Text>
                        <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                          View all locations
                        </Text>
                      </View>
                      {locationFilter === "all" && (
                        <Feather name="check" size={16} color={PRIMARY} />
                      )}
                    </Pressable>

                    {locationsLoading && locations.length === 0 && (
                      <View className="py-4 items-center border-t border-gray-100 dark:border-neutral-800">
                        <ActivityIndicator color={PRIMARY} />
                      </View>
                    )}

                    {locations.map((loc) => {
                      const active = locationFilter === loc.id;
                      return (
                        <Pressable
                          key={loc.id}
                          onPress={() => setLocationFilter(loc.id)}
                          className={`flex-row items-center gap-2.5 px-3 py-2.5 border-t border-gray-100 dark:border-neutral-800 ${
                            active ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                        >
                          <View className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                            <Feather name="map-pin" size={14} color={PRIMARY} />
                          </View>
                          <View className="flex-1">
                            <Text
                              className="text-sm font-semibold text-gray-800 dark:text-gray-100"
                              numberOfLines={1}
                            >
                              {loc.name}
                            </Text>
                            {!!loc.address && (
                              <Text
                                className="text-[11px] text-gray-400 dark:text-gray-500"
                                numberOfLines={1}
                              >
                                {loc.address}
                              </Text>
                            )}
                          </View>
                          {active && (
                            <Feather name="check" size={16} color={PRIMARY} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {filtersActive && (
                <Pressable onPress={clearFilters} className="self-end mt-1">
                  <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {!loading && !error && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "room" : "rooms"}
              {locationFilter !== "all" ? ` · ${locationLabel}` : ""}
            </Text>
          )}

          {/* States */}
          {loading ? (
            <View key="s-loading" className="py-16 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : error ? (
            <View key="s-error" className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View key="s-empty" className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="home" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No spaces found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                {spaces.length === 0
                  ? "There are no spaces for this account yet."
                  : "Try a different search or filters."}
              </Text>
            </View>
          ) : (
            <View key="s-list">
              {paged.map((space) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  onEdit={() => openEdit(space)}
                  onDelete={() => confirmDelete(space)}
                />
              ))}
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

      {/* Edit Space */}
      <BottomSheet
        visible={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Space"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Space Name *
          </Text>
          <TextInput
            value={fName}
            onChangeText={setFName}
            placeholder="e.g. Table 1"
            placeholderTextColor="#9CA3AF"
            className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
          />

          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Capacity (people)
          </Text>
          <TextInput
            value={fCapacity}
            onChangeText={setFCapacity}
            placeholder="20"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
          />

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Available for booking
            </Text>
            <Switch
              value={fAvailable}
              onValueChange={setFAvailable}
              trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View className="pt-3 border-t border-gray-100 dark:border-neutral-800 mb-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              Stagger Booking Settings
            </Text>
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Area Group
            </Text>
            <TextInput
              value={fAreaGroup}
              onChangeText={setFAreaGroup}
              placeholder="e.g. Party Tables"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
              Rooms in the same group share stagger rules.
            </Text>

            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Booking Interval (min)
            </Text>
            <TextInput
              value={fInterval}
              onChangeText={setFInterval}
              placeholder="15"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500">
              Minutes between bookings. Set to 0 to allow simultaneous bookings.
            </Text>
          </View>

          <View className="pt-3 border-t border-gray-100 dark:border-neutral-800 mb-3">
            <BreakTimesEditor breaks={fBreaks} onChange={setFBreaks} />
          </View>

          <View className="flex-row gap-3 mt-3">
            <Pressable
              onPress={saveRoom}
              disabled={saving}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Update Room
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setEditTarget(null)}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Add New Space (create) */}
      <BottomSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add New Space"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {/* Single / Multiple toggle */}
          <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 mb-4">
            {(["single", "multiple"] as const).map((mode) => {
              const active = createMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setCreateMode(mode)}
                  className={`flex-1 items-center py-2.5 rounded-lg ${
                    active ? "bg-[#0644C7]" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      active ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {mode === "single" ? "Single Room" : "Multiple Rooms"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Location */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Location *
          </Text>
          {locationsLoading ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            <View className="flex-row flex-wrap -mx-1 mb-4">
              {locations.map((loc) => {
                const active = cLocationId === loc.id;
                return (
                  <View key={loc.id} className="w-1/3 px-1 mb-2">
                    <Pressable
                      onPress={() => setCLocationId(loc.id)}
                      className={`flex-row items-center gap-1.5 p-2 rounded-xl border ${
                        active
                          ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                      }`}
                    >
                      <View className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                        <Feather name="map-pin" size={13} color={PRIMARY} />
                      </View>
                      <Text
                        className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                        numberOfLines={1}
                      >
                        {loc.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {locations.length === 0 && (
                <Text className="text-sm text-gray-400 dark:text-gray-500 px-1">
                  No locations available.
                </Text>
              )}
            </View>
          )}

          {createMode === "single" ? (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Space Name *
              </Text>
              <TextInput
                value={cName}
                onChangeText={setCName}
                placeholder="Enter Space name"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
              />
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Capacity (people)
              </Text>
              <TextInput
                value={cCapacity}
                onChangeText={setCCapacity}
                placeholder="Enter capacity"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
              />
            </>
          ) : (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Base Name *
              </Text>
              <TextInput
                value={cBaseName}
                onChangeText={setCBaseName}
                placeholder="e.g. Table"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
              />
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                    Suffix Type *
                  </Text>
                  <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
                    {(["number", "letter"] as const).map((s) => {
                      const active = cSuffix === s;
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setCSuffix(s)}
                          className={`flex-1 items-center py-2 rounded-lg ${
                            active ? "bg-[#0644C7]" : "bg-transparent"
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold capitalize ${
                              active
                                ? "text-white"
                                : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {s}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View className="w-24">
                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                    Count *
                  </Text>
                  <TextInput
                    value={cCount}
                    onChangeText={setCCount}
                    placeholder="1"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
                  />
                </View>
              </View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Start {cSuffix === "letter" ? "Letter #" : "Number"} *
              </Text>
              <TextInput
                value={cStart}
                onChangeText={setCStart}
                placeholder="1"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
              />
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Capacity (people)
              </Text>
              <TextInput
                value={cCapacity}
                onChangeText={setCCapacity}
                placeholder="Enter capacity for all Spaces"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-2"
              />
              {createCount > 0 && !!cBaseName.trim() && (
                <View className="flex-row flex-wrap gap-1.5 mb-4">
                  {buildRoomNames(
                    cBaseName,
                    cSuffix,
                    Math.min(createCount, 12),
                    Number(cStart) || 1,
                  ).map((n) => (
                    <View
                      key={n}
                      className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded"
                    >
                      <Text className="text-[11px] font-medium text-[#0644C7] dark:text-blue-300">
                        {n}
                      </Text>
                    </View>
                  ))}
                  {createCount > 12 && (
                    <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                      +{createCount - 12} more
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Available for booking
            </Text>
            <Switch
              value={cAvailable}
              onValueChange={setCAvailable}
              trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View className="pt-3 border-t border-gray-100 dark:border-neutral-800 mb-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              Stagger Booking Settings{createMode === "multiple" ? " (applies to all)" : ""}
            </Text>
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Area Group
            </Text>
            <TextInput
              value={cAreaGroup}
              onChangeText={setCAreaGroup}
              placeholder="e.g. Zone A"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
              Rooms in the same group share stagger rules.
            </Text>
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Booking Interval (min)
            </Text>
            <TextInput
              value={cInterval}
              onChangeText={setCInterval}
              placeholder="15"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500">
              Minutes between bookings in group.
            </Text>
          </View>

          <View className="pt-3 border-t border-gray-100 dark:border-neutral-800 mb-3">
            <BreakTimesEditor
              breaks={cBreaks}
              onChange={setCBreaks}
              note={
                createMode === "multiple" ? "Applies to all created rooms." : undefined
              }
            />
          </View>

          <View className="flex-row gap-3 mt-3">
            <Pressable
              onPress={saveCreate}
              disabled={creating}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {creating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {createMode === "multiple"
                    ? `Create ${createCount} Room${createCount === 1 ? "" : "s"}`
                    : "Create Room"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setShowCreate(false)}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Area Group Settings */}
      <BottomSheet
        visible={showAreaGroup}
        onClose={() => setShowAreaGroup(false)}
        title="Area Group Settings"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Update the booking interval for all rooms in an area group.
          </Text>

          {areaGroups.size === 0 ? (
            <View className="py-10 items-center">
              <Feather name="layers" size={28} color="#9CA3AF" />
              <Text className="text-gray-500 dark:text-gray-400 text-sm mt-2 text-center">
                No area groups yet. Assign an area group to a room first.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Select Area Group
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {Array.from(areaGroups.entries()).map(([group, rooms]) => {
                  const active = agGroup === group;
                  return (
                    <Pressable
                      key={group}
                      onPress={() => {
                        setAgGroup(group);
                        setAgInterval(
                          String(rooms[0]?.bookingInterval ?? 15),
                        );
                      }}
                      className={`px-3.5 py-2 rounded-lg border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          active ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {group} ({rooms.length})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {agGroup && (
                <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 mb-4">
                  <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                    Rooms in &quot;{agGroup}&quot;
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {(areaGroups.get(agGroup) ?? []).map((r) => (
                      <View
                        key={r.id}
                        className="bg-[#0644C7] px-2 py-0.5 rounded"
                      >
                        <Text className="text-[11px] font-medium text-white">
                          {r.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Booking Interval (minutes)
              </Text>
              <TextInput
                value={agInterval}
                onChangeText={setAgInterval}
                placeholder="15"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
              />
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
                Time gap required between bookings in this area group. Set to 0
                to allow simultaneous bookings.
              </Text>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={saveAreaGroup}
                  disabled={agSaving || !agGroup}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
                >
                  {agSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">
                      Update All Rooms
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setShowAreaGroup(false)}
                  className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Space;
