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
  createGiftCard,
  deleteGiftCard,
  fetchGiftCardList,
  type GiftCardInput,
  type GiftCardRow,
} from "../../services/giftCardsService";
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
type GiftCardType = "fixed" | "percentage";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

function valueLabel(card: GiftCardRow): string {
  if (card.discountType === "percentage" || card.discountType === "percent") {
    return `${card.value}%`;
  }
  return `$${card.value.toFixed(2)}`;
}

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

const GiftCardCard = ({
  card,
  onDelete,
}: {
  card: GiftCardRow;
  onDelete: () => void;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <View className="flex-row items-center gap-2">
          <Feather name="gift" size={14} color={PRIMARY} />
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {card.code}
          </Text>
        </View>
        {!!formatDate(card.expiresAt) && (
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Expires {formatDate(card.expiresAt)}
          </Text>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <View
          className={`px-2.5 py-1 rounded-full ${
            card.isActive
              ? "bg-green-50 dark:bg-green-900/30"
              : "bg-gray-100 dark:bg-neutral-800"
          }`}
        >
          <Text
            className={`text-[11px] font-semibold ${
              card.isActive
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {card.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 items-center justify-center"
          accessibilityLabel={`Delete ${card.code}`}
        >
          <Feather name="trash-2" size={14} color="#E11D48" />
        </Pressable>
      </View>
    </View>

    <View className="flex-row items-center justify-between pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View>
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Value
        </Text>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {valueLabel(card)}
        </Text>
      </View>
      {card.balance != null && (
        <View className="items-center">
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Balance
          </Text>
          <Text className="text-sm font-bold text-green-600 dark:text-green-400">
            ${card.balance.toFixed(2)}
          </Text>
        </View>
      )}
      <View className="items-end">
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Usage
        </Text>
        <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">
          {card.usedCount}
          {card.maxUsage != null ? `/${card.maxUsage}` : ""}
        </Text>
      </View>
    </View>
  </View>
);

/** A labelled text field used in the create modal. */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  prefix,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  multiline?: boolean;
  prefix?: string;
}) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </Text>
      <View
        className={`flex-row items-center bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-700 ${
          multiline ? "" : ""
        }`}
      >
        {!!prefix && (
          <Text className="text-sm text-gray-500 dark:text-gray-400 mr-1">
            {prefix}
          </Text>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          multiline={multiline}
          className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
          style={multiline ? { minHeight: 72, textAlignVertical: "top" } : undefined}
        />
      </View>
    </View>
  );
}

const GiftCards = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const loader = useCallback(
    ({ token }: { token: string }) => fetchGiftCardList(token),
    [],
  );
  const { data: cards, loading, error, refetch } = useAsyncList(loader);

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
    return cards.filter((c) => {
      if (statusFilter === "active" && !c.isActive) return false;
      if (statusFilter === "inactive" && c.isActive) return false;
      if (term && !c.code.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [cards, search, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Statuses";

  // --- Create ---
  const [showCreate, setShowCreate] = useState(false);
  const [cType, setCType] = useState<GiftCardType>("fixed");
  const [cValue, setCValue] = useState("");
  const [cBalance, setCBalance] = useState("");
  const [cMaxUsage, setCMaxUsage] = useState("1");
  const [cExpiry, setCExpiry] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCType("fixed");
    setCValue("");
    setCBalance("");
    setCMaxUsage("1");
    setCExpiry("");
    setCDesc("");
    setShowCreate(true);
  };

  const submitCreate = async () => {
    const token = getToken();
    if (!token) return;
    const value = Number(cValue) || 0;
    if (value <= 0) {
      Alert.alert("Value required", "Please enter a gift card value.");
      return;
    }
    const input: GiftCardInput = {
      type: cType,
      value,
      // Balance defaults to the value when left blank (a fresh card).
      balance: cBalance.trim() ? Number(cBalance) : value,
      max_usage: Number(cMaxUsage) || 1,
      expiry_date: cExpiry.trim() || null,
      description: cDesc.trim() || null,
    };
    setCreating(true);
    try {
      await createGiftCard(token, input);
      setShowCreate(false);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Create failed",
        err instanceof Error ? err.message : "Could not create the gift card.",
      );
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (card: GiftCardRow) => {
    Alert.alert("Delete gift card", `Delete "${card.code}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          try {
            await deleteGiftCard(token, card.id);
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
            Gift Cards
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
              Gift Cards
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage gift cards for your customers
            </Text>
          </View>

          {/* Create */}
          <Pressable
            onPress={openCreate}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl active:opacity-90 mb-4"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Gift Card
            </Text>
          </Pressable>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-3">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search gift cards by code..."
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
              key="gc-count"
              className="text-sm text-gray-500 dark:text-gray-400 mb-3"
            >
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "gift card" : "gift cards"}
            </Text>
          ) : null}

          {/* States (distinct keys so css-interop never re-upgrades one fiber) */}
          <View key="gc-listblock">
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
                  No gift cards found
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 mb-4">
                  Create your first gift card to get started
                </Text>
                <Pressable
                  onPress={openCreate}
                  className="flex-row items-center gap-2 bg-[#0644C7] px-4 py-3 rounded-xl active:opacity-90"
                >
                  <Feather name="plus" size={16} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Create Gift Card
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View key="s-list">
                {paged.map((card) => (
                  <GiftCardCard
                    key={card.id}
                    card={card}
                    onDelete={() => confirmDelete(card)}
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

      {/* Create Gift Card */}
      <BottomSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Gift Card"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Type
          </Text>
          <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 mb-4">
            {[
              { label: "Fixed Value", value: "fixed" as const },
              { label: "Percentage", value: "percentage" as const },
            ].map((opt) => {
              const active = cType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setCType(opt.value)}
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

          <Field
            label={`Value (${cType === "percentage" ? "%" : "$"})`}
            value={cValue}
            onChangeText={setCValue}
            placeholder="0.00"
            keyboardType="decimal-pad"
            prefix={cType === "percentage" ? undefined : "$"}
          />
          <Field
            label="Balance ($)"
            value={cBalance}
            onChangeText={setCBalance}
            placeholder="0.00"
            keyboardType="decimal-pad"
            prefix="$"
          />
          <Field
            label="Max Usage"
            value={cMaxUsage}
            onChangeText={setCMaxUsage}
            placeholder="1"
            keyboardType="number-pad"
          />
          <Field
            label="Expiry Date"
            value={cExpiry}
            onChangeText={setCExpiry}
            placeholder="YYYY-MM-DD"
          />
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
                Create Gift Card
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default GiftCards;
