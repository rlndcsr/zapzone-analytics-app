import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { SelectField, type SelectOption } from "../../components/ui/FormControls";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import { AttractionsListSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
} from "../../components/ui/SummaryPanel";
import {
  EMPTY_TARGETING,
  TargetingSelector,
  targetingPayload,
  targetingSummary,
  type TargetingValue,
} from "../../components/ui/TargetingSelector";
import {
  createPromo,
  deletePromo,
  fetchPromoBatches,
  fetchPromoList,
  generateBulkPromos,
  updatePromo,
  type BulkPromoInput,
  type PromoInput,
  type PromoRow,
  type PromoUpdateInput,
} from "../../services/promosService";
import { ApiError, firstFieldError } from "../../lib/api";
import { useAsyncList } from "../../lib/hooks/useAsyncList";
import { getCurrentUser, getToken } from "../../lib/session";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/** Statuses the edit sheet can set (the API's own enum). */
const STATUS_EDIT_OPTIONS: SelectOption[] = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Expired", value: "expired" },
  { label: "Exhausted", value: "exhausted" },
];

/** `YYYY-MM-DD`, `days` from today — the promo window's fallback bounds. */
const isoDaysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().split("T")[0];

const formatDiscount = (type: string, value: number) =>
  type === "percentage" || type === "percent"
    ? `${value}% off`
    : `$${value.toFixed(2)} off`;

/**
 * Bounds on a typed discount, as the web admin applies them. Only Create insists
 * on a value; Edit leaves a cleared field to its existing "save as 0" handling.
 */
