import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { PackageActionsSheet } from "../../components/ui/PackageActionsSheet";
import { PackagesListSkeleton } from "../../components/ui/skeleton/PackagesSkeleton";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Pagination } from "../../components/ui/Pagination";
import {
  consumePackagesStale,
  markPackagesStale,
  usePackages,
} from "../../lib/hooks/usePackages";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  bulkImportPackages,
  deletePackage,
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

  // Location comes from the global workspace selector (shown at the top of the
  // screen), so the list follows the active location without a second control.
  const activeLocation = useActiveLocation();

  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const { packages, loading, error, refetch, applyStatus } = usePackages();

  // Refetch when returning to the list after a create/edit/duplicate/delete
  // elsewhere marked the cache stale (mirrors Bookings/Attractions).
  useFocusEffect(
    useCallback(() => {
      if (consumePackagesStale()) refetch();
    }, [refetch]),
  );

  // Package list state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [sortKey, setSortKey] = useState<SortKey>("Name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Client-side pagination over the filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [showSortSheet, setShowSortSheet] = useState(false);

  // Package whose per-card actions sheet (View / Edit / Duplicate / Delete) is open.
  const [actionsPkg, setActionsPkg] = useState<PackageRow | null>(null);

  // In-flight "More" management action (spinner + lock in the sheet).
  const [busyAction, setBusyAction] = useState<
    null | "import" | "export" | "delete"
  >(null);

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
  // {id,name} locations derived from the loaded list — feeds the Duplicate
  // destination picker without calling the heavy /api/locations endpoint.
  const locationObjOptions = useMemo(() => {
    const byId = new Map<number, string>();
    packages.forEach((p) => {
      if (p.locationId != null && !byId.has(p.locationId)) {
        byId.set(p.locationId, p.locationName || `Location ${p.locationId}`);
      }
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [packages]);

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
        activeLocation.id === "all" || p.locationName === activeLocation.name;
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
  }, [packages, search, category, activeLocation, sortKey, sortAsc]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the result set changes size / filters move.
  useEffect(() => {
    setPage(1);
  }, [search, category, activeLocation, sortKey, sortAsc, perPage]);

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

  // Ids of the currently checked cards (for bulk delete).
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[Number(k)]).map(Number),
    [selected],
  );

  // The location new/imported packages belong to — the active workspace
  // location, else the manager's own location.
  const importLocationId =
    typeof activeLocation.id === "number"
      ? activeLocation.id
      : (getCurrentUser()?.location_id ?? null);

  // ---- Import Packages (JSON, mirrors the web bulk-import) ----------------
  const runImport = useCallback(async () => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const text = await (await fetch(asset.uri)).text();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        Alert.alert("Invalid JSON", "The selected file isn't valid JSON.");
        return;
      }
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { packages?: unknown }).packages)
          ? (parsed as { packages: unknown[] }).packages
          : null;
      if (!arr || arr.length === 0) {
        Alert.alert("Nothing to import", "Expected a JSON array of packages.");
        return;
      }
      if (importLocationId == null) {
        Alert.alert(
          "Select a location",
          "Switch the workspace to a specific location before importing.",
        );
        return;
      }

      setBusyAction("import");
      const res = await bulkImportPackages(
        token,
        arr as Record<string, unknown>[],
        importLocationId,
      );
      markPackagesStale();
      await refetch();
      setShowMoreSheet(false);
      Alert.alert(
        "Import complete",
        `Imported ${res.imported} package(s)${
          res.failed ? `, ${res.failed} failed` : ""
        }.`,
      );
    } catch (err) {
      Alert.alert(
        "Import failed",
        err instanceof Error ? err.message : "Could not import packages.",
      );
    } finally {
      setBusyAction(null);
    }
  }, [importLocationId, refetch]);

  // ---- Export Packages (client-side JSON, mirrors the web) ----------------
  const runExport = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no packages to export.");
      return;
    }
    setBusyAction("export");
    try {
      const rows = filtered.map((p) => ({
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        max_participants: p.capacity,
        min_booking_notice_hours: p.bufferHours,
        is_active: p.status === "active",
        display_order: p.displayOrder,
      }));
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const stamp = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}zapzone-packages-${stamp}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(rows, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          dialogTitle: "Export Packages",
          UTI: "public.json",
        });
      } else {
        Alert.alert("Export ready", `Saved to ${uri}`);
      }
      setShowMoreSheet(false);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export packages.",
      );
    } finally {
      setBusyAction(null);
    }
  }, [filtered]);

  // ---- Delete selected packages (no bulk endpoint → per-id soft delete) ---
  const runDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      Alert.alert(
        "No packages selected",
        "Select one or more packages first, then choose Delete Packages.",
      );
      return;
    }
    Alert.alert(
      "Delete packages",
      `Delete ${selectedIds.length} selected package(s)? They can be restored from the web trash.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setBusyAction("delete");
            try {
              for (const id of selectedIds) await deletePackage(token, id);
              setSelected({});
              markPackagesStale();
              await refetch();
              setShowMoreSheet(false);
              Alert.alert("Deleted", `${selectedIds.length} package(s) deleted.`);
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the selected packages.",
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // "More" management actions (mirrors the web action menu). Fee Supports /
  // Special Pricing / Global Notes navigate to their screens; the rest run
  // inline.
  const moreActions: {
    label: string;
    icon: ComponentIconName;
    onPress: () => void;
    busyKey?: "import" | "export" | "delete";
    danger?: boolean;
    badge?: string;
  }[] = [
    {
      label: "Fee Supports",
      icon: "dollar-sign",
      onPress: () => {
        setShowMoreSheet(false);
        router.push("/pricing/fee-support");
      },
    },
    {
      label: "Special Pricing",
      icon: "percent",
      onPress: () => {
        setShowMoreSheet(false);
        router.push("/pricing/pricing");
      },
    },
    {
      label: "Global Notes",
      icon: "file-text",
      onPress: () => {
        setShowMoreSheet(false);
        router.push("/packages/global-notes");
      },
    },
    { label: "Import Packages", icon: "upload", onPress: runImport, busyKey: "import" },
    { label: "Export Packages", icon: "download", onPress: runExport, busyKey: "export" },
    {
      label: "Delete Packages",
      icon: "trash-2",
      onPress: runDeleteSelected,
      busyKey: "delete",
      danger: true,
      badge: selectedIds.length > 0 ? String(selectedIds.length) : undefined,
    },
  ];

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
        <View className="px-5 mt-5">
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-5">
            <LocationWorkspaceSelector />
          </View>

          <View className="flex-row items-stretch gap-3 mb-5">
            {/* Space Schedule Card */}
            <Pressable
              onPress={() => router.push("/packages/custom-packages")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="package" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Custom Packages
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                View all custom packages and their details
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>

            {/* Onsite Purchase Card */}
            <Pressable
              onPress={() => router.push("/packages/gift-cards")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="gift" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Gift Cards
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                Manage and view all your gift cards
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View all
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>
          </View>

          {/* Catalog sub-features (Space · Add-ons · Promos) — compact list rows
              so the section stays balanced regardless of item count. */}
          <View className="gap-3 mb-2">
            {[
              {
                label: "Space",
                desc: "Rooms & availability",
                icon: "home" as const,
                route: "/packages/space",
              },
              {
                label: "Add-ons",
                desc: "Food, beverage & extras",
                icon: "coffee" as const,
                route: "/packages/add-ons",
              },
              {
                label: "Promos",
                desc: "Promotional codes",
                icon: "tag" as const,
                route: "/packages/promos",
              },
            ].map((item) => (
              <Pressable
                key={item.route}
                onPress={() => router.push(item.route as never)}
                className="flex-row items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
                style={{
                  shadowColor: "#424242",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 6,
                  elevation: 1,
                }}
              >
                <View className="w-11 h-11 rounded-xl bg-[#0644C7]/10 items-center justify-center">
                  <Feather name={item.icon} size={20} color="#0644C7" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    {item.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                  >
                    {item.desc}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#0644C7" />
              </Pressable>
            ))}
          </View>

          {/* Create Package (mirrors the web header controls) */}
          <Pressable
            onPress={() => router.push("/packages/create-packages")}
            className="flex-1 flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90"
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

          {/* Controls — full-width segmented pill (More · Sort) with a compact
              sort-direction toggle. Location is set via the global workspace
              selector at the top of the screen. */}
          <View className="mt-3">
            <FilterPill>
              <PillSegment
                label="More"
                active={showMoreSheet}
                onPress={() => setShowMoreSheet(true)}
                renderIcon={(c) => (
                  <Feather name="more-horizontal" size={15} color={c} />
                )}
              />
              <PillSegment
                label={`Sort: ${sortKey}`}
                active={showSortSheet}
                onPress={() => setShowSortSheet(true)}
                renderIcon={(c) => <Feather name="sliders" size={15} color={c} />}
              />
              <Pressable
                onPress={() => setSortAsc((v) => !v)}
                className="px-3 py-2.5 rounded-xl items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Toggle sort direction"
              >
                <Feather
                  name={sortAsc ? "arrow-up" : "arrow-down"}
                  size={15}
                  color="#6B7280"
                />
              </Pressable>
            </FilterPill>
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
            Showing {filtered.length} packages
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
              {paged.map((pkg) => {
                const isSelected = !!selected[pkg.id];
                const isActive = pkg.status === "active";
                const dateLabel = formatDate(pkg.createdAt);
                return (
                  <Pressable
                    key={pkg.id}
                    onPress={() => setActionsPkg(pkg)}
                    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 active:opacity-90"
                    style={CARD_SHADOW}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${pkg.name}`}
                  >
                    {/* Top row */}
                    <View className="flex-row items-start justify-between">
                      <View className="flex-row items-start gap-2.5 flex-1 mr-2">
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

                      <View className="flex-row items-center gap-2">
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

                        {/* Per-card actions: View / Edit / Duplicate / Delete */}
                        <Pressable
                          onPress={() => setActionsPkg(pkg)}
                          hitSlop={6}
                          className="w-8 h-8 rounded-lg items-center justify-center bg-gray-100 dark:bg-neutral-800"
                          accessibilityRole="button"
                          accessibilityLabel="Package actions"
                        >
                          <Feather
                            name="more-vertical"
                            size={16}
                            color="#6B7280"
                          />
                        </Pressable>
                      </View>
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
                  </Pressable>
                );
              })}
              <Pagination
                page={page}
                perPage={perPage}
                total={filtered.length}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
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

        </View>
      </ScrollView>

      {/* More actions (matches the web action menu; wired in a future release) */}
      <BottomSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        title="More"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {moreActions.map((action) => {
            const busy = action.busyKey != null && busyAction === action.busyKey;
            const locked = busyAction !== null;
            return (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={locked}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  action.danger
                    ? "active:bg-red-50 dark:active:bg-red-900/20"
                    : "active:bg-gray-50 dark:active:bg-neutral-800"
                } ${locked && !busy ? "opacity-40" : ""}`}
              >
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                  {busy ? (
                    <ActivityIndicator
                      size="small"
                      color={action.danger ? "#EF4444" : PRIMARY}
                    />
                  ) : (
                    <Feather
                      name={action.icon}
                      size={18}
                      color={action.danger ? "#EF4444" : "#6B7280"}
                    />
                  )}
                  <Text
                    className={`text-base font-medium ${
                      action.danger
                        ? "text-red-600"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {action.label}
                  </Text>
                </View>
                {action.badge ? (
                  <View className="bg-[#0644C7] rounded-full min-w-5 h-5 px-1.5 items-center justify-center">
                    <Text className="text-[11px] font-bold text-white">
                      {action.badge}
                    </Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={16} color="#9CA3AF" />
                )}
              </Pressable>
            );
          })}
          <Text className="text-xs text-gray-400 dark:text-gray-500 px-4 mt-2">
            Delete Packages removes the packages you&apos;ve selected on the list.
          </Text>
        </ScrollView>
      </BottomSheet>

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

      {/* Per-card actions: View / Edit / Duplicate / Delete */}
      <PackageActionsSheet
        visible={actionsPkg !== null}
        pkg={actionsPkg}
        isCompanyAdmin={isCompanyAdmin}
        locationOptions={locationObjOptions}
        onClose={() => setActionsPkg(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default Packages;
