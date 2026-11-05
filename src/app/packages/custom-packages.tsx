import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { BackendOnlyBadge } from "../../components/ui/BackendOnly";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PackageActionsSheet } from "../../components/ui/PackageActionsSheet";
import { Pagination } from "../../components/ui/Pagination";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { PackagesListSkeleton } from "../../components/ui/skeleton/PackagesSkeleton";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import {
  consumePackagesStale,
  markPackagesStale,
  usePackages,
} from "../../lib/hooks/usePackages";
import {
  canChangeOnlineAvailability,
  ONLINE_NOT_APPLIED,
  onlineToggleDone,
  onlineToggleQuestion,
} from "../../lib/packages/onlineAvailability";
import { requestErrorMessage } from "../../lib/requestError";
import { getCurrentUser, getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import {
  deletePackage,
  setPackageOnlineAvailability,
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

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const ALL_TYPES = "All Types";

/** The More row: the custom-package screen's related modules. */
const MORE_SHORTCUTS: HubQuickLink[] = [
  { label: "Manage Packages", icon: "package", route: "/packages/packages" },
  { label: "Global Notes", icon: "file-text", route: "/packages/global-notes" },
  { label: "Special Pricing", icon: "percent", route: "/pricing/pricing" },
  { label: "Fee Supports", icon: "dollar-sign", route: "/pricing/fee-support" },
  { label: "Add-ons", icon: "coffee", route: "/packages/add-ons" },
];

/** "2025-12-13T…" -> "Dec 13, 2025". */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** One icon button in the card's action row. */
const IconAction = ({
  icon,
  label,
  tint,
  filled = false,
  busy = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  tint: string;
  /** Solid red button, used for Delete as on the web. */
  filled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`h-9 flex-1 items-center justify-center rounded-lg active:opacity-70 ${
      filled ? "bg-red-500" : "bg-gray-50 dark:bg-neutral-800"
    } ${busy ? "opacity-50" : ""}`}
  >
    {busy ? (
      <ActivityIndicator size="small" color={filled ? "#FFFFFF" : tint} />
    ) : (
      <Feather name={icon} size={16} color={filled ? "#FFFFFF" : tint} />
    )}
  </Pressable>
);

const CustomPackages = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  // Everything with a package_type other than "regular" — the inverse of the
  // /packages catalog, from the same endpoint.
  const { packages, loading, error, refetch, applyStatus, applyOnline } = usePackages({
    kind: "custom",
  });
  const canChangeOnline = canChangeOnlineAvailability(user?.role);
  const [onlineTogglingId, setOnlineTogglingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailPkg, setDetailPkg] = useState<PackageRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Pick up changes made on the edit screen when this one regains focus.
  useFocusEffect(
    useCallback(() => {
      if (consumePackagesStale()) refetch();
    }, [refetch]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // One chip per package type present (holiday, seasonal, …), with its count.
  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    packages.forEach((p) => {
      if (p.packageType) counts.set(p.packageType, (counts.get(p.packageType) ?? 0) + 1);
    });
    return Array.from(counts, ([type, count]) => ({ type, count })).sort((a, b) =>
      a.type.localeCompare(b.type),
    );
  }, [packages]);

  // A type that no longer has packages drops back to all of them.
  useEffect(() => {
    if (typeFilter !== ALL_TYPES && !typeOptions.some((t) => t.type === typeFilter)) {
      setTypeFilter(ALL_TYPES);
    }
  }, [typeFilter, typeOptions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return packages.filter(
      (p) =>
        (typeFilter === ALL_TYPES || p.packageType === typeFilter) &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          normalizeCategory(p.category).toLowerCase().includes(term) ||
          p.locationName.toLowerCase().includes(term)),
    );
  }, [packages, search, typeFilter]);

  const kpis = useMemo(() => {
    const total = packages.length;
    const active = packages.filter((p) => p.status === "active").length;
    const avgPrice =
      total > 0
        ? packages.reduce((sum, p) => sum + (Number(p.price) || 0), 0) / total
        : 0;
    const backendOnly = packages.filter((p) => p.availableOnline === false).length;
    return { total, active, inactive: total - active, avgPrice, backendOnly };
  }, [packages]);

  const showInitialLoader = loading && packages.length === 0;
  const showError = !loading && !!error && packages.length === 0;

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

  // A shrinking result set can leave the current page empty.
  useEffect(() => {
    setPage(1);
  }, [perPage, search, typeFilter]);

  /** Active <-> inactive, applied optimistically and reverted if the API says no. */
  const toggleStatus = useCallback(
    async (pkg: PackageRow) => {
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }
      const next = pkg.status !== "active";
      applyStatus(pkg.id, next);
      setTogglingId(pkg.id);
      try {
        const confirmed = await togglePackageStatus(token, pkg.id);
        applyStatus(pkg.id, confirmed);
        markPackagesStale();
      } catch (err) {
        applyStatus(pkg.id, !next);
        Alert.alert(
          "Update failed",
          requestErrorMessage(err, "Could not update package status."),
        );
      } finally {
        setTogglingId(null);
      }
    },
    [applyStatus],
  );

  /** Front-End Availability, confirmed first (web CustomPackages handleToggleOnline). */
  const toggleOnline = useCallback(
    (pkg: PackageRow) => {
      const makeBackendOnly = pkg.availableOnline !== false;
      const isActive = pkg.status === "active";
      const question = onlineToggleQuestion(pkg.name, makeBackendOnly, isActive);
      Alert.alert(question.title, question.message, [
        { text: "Cancel", style: "cancel" },
        {
          text: makeBackendOnly ? "Make backend only" : "Show online",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again.");
              return;
            }
            setOnlineTogglingId(pkg.id);
            try {
              const res = await setPackageOnlineAvailability(token, pkg.id, !makeBackendOnly);
              if (res.availableOnline !== !makeBackendOnly) {
                Alert.alert("Not changed", ONLINE_NOT_APPLIED);
                return;
              }
              applyOnline(pkg.id, res.availableOnline);
              Alert.alert("Saved", onlineToggleDone(pkg.name, res.availableOnline, isActive));
            } catch (err) {
              Alert.alert(
                "Update failed",
                err instanceof Error && err.message
                  ? err.message
                  : "Failed to update Front-End Availability. Please try again.",
              );
            } finally {
              setOnlineTogglingId(null);
            }
          },
        },
      ]);
    },
    [applyOnline],
  );

  const confirmDelete = useCallback(
    (pkg: PackageRow) => {
      Alert.alert(
        "Delete package?",
        `"${pkg.name}" will be removed. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) {
                Alert.alert("Not signed in", "Please sign in again.");
                return;
              }
              setDeletingId(pkg.id);
              try {
                await deletePackage(token, pkg.id);
                markPackagesStale();
                await refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  requestErrorMessage(err, "Could not delete package."),
                );
              } finally {
                setDeletingId(null);
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
      <View
        className="bg-white dark:bg-neutral-900 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800"
        style={{ paddingTop: insets.top + 8 }}
      >
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
            Custom Packages
          </Text>
          <Pressable
            onPress={() => router.push("/packages/create-packages?type=custom")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New custom package"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
            Holiday, special, seasonal, and promotional packages
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load custom packages"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <SummaryPanel
                figures={[
                  {
                    icon: "box",
                    title: "Custom Packages",
                    value: String(kpis.total),
                    hint: `${kpis.active} active`,
                  },
                  {
                    icon: "zap",
                    title: "Active",
                    value: String(kpis.active),
                    hint: `${kpis.inactive} inactive`,
                  },
                  {
                    icon: "dollar-sign",
                    title: "Avg. Price",
                    value: `$${kpis.avgPrice.toFixed(2)}`,
                    hint: "Per package",
                  },
                  {
                    icon: "eye-off",
                    title: "Backend Only",
                    value: String(kpis.backendOnly),
                    hint: "Hidden from the booking site",
                  },
                ]}
              />
            )
          )}

          {/* More — related modules as hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts title="More" links={MORE_SHORTCUTS} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 h-11 px-3.5 mt-4 mb-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search custom packages"
              placeholderTextColor="#9CA3AF"
              returnKeyType="search"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
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

          {/* Package type chips (holiday, seasonal, …). */}
          {typeOptions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 4, gap: 8 }}
              className="mb-4 -mx-1 px-1"
            >
              <FilterChip
                label={ALL_TYPES}
                selected={typeFilter === ALL_TYPES}
                onPress={() => setTypeFilter(ALL_TYPES)}
              />
              {typeOptions.map(({ type, count }) => (
                <FilterChip
                  key={type}
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                  count={count}
                  selected={typeFilter === type}
                  onPress={() => setTypeFilter(type)}
                />
              ))}
            </ScrollView>
          )}

          {!showInitialLoader && !showError && (
            <ListHeader title="All Custom Packages" count={filtered.length} />
          )}

          {/* Loading (first load) */}
          {showInitialLoader && <PackagesListSkeleton />}

          {/* Empty state */}
          {!showInitialLoader && !showError && filtered.length === 0 && (
            <ListEmptyState
              icon={packages.length === 0 ? "package" : "search"}
              title={packages.length === 0 ? "No custom packages yet" : "No packages found"}
              message={
                packages.length === 0
                  ? "Holiday, seasonal and promotional packages appear here."
                  : "No custom packages match your search or type."
              }
              {...(packages.length === 0
                ? {
                    actionLabel: "New Custom Package",
                    actionIcon: "plus" as const,
                    primary: true,
                    onAction: () => router.push("/packages/create-packages?type=custom"),
                  }
                : {
                    actionLabel: "Clear search & filters",
                    onAction: () => {
                      setSearch("");
                      setTypeFilter(ALL_TYPES);
                    },
                  })}
            />
          )}

          {/* Cards — kept exactly as they were. */}
          {!showInitialLoader && !showError && filtered.length > 0 && (
          <>
            {paged.map((pkg) => {
              const active = pkg.status === "active";
              return (
                <View
                  key={pkg.id}
                  className="mb-4 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
                  style={CARD_SHADOW}
                >
                  <View className="flex-row items-start gap-3">
                    <Text
                      className="flex-1 text-base font-bold uppercase text-gray-900 dark:text-white"
                      numberOfLines={2}
                    >
                      {pkg.name}
                    </Text>
                    {/* Power button — active/inactive, as on the web card. */}
                    <Pressable
                      onPress={() => toggleStatus(pkg)}
                      disabled={togglingId === pkg.id}
                      hitSlop={6}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={
                        active ? "Deactivate package" : "Activate package"
                      }
                      className={`h-9 w-9 items-center justify-center rounded-lg ${
                        active
                          ? "bg-emerald-50 dark:bg-emerald-900/25"
                          : "bg-gray-100 dark:bg-neutral-800"
                      }`}
                    >
                      {togglingId === pkg.id ? (
                        <ActivityIndicator size="small" color="#6B7280" />
                      ) : (
                        <Feather
                          name="power"
                          size={16}
                          color={active ? "#059669" : "#9CA3AF"}
                        />
                      )}
                    </Pressable>
                  </View>

                  <View className="mt-1.5 flex-row items-center gap-1.5">
                    <Feather name="map-pin" size={13} color="#9CA3AF" />
                    <Text
                      className="text-xs text-gray-500 dark:text-gray-400"
                      numberOfLines={1}
                    >
                      {pkg.locationName || "—"}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center gap-1.5">
                    <Feather name="calendar" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {shortDate(pkg.createdAt)}
                    </Text>
                  </View>

                  {!!pkg.description && (
                    <Text
                      className="mt-3 text-sm leading-5 text-gray-700 dark:text-gray-200"
                      numberOfLines={2}
                    >
                      {pkg.description}
                    </Text>
                  )}

                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {!!pkg.packageType && (
                      <View className="rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1 dark:border-rose-900/40 dark:bg-rose-900/20">
                        <Text className="text-xs font-medium capitalize text-rose-600 dark:text-rose-300">
                          {pkg.packageType}
                        </Text>
                      </View>
                    )}
                    {!!pkg.category && (
                      <View className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 dark:border-blue-800 dark:bg-blue-900/30">
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                          {normalizeCategory(pkg.category)}
                        </Text>
                      </View>
                    )}
                    {pkg.availableOnline === false && (
                      <BackendOnlyBadge isActive={active} />
                    )}
                    {!active && (
                      <View className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Inactive
                        </Text>
                      </View>
                    )}
                  </View>

                  <View className="mt-4 flex-row items-center justify-between border-t border-gray-100 pt-4 dark:border-neutral-800">
                    <Text className="text-xl font-bold text-gray-900 dark:text-white">
                      ${pkg.price.toFixed(2)}
                    </Text>
                    {pkg.capacity != null && (
                      <View className="flex-row items-center gap-1.5">
                        <Feather name="users" size={15} color="#9CA3AF" />
                        <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {pkg.capacity}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* View details / Edit / Delete */}
                  <View className="mt-3 flex-row items-center gap-2">
                    <IconAction
                      icon="eye"
                      label={`View details for ${pkg.name}`}
                      tint={PRIMARY}
                      onPress={() => setDetailPkg(pkg)}
                    />
                    <IconAction
                      icon="edit-2"
                      label={`Edit ${pkg.name}`}
                      tint={PRIMARY}
                      onPress={() =>
                        router.push(`/packages/edit-packages?id=${pkg.id}`)
                      }
                    />
                    {canChangeOnline && pkg.availableOnline !== null && (
                      <IconAction
                        icon={pkg.availableOnline === false ? "eye-off" : "globe"}
                        label={
                          pkg.availableOnline === false
                            ? `Show ${pkg.name} on the booking site`
                            : `Make ${pkg.name} backend only`
                        }
                        tint={pkg.availableOnline === false ? "#B45309" : PRIMARY}
                        busy={onlineTogglingId === pkg.id}
                        onPress={() => toggleOnline(pkg)}
                      />
                    )}
                    <IconAction
                      icon="trash-2"
                      label={`Delete ${pkg.name}`}
                      tint="#FFFFFF"
                      filled
                      busy={deletingId === pkg.id}
                      onPress={() => confirmDelete(pkg)}
                    />
                  </View>
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
          </>
          )}
        </View>
      </ScrollView>

      {/* Details (eye) — the same sheet the /packages catalog opens. */}
      <PackageActionsSheet
        visible={detailPkg !== null}
        pkg={detailPkg}
        initialMode="view"
        isCompanyAdmin={user?.role === "company_admin"}
        locationOptions={[]}
        onClose={() => setDetailPkg(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default CustomPackages;
