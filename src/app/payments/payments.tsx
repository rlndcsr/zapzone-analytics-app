import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { SelectField } from "../../components/ui/FormControls";
import { Pagination } from "../../components/ui/Pagination";
import { StatTile } from "../../components/ui/StatTile";
import { PaymentsListSkeleton } from "../../components/ui/skeleton/PaymentsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { fetchPackages } from "../../services/packagesService";
import {
  fetchPayments,
  fetchTrashedPayments,
  forceDeletePayment,
  packageInvoicesUrl,
  restorePayment,
  type PaymentRow,
} from "../../services/paymentsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/** ISO -> "Jul 9, 2026, 4:05 PM". */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

const STATUS_FILTERS = ["All", "Completed", "Pending", "Refunded", "Voided", "Failed"];

/** Pill classes for a payment status. */
function statusPill(status: string): { pill: string; text: string } {
  switch (status) {
    case "completed":
      return { pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" };
    case "pending":
      return { pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" };
    case "refunded":
    case "voided":
      return { pill: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" };
    case "failed":
      return { pill: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" };
    default:
      return { pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" };
  }
}

/** One payment card (shared by the main list and the deleted-payments sheet). */
function PaymentCard({ p, deleted }: { p: PaymentRow; deleted?: boolean }) {
  const pill = statusPill(p.status);
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {p.reference}
          </Text>
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            ID: {p.id}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${pill.pill}`}>
          <Text className={`text-xs font-semibold ${pill.text}`}>{p.statusLabel}</Text>
        </View>
      </View>

      <View className="mt-3">
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {p.customerName}
        </Text>
        {!!p.customerEmail && (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {p.customerEmail}
          </Text>
        )}
      </View>

      <View className="flex-row items-center justify-between mt-3">
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-1.5">
            <Feather name="tag" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {p.typeLabel}
              {p.countLabel ? ` • ${p.countLabel}` : ""}
            </Text>
          </View>
          {!!p.payableReference && (
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {p.payableReference}
            </Text>
          )}
        </View>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {money(p.amount)}
        </Text>
      </View>

      <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Feather name="credit-card" size={13} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">{p.methodLabel}</Text>
        </View>
        {!!p.locationName && (
          <View className="flex-row items-center gap-1.5">
            <Feather name="map-pin" size={13} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">{p.locationName}</Text>
          </View>
        )}
        <View className="flex-row items-center gap-1.5">
          <Feather name={deleted ? "trash-2" : "calendar"} size={13} color="#9CA3AF" />
          <Text className={`text-xs ${deleted ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            {deleted ? `Deleted ${fmtDateTime(p.deletedAt)}` : fmtDateTime(p.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const Payments = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Scope to the global workspace location (company_admin). Payments has no
  // backend location param, so filtering stays client-side, keyed off the id.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? null : activeLocation.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [showInvoices, setShowInvoices] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await fetchPayments(token);
      setPayments(list.rows);
      setTotal(list.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Stat cards — counts + revenue over the full fetched set.
  const stats = useMemo(() => {
    const sum = (rows: PaymentRow[]) => rows.reduce((acc, p) => acc + p.amount, 0);
    const completed = payments.filter((p) => p.status === "completed");
    const pending = payments.filter((p) => p.status === "pending");
    const returned = payments.filter((p) => p.status === "refunded" || p.status === "voided");
    return {
      total,
      totalRevenue: sum(payments),
      completedCount: completed.length,
      collected: sum(completed),
      pendingCount: pending.length,
      awaiting: sum(pending),
      returnedCount: returned.length,
      returned: sum(returned),
    };
  }, [payments, total]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesSearch =
        !q ||
        p.reference.toLowerCase().includes(q) ||
        (p.payableReference?.toLowerCase().includes(q) ?? false) ||
        p.customerName.toLowerCase().includes(q) ||
        p.customerEmail.toLowerCase().includes(q) ||
        p.typeLabel.toLowerCase().includes(q) ||
        p.methodLabel.toLowerCase().includes(q) ||
        p.locationName.toLowerCase().includes(q) ||
        p.statusLabel.toLowerCase().includes(q) ||
        p.amount.toFixed(2).includes(q);
      const matchesStatus =
        statusFilter === "All" || p.status === statusFilter.toLowerCase();
      const matchesLocation =
        activeLocationId == null || p.locationId === activeLocationId;
      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [payments, search, statusFilter, activeLocationId]);

  // Reset to page 1 whenever the filters change the result set.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, activeLocationId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);

  const showInitialLoader = loading && payments.length === 0;
  const showError = !loading && !!error && payments.length === 0;

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Payments</Text>
          <Pressable
            onPress={onRefresh}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6" style={CARD_SHADOW}>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">Payments</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View and manage all payment transactions
            </Text>
          </View>

          {/* Invoices / deleted actions */}
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => setShowInvoices(true)}
              className="flex-row items-center gap-1.5 bg-white dark:bg-neutral-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Feather name="package" size={13} color="#6B7280" />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                Package Invoices
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleted(true)}
              className="flex-row items-center gap-1.5 bg-white dark:bg-neutral-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Feather name="trash-2" size={13} color="#6B7280" />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                View Deleted
              </Text>
            </Pressable>
          </View>

          {/* Skeleton (first load) */}
          {showInitialLoader && <PaymentsListSkeleton />}

          {/* Error */}
          {showError && (
            <View className="items-center py-10">
              <Feather name="alert-circle" size={36} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable onPress={load} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {!showInitialLoader && !showError && (
            <>
              {/* Stats */}
              <View className="flex-row flex-wrap gap-3">
                <StatTile icon="credit-card" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Total Payments" value={String(stats.total)} hint={`${money(stats.totalRevenue)} total revenue`} />
                <StatTile icon="check-circle" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Completed" value={String(stats.completedCount)} hint={`${money(stats.collected)} collected`} />
                <StatTile icon="clock" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Pending" value={String(stats.pendingCount)} hint={`${money(stats.awaiting)} awaiting`} />
                <StatTile icon="rotate-ccw" iconBg="bg-orange-50 dark:bg-orange-900/30" iconColor="#EA580C" label="Refunded / Voided" value={String(stats.returnedCount)} hint={`${money(stats.returned)} returned`} />
              </View>

              {/* Search */}
              <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
                <Feather name="search" size={18} color="#9CA3AF" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search payments..."
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

              {/* Status chips */}
              <View className="flex-row flex-wrap gap-2">
                {STATUS_FILTERS.map((s) => {
                  const active = statusFilter === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setStatusFilter(s)}
                      className={`px-3.5 py-2 rounded-lg border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          active ? "text-white" : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* List */}
              {visible.map((p) => (
                <PaymentCard key={p.id} p={p} />
              ))}

              {filtered.length === 0 && (
                <View className="items-center py-10">
                  <Feather name="credit-card" size={36} color="#D1D5DB" />
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    {payments.length === 0 ? "No payments yet" : "No payments match your filters"}
                  </Text>
                </View>
              )}

              {/* Pagination */}
              <Pagination
                page={currentPage}
                perPage={perPage}
                total={filtered.length}
                onPageChange={setPage}
                onPerPageChange={(pp) => {
                  setPerPage(pp);
                  setPage(1);
                }}
              />
            </>
          )}
        </View>
      </ScrollView>

      <PackageInvoicesSheet visible={showInvoices} onClose={() => setShowInvoices(false)} />
      <DeletedPaymentsSheet
        visible={showDeleted}
        onClose={() => setShowDeleted(false)}
        onChanged={load}
      />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Package Invoices sheet                                              */
/* ------------------------------------------------------------------ */

const INVOICE_STATUSES = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

function PackageInvoicesSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [packages, setPackages] = useState<{ id: number; name: string }[]>([]);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<"view" | "download" | null>(null);

  useEffect(() => {
    if (!visible) return;
    const token = getToken();
    if (!token) return;
    fetchPackages({ token, userId: getCurrentUser()?.id })
      .then((rows) => setPackages(rows.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setPackages([]));
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setPackageId(null);
      setStartDate("");
      setEndDate("");
      setStatus("all");
      setBusy(null);
    }
  }, [visible]);

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
      onClose();
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export invoices.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Package Invoices">
      <ScrollView className="px-6 pb-6" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-4">
          Export all invoices for a specific package.
        </Text>

        <View className="gap-4">
          <SelectField
            label="Select Package"
            required
            placeholder={packages.length === 0 ? "Loading packages…" : "-- Select a package --"}
            value={packageId}
            options={packages.map((p) => ({ label: p.name, value: p.id }))}
            onSelect={(v) => setPackageId(Number(v))}
          />

          <View className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 gap-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Optional filters
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Start Date
                </Text>
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  End Date
                </Text>
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
                />
              </View>
            </View>
            <SelectField
              label="Payment Status"
              value={status}
              options={INVOICE_STATUSES}
              onSelect={(v) => setStatus(String(v))}
            />
          </View>

          <View className="flex-row gap-3 mt-1">
            <Pressable
              onPress={() => exportPdf("view")}
              disabled={packageId == null || busy != null}
              className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border ${
                packageId == null ? "border-gray-200 dark:border-neutral-800 opacity-50" : "border-gray-300 dark:border-neutral-700"
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
              disabled={packageId == null || busy != null}
              className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
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
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Deleted payments sheet                                              */
/* ------------------------------------------------------------------ */

function DeletedPaymentsSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { rows: list, total: t } = await fetchTrashedPayments(token);
      setRows(list);
      setTotal(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deleted payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const restore = async (id: number) => {
    const token = getToken();
    if (!token) return;
    setBusyId(id);
    try {
      await restorePayment(token, id);
      await load();
      onChanged();
    } catch (err) {
      Alert.alert("Restore failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteForever = (id: number) => {
    Alert.alert(
      "Delete forever?",
      "This permanently removes the payment. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Forever",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setBusyId(id);
            try {
              await forceDeletePayment(token, id);
              await load();
              onChanged();
            } catch (err) {
              Alert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Deleted Payments${total ? ` (${total})` : ""}`}
    >
      <ScrollView className="px-6 pb-6" showsVerticalScrollIndicator={false}>
        {loading && (
          <View className="items-center py-10">
            <ActivityIndicator size="small" color={PRIMARY} />
          </View>
        )}
        {!loading && error && (
          <Text className="text-sm text-red-600 dark:text-red-400 py-4">{error}</Text>
        )}
        {!loading && !error && rows.length === 0 && (
          <View className="items-center py-10">
            <Feather name="trash-2" size={36} color="#D1D5DB" />
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              No deleted payments.
            </Text>
          </View>
        )}

        <View className="gap-3">
          {rows.map((p) => (
            <View key={p.id} className="gap-2">
              <PaymentCard p={p} deleted />
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => restore(p.id)}
                  disabled={busyId === p.id}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border border-green-200 dark:border-green-900/50"
                >
                  {busyId === p.id ? (
                    <ActivityIndicator size="small" color="#16A34A" />
                  ) : (
                    <Feather name="rotate-ccw" size={15} color="#16A34A" />
                  )}
                  <Text className="text-sm font-semibold text-green-700 dark:text-green-400">
                    Restore
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteForever(p.id)}
                  disabled={busyId === p.id}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500 active:opacity-90"
                >
                  <Feather name="trash-2" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">Delete Forever</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export default Payments;
