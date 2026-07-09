import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { PackagesListSkeleton } from "../../components/ui/skeleton/PackagesSkeleton";
import { usePackages } from "../../lib/hooks/usePackages";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  togglePackageStatus,
  type PackageRow,
} from "../../services/packagesService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
const DEFAULT_VISIBLE = 5;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

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

/** Format an ISO timestamp as "Jul 1, 2026"; null when unparseable/absent. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Sort options mirror the web /packages dropdown exactly (Name / Price /
// Category / Display Order). "Date" is not a web option and was removed.
type SortKey = "Name" | "Price" | "Category" | "Display Order";
const SORT_KEYS: SortKey[] = ["Name", "Price", "Category", "Display Order"];

const Packages = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const { packages, loading, error, refetch, applyStatus } = usePackages();

  // Package list state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [location, setLocation] = useState("All Locations");
  const [sortKey, setSortKey] = useState<SortKey>("Name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

  // Animation values
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Floating animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateYValue, {
          toValue: -10,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(translateYValue, {
          toValue: 0,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [spinValue, pulseValue, translateYValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Mirrors the web "More" action menu; these management actions arrive in a
  // future release, so they're shown but not yet actionable.
  const moreActions: { label: string; icon: ComponentIconName }[] = [
    { label: "Fee Supports", icon: "dollar-sign" },
    { label: "Special Pricing", icon: "percent" },
    { label: "Global Notes", icon: "file-text" },
    { label: "Import Packages", icon: "upload" },
    { label: "Export Packages", icon: "download" },
    { label: "Delete Packages", icon: "trash-2" },
  ];

  // Filter options derived from the fetched data.
  const categoryOptions = useMemo(
    () => [
      "All Categories",
      ...Array.from(
        new Set(packages.map((p) => p.category).filter(Boolean)),
      ).sort(),
    ],
    [packages],
  );
  const locationOptions = useMemo(
    () => [
      "All Locations",
      ...Array.from(
        new Set(packages.map((p) => p.locationName).filter(Boolean)),
      ).sort(),
    ],
    [packages],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = packages.filter((p) => {
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query);
      const matchesCategory =
        category === "All Categories" || p.category === category;
      const matchesLocation =
        location === "All Locations" || p.locationName === location;
      return matchesSearch && matchesCategory && matchesLocation;
    });

    // Mirrors the web /packages sort: strings compare lowercased, price/display
    // order numeric, and direction flips the >/< test (not a negated diff).
    result.sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";
      if (sortKey === "Name") {
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
      } else if (sortKey === "Price") {
        aValue = Number(a.price) || 0;
        bValue = Number(b.price) || 0;
      } else if (sortKey === "Category") {
        aValue = a.category.toLowerCase();
        bValue = b.category.toLowerCase();
      } else {
        // Display Order
        aValue = a.displayOrder;
        bValue = b.displayOrder;
      }
      return sortAsc ? (aValue > bValue ? 1 : -1) : aValue < bValue ? 1 : -1;
    });

    return result;
  }, [packages, search, category, location, sortKey, sortAsc]);

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const allSelected =
    filtered.length > 0 && filtered.every((p) => selected[p.id]);

  const toggleSelected = (id: number) =>
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(filtered.map((p) => [p.id, true])));
    }
  };

  // Activate / deactivate via PATCH /api/packages/{id}/toggle-status.
  // Optimistically flip the card, then reconcile with the server's response.
  const handleToggleActive = async (pkg: PackageRow) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to update packages.");
      return;
    }
    const next = pkg.status !== "active";
    applyStatus(pkg.id, next);
    setTogglingId(pkg.id);
    try {
      const confirmed = await togglePackageStatus(token, pkg.id);
      applyStatus(pkg.id, confirmed);
    } catch (err) {
      applyStatus(pkg.id, !next); // revert on failure
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update package status.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const showInitialLoader = loading && packages.length === 0;
  const showError = !loading && !!error && packages.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header - Unchanged */}
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
            Packages
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
        <View className="px-5">
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Packages Overview
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Browse all packages and their details
            </Text>
          </View>
          {/* Overview intro */}
          <Pressable
            onPress={() => router.push("/packages/custom-packages")}
            className="flex-row items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-5 shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="w-10 h-10 rounded-xl bg-[#0644C7]/10 items-center justify-center">
              <Feather name="package" size={18} color={PRIMARY} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                Custom Packages
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                View all custom packages and their details.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </Pressable>

          {/* More + Create Package (mirrors the web header controls) */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => setShowMoreSheet(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="more-horizontal" size={16} color="#6B7280" />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                More
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => router.push("/packages/create-packages")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Create package"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text
                className="text-xs font-semibold text-white"
                numberOfLines={1}
              >
                Create Package
              </Text>
            </Pressable>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search packages..."
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

          {/* Location + Sort controls. Location selector is company-admin only;
              hidden for other roles (backend-scoped), so Sort fills the row. */}
          <View className="flex-row items-center gap-2 mt-3">
            {isCompanyAdmin && (
              <Pressable
                onPress={() => setShowLocationSheet(true)}
                className="flex-1 flex-row items-center justify-between gap-2 bg-white dark:bg-neutral-900 px-3.5 py-3 rounded-xl border border-gray-200 dark:border-neutral-800"
              >
                <Text
                  className="text-sm text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  {location}
                </Text>
                <Feather name="chevron-down" size={16} color="#9CA3AF" />
              </Pressable>
            )}

            <Pressable
              onPress={() => setShowSortSheet(true)}
              className="flex-1 flex-row items-center justify-between gap-2 bg-white dark:bg-neutral-900 px-3.5 py-3 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Text
                className="text-sm text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Sort: {sortKey}
              </Text>
              <Feather name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSortAsc((v) => !v)}
              className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-gray-200 dark:border-neutral-800"
              accessibilityRole="button"
              accessibilityLabel="Toggle sort direction"
            >
              <Feather
                name={sortAsc ? "arrow-up" : "arrow-down"}
                size={16}
                color="#6B7280"
              />
            </Pressable>
          </View>

          {/* Category chips */}
          <View className="flex-row flex-wrap gap-2 mt-4">
            {categoryOptions.map((cat) => {
              const isActive = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-lg border ${
                    isActive
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-white"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Count */}
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Showing {visible.length} of {filtered.length} packages
          </Text>

          {/* Select all */}
          <Pressable
            onPress={toggleSelectAll}
            className="flex-row items-center gap-2.5 mt-3 mb-1"
          >
            <View
              className={`w-5 h-5 rounded border items-center justify-center ${
                allSelected
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
              }`}
            >
              {allSelected && (
                <Feather name="check" size={13} color="#FFFFFF" />
              )}
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Select all for bulk update
            </Text>
          </Pressable>

          {/* Loading (first load) */}
          {showInitialLoader && <PackagesListSkeleton />}

          {/* Error (nothing cached to show) */}
          {showError && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={onRefresh}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Cards */}
          {!showInitialLoader && !showError && (
            <View className="mt-4 gap-4">
              {visible.map((pkg) => {
                const isSelected = !!selected[pkg.id];
                const isActive = pkg.status === "active";
                const dateLabel = formatDate(pkg.createdAt);
                return (
                  <View
                    key={pkg.id}
                    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                    style={CARD_SHADOW}
                  >
                    {/* Top row */}
                    <View className="flex-row items-start justify-between">
                      <View className="flex-row items-start gap-2.5 flex-1 mr-2">
                        <Feather
                          name="menu"
                          size={16}
                          color="#D1D5DB"
                          style={{ marginTop: 3 }}
                        />
                        <Pressable
                          onPress={() => toggleSelected(pkg.id)}
                          hitSlop={6}
                          style={{ marginTop: 1 }}
                        >
                          <View
                            className={`w-5 h-5 rounded border items-center justify-center ${
                              isSelected
                                ? "bg-[#0644C7] border-[#0644C7]"
                                : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
                            }`}
                          >
                            {isSelected && (
                              <Feather name="check" size={13} color="#FFFFFF" />
                            )}
                          </View>
                        </Pressable>
                        <Text className="text-base font-bold text-gray-900 dark:text-white flex-1">
                          {pkg.name}
                        </Text>
                      </View>

                      {/* Activate / deactivate */}
                      <Pressable
                        onPress={() => handleToggleActive(pkg)}
                        disabled={togglingId === pkg.id}
                        className={`w-8 h-8 rounded-lg items-center justify-center ${
                          isActive
                            ? "bg-green-100 dark:bg-green-900/40"
                            : "bg-gray-100 dark:bg-neutral-800"
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isActive ? "Deactivate package" : "Activate package"
                        }
                      >
                        {togglingId === pkg.id ? (
                          <ActivityIndicator
                            size="small"
                            color={isActive ? "#16A34A" : "#9CA3AF"}
                          />
                        ) : (
                          <Feather
                            name="power"
                            size={16}
                            color={isActive ? "#16A34A" : "#9CA3AF"}
                          />
                        )}
                      </Pressable>
                    </View>

                    {/* Location */}
                    {!!pkg.locationName && (
                      <View className="flex-row items-center gap-1.5 mt-3">
                        <Feather name="map-pin" size={13} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {pkg.locationName}
                        </Text>
                      </View>
                    )}

                    {/* Date */}
                    {!!dateLabel && (
                      <View className="flex-row items-center gap-1.5 mt-1.5">
                        <Feather name="calendar" size={13} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {dateLabel}
                        </Text>
                      </View>
                    )}

                    {/* Description */}
                    {!!pkg.description && (
                      <Text
                        className="text-sm text-gray-700 dark:text-gray-200 mt-3 leading-5"
                        numberOfLines={2}
                      >
                        {pkg.description}
                      </Text>
                    )}

                    {/* Tags */}
                    <View className="flex-row items-center gap-2 mt-3">
                      <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                          {pkg.category}
                        </Text>
                      </View>
                      {pkg.bufferHours != null && (
                        <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                          <Feather name="clock" size={11} color={PRIMARY} />
                          <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                            {pkg.bufferHours}h buffer
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Price + capacity */}
                    <View className="flex-row items-center justify-between mt-4">
                      <Text className="text-xl font-bold text-gray-900 dark:text-white">
                        ${pkg.price.toFixed(2)}
                      </Text>
                      {pkg.capacity != null && (
                        <View className="flex-row items-center gap-1.5">
                          <Feather name="users" size={14} color="#9CA3AF" />
                          <Text className="text-sm text-gray-500 dark:text-gray-400">
                            {pkg.capacity}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty state */}
          {!showInitialLoader && !showError && filtered.length === 0 && (
            <View className="items-center py-12">
              <Feather name="package" size={40} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                {packages.length === 0
                  ? "No packages yet"
                  : "No packages match your filters"}
              </Text>
            </View>
          )}

          {/* See all / Show less */}
          {filtered.length > DEFAULT_VISIBLE && (
            <Pressable
              onPress={() => setShowAll((v) => !v)}
              className="flex-row items-center justify-center gap-2 mt-5 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <Text className="text-sm font-semibold text-[#0644C7]">
                {showAll ? "Show less" : `See all ${filtered.length} cards`}
              </Text>
              <Feather
                name={showAll ? "chevron-up" : "chevron-down"}
                size={16}
                color={PRIMARY}
              />
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* More actions (matches the web action menu; wired in a future release) */}
      <BottomSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        title="More"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {moreActions.map((action) => (
            <View
              key={action.label}
              className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 opacity-60"
            >
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <Feather name={action.icon} size={18} color="#6B7280" />
                <Text className="text-base font-medium text-gray-700 dark:text-gray-200">
                  {action.label}
                </Text>
              </View>
              <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Soon
                </Text>
              </View>
            </View>
          ))}
          <Text className="text-xs text-gray-400 dark:text-gray-500 px-4 mt-2">
            Management actions arrive in a future update.
          </Text>
        </ScrollView>
      </BottomSheet>

      {/* Location picker (company-admin only) */}
      {isCompanyAdmin && (
        <BottomSheet
          visible={showLocationSheet}
          onClose={() => setShowLocationSheet(false)}
          title="Location"
        >
          <View className="px-4 pb-6">
            {locationOptions.map((loc) => {
              const isActive = location === loc;
              return (
                <Pressable
                  key={loc}
                  onPress={() => {
                    setLocation(loc);
                    setShowLocationSheet(false);
                  }}
                  className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1"
                >
                  <Text
                    className={`text-base ${
                      isActive
                        ? "font-semibold text-[#0644C7]"
                        : "font-medium text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {loc}
                  </Text>
                  {isActive && (
                    <Feather name="check" size={18} color={PRIMARY} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </BottomSheet>
      )}

      {/* Sort picker */}
      <BottomSheet
        visible={showSortSheet}
        onClose={() => setShowSortSheet(false)}
        title="Sort by"
      >
        <View className="px-4 pb-6">
          {SORT_KEYS.map((key) => {
            const isActive = sortKey === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setSortKey(key);
                  setShowSortSheet(false);
                }}
                className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1"
              >
                <Text
                  className={`text-base ${
                    isActive
                      ? "font-semibold text-[#0644C7]"
                      : "font-medium text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {key}
                </Text>
                {isActive && <Feather name="check" size={18} color={PRIMARY} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
};

export default Packages;
