import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PackageActionsSheet } from "../../components/ui/PackageActionsSheet";
import { Pagination } from "../../components/ui/Pagination";
import {
  consumePackagesStale,
  markPackagesStale,
  usePackages,
} from "../../lib/hooks/usePackages";
import { getCurrentUser, getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import {
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
  const { packages, loading, error, refetch, applyStatus } = usePackages({
    kind: "custom",
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailPkg, setDetailPkg] = useState<PackageRow | null>(null);

  // Pick up changes made on the edit screen when this one regains focus.
  useEffect(() => {
    if (consumePackagesStale()) refetch();
  }, [refetch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packages;
    return packages.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        normalizeCategory(p.category).toLowerCase().includes(term) ||
        p.locationName.toLowerCase().includes(term),
    );
  }, [packages, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // A shrinking result set can leave the current page empty.
  useEffect(() => {
    setPage(1);
  }, [perPage, search]);

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
          err instanceof Error
            ? err.message
            : "Could not update package status.",
        );
      } finally {
        setTogglingId(null);
      }
    },
    [applyStatus],
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
                  err instanceof Error
                    ? err.message
                    : "Could not delete package.",
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
      {/* Header */}
      <View
        className="bg-white dark:bg-neutral-900 px-5 pb-4 border-b border-gray-100 dark:border-neutral-800"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Custom Packages
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Holiday, special, seasonal, and promotional packages
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.push("/packages/create-packages?type=custom")}
          className="mb-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3.5 active:opacity-90"
          accessibilityRole="button"
        >
          <Feather name="plus" size={16} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">
            New Custom Package
          </Text>
        </Pressable>

        <View className="mb-4 flex-row items-center rounded-xl border border-gray-200 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
          <Feather name="search" size={18} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search packages..."
            placeholderTextColor="#9CA3AF"
            className="ml-2 flex-1 py-2.5 text-sm text-gray-900 dark:text-white"
          />
          {!!search && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : error ? (
          <View className="items-center rounded-2xl bg-white p-8 dark:bg-neutral-900">
            <Feather name="alert-circle" size={28} color="#EF4444" />
            <Text className="mt-3 text-center text-sm text-gray-600 dark:text-gray-300">
              {error}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-4 rounded-xl bg-[#0644C7] px-5 py-2.5"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white">Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View className="items-center rounded-2xl bg-white p-10 dark:bg-neutral-900">
            <Feather name="package" size={28} color="#9CA3AF" />
            <Text className="mt-3 font-semibold text-gray-700 dark:text-gray-200">
              {search.trim() ? "No matches" : "No custom packages"}
            </Text>
            <Text className="mt-1 text-center text-sm text-gray-400 dark:text-gray-500">
              {search.trim()
                ? "Try a different search term."
                : "Holiday, seasonal and promotional packages appear here."}
            </Text>
          </View>
        ) : (
          <>
            <Text className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Showing {paged.length} of {filtered.length} custom package
              {filtered.length === 1 ? "" : "s"}
            </Text>

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

            <Text className="mb-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              Showing {paged.length} of {filtered.length} custom package
              {filtered.length === 1 ? "" : "s"}
            </Text>

            <Pagination
              page={page}
              perPage={perPage}
              total={filtered.length}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          </>
        )}
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
