import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  CheckboxRow,
  FieldLabel,
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "../../components/ui/FormControls";
import { MembershipPlansListSkeleton } from "../../components/ui/skeleton/MembershipsSkeleton";
import { useMembershipPlans } from "../../lib/hooks/useMembershipPlans";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAddOns } from "../../services/addOnsService";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchEvents } from "../../services/eventsService";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import { fetchPackages } from "../../services/packagesService";
import {
  BENEFIT_TYPES,
  createBenefit,
  deleteBenefit,
  deletePlan,
  fetchBillingAccounts,
  fetchPlanBenefits,
  savePlan,
  togglePlanStatus,
  VALUE_MODE_LABELS,
  type BenefitType,
  type BillingAccount,
  type BillingCycle,
  type CancellationMode,
  type LocationAccessMode,
  type MembershipPlanRow,
  type PlanBenefit,
  type ScopeType,
  type UsageType,
  type ValueMode,
} from "../../services/membershipPlansService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";

const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One-time" },
  { value: "custom", label: "Custom" },
];

const USAGE_TYPES: { value: UsageType; label: string }[] = [
  { value: "unlimited", label: "Unlimited" },
  { value: "limited_visits", label: "Limited visits" },
  { value: "punch_card", label: "Punch card" },
  { value: "limited", label: "Limited uses" },
];

const ACCESS_MODES: { value: LocationAccessMode; label: string }[] = [
  { value: "single", label: "Single Home Location" },
  { value: "multi", label: "Multi-Location" },
  { value: "all", label: "All Locations" },
];

const CANCELLATION_MODES: { value: CancellationMode; label: string }[] = [
  { value: "end_of_term", label: "End of Term" },
  { value: "immediate", label: "Immediate" },
  { value: "staff_only", label: "Staff Only" },
];

const DEFAULT_BILLING = "default"; // sentinel = per member's home location

/** Parse an optional numeric text field into a number or null when blank. */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** Normalize a backend date value to a YYYY-MM-DD input string. */
function toDateInput(v: string | null | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

/** A specific benefit target scope (the "any" scope needs no catalog). */
type TargetScope = Exclude<ScopeType, "any">;

/**
 * Which target catalog each benefit type scopes to. null = the benefit only
 * supports "any" (no per-item selector), matching the backend SCOPE_MATRIX.
 */
const BENEFIT_TARGET_SCOPE: Record<BenefitType, TargetScope | null> = {
  package_discount: "package",
  attraction_discount: "attraction",
  event_discount: "event",
  addon_discount: "addon",
  free_entry_pass: "attraction",
  guest_pass: "attraction",
  priority_booking: null,
  member_only_access: "location",
  birthday_reward: null,
};

const ALL_TARGETS_LABEL: Record<TargetScope, string> = {
  package: "All packages",
  attraction: "All attractions",
  event: "All events",
  addon: "All add-ons",
  location: "All locations",
};

/** Fetch the selectable targets for a benefit scope, normalized to {id,name}. */
async function fetchBenefitTargets(
  scope: TargetScope,
  token: string,
  userId: number,
): Promise<{ id: number; name: string }[]> {
  const strip = (rows: { id: number; name: string }[]) =>
    rows.map((r) => ({ id: r.id, name: r.name }));
  switch (scope) {
    case "package":
      return strip(await fetchPackages({ token, userId }));
    case "attraction":
      return strip(await fetchAttractions({ token, userId }));
    case "event":
      return strip(await fetchEvents({ token, userId }));
    case "addon":
      return strip(await fetchAddOns({ token, userId }));
    case "location":
      return await fetchLocations(token);
  }
}

/** A labeled attribute chip (INTERVAL / USAGE / ACCESS). */
function AttrChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 bg-gray-100 dark:bg-neutral-800 px-2.5 py-1.5 rounded-md">
      {icon}
      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
        {label}
      </Text>
    </View>
  );
}

