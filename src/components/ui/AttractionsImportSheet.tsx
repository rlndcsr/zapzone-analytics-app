import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { getCurrentUser, getToken } from "../../lib/session";
import {
  bulkImportAttractions,
  type AttractionImportInput,
} from "../../services/attractionsService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { BottomSheet } from "./BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Target location for company admins; managers fall back to their own. */
  locationId: number | null;
  onImported: () => void;
};

const IMPORT_NOTES = [
  "JSON must be an array of attraction objects",
  "Each attraction must have at least a name and price",
  "Location data is ignored; attractions are registered to the selected location",
  "New IDs are generated to avoid conflicts",
];

/** Coerce one parsed JSON record into the import payload. Accepts both the
 *  camelCase shape produced by Export and common snake_case aliases so a file
 *  from either platform imports cleanly. */
function toImportInput(
  raw: Record<string, unknown>,
  locationId: number,
): AttractionImportInput | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const description =
    typeof raw.description === "string" ? raw.description : "";
  const category =
    typeof raw.category === "string" && raw.category.trim()
      ? raw.category
      : "Uncategorized";
  const images = Array.isArray(raw.images)
    ? (raw.images.filter((i) => typeof i === "string") as string[])
    : typeof raw.image === "string"
      ? [raw.image]
      : undefined;
  const availability = Array.isArray(raw.availability)
    ? (raw.availability as AttractionImportInput["availability"])
    : undefined;
  return {
    location_id: locationId,
    name,
    description,
    category,
    price: num(raw.price) ?? 0,
    pricingType:
      (raw.pricingType as string) ?? (raw.pricing_type as string) ?? undefined,
    maxCapacity: num(raw.maxCapacity) ?? num(raw.max_capacity),
    duration: num(raw.duration) ?? null,
    durationUnit:
      (raw.durationUnit as string) ?? (raw.duration_unit as string) ?? undefined,
    availability,
    images,
    status:
      (raw.status as string) ??
      (typeof raw.is_active === "boolean"
        ? raw.is_active
          ? "active"
          : "inactive"
        : undefined),
  };
}

/**
 * "Import Attractions" — mirrors the web ManageAttractions import modal. The
 * user picks the target location, then pastes or picks a JSON array of
 * attractions; each is created into the chosen location via the same
 * POST /attractions/bulk-import the web uses. The expected JSON is exactly what
 * this screen's "Export Attractions" produces.
 */
export function AttractionsImportSheet({
  visible,
  onClose,
  locationId,
  onImported,
}: Props) {
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Target location (web "Import to Location"). Seeded from the passed active
  // location, then the user's own; the picker below can override it.
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    locationId ?? getCurrentUser()?.location_id ?? null,
  );
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLocationsLoading(true);
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal; the picker just stays empty and the seeded id is used.
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  // Lazily load the location list (and re-seed the selection) each time the
  // sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSelectedLocationId(locationId ?? getCurrentUser()?.location_id ?? null);
    loadLocations();
  }, [visible, locationId, loadLocations]);

  const pickFile = async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const resp = await fetch(asset.uri);
      const text = await resp.text();
      setJson(text);
      setFileName(asset.name || "attractions.json");
    } catch {
      Alert.alert("File error", "Could not read the selected file.");
    }
  };

  const reset = () => {
    setJson("");
    setFileName(null);
  };

  const runImport = async () => {
    const text = json.trim();
    if (!text) {
      Alert.alert("Nothing to import", "Paste or pick a JSON file first.");
      return;
    }
    if (selectedLocationId == null) {
      Alert.alert(
        "Select a location",
        "Choose the location to import these attractions into.",
      );
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      Alert.alert(
        "Invalid JSON",
        "Please check your data — it must be a valid JSON array of attractions.",
      );
      return;
    }
    if (!Array.isArray(parsed)) {
      Alert.alert("Invalid format", "Expected a JSON array of attractions.");
      return;
    }

    const items = parsed
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => toImportInput(r, selectedLocationId))
      .filter((r): r is AttractionImportInput => r !== null);

    if (items.length === 0) {
      Alert.alert(
        "Nothing to import",
        "No valid attractions were found in the file (each needs at least a name).",
      );
      return;
    }

    setImporting(true);
    try {
      const result = await bulkImportAttractions(token, items);
      const errorNote =
        result.errors.length > 0
          ? `\n${result.failed} failed — first: "${result.errors[0].name}" (${result.errors[0].error})`
          : "";
      Alert.alert(
        "Import complete",
        `Imported ${result.imported} of ${items.length} attraction(s).${errorNote}`,
      );
      reset();
      onImported();
      onClose();
    } catch (err) {
      Alert.alert(
        "Import failed",
        err instanceof Error ? err.message : "Could not import the file.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Import Attractions">
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Upload or paste JSON data to import attractions.
        </Text>

        {/* Import to Location (web parity) */}
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Import to Location
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {locationsLoading && locations.length === 0 && (
            <ActivityIndicator color="#0644C7" />
          )}
          {locations.map((loc) => {
            const active = selectedLocationId === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => setSelectedLocationId(loc.id)}
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
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
              </Pressable>
            );
          })}
          {!locationsLoading && locations.length === 0 && (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              No locations available.
            </Text>
          )}
        </View>

        {/* Upload JSON file */}
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Upload JSON File
        </Text>
        <Pressable
          onPress={pickFile}
          className="flex-row items-center justify-center gap-2 border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 mb-4 active:opacity-70"
        >
          <Feather name="file-plus" size={16} color="#6B7280" />
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {fileName ?? "Choose JSON file"}
          </Text>
        </Pressable>

        {/* OR divider */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="flex-1 h-px bg-gray-200 dark:bg-neutral-800" />
          <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">
            OR
          </Text>
          <View className="flex-1 h-px bg-gray-200 dark:bg-neutral-800" />
        </View>

        {/* Paste JSON */}
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
          Or Paste JSON Data
        </Text>
        <TextInput
          value={json}
          onChangeText={(t) => {
            setJson(t);
            if (fileName) setFileName(null);
          }}
          placeholder='[{"name": "Attraction Name", "category": "Category", "price": 50, ...}]'
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
          className="border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-3 text-sm text-gray-900 dark:text-white min-h-[140px] mb-3"
        />

        {json.length > 0 && (
          <Pressable onPress={reset} className="self-end mb-3">
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Clear
            </Text>
          </Pressable>
        )}

        {/* Import Notes (web parity) */}
        <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-5">
          <Text className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
            Import Notes:
          </Text>
          {IMPORT_NOTES.map((note) => (
            <Text
              key={note}
              className="text-xs text-blue-700 dark:text-blue-300 leading-5"
            >
              • {note}
            </Text>
          ))}
        </View>

        <Pressable
          onPress={runImport}
          disabled={importing}
          className="py-3.5 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-90"
        >
          {importing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="upload" size={16} color="#FFFFFF" />
          )}
          <Text className="text-sm font-semibold text-white">
            {importing ? "Importing…" : "Import Attractions"}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}
