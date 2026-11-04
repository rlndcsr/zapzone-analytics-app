import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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

import { BackendOnlyBadge } from "../../components/ui/BackendOnly";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PackageActionsSheet } from "../../components/ui/PackageActionsSheet";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { PackagesListSkeleton } from "../../components/ui/skeleton/PackagesSkeleton";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Pagination } from "../../components/ui/Pagination";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  consumePackagesStale,
  markPackagesStale,
  usePackages,
} from "../../lib/hooks/usePackages";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  canChangeOnlineAvailability,
  importStayedOnlineNote,
  ONLINE_NOT_APPLIED,
  onlineToggleQuestion,
} from "../../lib/packages/onlineAvailability";
import { requestErrorMessage } from "../../lib/requestError";
import { getCurrentUser, getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import {
  bulkImportPackages,
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

/** Select-all checkbox — the same box the package cards use, so they match. */
const Checkbox = ({ checked }: { checked: boolean }) => (
  <View
    className={`w-5 h-5 rounded border items-center justify-center ${
      checked
        ? "bg-[#0644C7] border-[#0644C7]"
        : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
    }`}
  >
    {checked && <Feather name="check" size={13} color="#FFFFFF" />}
  </View>
);

const Packages = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";
  // Attendants see the setting but cannot change it (the server refuses them).
  const canChangeOnline = canChangeOnlineAvailability(getCurrentUser()?.role);

  // Location comes from the global workspace selector (shown at the top of the
  // screen), so the list follows the active location without a second control.
  const activeLocation = useActiveLocation();

  const { packages, loading, error, refetch, applyStatus, applyOnline } = usePackages();

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
  const [onlineTogglingId, setOnlineTogglingId] = useState<number | null>(null);
  const [backendOnlyFilter, setBackendOnlyFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Client-side pagination over the filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const [showSortSheet, setShowSortSheet] = useState(false);

  // Package whose sheet is open, and which content it opens on: the eye action
  // shows the details, the copy action goes straight to the duplicate form.
  const [actionsPkg, setActionsPkg] = useState<PackageRow | null>(null);
  const [actionsMode, setActionsMode] = useState<"view" | "duplicate">("view");
  // Card whose delete is in flight (spinner on that card's trash button).
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // In-flight "More" management action (spinner + lock in the sheet).
  const [busyAction, setBusyAction] = useState<
    null | "import" | "export" | "delete"
  >(null);
  // Held from the first tap on Import Packages until it settles, so a double
  // tap can't open the picker twice and import the file twice (web 8198ae3).
  const importingRef = useRef(false);

  // Filter options derived from the fetched data. Normalized on the way in, so
  // the escape-room difficulties ("Beginner", "Advanced", …) collapse into one
  // "Escape Room" chip instead of one chip each — as on the web.
  const categoryOptions = useMemo(
    () => [
      "All Categories",
      ...Array.from(
        new Set(
          packages.map((p) => normalizeCategory(p.category)).filter(Boolean),
        ),
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

  // "Backend only (N)" counts the workspace location's packages, as on the web.
  const backendOnlyCount = useMemo(
    () =>
      packages.filter(
        (p) =>
          p.availableOnline === false &&
          (activeLocation.id === "all" || p.locationName === activeLocation.name),
      ).length,
    [packages, activeLocation],
  );
  const backendOnlyFilterOn = backendOnlyFilter && backendOnlyCount > 0;

  useEffect(() => {
    if (backendOnlyCount === 0) setBackendOnlyFilter(false);
  }, [backendOnlyCount]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = packages.filter((p) => {
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query);
      // Both sides normalize, so the chip and the rows it selects still agree.
      const matchesCategory =
        category === "All Categories" ||
        normalizeCategory(p.category) === normalizeCategory(category);
      const matchesLocation =
        activeLocation.id === "all" || p.locationName === activeLocation.name;
      const matchesOnline = !backendOnlyFilterOn || p.availableOnline === false;
      return matchesSearch && matchesCategory && matchesLocation && matchesOnline;
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
        aValue = normalizeCategory(a.category).toLowerCase();
        bValue = normalizeCategory(b.category).toLowerCase();
      } else {
        // Display Order
        aValue = a.displayOrder;
        bValue = b.displayOrder;
      }
      return sortAsc ? (aValue > bValue ? 1 : -1) : aValue < bValue ? 1 : -1;
    });

    return result;
  }, [packages, search, category, activeLocation, sortKey, sortAsc, backendOnlyFilterOn]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the result set changes size / filters move.
  useEffect(() => {
    setPage(1);
  }, [search, category, activeLocation, sortKey, sortAsc, perPage, backendOnlyFilterOn]);

  // A new workspace location starts with nothing selected, so Delete Packages
  // can't act on packages the list no longer shows (web 8198ae3).
  useEffect(() => {
    setSelected({});
  }, [activeLocation.id]);

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
        requestErrorMessage(err, "Could not update package status."),
      );
    } finally {
      setTogglingId(null);
    }
  };

  // Front-End Availability via PATCH /api/packages/{id}/online-availability,
  // confirmed first (web Packages handleToggleOnline).
  const handleToggleOnline = (pkg: PackageRow) => {
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
            Alert.alert("Not signed in", "Please sign in again to update packages.");
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
  };

  /* --- Per-card actions (eye / pencil / copy / trash) --------------------- */

  const openDetails = (pkg: PackageRow) => {
    setActionsMode("view");
    setActionsPkg(pkg);
  };

  const openDuplicate = (pkg: PackageRow) => {
    setActionsMode("duplicate");
    setActionsPkg(pkg);
  };

  const goEditPackage = (pkg: PackageRow) => {
    router.push(`/packages/edit-packages?id=${pkg.id}`);
  };

  // DELETE /api/packages/{id} — same endpoint as the sheet's Delete, confirmed
  // first because it can't be undone.
  const confirmDeletePackage = (pkg: PackageRow) => {
    Alert.alert(
      "Delete package",
      `Delete "${pkg.name}"? This action cannot be undone.`,
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
              setSelected((prev) => {
                if (!prev[pkg.id]) return prev;
                const next = { ...prev };
                delete next[pkg.id];
                return next;
              });
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
    if (importingRef.current) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }
    importingRef.current = true;
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
      const listRefreshed = await refetch();
      // The import already happened, so a list that could not reload must not
      // read as a failed import — staff would import the file again (web 8198ae3).
      const refreshNote =
        listRefreshed || res.imported === 0
          ? ""
          : "\n\nThe list could not refresh. Pull down to reload it and see the imported packages - do not import the file again.";
      // The first few reasons, and any backend-only rows the server left online (web 4d165ce).
      const reasons = res.errors.slice(0, 3).join("\n");
      Alert.alert(
        "Import complete",
        `Imported ${res.imported} package(s)${
          res.failed ? `, ${res.failed} failed` : ""
        }.${reasons ? `\n\n${reasons}` : ""}${
          res.stayedOnline > 0 ? `\n\n${importStayedOnlineNote(res.stayedOnline)}` : ""
        }${refreshNote}`,
      );
    } catch (err) {
      Alert.alert(
        "Import failed",
        requestErrorMessage(
          err,
          "Error importing packages. Please check the format and try again.",
        ),
      );
    } finally {
      importingRef.current = false;
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
      // `p.category` is the stored value, never the normalized display one: the
      // export feeds the bulk import back, so normalizing here would rewrite a
      // stored "Advanced" to "Escape Room" and lose the difficulty.
      const rows = filtered.map((p) => ({
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        max_participants: p.capacity,
        min_booking_notice_hours: p.bufferHours,
        is_active: p.status === "active",
        // Round-trips through Import, which keeps a backend-only package so.
        ...(p.availableOnline === false ? { available_online: false } : {}),
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
              // Together rather than one round trip each; settled, so the list
              // is refreshed even when some fail — otherwise the ones already
              // deleted stay listed and selected, and a retry 404s on them.
              const results = await Promise.allSettled(
                selectedIds.map((id) => deletePackage(token, id)),
              );
              const failures = results.filter(
                (r): r is PromiseRejectedResult => r.status === "rejected",
              );
              const deleted = results.length - failures.length;
              setSelected({});
              markPackagesStale();
              await refetch().catch(() => {});
              if (failures.length === 0) {
                Alert.alert("Deleted", `${deleted} package(s) deleted.`);
              } else {
                Alert.alert(
                  "Delete failed",
                  `${deleted} of ${results.length} package(s) deleted. ${requestErrorMessage(
                    failures[0].reason,
                    "Could not delete the selected packages.",
                  )}`,
                );
              }
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // The web action menu, laid out as module-hub shortcuts like the Manage
  // Attractions "More" row. Fee Supports / Special Pricing / Global Notes open
  // their screens; Import / Export run inline and ignore taps while any bulk
  // action is running. Delete Packages moved to the selection bar.
  const whenIdle = (run: () => void) => () => {
    if (busyAction === null) run();
  };
  const moreShortcuts: HubQuickLink[] = [
    { label: "Fee Supports", icon: "dollar-sign", route: "/pricing/fee-support" },
    { label: "Special Pricing", icon: "percent", route: "/pricing/pricing" },
    { label: "Global Notes", icon: "file-text", route: "/packages/global-notes" },
    {
      label: busyAction === "import" ? "Importing…" : "Import Packages",
      icon: "upload",
      onPress: whenIdle(() => void runImport()),
    },
    {
      label: busyAction === "export" ? "Exporting…" : "Export Packages",
      icon: "download",
      onPress: whenIdle(() => void runExport()),
    },
  ];

  // Summary figures over the workspace location's packages (the same location
  // rule the list uses), like the Manage Attractions summary panel. The
  // backend-only figure is `backendOnlyCount`, which already scopes the same way.
  const kpis = useMemo(() => {
    const scoped = packages.filter(
      (p) =>
        activeLocation.id === "all" || p.locationName === activeLocation.name,
    );
    const total = scoped.length;
    const active = scoped.filter((p) => p.status === "active").length;
    const avgPrice =
      total > 0
        ? scoped.reduce((sum, p) => sum + (Number(p.price) || 0), 0) / total
        : 0;
    return { total, active, inactive: total - active, avgPrice };
  }, [packages, activeLocation]);

  const showInitialLoader = loading && packages.length === 0;
  const showError = !loading && !!error && packages.length === 0;

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
            Manage Packages
          </Text>
          <Pressable
            onPress={() => router.push("/packages/create-packages")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Create package"
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

          {/* Error state (nothing cached to show) */}
          {showError && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load packages
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
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                <View className="flex-row">
                  <SummaryCell
                    icon="package"
                    title="Total Packages"
                    value={String(kpis.total)}
                    hint={`${kpis.active} active`}
                  />
                  <SummaryCell
                    divideLeft
                    icon="zap"
                    title="Active"
                    value={String(kpis.active)}
                    hint={`${kpis.inactive} inactive`}
                  />
                </View>
                <View className="flex-row">
                  <SummaryCell
                    divideTop
                    icon="dollar-sign"
                    title="Avg. Price"
                    value={`$${kpis.avgPrice.toFixed(2)}`}
                    hint="Per package"
                  />
                  <SummaryCell
                    divideTop
                    divideLeft
                    icon="eye-off"
                    title="Backend Only"
                    value={String(backendOnlyCount)}
                    hint="Hidden from the booking site"
                  />
                </View>
              </View>
            )
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Sort (with its direction) */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search packages"
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
            <Pressable
              onPress={() => setShowSortSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${sortKey}`}
              className="flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 active:opacity-70"
            >
              <Feather name="sliders" size={15} color="#6B7280" />
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {sortKey}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSortAsc((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Toggle sort direction"
              className="w-11 h-11 rounded-xl items-center justify-center border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 active:opacity-70"
            >
              <Feather
                name={sortAsc ? "arrow-up" : "arrow-down"}
                size={15}
                color="#6B7280"
              />
            </Pressable>
          </View>

          {/* Category chips (+ Backend only), in the shared chip-row style. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {categoryOptions.map((cat) => {
              const isActive = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  className={`rounded-full border px-3.5 py-1.5 active:opacity-70 ${
                    isActive
                      ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-white dark:text-gray-900"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
            {backendOnlyCount > 0 && (
              <Pressable
                onPress={() => setBackendOnlyFilter((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ selected: backendOnlyFilterOn }}
                accessibilityHint="Packages customers cannot see or book online. Staff can still book them."
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-70 ${
                  backendOnlyFilterOn
                    ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Feather
                  name="eye-off"
                  size={13}
                  color={
                    backendOnlyFilterOn
                      ? scheme === "dark"
                        ? "#111827"
                        : "#FFFFFF"
                      : "#6B7280"
                  }
                />
                <Text
                  className={`text-sm font-medium ${
                    backendOnlyFilterOn
                      ? "text-white dark:text-gray-900"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  Backend only
                </Text>
                <Text
                  className={`text-sm ${
                    backendOnlyFilterOn
                      ? "text-white/70 dark:text-gray-900/60"
                      : "text-gray-400"
                  }`}
                >
                  {backendOnlyCount}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* List header — title + count, and select-all for the bulk delete. */}
          {!showInitialLoader && !showError && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  All Packages
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              {filtered.length > 0 && (
                <Pressable
                  onPress={toggleSelectAll}
                  hitSlop={6}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                  accessibilityLabel="Select all for bulk update"
                  className="flex-row items-center gap-2 h-9 px-3 rounded-xl bg-gray-100 dark:bg-neutral-800 active:opacity-70"
                >
                  <Checkbox checked={allSelected} />
                  <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    Select all
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Selection bar — shown while packages are ticked; Delete is the
              web's "Delete Packages" (it used to live in the More menu). */}
          {selectedIds.length > 0 && (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 mb-3">
              <View className="flex-row items-center gap-2">
                <View className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-xs font-bold text-white">
                    {selectedIds.length}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  selected
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => setSelected({})}
                  disabled={busyAction !== null}
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
                <Pressable
                  onPress={runDeleteSelected}
                  disabled={busyAction !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Delete selected packages"
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 active:opacity-70 ${
                    busyAction !== null && busyAction !== "delete"
                      ? "opacity-50"
                      : ""
                  }`}
                >
                  {busyAction === "delete" ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <Feather name="trash-2" size={14} color="#DC2626" />
                  )}
                  <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Loading (first load) */}
          {showInitialLoader && <PackagesListSkeleton />}

          {/* Cards */}
          {!showInitialLoader && !showError && (
            <View className="mt-4 gap-4">
              {paged.map((pkg) => {
                const isSelected = !!selected[pkg.id];
                const isActive = pkg.status === "active";
                const dateLabel = formatDate(pkg.createdAt);
                return (
                  // The card is static: every action lives in the row below, so
                  // nothing happens on a stray tap.
                  <View
                    key={pkg.id}
                    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                    style={CARD_SHADOW}
                  >
                    {/* Top row */}
                    <View className="flex-row items-start justify-between">
                      <View className="flex-row items-start gap-2.5 flex-1 mr-2">
                        <Pressable
                          onPress={() => toggleSelected(pkg.id)}
                          hitSlop={6}
                          style={{ marginTop: 1 }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={`Select ${pkg.name}`}
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
                    <View className="flex-row flex-wrap items-center gap-2 mt-3">
                      <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
                        <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                          {normalizeCategory(pkg.category)}
                        </Text>
                      </View>
                      {pkg.availableOnline === false && (
                        <BackendOnlyBadge isActive={isActive} />
                      )}
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

                    {/* Actions: See details / Edit / Duplicate / Delete */}
                    <View className="flex-row items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-neutral-800">
                      <Pressable
                        onPress={() => openDetails(pkg)}
                        className="flex-1 items-center py-2.5 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                        accessibilityRole="button"
                        accessibilityLabel={`See details for ${pkg.name}`}
                      >
                        <Feather name="eye" size={18} color={PRIMARY} />
                      </Pressable>
                      <Pressable
                        onPress={() => goEditPackage(pkg)}
                        className="flex-1 items-center py-2.5 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${pkg.name}`}
                      >
                        <Feather name="edit-2" size={18} color={PRIMARY} />
                      </Pressable>
                      {canChangeOnline && pkg.availableOnline !== null && (
                        <Pressable
                          onPress={() => handleToggleOnline(pkg)}
                          disabled={onlineTogglingId === pkg.id}
                          className={`flex-1 items-center py-2.5 rounded-xl ${
                            pkg.availableOnline === false
                              ? "active:bg-amber-50 dark:active:bg-amber-900/20"
                              : "active:bg-gray-50 dark:active:bg-neutral-800"
                          } ${onlineTogglingId === pkg.id ? "opacity-50" : ""}`}
                          accessibilityRole="button"
                          accessibilityLabel={
                            pkg.availableOnline === false
                              ? `Show ${pkg.name} on the booking site`
                              : `Make ${pkg.name} backend only`
                          }
                        >
                          {onlineTogglingId === pkg.id ? (
                            <ActivityIndicator size="small" color={PRIMARY} />
                          ) : (
                            <Feather
                              name={pkg.availableOnline === false ? "eye-off" : "globe"}
                              size={18}
                              color={pkg.availableOnline === false ? "#B45309" : PRIMARY}
                            />
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => openDuplicate(pkg)}
                        className="flex-1 items-center py-2.5 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
                        accessibilityRole="button"
                        accessibilityLabel={`Duplicate ${pkg.name}`}
                      >
                        <Feather name="copy" size={18} color={PRIMARY} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeletePackage(pkg)}
                        disabled={deletingId === pkg.id}
                        className={`flex-1 items-center py-2.5 rounded-xl bg-red-600 ${
                          deletingId === pkg.id
                            ? "opacity-60"
                            : "active:opacity-90"
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${pkg.name}`}
                      >
                        {deletingId === pkg.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Feather name="trash-2" size={18} color="#FFFFFF" />
                        )}
                      </Pressable>
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
            </View>
          )}

          {/* Empty state */}
          {!showInitialLoader && !showError && filtered.length === 0 && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={packages.length === 0 ? "package" : "search"}
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {packages.length === 0 ? "No packages yet" : "No packages found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {packages.length === 0
                  ? "There are no packages for this account yet."
                  : backendOnlyFilterOn
                    ? "No backend-only packages match your filters."
                    : "No packages match your filters."}
              </Text>
              {packages.length === 0 ? (
                <Pressable
                  onPress={() => router.push("/packages/create-packages")}
                  className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Create Package
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setCategory("All Categories");
                    setBackendOnlyFilter(false);
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
          )}
        </View>
      </ScrollView>

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

      {/* Details (eye) / Duplicate (copy) — Edit and Delete run from the card. */}
      <PackageActionsSheet
        visible={actionsPkg !== null}
        pkg={actionsPkg}
        initialMode={actionsMode}
        isCompanyAdmin={isCompanyAdmin}
        locationOptions={locationObjOptions}
        onClose={() => setActionsPkg(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default Packages;