const MembershipPlans = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const { plans, loading, error, refetch, applyStatus, invalidate } =
    useMembershipPlans();

  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<MembershipPlanRow | null | undefined>(
    undefined, // undefined = closed, null = new plan, row = edit
  );
  const [benefitsPlan, setBenefitsPlan] = useState<MembershipPlanRow | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Optimistically flip the toggle, then reconcile with the server's response.
  const handleToggle = async (plan: MembershipPlanRow) => {
    const token = getToken();
    if (!token) return;
    const next = !plan.isActive;
    applyStatus(plan.id, next);
    setTogglingId(plan.id);
    try {
      const confirmed = await togglePlanStatus(token, plan.id);
      applyStatus(plan.id, confirmed);
    } catch (err) {
      applyStatus(plan.id, !next); // revert
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update plan status.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (plan: MembershipPlanRow) => {
    Alert.alert(
      "Delete plan?",
      `"${plan.name}" will be permanently deleted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setDeletingId(plan.id);
            try {
              await deletePlan(token, plan.id);
              invalidate();
              await refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete plan.",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const showInitialLoader = loading && plans.length === 0;
  const showError = !loading && !!error && plans.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Membership Plans
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5">
          {/* Intro */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Membership Plans
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Pricing, billing cadence, and access rules
            </Text>
          </View>

          {/* New Plan */}
          <Pressable
            onPress={() => setEditing(null)}
            className="flex-row items-center justify-center gap-2 bg-[#0644C7] px-4 py-3.5 rounded-xl mb-5 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New plan"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New Plan</Text>
          </Pressable>

          {/* Loading */}
          {showInitialLoader && <MembershipPlansListSkeleton />}

          {/* Error */}
          {showError && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={onRefresh}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Plan cards */}
          {!showInitialLoader && !showError && (
            <View className="gap-4">
              {plans.map((plan) => (
                <View
                  key={plan.id}
                  className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
                  style={CARD_SHADOW}
                >
                  {/* Name + status toggle */}
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-bold text-gray-900 dark:text-white">
                        {plan.name}
                      </Text>
                      <Text className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                        {plan.price <= 0 ? "Free" : `$${plan.price.toFixed(2)}`}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center gap-2">
                        {togglingId === plan.id && (
                          <ActivityIndicator size="small" color={PRIMARY} />
                        )}
                        <Switch
                          value={plan.isActive}
                          onValueChange={() => handleToggle(plan)}
                          disabled={togglingId === plan.id}
                          trackColor={{ false: "#D1D5DB", true: "#86B7FF" }}
                          thumbColor={plan.isActive ? PRIMARY : "#F3F4F6"}
                        />
                      </View>
                      <Text
                        className={`text-xs font-semibold mt-1 ${
                          plan.isActive
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {plan.isActive ? "Active" : "Inactive"}
                      </Text>
                    </View>
                  </View>

                  {/* Attribute chips */}
                  <View className="flex-row flex-wrap items-center gap-2 mt-3">
                    <AttrChip
                      icon={<Feather name="repeat" size={11} color="#6B7280" />}
                      label={plan.intervalLabel}
                    />
                    <AttrChip
                      icon={<Feather name="activity" size={11} color="#6B7280" />}
                      label={plan.usageLabel}
                    />
                    <AttrChip
                      icon={<Feather name="map-pin" size={11} color="#6B7280" />}
                      label={plan.accessLabel}
                    />
                    {plan.membersCount > 0 && (
                      <AttrChip
                        icon={<Feather name="users" size={11} color="#6B7280" />}
                        label={`${plan.membersCount} member${
                          plan.membersCount === 1 ? "" : "s"
                        }`}
                      />
                    )}
                  </View>

                  {/* Actions */}
                  <View className="flex-row items-center gap-2 mt-4">
                    <Pressable
                      onPress={() => setBenefitsPlan(plan)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-800"
                    >
                      <Feather name="gift" size={14} color="#6B7280" />
                      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        Benefits
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditing(plan)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-800"
                    >
                      <Feather name="edit-2" size={14} color="#6B7280" />
                      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(plan)}
                      disabled={deletingId === plan.id}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 active:opacity-90"
                    >
                      {deletingId === plan.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Feather name="trash-2" size={14} color="#FFFFFF" />
                      )}
                      <Text className="text-xs font-semibold text-white">
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Empty */}
          {!showInitialLoader && !showError && plans.length === 0 && (
            <View className="items-center py-14">
              <Feather name="layers" size={40} color="#D1D5DB" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                No plans yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Create / edit form */}
      <PlanFormSheet
        // undefined = closed; null = new; row = edit
        state={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          invalidate();
          refetch();
        }}
      />

      {/* Enforceable benefits */}
      <BenefitsSheet plan={benefitsPlan} onClose={() => setBenefitsPlan(null)} />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Plan create / edit form                                             */
/* ------------------------------------------------------------------ */

function PlanFormSheet({
  state,
  onClose,
  onSaved,
}: {
  state: MembershipPlanRow | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = state !== undefined;
  const editingPlan = state ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [trialDays, setTrialDays] = useState("0");
  const [termMonths, setTermMonths] = useState("1");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [usageType, setUsageType] = useState<UsageType>("unlimited");
  const [visits, setVisits] = useState("");
  const [uses, setUses] = useState("");
  const [punch, setPunch] = useState("");
  const [accessMode, setAccessMode] = useState<LocationAccessMode>("single");
  const [planLocationId, setPlanLocationId] = useState<number | null>(null);
  const [approvedIds, setApprovedIds] = useState<number[]>([]);
  const [billingAccountId, setBillingAccountId] = useState<number | null>(null);
  const [cancellationMode, setCancellationMode] =
    useState<CancellationMode>("end_of_term");
  const [graceDays, setGraceDays] = useState("7");
  const [retryDays, setRetryDays] = useState("3");
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [isFamily, setIsFamily] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BillingAccount[]>([]);

  // Load the locations picker; surfaced with loading/error/retry so it can never
  // silently stick (used by both Plan Location and Approved Locations).
  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      setLocations(await fetchLocations(token));
    } catch (err) {
      setLocationsError(
        err instanceof Error ? err.message : "Failed to load locations",
      );
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  // Load the location + billing-account pickers lazily when the form opens.
  useEffect(() => {
    if (!visible) return;
    loadLocations();
    const token = getToken();
    if (!token) return;
    fetchBillingAccounts(token).then(setAccounts).catch(() => setAccounts([]));
  }, [visible, loadLocations]);

  // Prime the form each time it opens (blank for new, pre-filled for edit).
  useEffect(() => {
    if (!visible) return;
    if (editingPlan) {
      const raw = editingPlan.raw;
      setName(editingPlan.name);
      setDescription(editingPlan.description);
      setPrice(String(editingPlan.price));
      setCycle(editingPlan.billingCycle);
      setTrialDays(String(raw.trial_days ?? 0));
      setTermMonths(String(raw.term_length_months ?? 1));
      setSeasonStart(toDateInput(raw.season_start_date));
      setSeasonEnd(toDateInput(raw.season_end_date));
      setUsageType(editingPlan.usageType);
      setVisits(raw.visits_per_term != null ? String(raw.visits_per_term) : "");
      setUses(raw.uses_per_term != null ? String(raw.uses_per_term) : "");
      setPunch(raw.punch_card_total != null ? String(raw.punch_card_total) : "");
      setAccessMode(editingPlan.locationAccessMode);
      setPlanLocationId(raw.location_id ?? null);
      setApprovedIds(editingPlan.approvedLocationIds);
      setBillingAccountId(editingPlan.billingAccountId);
      setCancellationMode(raw.cancellation_mode ?? "end_of_term");
      setGraceDays(String(raw.grace_period_days ?? 7));
      setRetryDays(String(raw.failed_payment_retry_days ?? 3));
      setRequiresPhoto(!!raw.requires_photo);
      setIsFamily(!!raw.is_family_or_group);
      setIsActive(editingPlan.isActive);
    } else {
      setName("");
      setDescription("");
      setPrice("0");
      setCycle("monthly");
      setTrialDays("0");
      setTermMonths("1");
      setSeasonStart("");
      setSeasonEnd("");
      setUsageType("unlimited");
      setVisits("");
      setUses("");
      setPunch("");
      setAccessMode("single");
      setPlanLocationId(null);
      setApprovedIds([]);
      setBillingAccountId(null);
      setCancellationMode("end_of_term");
      setGraceDays("7");
      setRetryDays("3");
      setRequiresPhoto(false);
      setIsFamily(false);
      setIsActive(true);
    }
    setSubmitting(false);
  }, [visible, editingPlan]);

  const priceNum = Number(price);
  const priceValid = price.trim() !== "" && !Number.isNaN(priceNum) && priceNum >= 0;
  const canSubmit = name.trim() !== "" && priceValid && !submitting;

  const toggleApproved = (id: number) =>
    setApprovedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const locationOptions: SelectOption[] = locations.map((l) => ({
    label: l.name,
    value: l.id,
  }));
  const billingOptions: SelectOption[] = [
    { label: "Each member's home location (default)", value: DEFAULT_BILLING },
    ...accounts.map((a) => ({
      label: a.locationName ? `${a.label} · ${a.locationName}` : a.label,
      value: a.id,
    })),
  ];

  const handleSave = async () => {
    const token = getToken();
    if (!token || !canSubmit) return;
    setSubmitting(true);
    try {
      await savePlan(token, editingPlan?.id ?? null, {
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        billing_cycle: cycle,
        trial_days: numOrNull(trialDays),
        term_length_months: numOrNull(termMonths),
        season_start_date: seasonStart.trim() || null,
        season_end_date: seasonEnd.trim() || null,
        usage_type: usageType,
        unlimited_visits_per_term: usageType === "unlimited",
        visits_per_term: usageType === "limited_visits" ? numOrNull(visits) : null,
        uses_per_term: usageType === "limited" ? numOrNull(uses) : null,
        punch_card_total: usageType === "punch_card" ? numOrNull(punch) : null,
        location_access_mode: accessMode,
        location_id: planLocationId,
        approved_location_ids: accessMode === "multi" ? approvedIds : undefined,
        billing_account_id: billingAccountId,
        cancellation_mode: cancellationMode,
        grace_period_days: numOrNull(graceDays),
        failed_payment_retry_days: numOrNull(retryDays),
        requires_photo: requiresPhoto,
        is_family_or_group: isFamily,
        is_active: isActive,
      });
      onSaved();
    } catch (err) {
      Alert.alert(
        "Could not save plan",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editingPlan ? "Edit Plan" : "New Plan"}
    >
      <ScrollView
        className="px-6 pb-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4 -mt-1">
          Configure pricing, usage limits, and access rules.
        </Text>

        <View className="gap-4">
          <TextField
            label="Name"
            required
            value={name}
            onChangeText={setName}
            placeholder="e.g. Season Pass"
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What this plan includes"
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />

          <TextField
            label="Price (USD)"
            required
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <SelectField
            label="Billing Interval"
            value={cycle}
            options={BILLING_CYCLES}
            onSelect={(v) => setCycle(v as BillingCycle)}
          />

          <TextField
            label="Trial Period (days)"
            value={trialDays}
            onChangeText={setTrialDays}
            placeholder="0"
            keyboardType="number-pad"
          />
          <TextField
            label="Term Length (months)"
            value={termMonths}
            onChangeText={setTermMonths}
            placeholder="1"
            keyboardType="number-pad"
          />

          <TextField
            label="Season Start Date"
            value={seasonStart}
            onChangeText={setSeasonStart}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <TextField
            label="Season End Date"
            value={seasonEnd}
            onChangeText={setSeasonEnd}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />

          <SelectField
            label="Usage Type"
            value={usageType}
            options={USAGE_TYPES}
            onSelect={(v) => setUsageType(v as UsageType)}
          />
          {usageType === "limited_visits" && (
            <TextField
              label="Visits per term"
              value={visits}
              onChangeText={setVisits}
              placeholder="e.g. 10"
              keyboardType="number-pad"
            />
          )}
          {usageType === "limited" && (
            <TextField
              label="Uses per term"
              value={uses}
              onChangeText={setUses}
              placeholder="e.g. 10"
              keyboardType="number-pad"
            />
          )}
          {usageType === "punch_card" && (
            <TextField
              label="Punch card total"
              value={punch}
              onChangeText={setPunch}
              placeholder="e.g. 10"
              keyboardType="number-pad"
            />
          )}

          <SelectField
            label="Location Access"
            value={accessMode}
            options={ACCESS_MODES}
            onSelect={(v) => setAccessMode(v as LocationAccessMode)}
          />

          {accessMode === "multi" ? (
            <View>
              <FieldLabel>Approved Locations</FieldLabel>
              {locationsLoading && locations.length === 0 ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator size="small" color={PRIMARY} />
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    Loading locations…
                  </Text>
                </View>
              ) : locationsError && locations.length === 0 ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-red-600 dark:text-red-400 flex-1 mr-2">
                    {locationsError}
                  </Text>
                  <Pressable
                    onPress={loadLocations}
                    className="px-3 py-1.5 rounded-lg bg-[#0644C7]"
                  >
                    <Text className="text-xs font-semibold text-white">Retry</Text>
                  </Pressable>
                </View>
              ) : locations.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  No locations available.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {locations.map((l) => {
                    const checked = approvedIds.includes(l.id);
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => toggleApproved(l.id)}
                        className={`flex-row items-center gap-2 px-3 py-2.5 rounded-xl border min-w-[47%] ${
                          checked
                            ? "border-[#0644C7] bg-[#0644C7]/5"
                            : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                        }`}
                      >
                        <View
                          className={`w-4 h-4 rounded border items-center justify-center ${
                            checked
                              ? "bg-[#0644C7] border-[#0644C7]"
                              : "border-gray-300 dark:border-neutral-700"
                          }`}
                        >
                          {checked && (
                            <Feather name="check" size={11} color="#FFFFFF" />
                          )}
                        </View>
                        <Text
                          className={`text-xs flex-1 ${
                            checked
                              ? "text-[#0644C7] font-medium"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {l.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <SelectField
              label="Plan Location"
              placeholder="Select a location..."
              value={planLocationId}
              options={locationOptions}
              onSelect={(v) => setPlanLocationId(Number(v))}
            />
          )}

          <View>
            <SelectField
              label="Billing Account (Authorize.Net)"
              value={billingAccountId ?? DEFAULT_BILLING}
              options={billingOptions}
              onSelect={(v) =>
                setBillingAccountId(v === DEFAULT_BILLING ? null : Number(v))
              }
            />
            {billingAccountId == null && (
              <View className="flex-row items-start gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 mt-2">
                <Feather name="dollar-sign" size={14} color={PRIMARY} style={{ marginTop: 1 }} />
                <Text className="text-xs text-gray-600 dark:text-gray-300 flex-1">
                  Payments use the Authorize.Net account registered to the
                  member&apos;s home location.
                </Text>
              </View>
            )}
          </View>

          <SelectField
            label="Cancellation Mode"
            value={cancellationMode}
            options={CANCELLATION_MODES}
            onSelect={(v) => setCancellationMode(v as CancellationMode)}
          />
          <TextField
            label="Grace Period (days)"
            value={graceDays}
            onChangeText={setGraceDays}
            placeholder="7"
            keyboardType="number-pad"
          />
          <TextField
            label="Retry Failed Payment (days)"
            value={retryDays}
            onChangeText={setRetryDays}
            placeholder="3"
            keyboardType="number-pad"
          />

          <View className="gap-3 mt-1">
            <CheckboxRow
              label="Requires member photo"
              checked={requiresPhoto}
              onToggle={() => setRequiresPhoto((v) => !v)}
            />
            <CheckboxRow
              label="Family / Group plan"
              checked={isFamily}
              onToggle={() => setIsFamily((v) => !v)}
            />
          </View>

          <ToggleRow label="Active" value={isActive} onValueChange={setIsActive} />
        </View>

        {/* Submit */}
        <View className="flex-row gap-3 mt-7">
          <Pressable
            onPress={onClose}
            className="flex-1 items-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!canSubmit}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
              canSubmit ? "bg-[#0644C7]" : "bg-gray-300 dark:bg-neutral-700"
            }`}
          >
            {submitting && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className="text-sm font-semibold text-white">
              {editingPlan ? "Save Changes" : "Create Plan"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Enforceable benefits                                                */
/* ------------------------------------------------------------------ */

function BenefitsSheet({
  plan,
  onClose,
}: {
  plan: MembershipPlanRow | null;
  onClose: () => void;
}) {
  const [benefits, setBenefits] = useState<PlanBenefit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownName, setShownName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Inline "Add benefit" form.
  const [adding, setAdding] = useState(false);
  const [bType, setBType] = useState<BenefitType>("package_discount");
  const [bLabel, setBLabel] = useState("");
  const [bMode, setBMode] = useState<ValueMode>("percent");
  const [bValue, setBValue] = useState("");
  const [bActive, setBActive] = useState(true);
  const [scopeSel, setScopeSel] = useState<string>("any");
  const [targets, setTargets] = useState<{ id: number; name: string }[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [priority, setPriority] = useState("0");
  const [isStackable, setIsStackable] = useState(false);
  const [manualRedemption, setManualRedemption] = useState(false);
  const [savingBenefit, setSavingBenefit] = useState(false);

  const planId = plan?.id ?? null;

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || planId == null) return;
    setLoading(true);
    setError(null);
    try {
      setBenefits(await fetchPlanBenefits(token, planId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load benefits");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (!plan) return;
    setShownName(plan.name);
    setAdding(false);
    setBenefits([]);
    load();
  }, [plan, load]);

  // Keep value_mode valid for the chosen benefit type.
  const typeSpec = BENEFIT_TYPES.find((t) => t.value === bType) ?? BENEFIT_TYPES[0];
  const modeNeedsValue = bMode === "percent" || bMode === "fixed" || bMode === "count";
  const valueNum = Number(bValue);
  const valueValid = !modeNeedsValue || (bValue.trim() !== "" && valueNum >= 0);
  const targetScope = BENEFIT_TARGET_SCOPE[bType];

  // Load the "Applies to" catalog for the chosen benefit type while the add form
  // is open. Types with no target scope (priority booking, birthday reward) skip.
  useEffect(() => {
    if (!adding) return;
    const scope = BENEFIT_TARGET_SCOPE[bType];
    if (!scope) {
      setTargets([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    setTargetsLoading(true);
    fetchBenefitTargets(scope, token, getCurrentUser()?.id ?? 0)
      .then((t) => active && setTargets(t))
      .catch(() => active && setTargets([]))
      .finally(() => {
        if (active) setTargetsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adding, bType]);

  const startAdd = () => {
    setBType("package_discount");
    setBLabel("");
    setBMode("percent");
    setBValue("");
    setScopeSel("any");
    setMaxRedemptions("");
    setPriority("0");
    setIsStackable(false);
    setManualRedemption(false);
    setBActive(true);
    setAdding(true);
  };

  const onPickType = (value: string | number) => {
    const next = value as BenefitType;
    setBType(next);
    const spec = BENEFIT_TYPES.find((t) => t.value === next);
    setBMode(spec?.modes[0] ?? "percent");
    setBValue("");
    setScopeSel("any"); // scope options change with the type
  };

  const handleAdd = async () => {
    const token = getToken();
    if (!token || planId == null || !valueValid) return;

    // Decode the "Applies to" selection into scope_type + scope_id.
    let scopeType: ScopeType = "any";
    let scopeId: number | null = null;
    if (targetScope && scopeSel !== "any") {
      const [t, idStr] = scopeSel.split(":");
      scopeType = t as ScopeType;
      scopeId = Number(idStr);
    }

    setSavingBenefit(true);
    try {
      await createBenefit(token, planId, {
        benefitType: bType,
        label: bLabel.trim() || undefined,
        valueMode: bMode,
        value: modeNeedsValue ? valueNum : 0,
        scopeType,
        scopeId,
        maxRedemptions: numOrNull(maxRedemptions),
        priority: numOrNull(priority) ?? 0,
        isStackable,
        requiresManualRedemption: manualRedemption,
        isActive: bActive,
      });
      setAdding(false);
      await load();
    } catch (err) {
      Alert.alert(
        "Could not add benefit",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSavingBenefit(false);
    }
  };

  const handleDeleteBenefit = (benefitId: number) => {
    if (planId == null) return;
    Alert.alert("Remove benefit?", "This benefit will stop applying.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const token = getToken();
          if (!token) return;
          setDeletingId(benefitId);
          try {
            await deleteBenefit(token, planId, benefitId);
            await load();
          } catch (err) {
            Alert.alert(
              "Delete failed",
              err instanceof Error ? err.message : "Please try again.",
            );
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <BottomSheet visible={!!plan} onClose={onClose} title="Enforceable Benefits">
      <ScrollView
        className="px-6 pb-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-sm text-gray-500 dark:text-gray-400 -mt-1">
          {shownName ? `${shownName} — ` : ""}applied automatically at checkout and
          check-in (server-enforced).
        </Text>

        {loading && (
          <View className="items-center py-10">
            <ActivityIndicator size="small" color={PRIMARY} />
          </View>
        )}

        {!loading && error && (
          <Text className="text-sm text-red-600 dark:text-red-400 py-4">
            {error}
          </Text>
        )}

        {/* Benefit rows */}
        {!loading && !error && benefits.length > 0 && (
          <View className="mt-4">
            {benefits.map((b) => (
              <View
                key={b.id}
                className="flex-row items-start gap-3 py-3 border-b border-gray-100 dark:border-neutral-800"
              >
                <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center mt-0.5">
                  <Feather name="check" size={15} color={PRIMARY} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                    {b.label}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {b.type}
                    {b.detail ? ` · ${b.detail}` : ""}
                    {b.active ? "" : " · Inactive"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDeleteBenefit(b.id)}
                  disabled={deletingId === b.id}
                  hitSlop={8}
                  className="p-1"
                >
                  {deletingId === b.id ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <Feather name="trash-2" size={16} color="#DC2626" />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && benefits.length === 0 && !adding && (
          <View className="items-center py-10">
            <View className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
              <Feather name="tag" size={24} color={PRIMARY} />
            </View>
            <Text className="text-base font-semibold text-gray-900 dark:text-white mt-4">
              No enforceable benefits yet.
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
              Add one to automate discounts or passes for this plan.
            </Text>
          </View>
        )}

        {/* Add benefit form */}
        {adding && (
          <View className="mt-4 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 gap-4">
            <Text className="text-sm font-bold text-gray-900 dark:text-white">
              New benefit
            </Text>
            <SelectField
              label="Benefit type"
              value={bType}
              options={BENEFIT_TYPES.map((t) => ({ label: t.label, value: t.value }))}
              onSelect={onPickType}
            />
            <SelectField
              label="Value mode"
              value={bMode}
              options={typeSpec.modes.map((m) => ({
                label: VALUE_MODE_LABELS[m],
                value: m,
              }))}
              onSelect={(v) => setBMode(v as ValueMode)}
            />
            {modeNeedsValue && (
              <TextField
                label={
                  bMode === "percent"
                    ? "Percent off"
                    : bMode === "fixed"
                      ? "Amount off (USD)"
                      : "Quantity"
                }
                value={bValue}
                onChangeText={setBValue}
                placeholder={bMode === "count" ? "e.g. 2" : "e.g. 20"}
                keyboardType="decimal-pad"
              />
            )}
            {targetScope && (
              <SelectField
                label="Applies to"
                value={scopeSel}
                options={[
                  {
                    label: targetsLoading
                      ? "Loading…"
                      : ALL_TARGETS_LABEL[targetScope],
                    value: "any",
                  },
                  ...targets.map((t) => ({
                    label: t.name,
                    value: `${targetScope}:${t.id}`,
                  })),
                ]}
                onSelect={(v) => setScopeSel(String(v))}
              />
            )}
            <TextField
              label="Max redemptions"
              value={maxRedemptions}
              onChangeText={setMaxRedemptions}
              placeholder="Unlimited"
              keyboardType="number-pad"
            />
            <TextField
              label="Priority"
              value={priority}
              onChangeText={setPriority}
              placeholder="0"
              keyboardType="number-pad"
            />
            <TextField
              label="Label"
              value={bLabel}
              onChangeText={setBLabel}
              placeholder="e.g. Member 15% off all packages"
              hint="Optional — shown to members."
            />
            <View className="gap-3 mt-1">
              <CheckboxRow
                label="Stackable with other benefits"
                checked={isStackable}
                onToggle={() => setIsStackable((v) => !v)}
              />
              <CheckboxRow
                label="Manual redemption only"
                checked={manualRedemption}
                onToggle={() => setManualRedemption((v) => !v)}
              />
            </View>
            <ToggleRow label="Active" value={bActive} onValueChange={setBActive} />

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setAdding(false)}
                className="flex-1 items-center py-3 rounded-xl border border-gray-200 dark:border-neutral-800"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAdd}
                disabled={!valueValid || savingBenefit}
                className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
                  !valueValid || savingBenefit
                    ? "bg-gray-300 dark:bg-neutral-700"
                    : "bg-[#0644C7]"
                }`}
              >
                {savingBenefit && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text className="text-sm font-semibold text-white">Save benefit</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Footer actions */}
        {!adding && (
          <View className="flex-row items-center justify-between mt-6">
            <Pressable
              onPress={startAdd}
              className="flex-row items-center gap-2 bg-[#0644C7] px-4 py-3 rounded-xl active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">Add benefit</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="px-5 py-3 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Done
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

export default MembershipPlans;