const discountValueError = (
  type: DiscountType,
  raw: string,
  requireValue: boolean,
): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return requireValue ? "Please enter a valid value" : null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return "Please enter a valid value";
  if (value < 0) return "Discount value cannot be negative";
  if (type === "percentage" && value > 100)
    return "Percentage discount cannot exceed 100%";
  return null;
};

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
  onEdit,
  onDelete,
}: {
  promo: PromoRow;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const range = [formatDate(promo.startDate), formatDate(promo.endDate)]
    .filter(Boolean)
    .join(" – ");
  const scope = targetingSummary({
    locationIds: promo.locationIds,
    packageIds: promo.packageIds,
    attractionIds: promo.attractionIds,
    eventIds: promo.eventIds,
  });
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
            onPress={onEdit}
            hitSlop={6}
            className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 items-center justify-center"
            accessibilityLabel={`Edit ${promo.name}`}
          >
            <Feather name="edit-2" size={14} color={PRIMARY} />
          </Pressable>
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

      {/* Where the promo applies (empty targeting reads as "all"). */}
      <View className="flex-row items-start gap-1.5 mt-1.5">
        <Feather name="crosshair" size={11} color="#9CA3AF" />
        <Text
          className="text-[11px] text-gray-400 dark:text-gray-500 flex-1"
          numberOfLines={2}
        >
          Applies to: {scope}
        </Text>
      </View>
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

/**
 * The server's own reason — the first field error when it gave one (the code is
 * taken, the dates are backwards, that location is not yours), else its
 * message. Laravel's message alone reads "… (and 1 more error)".
 */
const apiErrorMessage = (err: unknown, fallback: string): string =>
  firstFieldError(err) || (err instanceof Error && err.message) || fallback;

/**
 * A code refused as taken comes back with one that is free (the API's
 * `suggested_code`), so the form can offer it instead of leaving staff to guess.
 */
const suggestedCodeFrom = (err: unknown): string | null => {
  if (!(err instanceof ApiError)) return null;
  const suggestion = (err.body as { suggested_code?: unknown } | null)
    ?.suggested_code;
  return typeof suggestion === "string" && suggestion.length > 0
    ? suggestion
    : null;
};

const Promos = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

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
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  // Per-status chip counts over every loaded promo code.
  const activeCount = useMemo(() => promos.filter((p) => p.isActive).length, [promos]);
  const statusCount = (value: StatusFilter) =>
    value === "all"
      ? promos.length
      : value === "active"
        ? activeCount
        : promos.length - activeCount;

  const showInitialLoader = loading && promos.length === 0;
  const showError = !loading && !!error && promos.length === 0;
  const showBatchesLoader = batchesLoading && batches.length === 0;
  const showBatchesError = !batchesLoading && !!batchesError && batches.length === 0;

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
  // Where the new promo applies (empty lists = everywhere).
  const [cTargeting, setCTargeting] = useState<TargetingValue>(EMPTY_TARGETING);
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
    setCTargeting(EMPTY_TARGETING);
    setShowCreate(true);
  };

  // Opened from the Packages hub's "Create Promo Code" shortcut
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
    if (!cName.trim()) {
      Alert.alert("Name required", "Please enter a promo name.");
      return;
    }
    const createValueError = discountValueError(cType, cValue, true);
    if (createValueError) {
      Alert.alert("Invalid discount", createValueError);
      return;
    }
    // The API requires a window with end after start; blank fields fall back to
    // today → +30 days, the same defaults the web admin applies.
    const input: PromoInput = {
      name: cName.trim(),
      code: cCode.trim() || undefined,
      type: cType,
      value: Number(cValue) || 0,
      start_date: cStart.trim() || isoDaysFromNow(0),
      end_date: cEnd.trim() || isoDaysFromNow(30),
      description: cDesc.trim() || null,
      created_by: user.id,
      ...(cLimit.trim() ? { usage_limit_total: Number(cLimit) } : null),
      ...(cPerUser.trim() ? { usage_limit_per_user: Number(cPerUser) } : null),
      ...targetingPayload(cTargeting),
    };
    setCreating(true);
    try {
      await createPromo(token, input);
      setShowCreate(false);
      await refetch();
    } catch (err) {
      // Fill in the free code the server offered, so the next tap works.
      const suggestion = suggestedCodeFrom(err);
      if (suggestion) setCCode(suggestion);
      Alert.alert(
        "Create failed",
        apiErrorMessage(err, "Could not create the promo code."),
      );
    } finally {
      setCreating(false);
    }
  };

  // --- Edit single ---
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [eType, setEType] = useState<DiscountType>("fixed");
  const [eValue, setEValue] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eLimit, setELimit] = useState("");
  const [ePerUser, setEPerUser] = useState("");
  const [eStatus, setEStatus] = useState("active");
  const [eDesc, setEDesc] = useState("");
  const [eTargeting, setETargeting] = useState<TargetingValue>(EMPTY_TARGETING);
  const [saving, setSaving] = useState(false);

  const openEdit = (promo: PromoRow) => {
    setEType(promo.discountType === "percentage" ? "percentage" : "fixed");
    setEValue(String(promo.discountValue));
    setEStart(promo.startDate ? promo.startDate.substring(0, 10) : "");
    setEEnd(promo.endDate ? promo.endDate.substring(0, 10) : "");
    setELimit(promo.usageLimit != null ? String(promo.usageLimit) : "");
    setEPerUser(
      promo.usageLimitPerUser != null ? String(promo.usageLimitPerUser) : "",
    );
    setEStatus(promo.status || (promo.isActive ? "active" : "inactive"));
    setEDesc(promo.description);
    setETargeting({
      locationIds: promo.locationIds,
      packageIds: promo.packageIds,
      attractionIds: promo.attractionIds,
      eventIds: promo.eventIds,
    });
    setEditing(promo);
  };

  const submitEdit = async () => {
    const token = getToken();
    if (!token || !editing) return;
    // Fall back to the promo's own window for a cleared field: the API validates
    // `end_date` as "after:start_date" within the same request, so the pair has
    // to travel together.
    const start = eStart.trim() || (editing.startDate?.substring(0, 10) ?? "");
    const end = eEnd.trim() || (editing.endDate?.substring(0, 10) ?? "");
    if (start && end && end <= start) {
      Alert.alert("Invalid dates", "The end date must be after the start date.");
      return;
    }
    const editValueError = discountValueError(eType, eValue, false);
    if (editValueError) {
      Alert.alert("Invalid discount", editValueError);
      return;
    }
    // Targeting always goes up (an empty list clears the restriction), while the
    // other fields are only sent when filled — the API validates `sometimes`.
    // A total of 0 means "no limit", which the API spells null (it requires at
    // least 1); a per-user limit is never sent below 1.
    const totalLimit = Number(eLimit);
    const perUserLimit = Number(ePerUser);
    const input: PromoUpdateInput = {
      type: eType,
      value: Number(eValue) || 0,
      status: eStatus,
      description: eDesc.trim() || null,
      usage_limit_total:
        eLimit.trim() && Number.isFinite(totalLimit) && totalLimit > 0
          ? totalLimit
          : null,
      location_ids: eTargeting.locationIds,
      package_ids: eTargeting.packageIds,
      attraction_ids: eTargeting.attractionIds,
      event_ids: eTargeting.eventIds,
      ...(start ? { start_date: start } : null),
      ...(end ? { end_date: end } : null),
      ...(ePerUser.trim()
        ? {
            usage_limit_per_user:
              Number.isFinite(perUserLimit) && perUserLimit > 0
                ? perUserLimit
                : 1,
          }
        : null),
    };
    setSaving(true);
    try {
      await updatePromo(token, editing.id, input);
      setEditing(null);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Save failed",
        apiErrorMessage(err, "Could not update the promo code."),
      );
    } finally {
      setSaving(false);
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
              apiErrorMessage(err, "Could not delete."),
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
        apiErrorMessage(err, "Could not generate the codes."),
      );
    } finally {
      setGenerating(false);
    }
  };

  // Generate Bulk plus related modules as hub shortcuts; the header's New
  // action creates whatever the open tab lists.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Generate Bulk Codes", icon: "layers", onPress: openBulk },
    { label: "Gift Cards", icon: "gift", route: "/packages/gift-cards" },
    { label: "Manage Packages", icon: "package", route: "/packages/packages" },
    { label: "Add-ons", icon: "coffee", route: "/packages/add-ons" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
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
            Promo Codes
          </Text>
          <Pressable
            onPress={tab === "single" ? openCreate : openBulk}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel={
              tab === "single" ? "Create promo code" : "Generate bulk codes"
            }
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
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
            Create and manage promotional codes
          </Text>

          {/* More — Generate Bulk plus related modules as hub shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Tabs — flat segmented control. */}
          <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 mt-4 mb-3">
            {[
              { key: "single" as const, label: "Single Codes" },
              { key: "bulk" as const, label: "Bulk Codes" },
            ].map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 items-center py-2 rounded-lg ${
                    active ? "bg-white dark:bg-neutral-900" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      active
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
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
              {/* Error state (nothing cached to show) */}
              {showError && (
                <ListErrorBanner
                  title="Could not load promo codes"
                  message={error ?? ""}
                  onRetry={onRefresh}
                />
              )}

              {/* Search */}
              <View className="flex-row items-center gap-2 h-11 px-3.5 mb-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
                <Feather name="search" size={16} color="#9CA3AF" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or code"
                  placeholderTextColor="#9CA3AF"
                  returnKeyType="search"
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
                <ListHeader title="All Promo Codes" count={filtered.length} />
              )}

              <View key="promo-listblock">
              {showInitialLoader ? (
                <View key="s-loading">
                  <AttractionsListSkeleton />
                </View>
              ) : showError ? null : filtered.length === 0 ? (
                <View key="s-empty">
                  {promos.length === 0 ? (
                    <ListEmptyState
                      icon="tag"
                      title="No promo codes yet"
                      message="Create your first promo code to get started."
                      actionLabel="Create Promo Code"
                      actionIcon="plus"
                      primary
                      onAction={openCreate}
                    />
                  ) : (
                    <ListEmptyState
                      icon="search"
                      title="No promo codes found"
                      message="No promo codes match your search or status."
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
                  {paged.map((promo) => (
                    <PromoCard
                      key={promo.id}
                      promo={promo}
                      onEdit={() => openEdit(promo)}
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
              {/* Error state (nothing cached to show) */}
              {showBatchesError && (
                <ListErrorBanner
                  title="Could not load bulk batches"
                  message={batchesError ?? ""}
                  onRetry={onRefresh}
                />
              )}

              {!showBatchesLoader && !showBatchesError && (
                <ListHeader title="Bulk Batches" count={batches.length} />
              )}

              <View key="batch-listblock">
              {showBatchesLoader ? (
                <View key="b-loading">
                  <AttractionsListSkeleton />
                </View>
              ) : showBatchesError ? null : batches.length === 0 ? (
                <View key="b-empty">
                  <ListEmptyState
                    icon="layers"
                    title="No bulk code batches yet"
                    message="Generate unique promo codes in bulk for flyers, mailers, and campaigns."
                    actionLabel="Generate Bulk Codes"
                    actionIcon="plus"
                    primary
                    onAction={openBulk}
                  />
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

          <TargetingSelector
            label="Where this promo applies"
            lockToOwnLocation
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
                Create Promo Code
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Edit Promo Code — name and code stay fixed; everything else is editable. */}
      <BottomSheet
        visible={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title="Edit Promo Code"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-2.5 mb-4">
            <Text
              className="text-sm font-semibold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {editing?.name}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {editing?.code}
            </Text>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Type
              </Text>
              <TypeToggle value={eType} onChange={setEType} />
            </View>
            <View className="w-32">
              <Field
                label={`Value (${eType === "percentage" ? "%" : "$"})`}
                value={eValue}
                onChangeText={setEValue}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Start Date"
                value={eStart}
                onChangeText={setEStart}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="End Date"
                value={eEnd}
                onChangeText={setEEnd}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Total Usage Limit"
                value={eLimit}
                onChangeText={setELimit}
                placeholder="Unlimited"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Usage Limit Per User"
                value={ePerUser}
                onChangeText={setEPerUser}
                placeholder="Unchanged"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View className="mb-4">
            <SelectField
              label="Status"
              value={eStatus}
              options={STATUS_EDIT_OPTIONS}
              onSelect={(v) => setEStatus(String(v))}
              disabled={saving}
            />
          </View>

          <Field
            label="Description"
            value={eDesc}
            onChangeText={setEDesc}
            placeholder="Optional description"
            multiline
          />

          <TargetingSelector
            label="Where this promo applies"
            lockToOwnLocation
            value={eTargeting}
            onChange={setETargeting}
            disabled={saving}
          />

          <View className="flex-row gap-3">
            <Pressable
              onPress={submitEdit}
              disabled={saving}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Save Changes
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setEditing(null)}
              disabled={saving}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
          </View>
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
