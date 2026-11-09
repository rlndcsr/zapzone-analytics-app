import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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

import { FieldLabel } from "../../components/ui/FormControls";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { FilterChip } from "../../components/ui/SummaryPanel";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchPackages } from "../../services/packagesService";
import { packageInvoicesUrl } from "../../services/paymentsService";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

// Same statuses and values the old Package Invoices sheet sent.
const INVOICE_STATUSES = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

const DATE_INPUT =
  "h-11 rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white";

/** A titled block of the form, in the Manage Attractions bordered-card style. */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {!!subtitle && (
        <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </Text>
      )}
      <View className="mt-3">{children}</View>
    </View>
  );
}

export default function PackageInvoices() {
  const insets = useSafeAreaInsets();

  const [packages, setPackages] = useState<{ id: number; name: string }[]>([]);
  const [packagesState, setPackagesState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [packageId, setPackageId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<"view" | "download" | null>(null);

  const loadPackages = useCallback(() => {
    const token = getToken();
    if (!token) return;
    setPackagesState("loading");
    fetchPackages({ token, userId: getCurrentUser()?.id })
      .then((rows) => {
        setPackages(rows.map((p) => ({ id: p.id, name: p.name })));
        setPackagesState("ready");
      })
      .catch(() => {
        setPackages([]);
        setPackagesState("error");
      });
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const exportPdf = async (mode: "view" | "download") => {
    const token = getToken();
    if (!token || packageId == null) return;
    setBusy(mode);
    try {
      const url = packageInvoicesUrl({
        packageId,
        startDate: startDate.trim() || undefined,
        endDate: endDate.trim() || undefined,
        status,
        stream: mode === "view",
      });
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const dest = `${FileSystem.cacheDirectory}package-invoices-${packageId}.pdf`;
      const { status: httpStatus, uri } = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
      });
      if (httpStatus !== 200) {
        let message = "No invoices found for the selected criteria.";
        try {
          const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri));
          if (parsed?.message) message = parsed.message;
        } catch {
          message = "Failed to generate invoices. Please try again.";
        }
        Alert.alert("Invoices not generated", message);
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Package Invoices",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Invoices ready", `Saved to ${uri}`);
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export invoices.",
      );
    } finally {
      setBusy(null);
    }
  };

  const hasFilters = !!startDate.trim() || !!endDate.trim() || status !== "all";
  const canExport = packageId != null && busy == null;

  const moreShortcuts: HubQuickLink[] = [
    { label: "Manage Payments", icon: "credit-card", route: "/payments/payments" },
    { label: "Deleted Payments", icon: "trash-2", route: "/payments/deleted-payments" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader title="Package Invoices" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="mt-4 px-4">
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Export all invoices for a specific package, as a single PDF.
          </Text>

          {packagesState === "error" && (
            <View className="mb-4 flex-row gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load packages
                </Text>
                <Pressable
                  onPress={loadPackages}
                  className="mt-2.5 self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 active:opacity-70 dark:border-red-900/50 dark:bg-neutral-900"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View className="mb-4">
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Package — required. */}
          <Section title="Package" subtitle="The package whose invoices you want.">
            <FieldLabel required>Select Package</FieldLabel>
            <SheetSelect
              icon="package"
              title="Select Package"
              placeholder={
                packagesState === "loading"
                  ? "Loading packages…"
                  : packages.length === 0
                    ? "No packages found"
                    : "-- Select a package --"
              }
              disabled={packages.length === 0}
              value={packageId}
              options={packages.map((p) => ({ label: p.name, value: p.id }))}
              onSelect={(v) => setPackageId(Number(v))}
            />
          </Section>

          {/* Optional filters — same fields and values as before. */}
          <Section title="Optional filters" subtitle="Leave blank to include every invoice.">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <FieldLabel>Start Date</FieldLabel>
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  className={DATE_INPUT}
                  style={{ paddingVertical: 0 }}
                />
              </View>
              <View className="flex-1">
                <FieldLabel>End Date</FieldLabel>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  className={DATE_INPUT}
                  style={{ paddingVertical: 0 }}
                />
              </View>
            </View>

            <View className="mt-4">
              <FieldLabel>Payment Status</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {INVOICE_STATUSES.map((s) => (
                  <FilterChip
                    key={s.value}
                    label={s.label}
                    selected={status === s.value}
                    onPress={() => setStatus(s.value)}
                  />
                ))}
              </View>
            </View>

            {hasFilters && (
              <Pressable
                onPress={() => {
                  setStartDate("");
                  setEndDate("");
                  setStatus("all");
                }}
                hitSlop={8}
                accessibilityRole="button"
                className="mt-4 self-start"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear filters
                </Text>
              </Pressable>
            )}
          </Section>

          {/* Export */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => exportPdf("view")}
              disabled={!canExport}
              accessibilityRole="button"
              accessibilityLabel="View invoices PDF"
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border bg-white py-3.5 active:opacity-70 dark:bg-neutral-900 ${
                packageId == null
                  ? "border-gray-200 opacity-50 dark:border-neutral-800"
                  : "border-gray-300 dark:border-neutral-700"
              }`}
            >
              {busy === "view" ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <Feather name="eye" size={16} color="#6B7280" />
              )}
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                View
              </Text>
            </Pressable>
            <Pressable
              onPress={() => exportPdf("download")}
              disabled={!canExport}
              accessibilityRole="button"
              accessibilityLabel="Download invoices PDF"
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3.5 active:opacity-90 ${
                packageId == null ? "bg-gray-300 dark:bg-neutral-700" : "bg-[#0644C7]"
              }`}
            >
              {busy === "download" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="download" size={16} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">Download PDF</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
