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

import {
  markSpecialPricingsStale,
} from "../../lib/hooks/useSpecialPricings";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createSpecialPricing,
  fetchSpecialPricing,
  updateSpecialPricing,
  type DiscountType,
  type RecurrenceType,
  type SpecialPricingEntityType,
  type SpecialPricingInput,
} from "../../services/specialPricingService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { fetchPackages } from "../../services/bookingsService";
import { fetchAttractions } from "../../services/attractionsService";
import { fetchEvents } from "../../services/eventsService";

type EntityOption = { id: number; name: string };

const PRIMARY = "#0644C7";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RECURRENCE: { label: string; value: RecurrenceType }[] = [
  { label: "One-Time", value: "one_time" },
  { label: "Weekly (Every Week)", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];
const ENTITY: { label: string; value: SpecialPricingEntityType }[] = [
  { label: "All (Packages, Attractions & Events)", value: "all" },
  { label: "Packages", value: "package" },
  { label: "Attractions", value: "attraction" },
  { label: "Events", value: "event" },
];

/** Labelled text field. */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  required,
  prefix,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  multiline?: boolean;
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
          multiline={multiline}
          className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
          style={multiline ? { minHeight: 72, textAlignVertical: "top" } : undefined}
        />
      </View>
    </View>
  );
}

/** Section heading with an icon + subtitle (mirrors the web modal sections). */
function Section({
  icon,
  title,
  subtitle,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle: string;
}) {
  return (
    <View className="mt-2 mb-3 pt-4 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-2">
        <Feather name={icon} size={16} color={PRIMARY} />
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
      </View>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {subtitle}
      </Text>
    </View>
  );
}

