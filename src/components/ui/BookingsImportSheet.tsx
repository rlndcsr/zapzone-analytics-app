import { Feather } from "@expo/vector-icons";
import { useState } from "react";
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
import { bulkImportBookingsCsv } from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Selected location for company admins; managers fall back to their own. */
  locationId: number | null;
  onImported: () => void;
};

const SAMPLE_HEADER =
  "reference_number,customer_email,package_name,booking_date,booking_time,participants";

/**
 * "Bulk Import" — mirrors the web admin's CSV import. A phone has no file picker
 * wired up, so instead of uploading a file the user pastes CSV rows; we persist
 * them to a temp file and POST the same multipart /bookings/bulk-import-csv the
 * web uses, so the backend import workflow is unchanged.
 */
export function BookingsImportSheet({ visible, onClose, locationId, onImported }: Props) {
  const [csv, setCsv] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);

  // Managers are scoped to their own location; company admins use the selected
  // one. The backend requires a concrete location_id.
  const resolvedLocationId = locationId ?? getCurrentUser()?.location_id ?? null;

  const runImport = async () => {
    const text = csv.trim();
    if (!text) {
      Alert.alert("Nothing to import", "Paste your CSV rows first.");
      return;
    }
    if (resolvedLocationId == null) {
      Alert.alert(
        "Select a location",
        "Choose a specific location on the Bookings screen before importing.",
      );
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setImporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const uri = `${FileSystem.cacheDirectory}bookings-import.csv`;
      await FileSystem.writeAsStringAsync(uri, text);

      const result = await bulkImportBookingsCsv({
        token,
        fileUri: uri,
        locationId: resolvedLocationId,
        skipDuplicates,
      });

      const errorNote =
        result.errors.length > 0
          ? `\n${result.errors.length} row error(s) — first: row ${result.errors[0].row}, ${result.errors[0].error}`
          : "";
      Alert.alert(
        "Import complete",
        `Imported ${result.imported} of ${result.total_rows} row(s). Skipped ${result.skipped}.${errorNote}`,
      );
      setCsv("");
      onImported();
      onClose();
    } catch (err) {
      Alert.alert(
        "Import failed",
        err instanceof Error ? err.message : "Could not import the CSV.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Bulk Import">
      <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Paste CSV rows including a header row. Bookings are imported into the
          selected location using the same importer as the web admin.
        </Text>
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">Example header</Text>
        <View className="bg-gray-100 dark:bg-neutral-800 rounded-lg px-3 py-2 mb-3">
          <Text className="text-[11px] font-mono text-gray-600 dark:text-gray-300">
            {SAMPLE_HEADER}
          </Text>
        </View>

        <TextInput
          value={csv}
          onChangeText={setCsv}
          placeholder="Paste CSV content here…"
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
          className="border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-3 text-sm text-gray-900 dark:text-white min-h-[140px] mb-3"
        />

        <Pressable
          onPress={() => setSkipDuplicates((v) => !v)}
          className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 mb-6"
        >
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Skip duplicate bookings
          </Text>
          <View
            className={`w-6 h-6 rounded-md items-center justify-center ${
              skipDuplicates ? "bg-[#0644C7]" : "border border-gray-300 dark:border-neutral-600"
            }`}
          >
            {skipDuplicates && <Feather name="check" size={14} color="#FFFFFF" />}
          </View>
        </Pressable>

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
            {importing ? "Importing…" : "Import Bookings"}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}
