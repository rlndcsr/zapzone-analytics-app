import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import { AttractionsListSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SpecCell,
  StatusDotBadge,
} from "../../components/ui/SummaryPanel";
import {
  EMPTY_TARGETING,
  TargetingSelector,
  targetingPayload,
  type TargetingValue,
} from "../../components/ui/TargetingSelector";
import { firstFieldError } from "../../lib/api";
import { venueDateKey } from "../../lib/date/venueTime";
import { giftCardExpiryError } from "../../lib/giftCards/giftCardExpiry";
import {
  describeSellResult,
  GIFT_CARD_SELL_MAX,
  GIFT_CARD_SELL_MIN,
  GIFT_CARD_SELL_PRESETS,
  isValidPurchaserEmail,
  validateSellAmount,
} from "../../lib/giftCards/sellGiftCard";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createGiftCard,
  deleteGiftCard,
  fetchGiftCardList,
  purchaseGiftCard,
  type GiftCardInput,
  type GiftCardRow,
  type PurchasedGiftCard,
} from "../../services/giftCardsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type StatusFilter = "all" | "active" | "inactive";
type GiftCardType = "fixed" | "percentage";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
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
}) => {
  const expires = formatDate(card.expiresAt);
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3">
      {/* Code + status */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 items-center justify-center">
            <Feather name="gift" size={14} color="#D97706" />
          </View>
          <Text
            className="shrink text-base font-semibold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {card.code}
          </Text>
        </View>
        <StatusDotBadge on={card.isActive} label={card.isActive ? "Active" : "Inactive"} />
      </View>

      {!!card.description && (
        <Text
          className="text-[13px] text-gray-500 dark:text-gray-400 leading-5 mt-2"
          numberOfLines={2}
        >
          {card.description}
        </Text>
      )}

      {/* Value / Balance / Usage */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <SpecCell label="Value" value={valueLabel(card)} />
        <SpecCell
          divider
          label="Balance"
          value={card.balance != null ? `$${card.balance.toFixed(2)}` : "—"}
          valueClassName={
            card.balance != null
              ? "text-green-700 dark:text-green-400"
              : "text-gray-900 dark:text-white"
          }
        />
        <SpecCell
          divider
          label="Usage"
          value={`${card.usedCount}${card.maxUsage != null ? ` / ${card.maxUsage}` : ""}`}
        />
      </View>

      {/* Expiry + delete */}
      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {expires ? `Expires ${expires}` : "Never expires"}
        </Text>
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={`Delete ${card.code}`}
        >
          <Feather name="trash-2" size={13} color="#DC2626" />
          <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
            Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

/** A labelled text field used in the create modal. */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  prefix,
  autoCapitalize,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "email-address" | "phone-pad";
  multiline?: boolean;
  prefix?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  /** A line of guidance under the box. */
  hint?: string;
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
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
          style={multiline ? { minHeight: 72, textAlignVertical: "top" } : undefined}
        />
      </View>
      {!!hint && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hint}
        </Text>
      )}
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

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
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  // Per-status chip counts over every loaded card.
  const activeCount = useMemo(() => cards.filter((c) => c.isActive).length, [cards]);
  const statusCount = (value: StatusFilter) =>
    value === "all"
      ? cards.length
      : value === "active"
        ? activeCount
        : cards.length - activeCount;

  const showInitialLoader = loading && cards.length === 0;
  const showError = !loading && !!error && cards.length === 0;

  // --- Create ---
  const [showCreate, setShowCreate] = useState(false);
  const [cType, setCType] = useState<GiftCardType>("fixed");
  const [cValue, setCValue] = useState("");
  const [cBalance, setCBalance] = useState("");
  const [cMaxUsage, setCMaxUsage] = useState("1");
  const [cExpiry, setCExpiry] = useState("");
  const [cDesc, setCDesc] = useState("");
  // Where the new card applies (empty lists = everywhere).
  const [cTargeting, setCTargeting] = useState<TargetingValue>(EMPTY_TARGETING);
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCType("fixed");
    setCValue("");
    setCBalance("");
    setCMaxUsage("1");
    setCExpiry("");
    setCDesc("");
    setCTargeting(EMPTY_TARGETING);
    setShowCreate(true);
  };

  // Opened from the Packages hub's "Create Gift Card" shortcut
  // (?create=1): show the create form once, then drop the param.
  const { create } = useLocalSearchParams<{ create?: string }>();
  useEffect(() => {
    if (create !== "1") return;
    openCreate();
    router.setParams({ create: undefined });
    // openCreate is recreated each render; the param is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create]);

  const submitCreate = async () => {
    const token = getToken();
    const user = getCurrentUser();
    if (!token || !user) return;
    const value = Number(cValue) || 0;
    if (value <= 0) {
      Alert.alert("Value required", "Please enter a gift card value.");
      return;
    }
    if (cType === "percentage" && value > 100) {
      Alert.alert(
        "Invalid value",
        "Percentage gift cards cannot exceed 100%",
      );
      return;
    }
    const expiryError = giftCardExpiryError(
      cExpiry,
      venueDateKey(new Date().toISOString()),
    );
    if (expiryError) {
      Alert.alert("Invalid expiry", expiryError);
      return;
    }
    const input: GiftCardInput = {
      type: cType,
      initial_value: value,
      // Balance defaults to the value when left blank (a fresh card). The API
      // starts every new card at its full value, so this is informational.
      balance: cBalance.trim() ? Number(cBalance) : value,
      max_usage: Number(cMaxUsage) || 1,
      expiry_date: cExpiry.trim() || null,
      description: cDesc.trim() || null,
      created_by: user.id,
      // Managers' cards stay scoped to their own location, as on the web; the
      // API keeps the picked locations below when there are any.
      location_id: user.location_id ?? undefined,
      ...targetingPayload(cTargeting),
    };
    setCreating(true);
    try {
      await createGiftCard(token, input);
      setShowCreate(false);
      await refetch();
    } catch (err) {
      // What the server actually said (e.g. its expiry rule), not a generic line.
      Alert.alert(
        "Create failed",
        firstFieldError(err) ??
          (err instanceof Error && err.message
            ? err.message
            : "Could not create the gift card."),
      );
    } finally {
      setCreating(false);
    }
  };

  // --- Sell (counter sale) ---
  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";
  const { locations: sellLocations, loading: sellLocationsLoading } =
    useLocationOptions();

  const [showSell, setShowSell] = useState(false);
  const [sAmount, setSAmount] = useState("");
  const [sPurchaserName, setSPurchaserName] = useState("");
  const [sPurchaserEmail, setSPurchaserEmail] = useState("");
  const [sPurchaserPhone, setSPurchaserPhone] = useState("");
  const [sLocationId, setSLocationId] = useState<number | null>(null);
  const [sPaymentMethod, setSPaymentMethod] = useState<"cash" | "in-store">(
    "cash",
  );
  const [selling, setSelling] = useState(false);
  const [soldCard, setSoldCard] = useState<PurchasedGiftCard | null>(null);
  const [sellMessage, setSellMessage] = useState("");
  const [sellCodeCopied, setSellCodeCopied] = useState(false);
  const sellCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (sellCopyTimerRef.current) clearTimeout(sellCopyTimerRef.current);
    };
  }, []);

  const openSell = () => {
    setSAmount("");
    setSPurchaserName("");
    setSPurchaserEmail("");
    setSPurchaserPhone("");
    // Non-admins are scoped to their own venue, same as Create — only company
    // admins pick from the location list below.
    setSLocationId(isCompanyAdmin ? null : (currentUser?.location_id ?? null));
    setSPaymentMethod("cash");
    setSelling(false);
    setSoldCard(null);
    setSellMessage("");
    setSellCodeCopied(false);
    setShowSell(true);
  };

  const closeSell = () => {
    setShowSell(false);
    setSoldCard(null);
    setSellMessage("");
    setSellCodeCopied(false);
  };

  const handleCopySoldCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setSellCodeCopied(true);
    if (sellCopyTimerRef.current) clearTimeout(sellCopyTimerRef.current);
    sellCopyTimerRef.current = setTimeout(() => setSellCodeCopied(false), 2000);
  };

  const handleSell = async () => {
    if (selling) return;
    const token = getToken();
    if (!token) return;

    const effectiveLocationId = isCompanyAdmin
      ? sLocationId
      : (currentUser?.location_id ?? null);
    if (!effectiveLocationId) {
      Alert.alert(
        "Location required",
        "Please select the location making this sale.",
      );
      return;
    }
    const amountResult = validateSellAmount(sAmount);
    if (!amountResult.ok) {
      Alert.alert("Invalid amount", amountResult.message);
      return;
    }
    const name = sPurchaserName.trim();
    if (!name) {
      Alert.alert("Purchaser name required", "Please enter the purchaser's name.");
      return;
    }
    const email = sPurchaserEmail.trim();
    if (!isValidPurchaserEmail(email)) {
      Alert.alert("Invalid email", "Please enter a valid purchaser email.");
      return;
    }

    setSelling(true);
    try {
      const result = await purchaseGiftCard(token, {
        location_id: effectiveLocationId,
        amount: amountResult.amount,
        payment_method: sPaymentMethod,
        purchaser_name: name,
        purchaser_email: email,
        purchaser_phone: sPurchaserPhone.trim() || undefined,
      });
      // A duplicate is still a successful sale — same card, different message.
      const { card, message } = describeSellResult(result);
      setSoldCard(card);
      setSellMessage(message);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Sale failed",
        err instanceof Error ? err.message : "Could not sell the gift card.",
      );
    } finally {
      setSelling(false);
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

  // Secondary actions as hub shortcuts; Sell stays the header's primary action.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Create Gift Card", icon: "plus", onPress: openCreate },
    { label: "Promo Codes", icon: "tag", route: "/packages/promos" },
    { label: "Manage Packages", icon: "package", route: "/packages/packages" },
    { label: "Add-ons", icon: "coffee", route: "/packages/add-ons" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary Sell action (as on the web). */}
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
            Gift Cards
          </Text>
          <Pressable
            onPress={openSell}
            className="flex-row items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Sell gift card"
          >
            <Feather name="shopping-cart" size={15} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Sell</Text>
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
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Create and manage gift cards for your customers
          </Text>

          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load gift cards"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* More — Create plus related modules as hub shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 h-11 px-3.5 mt-4 mb-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search gift cards by code"
              placeholderTextColor="#9CA3AF"
              returnKeyType="search"
              autoCapitalize="characters"
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

          {/* Status chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                count={showInitialLoader ? undefined : statusCount(opt.value)}
                selected={statusFilter === opt.value}
                onPress={() => setStatusFilter(opt.value)}
              />
            ))}
          </ScrollView>

          {!showInitialLoader && !showError && (
            <ListHeader title="All Gift Cards" count={filtered.length} />
          )}

          {/* States (distinct keys so css-interop never re-upgrades one fiber) */}
          <View key="gc-listblock">
            {showInitialLoader ? (
              <View key="s-loading">
                <AttractionsListSkeleton />
              </View>
            ) : showError ? null : filtered.length === 0 ? (
              <View key="s-empty">
                {cards.length === 0 ? (
                  <ListEmptyState
                    icon="gift"
                    title="No gift cards yet"
                    message="Create your first gift card to get started."
                    actionLabel="Create Gift Card"
                    actionIcon="plus"
                    primary
                    onAction={openCreate}
                  />
                ) : (
                  <ListEmptyState
                    icon="search"
                    title="No gift cards found"
                    message="No gift cards match your search or status."
                    actionLabel="Clear search & filters"
                    onAction={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  />
                )}
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
            hint="Leave blank for a card that never expires."
          />
          <Field
            label="Description"
            value={cDesc}
            onChangeText={setCDesc}
            placeholder="Optional description"
            multiline
          />

          <TargetingSelector
            label="Where this gift card applies"
            value={cTargeting}
            onChange={setCTargeting}
            disabled={creating}
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

      {/* Sell Gift Card (counter sale) */}
      <BottomSheet
        visible={showSell}
        onClose={closeSell}
        title="Sell Gift Card"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {soldCard ? (
            <View>
              <View className="flex-row items-center gap-2 mb-4">
                <Feather name="check-circle" size={18} color="#16a34a" />
                <Text className="text-sm font-medium text-green-700 dark:text-green-400">
                  {sellMessage}
                </Text>
              </View>
              <View className="border-2 border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-6 items-center mb-4">
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Gift Card Code
                </Text>
                <Text className="font-mono text-2xl font-bold tracking-wider text-gray-900 dark:text-white text-center">
                  {soldCard.code}
                </Text>
                <Text className="text-lg font-semibold text-gray-900 dark:text-white mt-3">
                  ${Number(soldCard.initial_value).toFixed(2)}
                </Text>
                {!!soldCard.location && (
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {soldCard.location}
                  </Text>
                )}
              </View>
              <Text className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                Give this code to the customer — it&apos;s what they redeem. A
                copy was emailed to {soldCard.emailed_to}.
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => handleCopySoldCode(soldCard.code)}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3 rounded-xl active:opacity-90"
                >
                  <Feather
                    name={sellCodeCopied ? "check" : "copy"}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text className="text-sm font-semibold text-white">
                    {sellCodeCopied ? "Copied!" : "Copy code"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={closeSell}
                  className="flex-1 items-center justify-center py-3 rounded-xl border border-gray-300 dark:border-neutral-600"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Done
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Amount ($)
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {GIFT_CARD_SELL_PRESETS.map((amount) => {
                  const active = Number(sAmount) === amount;
                  return (
                    <Pressable
                      key={amount}
                      onPress={() => setSAmount(String(amount))}
                      className={`px-4 py-2 rounded-lg border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-white" : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        ${amount}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label="Custom Amount"
                value={sAmount}
                onChangeText={setSAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="$"
              />
              <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-3 mb-4">
                Pick a preset or enter any amount from ${GIFT_CARD_SELL_MIN} to $
                {GIFT_CARD_SELL_MAX}.
              </Text>

              <Field
                label="Purchaser Name"
                value={sPurchaserName}
                onChangeText={setSPurchaserName}
                placeholder="Jane Doe"
              />
              <Field
                label="Purchaser Email"
                value={sPurchaserEmail}
                onChangeText={setSPurchaserEmail}
                placeholder="jane@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Purchaser Phone (optional)"
                value={sPurchaserPhone}
                onChangeText={setSPurchaserPhone}
                placeholder="+1 555 000 0000"
                keyboardType="phone-pad"
              />

              {isCompanyAdmin && (
                <View className="mb-4">
                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                    Location
                  </Text>
                  {sellLocationsLoading ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : (
                    <View className="border border-gray-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                      {sellLocations.map((loc) => {
                        const active = sLocationId === loc.id;
                        return (
                          <Pressable
                            key={loc.id}
                            onPress={() => setSLocationId(loc.id)}
                            className={`flex-row items-center justify-between px-4 py-3 ${
                              active
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : "bg-white dark:bg-neutral-900"
                            }`}
                          >
                            <Text
                              className={`text-sm ${
                                active
                                  ? "font-semibold text-blue-600 dark:text-blue-400"
                                  : "text-gray-700 dark:text-gray-200"
                              }`}
                            >
                              {loc.name}
                            </Text>
                            {active && (
                              <Feather name="check" size={16} color={PRIMARY} />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Payment Method
              </Text>
              <View className="flex-row gap-2 mb-5">
                {(["cash", "in-store"] as const).map((method) => {
                  const active = sPaymentMethod === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => setSPaymentMethod(method)}
                      className={`flex-1 items-center py-2.5 rounded-xl border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {method === "cash" ? "Cash" : "In-Store"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={handleSell}
                disabled={selling}
                className={`flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90 ${
                  selling ? "opacity-60" : ""
                }`}
              >
                {selling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-sm font-semibold text-white">
                    Complete Sale
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default GiftCards;
