import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { markAttractionsStale } from "../../lib/hooks/useAttractions";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createAttraction,
  type AvailabilitySchedule,
  type CreateAttractionInput,
} from "../../services/attractionsService";
import {
  fetchAddOns,
  type AddOnOption,
} from "../../services/addOnsService";
import {
  createCategory,
  fetchCategories,
  type Category,
} from "../../services/categoriesService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRICING_TYPES = [
  { value: "per_person", label: "Per Person" },
  { value: "per_group", label: "Per Group" },
  { value: "per_hour", label: "Per Hour" },
  { value: "per_game", label: "Per Game" },
  { value: "fixed", label: "Fixed Price" },
] as const;

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

const ALL_DAY_KEYS = DAYS.map((d) => d.key);

const MAX_IMAGES = 5;

// 30-minute increments, the native stand-in for the web's <input type="time">.
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function formatTime(value: string): string {
  const [hStr, mStr] = value.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

const newSchedule = (): AvailabilitySchedule => ({
  days: [...ALL_DAY_KEYS],
  start_time: "09:00",
  end_time: "17:00",
});

/** Section wrapper card matching the app's card design. */
const Section = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-center gap-2 mb-4">
      <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

/** A pressable that opens a picker sheet, showing the current value. */
const SelectRow = ({
  icon,
  value,
  placeholder,
  onPress,
  error,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    className={`h-14 flex-row items-center gap-3 rounded-full border bg-white dark:bg-neutral-900 px-5 ${
      error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
    }`}
  >
    <Feather name={icon} size={18} color="#9CA3AF" />
    <Text
      className={`flex-1 text-base ${
        value ? "text-gray-900 dark:text-white" : "text-gray-400"
      }`}
      numberOfLines={1}
    >
      {value ?? placeholder}
    </Text>
    <Feather name="chevron-down" size={18} color="#9CA3AF" />
  </Pressable>
);

const ErrorText = ({ error }: { error?: string }) =>
  error ? (
    <Text className="ml-4 mt-1.5 text-xs text-red-500">{error}</Text>
  ) : null;

type FormErrors = Partial<
  Record<"name" | "description" | "category" | "price" | "maxCapacity" | "location", string>
>;

const CreateAttractionScreen = () => {
  const insets = useSafeAreaInsets();
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  // --- form state ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [pricingType, setPricingType] = useState<string>("per_person");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [displayCapacity, setDisplayCapacity] = useState(true);
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [schedules, setSchedules] = useState<AvailabilitySchedule[]>([newSchedule()]);
  const [images, setImages] = useState<string[]>([]);
  const [displayOrder, setDisplayOrder] = useState("0");
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    user?.location_id ?? null,
  );
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  // --- reference data ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);
  const [newCategory, setNewCategory] = useState("");

  // --- ui state ---
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sheet, setSheet] = useState<
    | null
    | { kind: "category" }
    | { kind: "pricing" }
    | { kind: "location" }
    | { kind: "time"; index: number; field: "start_time" | "end_time" }
  >(null);

  // Company admins choose a location; options come from the dashboard metrics
  // locationStats (the /api/locations endpoint is too heavy for mobile).
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Default the location once options arrive (admins with no prior selection).
  useEffect(() => {
    if (isCompanyAdmin && selectedLocationId == null && locationOptions.length) {
      setSelectedLocationId(locationOptions[0].id);
    }
  }, [isCompanyAdmin, selectedLocationId, locationOptions]);

  // Load categories once, and add-ons whenever the location changes.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchCategories(token).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;
    fetchAddOns({
      token,
      userId: user.id,
      locationId: selectedLocationId ?? undefined,
    })
      .then(setAddOns)
      .catch(() => {});
  }, [selectedLocationId, user?.id]);

  const locationName = useMemo(
    () =>
      locationOptions.find((l) => l.id === selectedLocationId)?.name ??
      (user?.location?.name ?? null),
    [locationOptions, selectedLocationId, user],
  );

  const pricingLabel =
    PRICING_TYPES.find((p) => p.value === pricingType)?.label ?? "Per Person";

  // --- schedule helpers ---
  const toggleDay = (index: number, day: string) =>
    setSchedules((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              days: s.days.includes(day)
                ? s.days.filter((d) => d !== day)
                : [...s.days, day],
            }
          : s,
      ),
    );

  const toggleAllDays = (index: number) =>
    setSchedules((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const allSelected = ALL_DAY_KEYS.every((d) => s.days.includes(d));
        return { ...s, days: allSelected ? [] : [...ALL_DAY_KEYS] };
      }),
    );

  const setScheduleTime = (
    index: number,
    field: "start_time" | "end_time",
    value: string,
  ) =>
    setSchedules((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );

  const addScheduleRow = () =>
    setSchedules((prev) => [...prev, { days: [], start_time: "09:00", end_time: "17:00" }]);

  const removeScheduleRow = (index: number) =>
    setSchedules((prev) => prev.filter((_, i) => i !== index));

  // --- add-ons ---
  const toggleAddOn = (addOnName: string) =>
    setSelectedAddOns((prev) =>
      prev.includes(addOnName)
        ? prev.filter((n) => n !== addOnName)
        : [...prev, addOnName],
    );

  // --- images ---
  const pickImages = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }
    // Loaded lazily so the native module never runs at app startup.
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to add images.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const picked = result.assets
      .filter((a) => a.base64)
      .map((a) => `data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`);
    setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  }, [images.length]);

  const removeImage = (index: number) =>
    setImages((prev) => prev.filter((_, i) => i !== index));

  // --- category creation ---
  const addCategory = async () => {
    const nameToAdd = newCategory.trim();
    if (!nameToAdd) return;
    const token = getToken();
    if (!token) return;
    try {
      const created = await createCategory(token, nameToAdd);
      setCategories((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      setCategory(created.name);
      setNewCategory("");
      setSheet(null);
    } catch (err) {
      Alert.alert(
        "Couldn't add category",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  // --- validation + submit ---
  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!description.trim()) next.description = "Description is required.";
    if (!category) next.category = "Category is required.";
    const priceNum = Number(price);
    if (price === "" || Number.isNaN(priceNum) || priceNum < 0)
      next.price = "Enter a valid price.";
    const capNum = Number(maxCapacity);
    if (maxCapacity === "" || Number.isNaN(capNum) || capNum < 1)
      next.maxCapacity = "Enter a capacity of at least 1.";
    if (selectedLocationId == null) next.location = "Select a location.";
    return next;
  };

  const handleSubmit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      Alert.alert("Missing information", "Please fix the highlighted fields.");
      return;
    }
    const token = getToken();
    if (!token || selectedLocationId == null) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    const durationNum = duration === "" ? 0 : Number(duration);
    const addonIds = selectedAddOns
      .map((n) => addOns.find((a) => a.name === n)?.id)
      .filter((id): id is number => typeof id === "number");

    const input: CreateAttractionInput = {
      location_id: selectedLocationId,
      name: name.trim(),
      description: description.trim(),
      category,
      price: Number(price),
      pricing_type: pricingType,
      max_capacity: Number(maxCapacity),
      duration: Number.isNaN(durationNum) ? 0 : durationNum,
      duration_unit: durationUnit,
      availability: schedules,
      image: images.length > 0 ? images : undefined,
      is_active: true,
      addon_ids: addonIds,
      add_ons_order: selectedAddOns,
      display_capacity_to_customers: displayCapacity,
      display_order: Number(displayOrder) || 0,
    };

    setSubmitting(true);
    try {
      await createAttraction(token, input);
      markAttractionsStale();
      Alert.alert("Attraction created", `"${input.name}" was created successfully.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Couldn't create attraction",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-[#0644C7] pt-12 pb-5 px-5 w-full relative overflow-hidden z-10">
        <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-white/20 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-lg font-bold">New Attraction</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          {/* Location (company admins only) */}
          {isCompanyAdmin && (
            <Section icon="map-pin" title="Location">
              <FieldLabel>Location</FieldLabel>
              <SelectRow
                icon="map-pin"
                value={locationName}
                placeholder="Select a location"
                onPress={() => setSheet({ kind: "location" })}
                error={!!errors.location}
              />
              <ErrorText error={errors.location} />
            </Section>
          )}

          {/* Basic Information */}
          <Section icon="info" title="Basic Information">
            <InputField
              label="Attraction Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Laser Tag, Bowling, Escape Room"
              error={errors.name}
              containerClassName="mb-4"
            />

            <FieldLabel>Description</FieldLabel>
            <View
              className={`rounded-2xl border bg-white dark:bg-neutral-900 px-4 py-3 mb-1 ${
                errors.description ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
              }`}
            >
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the attraction in detail..."
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                className="min-h-[88px] text-base text-gray-900 dark:text-white"
              />
            </View>
            <ErrorText error={errors.description} />

            <View className="mt-4">
              <FieldLabel>Category</FieldLabel>
              <SelectRow
                icon="tag"
                value={category || null}
                placeholder="Select category"
                onPress={() => setSheet({ kind: "category" })}
                error={!!errors.category}
              />
              <ErrorText error={errors.category} />
            </View>
          </Section>

          {/* Pricing & Capacity */}
          <Section icon="tag" title="Pricing & Capacity">
            <InputField
              label="Price"
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
              error={errors.price}
              containerClassName="mb-4"
            />

            <View className="mb-4">
              <FieldLabel>Pricing Type</FieldLabel>
              <SelectRow
                icon="dollar-sign"
                value={pricingLabel}
                placeholder="Select pricing type"
                onPress={() => setSheet({ kind: "pricing" })}
              />
            </View>

            <InputField
              label="Maximum Capacity"
              value={maxCapacity}
              onChangeText={setMaxCapacity}
              placeholder="e.g., 10"
              keyboardType="number-pad"
              error={errors.maxCapacity}
              containerClassName="mb-3"
            />

            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
                Display capacity to customers
              </Text>
              <Switch
                value={displayCapacity}
                onValueChange={setDisplayCapacity}
                trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                thumbColor="#FFFFFF"
              />
            </View>

            <FieldLabel>Duration (0 for unlimited)</FieldLabel>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <InputField
                  label=""
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              {/* Segmented control: a pill track with a pill-shaped selection so
                  the active corners match the container radius. */}
              <View className="h-14 flex-row items-center rounded-full bg-gray-100 dark:bg-neutral-800 p-1">
                {(["minutes", "hours"] as const).map((u) => {
                  const active = durationUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setDurationUnit(u)}
                      className={`h-full px-5 items-center justify-center rounded-full ${
                        active ? "bg-[#0644C7]" : ""
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold capitalize ${
                          active ? "text-white" : "text-gray-500 dark:text-gray-300"
                        }`}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Section>

          {/* Availability Schedules */}
          <Section icon="calendar" title="Availability Schedules">
            {schedules.map((schedule, index) => (
              <View
                key={index}
                className="border border-gray-200 dark:border-neutral-700 rounded-2xl p-4 mb-3"
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-semibold text-gray-800 dark:text-gray-100">
                    Schedule {index + 1}
                  </Text>
                  {schedules.length > 1 && (
                    <Pressable onPress={() => removeScheduleRow(index)} hitSlop={8}>
                      <Feather name="trash-2" size={18} color="#EF4444" />
                    </Pressable>
                  )}
                </View>

                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Days
                  </Text>
                  <Pressable onPress={() => toggleAllDays(index)} hitSlop={8}>
                    <Text className="text-xs font-semibold text-[#0644C7]">
                      {ALL_DAY_KEYS.every((d) => schedule.days.includes(d))
                        ? "Deselect All"
                        : "Select All"}
                    </Text>
                  </Pressable>
                </View>

                <View className="flex-row flex-wrap gap-2 mb-3">
                  {DAYS.map((day) => {
                    const on = schedule.days.includes(day.key);
                    return (
                      <Pressable
                        key={day.key}
                        onPress={() => toggleDay(index, day.key)}
                        className={`px-3 py-1.5 rounded-full ${
                          on ? "bg-[#0644C7]" : "bg-gray-100 dark:bg-neutral-800"
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            on ? "text-white" : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {day.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FieldLabel>Start Time</FieldLabel>
                    <SelectRow
                      icon="clock"
                      value={formatTime(schedule.start_time)}
                      placeholder="Start"
                      onPress={() =>
                        setSheet({ kind: "time", index, field: "start_time" })
                      }
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>End Time</FieldLabel>
                    <SelectRow
                      icon="clock"
                      value={formatTime(schedule.end_time)}
                      placeholder="End"
                      onPress={() =>
                        setSheet({ kind: "time", index, field: "end_time" })
                      }
                    />
                  </View>
                </View>
              </View>
            ))}

            <Pressable
              onPress={addScheduleRow}
              className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700"
            >
              <Feather name="plus" size={16} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                Add Another Schedule
              </Text>
            </Pressable>
          </Section>

          {/* Add-ons */}
          <Section icon="plus-circle" title="Add-ons">
            {addOns.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                No add-ons available for this location.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {addOns.map((addOn) => {
                  const on = selectedAddOns.includes(addOn.name);
                  return (
                    <Pressable
                      key={addOn.id}
                      onPress={() => toggleAddOn(addOn.name)}
                      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      {on && <Feather name="check" size={13} color="#FFFFFF" />}
                      <Text
                        className={`text-sm font-medium ${
                          on ? "text-white" : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {addOn.name}
                      </Text>
                      <Text
                        className={`text-xs ${on ? "text-white/80" : "text-gray-400"}`}
                      >
                        ${addOn.price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Section>

          {/* Images */}
          <Section icon="image" title="Images">
            <Pressable
              onPress={pickImages}
              className="flex-row items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700"
            >
              <Feather name="upload" size={18} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                Upload Images ({images.length}/{MAX_IMAGES})
              </Text>
            </Pressable>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Up to {MAX_IMAGES} images. 16:9 photos look best.
            </Text>

            {images.length > 0 && (
              <View className="flex-row flex-wrap gap-3 mt-3">
                {images.map((uri, index) => (
                  <View
                    key={index}
                    className="rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800"
                    style={{ width: 96, height: 72 }}
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => removeImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 items-center justify-center"
                      hitSlop={6}
                    >
                      <Feather name="x" size={13} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* Display Order */}
          <Section icon="list" title="Display Order">
            <InputField
              label="Order Position"
              value={displayOrder}
              onChangeText={setDisplayOrder}
              placeholder="0"
              keyboardType="number-pad"
            />
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Lower numbers appear first on the store page.
            </Text>
          </Section>

          {/* Actions */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] ${
                submitting ? "opacity-70" : "active:opacity-90"
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-base font-semibold text-white">
                  Create Attraction
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker */}
      <BottomSheet
        visible={sheet?.kind === "category"}
        onClose={() => setSheet(null)}
        title="Select Category"
      >
        <View className="px-4 pb-2">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <InputField
                label=""
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="Add new category"
                onSubmitEditing={addCategory}
              />
            </View>
            <Pressable
              onPress={addCategory}
              className="h-14 px-4 items-center justify-center rounded-full bg-[#0644C7]"
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {categories.length === 0 && (
            <Text className="text-sm text-gray-400 px-4 py-3">
              No categories yet. Add one above.
            </Text>
          )}
          {categories.map((cat) => {
            const isSelected = category === cat.name;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setCategory(cat.name);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {cat.name}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Pricing type picker */}
      <BottomSheet
        visible={sheet?.kind === "pricing"}
        onClose={() => setSheet(null)}
        title="Pricing Type"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {PRICING_TYPES.map((option) => {
            const isSelected = pricingType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setPricingType(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Location picker */}
      <BottomSheet
        visible={sheet?.kind === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {locationOptions.length === 0 && (
            <Text className="text-sm text-gray-400 px-4 py-3">
              No locations available.
            </Text>
          )}
          {locationOptions.map((loc) => {
            const isSelected = selectedLocationId === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => {
                  setSelectedLocationId(loc.id);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Time picker */}
      <BottomSheet
        visible={sheet?.kind === "time"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "time" && sheet.field === "start_time" ? "Start Time" : "End Time"}
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {TIME_OPTIONS.map((t) => {
            const current =
              sheet?.kind === "time"
                ? schedules[sheet.index]?.[sheet.field]
                : undefined;
            const isSelected = current === t;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  if (sheet?.kind === "time") {
                    setScheduleTime(sheet.index, sheet.field, t);
                  }
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {formatTime(t)}
                </Text>
                {isSelected && (
                  <Feather name="check" size={16} color="#3B82F6" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CreateAttractionScreen;
