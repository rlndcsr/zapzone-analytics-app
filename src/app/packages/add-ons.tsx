import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import { AttractionsListSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
} from "../../components/ui/SummaryPanel";
import {
  createAddOn,
  deleteAddOn,
  fetchAddOnList,
  updateAddOn,
  type AddOnInput,
  type AddOnRow,
} from "../../services/addOnsService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const AddOnCard = ({
  addOn,
  onEdit,
  onDelete,
}: {
  addOn: AddOnRow;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const image = addOn.images[0];
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl mb-3 border border-gray-100 dark:border-neutral-800 overflow-hidden"
      style={CARD_SHADOW}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          className="w-full h-40 bg-gray-100 dark:bg-neutral-800"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-40 bg-gray-100 dark:bg-neutral-800 items-center justify-center">
          <Feather name="image" size={28} color="#9CA3AF" />
        </View>
      )}

      <View className="p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {addOn.name}
            </Text>
            {!!addOn.locationName && (
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {addOn.locationName}
              </Text>
            )}
            {addOn.maxQuantity != null && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Max: {addOn.maxQuantity}
              </Text>
            )}
          </View>
          {addOn.isForced && (
            <View className="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">
              <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Required
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {formatMoney(addOn.price)}
          </Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onEdit}
              hitSlop={6}
              className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 items-center justify-center"
              accessibilityLabel={`Edit ${addOn.name}`}
            >
              <Feather name="edit-2" size={14} color={PRIMARY} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 items-center justify-center"
              accessibilityLabel={`Delete ${addOn.name}`}
            >
              <Feather name="trash-2" size={14} color="#E11D48" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const AddOns = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  // Only company admins pick/switch locations; location managers are scoped to
  // their own location by the backend (mirrors the web admin + every other
  // role-gated screen, e.g. Attractions / Manage Attractions / User Management).
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Location comes from the global workspace selector (shown at the top of the
  // screen, company-admin only), as on Manage Attractions / Packages.
  const activeLocation = useActiveLocation();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  // Locations (for the filter + create/edit picker).
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  // Create / edit form ("new" = create, AddOnRow = editing, null = closed).
  const [formTarget, setFormTarget] = useState<AddOnRow | "new" | null>(null);
  const [fLocationId, setFLocationId] = useState<number | null>(null);
  const [fImage, setFImage] = useState<string | null>(null);
  const [fImageChanged, setFImageChanged] = useState(false);
  const [fName, setFName] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fMin, setFMin] = useState("1");
  const [fMax, setFMax] = useState("5");
  const [fDescription, setFDescription] = useState("");
  const [fForce, setFForce] = useState(false);
  const [saving, setSaving] = useState(false);

  const loader = useCallback(
    ({ token, userId }: { token: string; userId: number }) =>
      fetchAddOnList({ token, userId }),
    [],
  );
  const { data: addOns, loading, error, refetch } = useAsyncList(loader);

  const loadLocations = useCallback(async () => {
    const token = getToken();
    // Managers never see a location picker/filter, so skip the fetch entirely.
    if (!token || !isCompanyAdmin || locations.length > 0) return;
    setLocationsLoading(true);
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal; the picker stays empty and the field is required.
    } finally {
      setLocationsLoading(false);
    }
  }, [locations.length, isCompanyAdmin]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return addOns.filter((a) => {
      if (activeLocation.id !== "all" && a.locationId !== activeLocation.id)
        return false;
      if (term && !a.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [addOns, search, activeLocation.id]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

  useEffect(() => {
    setPage(1);
  }, [search, activeLocation.id, perPage]);

  const openCreate = () => {
    // A new add-on starts at the workspace location, else the user's own.
    setFLocationId(
      typeof activeLocation.id === "number"
        ? activeLocation.id
        : (getCurrentUser()?.location_id ?? null),
    );
    setFImage(null);
    setFImageChanged(false);
    setFName("");
    setFPrice("");
    setFMin("1");
    setFMax("5");
    setFDescription("");
    setFForce(false);
    setFormTarget("new");
    loadLocations();
  };

  // Opened from the Packages hub's "Create Add-on" shortcut
  // (?create=1): show the create form once, then drop the param.
  const { create } = useLocalSearchParams<{ create?: string }>();
  useEffect(() => {
    if (create !== "1") return;
    openCreate();
    router.setParams({ create: undefined });
    // openCreate is recreated each render; the param is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create]);

  const openEdit = (addOn: AddOnRow) => {
    setFLocationId(addOn.locationId);
    setFImage(addOn.images[0] ?? null);
    setFImageChanged(false);
    setFName(addOn.name);
    setFPrice(String(addOn.price));
    setFMin(addOn.minQuantity != null ? String(addOn.minQuantity) : "1");
    // no maximum reopens as an empty box, or the next save would write 5 back
    setFMax(addOn.maxQuantity != null ? String(addOn.maxQuantity) : "");
    setFDescription(addOn.description);
    setFForce(addOn.isForced);
    setFormTarget(addOn);
    loadLocations();
  };

  const pickImage = useCallback(async () => {
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) return;
    setFImage(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`);
    setFImageChanged(true);
  }, []);

  const saveForm = async () => {
    const token = getToken();
    if (!token) return;
    if (fLocationId == null) {
      Alert.alert("Location required", "Please select a location.");
      return;
    }
    if (!fName.trim()) {
      Alert.alert("Name required", "Please enter an add-on name.");
      return;
    }
    // Blank max means unbounded, as it does everywhere the quantity is stepped.
    const minQty = fMin.trim() ? parseInt(fMin, 10) : 1;
    const maxQty = fMax.trim() ? parseInt(fMax, 10) : null;
    if (maxQty !== null && minQty > maxQty) {
      Alert.alert(
        "Check quantities",
        "Maximum quantity cannot be lower than minimum quantity",
      );
      return;
    }
    const input: AddOnInput = {
      name: fName.trim(),
      price: Number(fPrice) || 0,
      min_quantity: Number(fMin) || 0,
      // blank is no maximum, sent as null — a 0 would fail the API's min:1 rule
      max_quantity: maxQty,
      description: fDescription.trim() || null,
      is_force_add_on: fForce,
      location_id: fLocationId,
      // Only send a new base64 image; omit on update to keep the existing one.
      ...(fImageChanged && fImage ? { image: [fImage] } : {}),
    };
    setSaving(true);
    try {
      if (formTarget && formTarget !== "new") {
        await updateAddOn(token, formTarget.id, input);
      } else {
        await createAddOn(token, input);
      }
      setFormTarget(null);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save the add-on.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (addOn: AddOnRow) => {
    Alert.alert("Delete add-on", `Delete "${addOn.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          try {
            await deleteAddOn(token, addOn.id);
            await refetch();
          } catch (err) {
            Alert.alert(
              "Delete failed",
              err instanceof Error ? err.message : "Could not delete the add-on.",
            );
          }
        },
      },
    ]);
  };

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no add-ons to export.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const header = [
        "ID", "Name", "Location", "Price", "Min Quantity",
        "Max Quantity", "Forced", "Description",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((a) =>
        [
          a.id, a.name, a.locationName, a.price, a.minQuantity ?? "",
          a.maxQuantity ?? "", a.isForced ? "Yes" : "No", a.description,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}add-ons-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Add-ons",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
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

  const onImport = () =>
    Alert.alert(
      "Import Add-ons",
      "Bulk add-on import is available on the web dashboard.",
    );

  const isEditing = formTarget !== null && formTarget !== "new";

  const showInitialLoader = loading && addOns.length === 0;
  const showError = !loading && !!error && addOns.length === 0;

  // Import / Export (and related modules) as hub shortcuts; Create is the
  // header's New action. Export ignores taps while one is already running.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Import Add-ons", icon: "upload", onPress: onImport },
    {
      label: exporting ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
    { label: "Manage Packages", icon: "package", route: "/packages/packages" },
    { label: "Promo Codes", icon: "tag", route: "/packages/promos" },
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
            Add-ons
          </Text>
          <Pressable
            onPress={openCreate}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Create add-on"
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

          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Food, beverage and other items for your attractions
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load add-ons"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* More — Import / Export plus related modules as hub shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 h-11 px-3.5 mt-4 mb-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search add-ons"
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

          {!showInitialLoader && !showError && (
            <ListHeader title="All Add-ons" count={filtered.length} />
          )}

          {/* States */}
          {showInitialLoader ? (
            <View key="s-loading">
              <AttractionsListSkeleton />
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            <View key="s-empty">
              {addOns.length === 0 ? (
                <ListEmptyState
                  icon="coffee"
                  title="No add-ons yet"
                  message="There are no add-ons for this account yet."
                  actionLabel="Create Add-on"
                  actionIcon="plus"
                  primary
                  onAction={openCreate}
                />
              ) : (
                <ListEmptyState
                  icon="search"
                  title="No add-ons found"
                  message={
                    search.trim()
                      ? "No add-ons match your search."
                      : `There are no add-ons at ${activeLocation.name}.`
                  }
                  {...(search.trim()
                    ? { actionLabel: "Clear search", onAction: () => setSearch("") }
                    : {})}
                />
              )}
            </View>
          ) : (
            <View key="s-list">
              {paged.map((addOn) => (
                <AddOnCard
                  key={addOn.id}
                  addOn={addOn}
                  onEdit={() => openEdit(addOn)}
                  onDelete={() => confirmDelete(addOn)}
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

      {/* Create / Edit Add-on */}
      <BottomSheet
        visible={formTarget !== null}
        onClose={() => setFormTarget(null)}
        title={isEditing ? "Edit Add-on" : "Add New Add-on"}
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {/* Location — company-admin only. Managers' add-ons belong to their
              assigned location automatically (fLocationId is seeded from the
              user / existing add-on), matching the web admin. */}
          {isCompanyAdmin && (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Location *
              </Text>
              {locationsLoading && locations.length === 0 ? (
                <View className="py-6 items-center">
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : (
                <View className="flex-row flex-wrap -mx-1 mb-4">
                  {locations.map((loc) => {
                    const active = fLocationId === loc.id;
                    return (
                      <View key={loc.id} className="w-1/2 px-1 mb-2">
                        <Pressable
                          onPress={() => setFLocationId(loc.id)}
                          className={`flex-row items-center gap-1.5 p-2 rounded-xl border ${
                            active
                              ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                          }`}
                        >
                          <View className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                            <Feather name="map-pin" size={13} color={PRIMARY} />
                          </View>
                          <View className="flex-1">
                            <Text
                              className="text-xs font-medium text-gray-700 dark:text-gray-200"
                              numberOfLines={1}
                            >
                              {loc.name}
                            </Text>
                            {!!loc.address && (
                              <Text
                                className="text-[10px] text-gray-400 dark:text-gray-500"
                                numberOfLines={1}
                              >
                                {loc.address}
                              </Text>
                            )}
                          </View>
                          {active && (
                            <Feather name="check" size={13} color={PRIMARY} />
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Image */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Add-on Image
          </Text>
          <Pressable onPress={pickImage} className="mb-4">
            {fImage ? (
              <View className="relative">
                <Image
                  source={{ uri: fImage }}
                  className="w-full h-44 rounded-xl bg-gray-100 dark:bg-neutral-800"
                  resizeMode="cover"
                />
                <View className="absolute bottom-2 right-2 bg-black/60 px-2.5 py-1 rounded-lg flex-row items-center gap-1.5">
                  <Feather name="camera" size={12} color="#FFFFFF" />
                  <Text className="text-[11px] font-semibold text-white">Change</Text>
                </View>
              </View>
            ) : (
              <View className="w-full h-44 rounded-xl border-2 border-dashed border-gray-300 dark:border-neutral-700 items-center justify-center bg-gray-50 dark:bg-neutral-800">
                <Feather name="image" size={28} color="#9CA3AF" />
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Tap to add an image
                </Text>
              </View>
            )}
          </Pressable>

          {/* Name */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Add-on Name *
          </Text>
          <TextInput
            value={fName}
            onChangeText={setFName}
            placeholder="e.g. Cheesy Bread"
            placeholderTextColor="#9CA3AF"
            className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-4"
          />

          {/* Price */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Default Price *
          </Text>
          <View className="flex-row items-center bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-700 mb-4">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mr-1">$</Text>
            <TextInput
              value={fPrice}
              onChangeText={setFPrice}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
            />
          </View>

          {/* Min / Max */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Min Quantity
              </Text>
              <TextInput
                value={fMin}
                onChangeText={setFMin}
                placeholder="1"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Max Quantity
              </Text>
              <TextInput
                value={fMax}
                onChangeText={setFMax}
                placeholder="5"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
              />
            </View>
          </View>

          {/* Description */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Description
          </Text>
          <TextInput
            value={fDescription}
            onChangeText={setFDescription}
            placeholder="Add ingredients, special notes, dietary info, etc."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 mb-1"
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
            This description will be shown to customers when they click
            &quot;Details&quot;.
          </Text>

          {/* Force Add-On */}
          <View className="flex-row items-center justify-between bg-gray-50 dark:bg-neutral-800 rounded-xl p-3.5 mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Force Add-On
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                Automatically add this item when specific packages are selected.
              </Text>
            </View>
            <Switch
              value={fForce}
              onValueChange={setFForce}
              trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Actions */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setFormTarget(null)}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={saveForm}
              disabled={saving}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {isEditing ? "Update Add-on" : "Create Add-on"}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default AddOns;
