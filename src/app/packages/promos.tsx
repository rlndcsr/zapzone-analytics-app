import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { Pagination } from "../../components/ui/Pagination";
import {
  createPromo,
  deletePromo,
  fetchPromoBatches,
  fetchPromoList,
  generateBulkPromos,
  type BulkPromoInput,
  type PromoInput,
  type PromoRow,
} from "../../services/promosService";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { getToken } from "../../lib/session";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type StatusFilter = "all" | "active" | "inactive";
type DiscountType = "fixed" | "percentage";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const formatDiscount = (type: string, value: number) =>
  type === "percentage" || type === "percent"
    ? `${value}% off`
    : `$${value.toFixed(2)} off`;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Client-side random code (mirrors the web "Generate" button). */
function randomCode(length = 8, prefix = ""): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    // Vary by position + clock so we don't rely on Math.random.
    out += chars[(Date.now() + i * 7) % chars.length];
  }
  return `${prefix}${out}`;
}

const PromoCard = ({
  promo,
  onDelete,
}: {
  promo: PromoRow;
  onDelete: () => void;
}) => {
  const range = [formatDate(promo.startDate), formatDate(promo.endDate)]
    .filter(Boolean)
    .join(" – ");
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {promo.name}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <Feather name="tag" size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {promo.code}
            </Text>
          </View>
        </View>
        <View
          className={`px-2.5 py-1 rounded-full ${
            promo.isActive
              ? "bg-green-50 dark:bg-green-900/30"
              : "bg-gray-100 dark:bg-neutral-800"
          }`}
        >
          <Text
            className={`text-[11px] font-semibold ${
              promo.isActive
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {promo.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-2 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Text className="text-lg font-bold text-[#0644C7] dark:text-blue-300">
          {formatDiscount(promo.discountType, promo.discountValue)}
        </Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            {promo.usedCount}
            {promo.usageLimit != null ? `/${promo.usageLimit}` : ""} used
          </Text>
          <Pressable
            onPress={onDelete}
            hitSlop={6}
            className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 items-center justify-center"
            accessibilityLabel={`Delete ${promo.name}`}
          >
            <Feather name="trash-2" size={14} color="#E11D48" />
          </Pressable>
        </View>
      </View>

      {!!range && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="calendar" size={11} color="#9CA3AF" />
          <Text className="text-[11px] text-gray-400 dark:text-gray-500">
            {range}
          </Text>
        </View>
      )}
    </View>
  );
};

/** A labelled text field used across both modals. */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        multiline={multiline}
        className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
        style={multiline ? { minHeight: 72, textAlignVertical: "top" } : undefined}
      />
    </View>
  );
}

/** Fixed / Percentage segmented selector. */
function TypeToggle({
  value,
  onChange,
}: {
  value: DiscountType;
  onChange: (v: DiscountType) => void;
}) {
  return (
    <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
      {[
        { label: "Fixed ($)", value: "fixed" as const },
        { label: "Percent (%)", value: "percentage" as const },
      ].map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 items-center py-2 rounded-lg ${
              active ? "bg-[#0644C7]" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                active ? "text-white" : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const Promos = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const promoLoader = useCallback(
    ({ token }: { token: string }) => fetchPromoList(token),
    [],
  );
  const batchLoader = useCallback(
    ({ token }: { token: string }) => fetchPromoBatches(token),
    [],
  );
  const { data: promos, loading, error, refetch } = useAsyncList(promoLoader);
  const {
    data: batches,
    loading: batchesLoading,
    error: batchesError,
    refetch: refetchBatches,
  } = useAsyncList(batchLoader);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await (tab === "single" ? refetch() : refetchBatches());
    } finally {
      setRefreshing(false);
    }
  }, [tab, refetch, refetchBatches]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return promos.filter((p) => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (
        term &&
        !p.name.toLowerCase().includes(term) &&
        !p.code.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [promos, search, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Statuses";

  // --- Create single ---
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState<DiscountType>("fixed");
  const [cValue, setCValue] = useState("");
  const [cCode, setCCode] = useState("");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cLimit, setCLimit] = useState("");
  const [cPerUser, setCPerUser] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCName("");
    setCType("fixed");
    setCValue("");
    setCCode("");
    setCStart("");
    setCEnd("");
    setCLimit("");
    setCPerUser("");
    setCDesc("");
    setShowCreate(true);
  };

  const submitCreate = async () => {
    const token = getToken();
    if (!token) return;
    if (!cName.trim()) {
      Alert.alert("Name required", "Please enter a promo name.");
      return;
    }
    const input: PromoInput = {
      name: cName.trim(),
      code: cCode.trim() || undefined,
      discount_type: cType,
      discount_value: Number(cValue) || 0,
      start_date: cStart.trim() || null,
      end_date: cEnd.trim() || null,
      usage_limit: cLimit.trim() ? Number(cLimit) : null,
      usage_limit_per_user: cPerUser.trim() ? Number(cPerUser) : null,
      description: cDesc.trim() || null,
    };
    setCreating(true);
    try {
      await createPromo(token, input);
      setShowCreate(false);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Create failed",
        err instanceof Error ? err.message : "Could not create the promo code.",
      );
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (promo: PromoRow) => {
    Alert.alert("Delete promo", `Delete "${promo.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          try {
            await deletePromo(token, promo.id);
            await refetch();
          } catch (err) {
            Alert.alert(
              "Delete failed",
              err instanceof Error ? err.message : "Could not delete.",
            );
          }
        },
      },
    ]);
  };

  // --- Generate bulk ---
  const [showBulk, setShowBulk] = useState(false);
  const [bName, setBName] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bType, setBType] = useState<DiscountType>("fixed");
  const [bValue, setBValue] = useState("");
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bQty, setBQty] = useState("100");
  const [bPrefix, setBPrefix] = useState("");
  const [bLength, setBLength] = useState("8");
  const [bUses, setBUses] = useState("1");
  const [generating, setGenerating] = useState(false);

  const bulkQty = Math.min(1000, Math.max(0, Number(bQty) || 0));

  const openBulk = () => {
    setBName("");
    setBDesc("");
    setBType("fixed");
    setBValue("");
    setBStart("");
    setBEnd("");
    setBQty("100");
    setBPrefix("");
    setBLength("8");
    setBUses("1");
    setShowBulk(true);
  };

  const submitBulk = async () => {
    const token = getToken();
    if (!token) return;
    if (!bName.trim()) {
      Alert.alert("Campaign name required", "Please enter a campaign name.");
      return;
    }
    if (!bStart.trim() || !bEnd.trim()) {
      Alert.alert("Dates required", "Please enter a start and end date.");
      return;
    }
    const input: BulkPromoInput = {
      campaign_name: bName.trim(),
      description: bDesc.trim() || null,
      discount_type: bType,
      discount_value: Number(bValue) || 0,
      start_date: bStart.trim(),
      end_date: bEnd.trim(),
      quantity: bulkQty,
      code_prefix: bPrefix.trim() || null,
      code_length: Math.min(16, Math.max(4, Number(bLength) || 8)),
      uses_per_code: Number(bUses) || 1,
    };
    setGenerating(true);
    try {
      await generateBulkPromos(token, input);
      setShowBulk(false);
      await refetchBatches();
      setTab("bulk");
    } catch (err) {
      Alert.alert(
        "Generation failed",
        err instanceof Error ? err.message : "Could not generate the codes.",
      );
    } finally {
      setGenerating(false);
    }
  };

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
            Promo Codes
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
              Promo Codes
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage promotional codes
            </Text>
          </View>

          {/* Tabs */}
          <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 mb-4">
            {[
              { key: "single" as const, label: "Single Codes" },
              { key: "bulk" as const, label: "Bulk Codes" },
            ].map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  className={`flex-1 items-center py-2.5 rounded-lg ${
                    active ? "bg-[#0644C7]" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      active ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === "single" ? (
            <View key="tab-single">
              <Pressable
                onPress={openCreate}
                className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  Create Promo Code
                </Text>
              </Pressable>

              {/* Search */}
              <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-3">
                <Feather name="search" size={18} color="#9CA3AF" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search promo codes..."
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

              {/* Filter pill — Status */}
              <FilterPill>
                <PillSegment
                  label={statusLabel}
                  active={showStatusSheet}
                  onPress={() => setShowStatusSheet(true)}
                  renderIcon={(c) => (
                    <Feather name="check-circle" size={15} color={c} />
                  )}
                />
              </FilterPill>

              {!loading && !error ? (
                <Text
                  key="promo-count"
                  className="text-sm text-gray-500 dark:text-gray-400 mb-3"
                >
                  Showing {filtered.length}{" "}
                  {filtered.length === 1 ? "promo code" : "promo codes"}
                </Text>
              ) : null}

              <View key="promo-listblock">
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
                  <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-3">
                    <Feather name="plus" size={26} color={PRIMARY} />
                  </View>
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                    No promo codes found
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 mb-4">
                    Create your first promo code to get started
                  </Text>
                  <Pressable
                    onPress={openCreate}
                    className="flex-row items-center gap-2 bg-[#0644C7] px-4 py-3 rounded-xl active:opacity-90"
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Create Promo Code
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View key="s-list">
                  {paged.map((promo) => (
                    <PromoCard
                      key={promo.id}
                      promo={promo}
                      onDelete={() => confirmDelete(promo)}
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
            </View>
          ) : (
            <View key="tab-bulk">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {batches.length} {batches.length === 1 ? "batch" : "batches"}
                </Text>
                <Pressable
                  onPress={openBulk}
                  className="flex-row items-center gap-2 bg-[#0644C7] px-4 py-2.5 rounded-xl active:opacity-90"
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Generate Bulk
                  </Text>
                </Pressable>
              </View>

              <View key="batch-listblock">
              {batchesLoading ? (
                <View key="b-loading" className="py-16 items-center">
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : batchesError ? (
                <View key="b-error" className="bg-red-50 border border-red-100 rounded-2xl p-5">
                  <Text className="text-red-600 font-semibold">
                    Something went wrong
                  </Text>
                  <Text className="text-red-500 text-sm mt-1">{batchesError}</Text>
                </View>
              ) : batches.length === 0 ? (
                <View key="b-empty" className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
                  <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-3">
                    <Feather name="plus" size={26} color={PRIMARY} />
                  </View>
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                    No bulk code batches yet
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 mb-4">
                    Generate unique promo codes in bulk for flyers, mailers, and
                    campaigns
                  </Text>
                  <Pressable
                    onPress={openBulk}
                    className="flex-row items-center gap-2 bg-[#0644C7] px-4 py-3 rounded-xl active:opacity-90"
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Generate Bulk Codes
                    </Text>
                  </Pressable>
                </View>
              ) : (
                batches.map((batch) => (
                  <View
                    key={batch.id}
                    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
                    style={CARD_SHADOW}
                  >
                    <Text
                      className="text-base font-bold text-gray-900 dark:text-white"
                      numberOfLines={1}
                    >
                      {batch.name}
                    </Text>
                    <View className="flex-row items-center gap-4 mt-2">
                      <View className="flex-row items-center gap-1.5">
                        <Feather name="hash" size={13} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {batch.quantity} codes
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <Feather name="check-circle" size={13} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {batch.usedCount} used
                        </Text>
                      </View>
                    </View>
                    {!!formatDate(batch.createdAt) && (
                      <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                        {formatDate(batch.createdAt)}
                      </Text>
                    )}
                  </View>
                ))
              )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Status filter picker */}
      <BottomSheet
        visible={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setStatusFilter(opt.value);
                  setShowStatusSheet(false);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  active ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {opt.label}
                </Text>
                {active && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Create Promo Code */}
      <BottomSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Promo Code"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Field
            label="Name"
            required
            value={cName}
            onChangeText={setCName}
            placeholder="e.g. Summer Sale 20%"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Type
              </Text>
              <TypeToggle value={cType} onChange={setCType} />
            </View>
            <View className="w-32">
              <Field
                label={`Value (${cType === "percentage" ? "%" : "$"})`}
                value={cValue}
                onChangeText={setCValue}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Promo Code
          </Text>
          <View className="flex-row gap-2 mb-4">
            <TextInput
              value={cCode}
              onChangeText={setCCode}
              placeholder="Leave empty to auto-generate"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              className="flex-1 bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
            />
            <Pressable
              onPress={() => setCCode(randomCode(8))}
              className="px-4 items-center justify-center rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Generate
              </Text>
            </Pressable>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Start Date"
                value={cStart}
                onChangeText={setCStart}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="End Date"
                value={cEnd}
                onChangeText={setCEnd}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Total Usage Limit"
                value={cLimit}
                onChangeText={setCLimit}
                placeholder="Unlimited"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Usage Limit Per User"
                value={cPerUser}
                onChangeText={setCPerUser}
                placeholder="Unlimited"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Field
            label="Description"
            value={cDesc}
            onChangeText={setCDesc}
            placeholder="Optional description"
            multiline
          />

          <Pressable
            onPress={submitCreate}
            disabled={creating}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            {creating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                Create Promo Code
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Generate Bulk Promo Codes */}
      <BottomSheet
        visible={showBulk}
        onClose={() => setShowBulk(false)}
        title="Generate Bulk Promo Codes"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Field
            label="Campaign Name"
            required
            value={bName}
            onChangeText={setBName}
            placeholder="e.g. Spring Flyer Campaign"
          />
          <Field
            label="Description"
            value={bDesc}
            onChangeText={setBDesc}
            placeholder="Optional internal description"
            multiline
          />

          <Text className="text-sm font-bold text-gray-900 dark:text-white mb-2">
            Discount Settings
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Type *
              </Text>
              <TypeToggle value={bType} onChange={setBType} />
            </View>
            <View className="w-28">
              <Field
                label={`Value (${bType === "percentage" ? "%" : "$"})`}
                required
                value={bValue}
                onChangeText={setBValue}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text className="text-sm font-bold text-gray-900 dark:text-white mb-2">
            Validity Period
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Start Date"
                required
                value={bStart}
                onChangeText={setBStart}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="End Date"
                required
                value={bEnd}
                onChangeText={setBEnd}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <Text className="text-sm font-bold text-gray-900 dark:text-white mb-2">
            Code Generation Settings
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Quantity (max 1000)"
                required
                value={bQty}
                onChangeText={setBQty}
                placeholder="100"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Code Prefix"
                value={bPrefix}
                onChangeText={setBPrefix}
                placeholder="e.g. ZAP"
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Code Length (4–16)"
                value={bLength}
                onChangeText={setBLength}
                placeholder="8"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Uses Per Code"
                value={bUses}
                onChangeText={setBUses}
                placeholder="1"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setShowBulk(false)}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={submitBulk}
              disabled={generating}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {generating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Generate {bulkQty} Codes
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Promos;