const CreateSpecialPricing = () => {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#ffffff" : "#000000";
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [amount, setAmount] = useState("10");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(2); // Tue, like the web default
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [entityType, setEntityType] = useState<SpecialPricingEntityType>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [priority, setPriority] = useState("0");
  const [stackable, setStackable] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : null;
  const [ready, setReady] = useState(!editId);
  const pendingIdsRef = useRef<number[] | null>(null);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal; the picker falls back to "All Locations (Company-wide)".
    }
  }, []);
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // Edit mode: load the record, prefill, then release the entity loader.
  useEffect(() => {
    if (!editId) return;
    const token = getToken();
    if (!token) return;
    fetchSpecialPricing(token, editId)
      .then((d) => {
        setName(d.name);
        setDescription(d.description);
        setLocationId(d.locationId);
        setDiscountType(d.discountType);
        setAmount(String(d.discountAmount));
        setRecurrence(d.recurrenceType);
        if (d.dayOfWeek != null) setDayOfWeek(d.dayOfWeek);
        setStartDate(d.startDate);
        setEndDate(d.endDate);
        setTimeFrom(d.timeFrom);
        setTimeTo(d.timeTo);
        pendingIdsRef.current = d.entityIds;
        setEntityType(d.entityType);
        setPriority(String(d.priority));
        setStackable(d.isStackable);
        setActive(d.isActive);
      })
      .catch((err) => {
        Alert.alert(
          "Load failed",
          err instanceof Error ? err.message : "Could not load the discount.",
        );
      })
      .finally(() => setReady(true));
  }, [editId]);

  // Load the selectable entity list for the current Entity Type. "all" has no
  // specific list (applies to everything).
  const loadEntities = useCallback(async () => {
    const token = getToken();
    const user = getCurrentUser();
    if (!token || !user || entityType === "all") {
      setEntities([]);
      return;
    }
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
      } else {
        list = (
          await fetchEvents({ token, userId: user.id, locationId: loc })
        ).map((e) => ({ id: e.id, name: e.name }));
      }
      setEntities(list);
      if (pendingIdsRef.current) {
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

  const allSelected =
    entities.length > 0 && selectedIds.length === entities.length;
  const toggleId = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : entities.map((e) => e.id));

  // Live preview against a $100 booking (mirrors the web preview line).
  const preview = useMemo(() => {
    const amt = Number(amount) || 0;
    const base = 100;
    const discounted =
      discountType === "percentage" ? base * (1 - amt / 100) : base - amt;
    const saved = base - discounted;
    return { discounted: Math.max(0, discounted), saved };
  }, [amount, discountType]);

  const submit = async () => {
    const token = getToken();
    if (!token) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a discount name.");
      return;
    }
    const input: SpecialPricingInput = {
      name: name.trim(),
      description: description.trim() || null,
      location_id: locationId,
      discount_type: discountType,
      discount_amount: Number(amount) || 0,
      recurrence_type: recurrence,
      day_of_week: recurrence === "weekly" ? dayOfWeek : null,
      start_date: startDate.trim() || null,
      end_date: endDate.trim() || null,
      time_from: timeFrom.trim() || null,
      time_to: timeTo.trim() || null,
      entity_type: entityType,
      entity_ids: entityType === "all" ? [] : selectedIds,
      priority: Number(priority) || 0,
      is_stackable: stackable,
      is_active: active,
    };
    setSaving(true);
    try {
      if (editId) await updateSpecialPricing(token, editId, input);
      else await createSpecialPricing(token, input);
      markSpecialPricingsStale();
      router.back();
    } catch (err) {
      Alert.alert(
        editId ? "Update failed" : "Create failed",
        err instanceof Error ? err.message : "Could not save the discount.",
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
            {editId ? "Edit Special Pricing" : "Create Special Pricing"}
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
              <Feather name="tag" size={18} color={PRIMARY} />
            </View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 flex-1">
              Set up automatic discounts that apply to bookings based on your
              schedule.
            </Text>
          </View>

          <Field
            label="Discount Name"
            required
            value={name}
            onChangeText={setName}
            placeholder="e.g., Tuesday Special, Weekend Sale"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description for this discount"
            multiline
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
              const activeLoc = locationId === loc.id;
              return (
                <Pressable
                  key={loc.id}
                  onPress={() => setLocationId(loc.id)}
                  className={`px-3.5 py-2 rounded-lg border ${
                    activeLoc
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      activeLoc ? "text-white" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {loc.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Discount Settings */}
          <Section
            icon="dollar-sign"
            title="Discount Settings"
            subtitle="Configure how much your customers save on each booking."
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Type
              </Text>
              <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
                {[
                  { label: "Percentage (%)", value: "percentage" as const },
                  { label: "Fixed ($)", value: "fixed" as const },
                ].map((opt) => {
                  const on = discountType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setDiscountType(opt.value)}
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
            </View>
            <View className="w-28">
              <Field
                label={`Amount (${discountType === "percentage" ? "%" : "$"})`}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                keyboardType="decimal-pad"
                prefix={discountType === "percentage" ? "%" : "$"}
              />
            </View>
          </View>
          <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5 mb-2">
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Preview:{" "}
              <Text className="line-through text-gray-400">$100.00</Text>
              {"  "}→{" "}
              <Text className="font-bold text-[#0644C7] dark:text-blue-300">
                ${preview.discounted.toFixed(2)}
              </Text>{" "}
              (-${preview.saved.toFixed(2)})
            </Text>
          </View>

          {/* Schedule */}
          <Section
            icon="calendar"
            title="Schedule"
            subtitle="Control when this discount is active — one-time, weekly, or monthly."
          />
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Recurrence
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {RECURRENCE.map((opt) => {
              const on = recurrence === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setRecurrence(opt.value)}
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

          {recurrence === "weekly" && (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Day of Week *
              </Text>
              <View className="flex-row gap-1.5 mb-4">
                {DAYS.map((d, i) => {
                  const on = dayOfWeek === i;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDayOfWeek(i)}
                      className={`flex-1 items-center py-2 rounded-lg ${
                        on
                          ? "bg-[#0644C7]"
                          : "bg-gray-100 dark:bg-neutral-800"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          on ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {d}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Start Date"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="End Date"
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Time From"
                value={timeFrom}
                onChangeText={setTimeFrom}
                placeholder="HH:MM"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Time To"
                value={timeTo}
                onChangeText={setTimeTo}
                placeholder="HH:MM"
              />
            </View>
          </View>

          {/* Apply To */}
          <Section
            icon="layers"
            title="Apply To"
            subtitle="Choose which items receive this discount."
          />
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Entity Type
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
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

          {/* Select entities (hidden for "all"). Empty = applies to all. */}
          {entityType !== "all" && (
            <>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Select Items
                </Text>
                <View className="flex-row items-center gap-3">
                  <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                    Empty = All
                  </Text>
                  {entities.length > 0 && (
                    <Pressable onPress={toggleAll}>
                      <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {allSelected ? "Clear All" : "Select All"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
              <View className="bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 max-h-56 mb-2">
                {entitiesLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : entities.length === 0 ? (
                  <View className="py-8 items-center">
                    <Text className="text-sm text-gray-400 dark:text-gray-500">
                      No items available.
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
              <Text className="text-[11px] text-blue-600 dark:text-blue-400 mb-2">
                {selectedIds.length} selected
              </Text>
            </>
          )}

          {/* Advanced */}
          <Section
            icon="settings"
            title="Advanced"
            subtitle="Fine-tune priority and stacking behavior."
          />
          <Field
            label="Priority"
            value={priority}
            onChangeText={setPriority}
            placeholder="0"
            keyboardType="number-pad"
          />
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 -mt-3 mb-3">
            Higher = applies first.
          </Text>

          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Stackable
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                Can combine with others.
              </Text>
            </View>
            <Switch
              value={stackable}
              onValueChange={setStackable}
              trackColor={{ false: "#D1D5DB", true: "#0644C7" }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View className="flex-row items-center justify-between mb-5">
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

export default CreateSpecialPricing;
