import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { Pagination } from "../../components/ui/Pagination";
import { useDayOffs } from "../../lib/hooks/useDayOffs";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
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

const DayOffCard = ({
  dayOff,
  showLocation,
  canManage,
  onEdit,
  onDelete,
}: {
  dayOff: DayOff;
  showLocation: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between">
      <View className="flex-row items-center gap-2.5 flex-1">
        <View className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 items-center justify-center">
          <Feather name="calendar" size={18} color={PRIMARY} />
        </View>
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          {prettyDate(dayOff.date)}
        </Text>
      </View>
      {canManage && (
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
  </View>
);

type FormState = {
  id: number | null;
  date: string;
  reason: string;
  locationId: number | null;
  customHours: boolean;
  timeStart: string;
  timeEnd: string;
};

const emptyForm = (locationId: number | null): FormState => ({
  id: null,
  date: ymd(new Date()),
  reason: "",
  locationId,
  customHours: false,
  timeStart: "",
  timeEnd: "",
});

const DayOffs = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  const canManage = isCompanyAdmin || role === "location_manager";
  const ownLocationId = currentUser?.location_id ?? null;

  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "location" | "form" | "formLocation">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(ownLocationId));
  const [saving, setSaving] = useState(false);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [locationFilter, upcomingOnly, debouncedSearch, perPage]);

  const filters = useMemo<DayOffFilters>(
    () => ({
      search: debouncedSearch || undefined,
      locationId:
        isCompanyAdmin && locationFilter != null ? locationFilter : undefined,
      upcomingOnly,
    }),
    [debouncedSearch, isCompanyAdmin, locationFilter, upcomingOnly],
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

  const openCreate = useCallback(() => {
    setForm(emptyForm(isCompanyAdmin ? null : ownLocationId));
    setSheet("form");
  }, [isCompanyAdmin, ownLocationId]);

  const openEdit = useCallback((d: DayOff) => {
    setForm({
      id: d.id,
      date: d.date || ymd(new Date()),
      reason: d.reason ?? "",
      locationId: d.locationId,
      customHours: !!(d.timeStart || d.timeEnd),
      timeStart: d.timeStart ? d.timeStart.substring(0, 5) : "",
      timeEnd: d.timeEnd ? d.timeEnd.substring(0, 5) : "",
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

  const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;

  const saveForm = useCallback(async () => {
    if (form.locationId == null) {
      Alert.alert("Location required", "Please choose a location for this day off.");
      return;
    }
    if (form.customHours) {
      if (form.timeStart && !timeRe.test(form.timeStart)) {
        Alert.alert("Invalid time", "Start time must be in 24-hour HH:mm format.");
        return;
      }
      if (form.timeEnd && !timeRe.test(form.timeEnd)) {
        Alert.alert("Invalid time", "End time must be in 24-hour HH:mm format.");
        return;
      }
    }

    const payload: DayOffPayload = {
      location_id: form.locationId,
      date: form.date,
      reason: form.reason.trim() || null,
      time_start: form.customHours && form.timeStart ? form.timeStart : null,
      time_end: form.customHours && form.timeEnd ? form.timeEnd : null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, refetch]);

  const locationLabel =
    locationFilter == null
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ?? "Location");
  const formLocationLabel =
    form.locationId == null
      ? "Select location..."
      : (locations.find((l) => l.id === form.locationId)?.name ??
        currentUser?.location?.name ??
        `Location #${form.locationId}`);

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
          {canManage ? (
            <Pressable
              onPress={openCreate}
              className="bg-[#0644C7] p-2 rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Add day off"
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
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

          {/* Filters */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => setUpcomingOnly((v) => !v)}
              className={`flex-1 flex-row items-center gap-2 px-4 py-3.5 rounded-xl border ${
                upcomingOnly
                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                  : "bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800"
              }`}
            >
              <Feather
                name={upcomingOnly ? "check-square" : "square"}
                size={16}
                color={PRIMARY}
              />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Upcoming only
              </Text>
            </Pressable>

            {isCompanyAdmin && (
              <Pressable
                onPress={() => setSheet("location")}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
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
          </View>

          {/* List header */}
          {!loading && !error && (
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
                No day offs found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {canManage
                  ? "Add a blocked date to keep it off the booking calendar."
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
                    onEdit={() => openEdit(d)}
                    onDelete={() => confirmDelete(d)}
                  />
                ))}

                <Pagination
                  page={page}
                  perPage={perPage}
                  total={total}
                  options={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

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

          {/* Full day vs custom hours */}
          <Pressable
            onPress={() => setForm((f) => ({ ...f, customHours: !f.customHours }))}
            className="flex-row items-center gap-2 mb-4"
          >
            <Feather
              name={form.customHours ? "square" : "check-square"}
              size={18}
              color={PRIMARY}
            />
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Full day (block the entire day)
            </Text>
          </Pressable>

          {form.customHours && (
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Start (HH:mm)
                </Text>
                <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                  <TextInput
                    value={form.timeStart}
                    onChangeText={(t) => setForm((f) => ({ ...f, timeStart: t }))}
                    placeholder="09:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numbers-and-punctuation"
                    className="text-sm text-gray-900 dark:text-white"
                  />
                </View>
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  End (HH:mm)
                </Text>
                <View className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                  <TextInput
                    value={form.timeEnd}
                    onChangeText={(t) => setForm((f) => ({ ...f, timeEnd: t }))}
                    placeholder="17:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numbers-and-punctuation"
                    className="text-sm text-gray-900 dark:text-white"
                  />
                </View>
              </View>
            </View>
          )}
          {form.customHours && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4 -mt-2">
              Leave start blank for a delayed opening, or end blank to close early.
            </Text>
          )}

          <Pressable
            onPress={saveForm}
            disabled={saving}
            className={`h-14 flex-row items-center justify-center rounded-full bg-[#0644C7] active:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-semibold text-white">
                {form.id != null ? "Save Changes" : "Add Day Off"}
              </Text>
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
                  setForm((f) => ({ ...f, locationId: option.id }));
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
    </View>
  );
};

export default DayOffs;
