import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { markFeeSupportsStale } from "../../lib/hooks/useFeeSupports";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createFeeSupport,
  fetchFeeSupport,
  updateFeeSupport,
  type FeeApplicationType,
  type FeeCalculationType,
  type FeeSupportEntityType,
  type FeeSupportInput,
} from "../../services/feeSupportService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { fetchPackages } from "../../services/bookingsService";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchEvents } from "../../services/eventsService";
import { fetchMembershipPlans } from "../../services/membershipPlansService";

const PRIMARY = "#0644C7";

type EntityOption = { id: number; name: string };

const ENTITY: { label: string; value: FeeSupportEntityType }[] = [
  { label: "Packages", value: "package" },
  { label: "Attractions", value: "attraction" },
  { label: "Events", value: "event" },
  { label: "Membership Plans", value: "membership" },
];

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  required,
  prefix,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  required?: boolean;
  prefix?: string;
}) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
        {required ? " *" : ""}
      </Text>
      <View className="flex-row items-center bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 border border-gray-200 dark:border-neutral-700">
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
          className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
        />
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-1 items-center py-2 rounded-lg ${
              on ? "bg-[#0644C7]" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                on ? "text-white" : "text-gray-600 dark:text-gray-300"
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

const CreateFeeSupport = () => {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;

  const [feeName, setFeeName] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [calcType, setCalcType] = useState<FeeCalculationType>("fixed");
  const [amount, setAmount] = useState("0");
  const [applicationType, setApplicationType] =
    useState<FeeApplicationType>("additive");
  const [entityType, setEntityType] = useState<FeeSupportEntityType>("package");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  // In edit mode, gate the first entity-list load until the record is fetched
  // and its entity_ids are staged, so the pre-checked selection survives.
  const [ready, setReady] = useState(!editId);
  const pendingIdsRef = useRef<number[] | null>(null);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchLocations(token)
      .then(setLocations)
      .catch(() => {});
  }, []);

  // Edit mode: load the record, prefill, then release the entity loader.
  useEffect(() => {
    if (!editId) return;
    const token = getToken();
    if (!token) return;
    fetchFeeSupport(token, editId)
      .then((d) => {
        setFeeName(d.feeName);
        setLocationId(d.locationId);
        setCalcType(d.calculationType);
        setAmount(String(d.feeAmount));
        setApplicationType(d.applicationType);
        pendingIdsRef.current = d.entityIds;
        setEntityType(d.entityType);
        setActive(d.isActive);
      })
      .catch((err) => {
        Alert.alert(
          "Load failed",
          err instanceof Error ? err.message : "Could not load the fee.",
        );
      })
      .finally(() => setReady(true));
  }, [editId]);

  // Load the entity list whenever Entity Type (or location scope) changes.
  const loadEntities = useCallback(async () => {
    const token = getToken();
    const user = getCurrentUser();
    if (!token || !user) return;
    setEntitiesLoading(true);
    const loc = locationId ?? undefined;
    try {
      let list: EntityOption[] = [];
      if (entityType === "package") {
        list = (await fetchPackages(token, loc)).map((p) => ({
          id: p.id,
          name: p.name,
        }));
      } else if (entityType === "attraction") {
        list = (
          await fetchAttractions({ token, userId: user.id, locationId: loc })
        ).map((a) => ({ id: a.id, name: a.name }));
      } else if (entityType === "event") {
        list = (
          await fetchEvents({ token, userId: user.id, locationId: loc })
        ).map((e) => ({ id: e.id, name: e.name }));
      } else {
        list = (await fetchMembershipPlans({ token, locationId: loc })).map(
          (m) => ({ id: m.id, name: m.name }),
        );
      }
      setEntities(list);
      if (pendingIdsRef.current) {
        // Edit prefill: keep only ids that still exist in the list.
        const valid = new Set(list.map((e) => e.id));
        setSelectedIds(pendingIdsRef.current.filter((id) => valid.has(id)));
        pendingIdsRef.current = null;
      } else {
        setSelectedIds([]);
      }
    } catch {
      setEntities([]);
    } finally {
      setEntitiesLoading(false);
    }
  }, [entityType, locationId]);

  useEffect(() => {
    if (ready) loadEntities();
  }, [ready, loadEntities]);

  const preview = useMemo(() => {
    const amt = Number(amount) || 0;
    const base = 100;
    const fee = calcType === "percentage" ? base * (amt / 100) : amt;
    const total = applicationType === "additive" ? base + fee : base;
    return { fee, total };
  }, [amount, calcType, applicationType]);

  const allSelected =
    entities.length > 0 && selectedIds.length === entities.length;
  const toggleId = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : entities.map((e) => e.id));

  const submit = async () => {
    const token = getToken();
    if (!token) return;
    if (!feeName.trim()) {
      Alert.alert("Name required", "Please enter a fee name.");
      return;
    }
    if (selectedIds.length === 0) {
      Alert.alert(
        "Select entities",
        "Choose at least one item this fee applies to.",
      );
      return;
    }
    const input: FeeSupportInput = {
      fee_name: feeName.trim(),
      location_id: locationId,
      fee_calculation_type: calcType,
      fee_amount: Number(amount) || 0,
      fee_application_type: applicationType,
      entity_type: entityType,
      entity_ids: selectedIds,
      is_active: active,
    };
    setSaving(true);
    try {
      if (editId) await updateFeeSupport(token, editId, input);
      else await createFeeSupport(token, input);
      markFeeSupportsStale();
      router.back();
    } catch (err) {
      Alert.alert(
        "Create failed",
        err instanceof Error ? err.message : "Could not create the fee.",
      );
    } finally {
      setSaving(false);
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
            {editId ? "Edit Fee Support" : "Create Fee Support"}
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <View className="px-5 pt-5">
          <View className="flex-row items-center gap-2.5 mb-4">
            <View className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 items-center justify-center">
              <Feather name="dollar-sign" size={18} color={PRIMARY} />
            </View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 flex-1">
              Add a new fee that will be applied to selected packages or
              attractions.
            </Text>
          </View>

          <Field
            label="Fee Name"
            required
            value={feeName}
            onChangeText={setFeeName}
            placeholder="e.g., Processing Fee, Service Fee"
          />

          {/* Location */}
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Location
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            <Pressable
              onPress={() => setLocationId(null)}
              className={`px-3.5 py-2 rounded-lg border ${
                locationId === null
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  locationId === null
                    ? "text-white"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                All Locations (Company-wide)
              </Text>
            </Pressable>
            {locations.map((loc) => {
              const on = locationId === loc.id;
              return (
                <Pressable
                  key={loc.id}
                  onPress={() => setLocationId(loc.id)}
                  className={`px-3.5 py-2 rounded-lg border ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      on ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {loc.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Fee Settings */}
          <View className="mt-2 mb-3 pt-4 border-t border-gray-100 dark:border-neutral-800">
            <View className="flex-row items-center gap-2">
              <Feather name="dollar-sign" size={16} color={PRIMARY} />
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                Fee Settings
              </Text>
            </View>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Define the fee amount and how it&apos;s calculated.
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Calculation
              </Text>
              <Segmented
                options={[
                  { label: "Fixed ($)", value: "fixed" },
                  { label: "Percent (%)", value: "percentage" },
                ]}
                value={calcType}
                onChange={setCalcType}
              />
            </View>
            <View className="w-28">
              <Field
                label={`Amount (${calcType === "percentage" ? "%" : "$"})`}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                keyboardType="decimal-pad"
                prefix={calcType === "percentage" ? "%" : "$"}
              />
            </View>
          </View>
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Application Type
          </Text>
          <Segmented
            options={[
              { label: "Additive (on top)", value: "additive" },
              { label: "Inclusive", value: "inclusive" },
            ]}
            value={applicationType}
            onChange={setApplicationType}
          />
          <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 mt-3 mb-1">
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Preview ($100):{" "}
              <Text className="font-bold text-[#0644C7] dark:text-blue-300">
                +${preview.fee.toFixed(2)}
              </Text>{" "}
              = ${preview.total.toFixed(2)} total
            </Text>
          </View>

          {/* Apply To */}
          <View className="mt-2 mb-3 pt-4 border-t border-gray-100 dark:border-neutral-800">
            <View className="flex-row items-center gap-2">
              <Feather name="layers" size={16} color={PRIMARY} />
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                Apply To
              </Text>
            </View>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Select which packages, attractions, events, or membership plans
              include this fee.
            </Text>
          </View>
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Entity Type
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {ENTITY.map((opt) => {
              const on = entityType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setEntityType(opt.value)}
                  className={`px-3.5 py-2 rounded-lg border ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      on ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Select Items *
            </Text>
            {entities.length > 0 && (
              <Pressable onPress={toggleAll}>
                <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {allSelected ? "Clear All" : "Select All"}
                </Text>
              </Pressable>
            )}
          </View>
          <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 max-h-64 mb-4">
            {entitiesLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : entities.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  No items available for this type.
                </Text>
              </View>
            ) : (
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                {entities.map((ent) => {
                  const checked = selectedIds.includes(ent.id);
                  return (
                    <Pressable
                      key={ent.id}
                      onPress={() => toggleId(ent.id)}
                      className="flex-row items-center gap-3 px-3.5 py-3 border-b border-gray-100 dark:border-neutral-700"
                    >
                      <View
                        className={`w-5 h-5 rounded-md items-center justify-center border ${
                          checked
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "border-gray-300 dark:border-neutral-600"
                        }`}
                      >
                        {checked && (
                          <Feather
                            name="check"
                            size={13}
                            color="#FFFFFF"
                            strokeWidth={3}
                          />
                        )}
                      </View>
                      <Text
                        className="text-sm text-gray-800 dark:text-gray-100 flex-1"
                        numberOfLines={1}
                      >
                        {ent.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Active */}
          <View className="flex-row items-center justify-between mb-5 pt-3 border-t border-gray-100 dark:border-neutral-800">
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Active
            </Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.back()}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={saving}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {editId ? "Update" : "Create"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default CreateFeeSupport;
