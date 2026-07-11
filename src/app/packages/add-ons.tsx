import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
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
import { getCurrentUser, getToken } from "../../lib/session";

const PRIMARY = "#0644C7";

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

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

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
    if (!token || locations.length > 0) return;
    setLocationsLoading(true);
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal; the picker stays empty and the field is required.
    } finally {
      setLocationsLoading(false);
    }
  }, [locations.length]);

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
      if (locationFilter !== "all" && a.locationId !== locationFilter)
        return false;
      if (term && !a.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [addOns, search, locationFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, locationFilter, perPage]);

  const locationLabel =
    locationFilter === "all"
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ?? "All Locations");

  const openCreate = () => {
    setFLocationId(getCurrentUser()?.location_id ?? null);
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

  const openEdit = (addOn: AddOnRow) => {
    setFLocationId(addOn.locationId);
    setFImage(addOn.images[0] ?? null);
    setFImageChanged(false);
    setFName(addOn.name);
    setFPrice(String(addOn.price));
    setFMin(addOn.minQuantity != null ? String(addOn.minQuantity) : "1");
    setFMax(addOn.maxQuantity != null ? String(addOn.maxQuantity) : "5");
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
    const input: AddOnInput = {
      name: fName.trim(),
      price: Number(fPrice) || 0,
      min_quantity: Number(fMin) || 0,
      max_quantity: Number(fMax) || 0,
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
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
            Add-ons
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
              Add-ons
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Food, beverage and other items for your attractions
            </Text>
          </View>

          {/* Create */}
          <Pressable
            onPress={openCreate}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Add-on
            </Text>
          </Pressable>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-3">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search add-ons by name..."
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

          {/* Controls — full-width segmented pill (Location · Import · Export) */}
          <FilterPill>
            <PillSegment
              label={locationLabel}
              active={showLocationSheet}
              onPress={() => setShowLocationSheet(true)}
              renderIcon={(c) => <Feather name="map-pin" size={15} color={c} />}
            />
            <PillSegment
              label="Import"
              onPress={onImport}
              renderIcon={(c) => <Feather name="upload" size={15} color={c} />}
            />
            <PillSegment
              label="Export"
              onPress={exportCsv}
              renderIcon={(c) =>
                exporting ? (
                  <ActivityIndicator size="small" color={c} />
                ) : (
                  <Feather name="download" size={15} color={c} />
                )
              }
            />
          </FilterPill>

          {!loading && !error && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "add-on" : "add-ons"}
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
                <Feather name="coffee" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No add-ons found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                {addOns.length === 0
                  ? "There are no add-ons for this account yet."
                  : "Try a different search or filters."}
              </Text>
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
          {/* Location */}
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
                      {active && <Feather name="check" size={13} color={PRIMARY} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>
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

      {/* Location filter picker */}
      <BottomSheet
        visible={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => {
              setLocationFilter("all");
              setShowLocationSheet(false);
            }}
            className={`flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1 ${
              locationFilter === "all" ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
          >
            <View className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
              <Feather name="grid" size={15} color={PRIMARY} />
            </View>
            <View className="flex-1">
              <Text
                className={`text-base font-medium ${
                  locationFilter === "all"
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                All Locations
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                View all locations
              </Text>
            </View>
            {locationFilter === "all" && (
              <Feather name="check" size={18} color={PRIMARY} />
            )}
          </Pressable>

          {locationsLoading && locations.length === 0 && (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          )}

          {locations.map((loc) => {
            const active = locationFilter === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => {
                  setLocationFilter(loc.id);
                  setShowLocationSheet(false);
                }}
                className={`flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1 ${
                  active ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <View className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                  <Feather name="map-pin" size={15} color={PRIMARY} />
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-base font-medium ${
                      active
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                    numberOfLines={1}
                  >
                    {loc.name}
                  </Text>
                  {!!loc.address && (
                    <Text
                      className="text-xs text-gray-400 dark:text-gray-500"
                      numberOfLines={1}
                    >
                      {loc.address}
                    </Text>
                  )}
                </View>
                {active && <Feather name="check" size={18} color={PRIMARY} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default AddOns;
