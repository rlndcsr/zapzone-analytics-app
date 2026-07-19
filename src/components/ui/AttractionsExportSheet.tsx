import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { AttractionRow } from "../../services/attractionsService";
import { BottomSheet } from "./BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The attractions available to export (the current, filtered list). */
  attractions: AttractionRow[];
};

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * "Export Attractions" — mirrors the web ManageAttractions export modal. The
 * user selects which attractions to export (all selected by default), then the
 * chosen records are serialized as JSON (id/location stripped so they re-import
 * into any location) and handed to the OS share sheet. The output shape matches
 * what AttractionsImportSheet consumes, so files round-trip.
 */
export function AttractionsExportSheet({
  visible,
  onClose,
  attractions,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Select everything by default each time the sheet opens (web parity).
  useEffect(() => {
    if (visible) setSelected(new Set(attractions.map((a) => a.id)));
  }, [visible, attractions]);

  const allSelected =
    attractions.length > 0 && selected.size === attractions.length;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(attractions.map((a) => a.id)));

  const chosen = useMemo(
    () => attractions.filter((a) => selected.has(a.id)),
    [attractions, selected],
  );

  const runExport = async () => {
    if (chosen.length === 0) {
      Alert.alert("Nothing selected", "Select at least one attraction.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const cleaned = chosen.map((a) => ({
        name: a.name,
        description: a.description,
        category: a.category,
        price: a.price,
        pricingType: a.pricingType,
        maxCapacity: a.maxCapacity,
        duration: a.duration,
        durationUnit: a.durationUnit,
        status: a.status,
        images: a.images,
      }));
      const json = JSON.stringify(cleaned, null, 2);
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}zapzone-attractions-${date}.json`;
      await FileSystem.writeAsStringAsync(uri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          dialogTitle: "Export Attractions",
          UTI: "public.json",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }
      onClose();
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export attractions.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Export Attractions">
      <View className="px-4 pb-6">
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3 px-1">
          Select attractions to export as JSON.
        </Text>

        {/* Select-all + count row */}
        <View className="flex-row items-center justify-between mb-3 px-1">
          <Pressable
            onPress={toggleAll}
            className="flex-row items-center gap-1.5 active:opacity-70"
          >
            <Feather
              name={allSelected ? "check-square" : "square"}
              size={16}
              color="#0644C7"
            />
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {allSelected ? "Deselect All" : "Select All"}
            </Text>
          </Pressable>
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {selected.size} of {attractions.length} selected
          </Text>
        </View>

        {/* Selectable list */}
        <ScrollView
          className="max-h-96"
          showsVerticalScrollIndicator={false}
        >
          {attractions.map((a) => {
            const on = selected.has(a.id);
            const active = a.status === "active";
            return (
              <Pressable
                key={a.id}
                onPress={() => toggle(a.id)}
                className={`flex-row items-start gap-3 p-3 rounded-xl mb-2 border ${
                  on
                    ? "bg-blue-50 dark:bg-blue-900/20 border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Feather
                  name={on ? "check-square" : "square"}
                  size={18}
                  color={on ? "#0644C7" : "#9CA3AF"}
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1">
                  <Text
                    className="text-base font-bold text-gray-900 dark:text-white"
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {a.category} • {money(a.price)}
                    </Text>
                    <Text
                      className={`text-xs font-semibold capitalize ${
                        active
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {a.status}
                    </Text>
                  </View>
                  {!!a.description && (
                    <Text
                      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
                      numberOfLines={1}
                    >
                      {a.description}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          {attractions.length === 0 && (
            <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              No attractions to export.
            </Text>
          )}
        </ScrollView>

        {/* Footer actions */}
        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={onClose}
            className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={runExport}
            disabled={exporting || chosen.length === 0}
            className={`flex-[2] items-center justify-center flex-row gap-2 py-3.5 rounded-xl ${
              chosen.length === 0 ? "bg-[#0644C7]/50" : "bg-[#0644C7]"
            } active:opacity-90`}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="download" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">
              {exporting
                ? "Exporting…"
                : `Export ${chosen.length} Attraction${chosen.length === 1 ? "" : "s"}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
