import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { getCurrentUser, getToken } from "../../lib/session";
import {
  buildBookingsReportUrl,
  type ReportPeriod,
} from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";
import { DateRangeSheet } from "./DateRangeSheet";

const PRIMARY = "#0644C7";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Selected location for company admins; null = all / manager (backend-scoped). */
  locationId: number | null;
};

const PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: "Today", value: "today" },
  { label: "This Month", value: "monthly" },
  { label: "Custom Range", value: "custom" },
];

const VIEW_OPTIONS: { label: string; value: "individual" | "list" }[] = [
  { label: "Individual", value: "individual" },
  { label: "List", value: "list" },
];

const OptionPill = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className={`flex-1 py-2.5 rounded-xl border items-center ${
      active
        ? "border-[#0644C7] bg-[#0644C7]/10"
        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    }`}
  >
    <Text
      className={`text-sm font-semibold ${
        active ? "text-[#0644C7]" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * "Generate Report" — mirrors the web admin's booking details report. Builds the
 * same GET /api/bookings/details-report request and, since a phone can't stream
 * a download to disk like the browser, fetches the PDF to a cache file and hands
 * it to the native share sheet (save to Files, email, etc.).
 */
export function BookingsReportSheet({ visible, onClose, locationId }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [viewMode, setViewMode] = useState<"individual" | "list">("individual");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showRange, setShowRange] = useState(false);
  const [generating, setGenerating] = useState(false);

  const customLabel =
    customStart && customEnd ? `${customStart} → ${customEnd}` : "Select date range";

  const generate = async () => {
    if (period === "custom" && (!customStart || !customEnd)) {
      Alert.alert("Select a date range", "Please choose both a start and end date.");
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setGenerating(true);
    try {
      const url = buildBookingsReportUrl({
        period,
        viewMode,
        includeCancelled,
        startDate: customStart,
        endDate: customEnd,
        locationId,
        userId: getCurrentUser()?.id ?? null,
      });

      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const stamp = new Date().toISOString().split("T")[0];
      const dest = `${FileSystem.cacheDirectory}bookings-report-${stamp}.pdf`;
      const { status, uri } = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      });

      if (status !== 200) {
        // The endpoint returns JSON (404/422) on failure; downloadAsync writes it
        // to the file, so surface a readable message.
        let message = "No bookings found for the selected criteria.";
        try {
          const text = await FileSystem.readAsStringAsync(uri);
          const parsed = JSON.parse(text);
          if (parsed?.message) message = parsed.message;
        } catch {
          message = "Failed to generate report. Please try again.";
        }
        Alert.alert("Report not generated", message);
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Booking Details Report",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Report ready", `Saved to ${uri}`);
      }
      onClose();
    } catch (err) {
      Alert.alert(
        "Report failed",
        err instanceof Error ? err.message : "Could not generate the report.",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Generate Report">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Period
          </Text>
          <View className="flex-row gap-2 mb-2">
            {PERIOD_OPTIONS.map((o) => (
              <OptionPill
                key={o.value}
                label={o.label}
                active={period === o.value}
                onPress={() => {
                  setPeriod(o.value);
                  if (o.value === "custom") setShowRange(true);
                }}
              />
            ))}
          </View>
          {period === "custom" && (
            <Pressable
              onPress={() => setShowRange(true)}
              className="flex-row items-center gap-2 border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 mb-4"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1">{customLabel}</Text>
              <Feather name="chevron-right" size={16} color="#9CA3AF" />
            </Pressable>
          )}

          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3 mb-2">
            View Mode
          </Text>
          <View className="flex-row gap-2 mb-4">
            {VIEW_OPTIONS.map((o) => (
              <OptionPill
                key={o.value}
                label={o.label}
                active={viewMode === o.value}
                onPress={() => setViewMode(o.value)}
              />
            ))}
          </View>

          <Pressable
            onPress={() => setIncludeCancelled((v) => !v)}
            className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 mb-6"
          >
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Include cancelled bookings
            </Text>
            <View
              className={`w-6 h-6 rounded-md items-center justify-center ${
                includeCancelled ? "bg-[#0644C7]" : "border border-gray-300 dark:border-neutral-600"
              }`}
            >
              {includeCancelled && <Feather name="check" size={14} color="#FFFFFF" />}
            </View>
          </Pressable>

          <Pressable
            onPress={generate}
            disabled={generating}
            className="py-3.5 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-90"
          >
            {generating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="file-text" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">
              {generating ? "Generating…" : "Generate PDF"}
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <DateRangeSheet
        visible={showRange}
        initialStart={customStart}
        initialEnd={customEnd}
        onClose={() => setShowRange(false)}
        onApply={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setPeriod("custom");
          setShowRange(false);
        }}
      />
    </>
  );
}
