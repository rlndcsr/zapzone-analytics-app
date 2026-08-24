import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
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
import { useColorScheme } from "nativewind";

import {
  ALL_DAY_KEYS,
  AttractionLivePreview,
  DAYS,
  ErrorText,
  FieldLabel,
  FormButton,
  formatTime,
  MAX_IMAGES,
  newSchedule,
  PRICING_TYPES,
  PRIMARY,
  Section,
  SelectRow,
  TIME_OPTIONS,
} from "../../components/ui/attractionFormKit";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
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

type FormErrors = Partial<
  Record<"name" | "description" | "category" | "price" | "maxCapacity" | "location", string>
>;


const CreateAttractionScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
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
  /** Blank = no per-slot ticket limit (the field's own placeholder says so). */
  const [maxTicketsPerSlot, setMaxTicketsPerSlot] = useState("");
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
    | { kind: "time"; index: number; field: "start_time" | "end_time" }
  >(null);

  // Locations for the selectable grid (name + address, like the web's
  // LocationSelector cards).
  const { locations } = useLocationOptions();

  // Default the location once options arrive (admins with no prior selection).
  useEffect(() => {
    if (isCompanyAdmin && selectedLocationId == null && locations.length) {
      setSelectedLocationId(locations[0].id);
    }
  }, [isCompanyAdmin, selectedLocationId, locations]);

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

  const allAddOnsSelected =
    addOns.length > 0 && selectedAddOns.length === addOns.length;

  const toggleAllAddOns = () =>
    setSelectedAddOns(allAddOnsSelected ? [] : addOns.map((a) => a.name));

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
    // Blank clears the limit; the backend treats null as "unlimited".
    const slotCapRaw = maxTicketsPerSlot.trim();
    const slotCapNum =
      slotCapRaw === "" || Number.isNaN(Number(slotCapRaw))
        ? null
        : Number(slotCapRaw);
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
      max_tickets_per_slot: slotCapNum,
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
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3 relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-gray-900 dark:text-white text-lg font-bold">
              Create New Attraction
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Set up a new attraction that customers can purchase tickets for
            </Text>
          </View>
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
          {/* Select Location — the web's LocationSelector card grid */}
          {isCompanyAdmin && (
            <Section icon="map-pin" title="Select Location">
              {locations.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  No locations available.
                </Text>
              ) : (
                locations.map((loc) => {
                  const active = selectedLocationId === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setSelectedLocationId(loc.id)}
                      className={`mb-2 flex-row items-center gap-3 rounded-lg border p-3 ${
                        active
                          ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-neutral-700"
                      }`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                        <Feather name="map-pin" size={16} color={PRIMARY} />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-sm font-semibold text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {loc.name}
                        </Text>
                        {!!loc.address && (
                          <Text
                            className="text-xs text-gray-500 dark:text-gray-400"
                            numberOfLines={1}
                          >
                            {loc.address}
                          </Text>
                        )}
                      </View>
                      {active && (
                        <View className="h-5 w-5 items-center justify-center rounded-full bg-[#0644C7]">
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
              <ErrorText error={errors.location} />
            </Section>
          )}

          {/* Basic Information */}
          <Section icon="info" title="Basic Information">
            <InputField
              label="Attraction Name"
              pill={false}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Laser Tag, Bowling, Escape Room"
              error={errors.name}
              containerClassName="mb-4"
            />

            <FieldLabel>Description</FieldLabel>
            <View
              className={`rounded-lg border bg-white dark:bg-neutral-900 px-4 py-3 mb-1 ${
                errors.description
                  ? "border-red-400"
                  : "border-gray-300 dark:border-neutral-700"
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
              pill={false}
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
              pill={false}
              value={maxCapacity}
              onChangeText={setMaxCapacity}
              placeholder="e.g., 10"
              keyboardType="number-pad"
              error={errors.maxCapacity}
              containerClassName="mb-3"
            />

            <View className="flex-row items-center gap-3">
              <Switch
                value={displayCapacity}
                onValueChange={setDisplayCapacity}
                trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                thumbColor="#FFFFFF"
              />
              <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                Display capacity to customers
              </Text>
            </View>
            <Text className="mt-1 mb-4 text-xs text-gray-400 dark:text-gray-500">
              When unchecked, customers will not see the capacity on the
              attraction page
            </Text>

            <InputField
              label="Max Tickets per Time Slot"
              pill={false}
              value={maxTicketsPerSlot}
              onChangeText={setMaxTicketsPerSlot}
              placeholder="No limit"
              keyboardType="number-pad"
              containerClassName="mb-1"
            />
            <Text className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Tickets sellable per time slot per day. Customers see the live
              count.
            </Text>

            <FieldLabel>Duration (0 for unlimited)</FieldLabel>
            {/* Input + unit joined into one bordered control, like the web. */}
            <View className="h-14 flex-row items-center overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <TextInput
                value={duration}
                onChangeText={setDuration}
                placeholder="0 = unlimited"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="h-full flex-1 px-4 text-base text-gray-900 dark:text-white"
              />
              <View className="h-full flex-row items-center border-l border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
                {(["minutes", "hours"] as const).map((u) => {
                  const active = durationUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setDurationUnit(u)}
                      className={`h-full items-center justify-center px-3 ${
                        active ? "bg-[#0644C7]" : ""
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold capitalize ${
                          active ? "text-white" : "text-gray-600 dark:text-gray-300"
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
            {schedules.map((schedule, index) => {
              const allDays = ALL_DAY_KEYS.every((d) => schedule.days.includes(d));
              return (
                <View
                  key={index}
                  className="border border-gray-200 dark:border-neutral-700 rounded-lg p-4 mb-3"
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
                    <Pressable
                      onPress={() => toggleAllDays(index)}
                      className={`rounded px-2 py-1 ${
                        allDays
                          ? "bg-gray-200 dark:bg-neutral-700"
                          : "bg-blue-100 dark:bg-blue-900/40"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          allDays
                            ? "text-gray-700 dark:text-gray-200"
                            : "text-[#0644C7] dark:text-blue-300"
                        }`}
                      >
                        {allDays ? "Deselect All" : "Select All"}
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
                          className={`px-3 py-1.5 rounded-md ${
                            on ? "bg-[#0644C7]" : "bg-gray-100 dark:bg-neutral-800"
                          }`}
                        >
                          <Text
                            className={`text-sm font-medium ${
                              on ? "text-white" : "text-gray-700 dark:text-gray-300"
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
                      <View className="mb-2 flex-row items-center gap-1">
                        <Feather name="clock" size={14} color="#6B7280" />
                        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          Start Time
                        </Text>
                      </View>
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
                      <View className="mb-2 flex-row items-center gap-1">
                        <Feather name="clock" size={14} color="#6B7280" />
                        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          End Time
                        </Text>
                      </View>
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
              );
            })}

            <Pressable
              onPress={addScheduleRow}
              className="flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-300 dark:border-neutral-700"
            >
              <Feather name="plus" size={16} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                Add Another Schedule
              </Text>
            </Pressable>
          </Section>

          {/* Add-ons */}
          <Section icon="info" title="Add-ons">
            {addOns.length > 0 && (
              <Pressable
                onPress={toggleAllAddOns}
                className="mb-3 self-end"
                hitSlop={8}
              >
                <Text className="text-sm font-semibold text-[#0644C7]">
                  {allAddOnsSelected ? "Deselect All" : "Select All"}
                </Text>
              </Pressable>
            )}

            {/* Chosen add-ons, in the order they'll be shown to customers. */}
            {selectedAddOns.length > 0 && (
              <View className="mb-4">
                <Text className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                  Selected Add-ons
                </Text>
                {selectedAddOns.map((addOnName) => {
                  const addOn = addOns.find((a) => a.name === addOnName);
                  return (
                    <View
                      key={addOnName}
                      className="mb-2 flex-row items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 dark:border-green-900/40 dark:bg-green-900/20"
                    >
                      <Text
                        className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100"
                        numberOfLines={1}
                      >
                        {addOnName}
                      </Text>
                      {!!addOn && (
                        <Text className="text-xs text-green-700 dark:text-green-400">
                          ${addOn.price}
                        </Text>
                      )}
                      <Pressable
                        onPress={() => toggleAddOn(addOnName)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${addOnName}`}
                      >
                        <Feather name="x" size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {addOns.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                No add-ons available. Create add-ons from the Add-ons management
                page.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {addOns
                  .filter((a) => !selectedAddOns.includes(a.name))
                  .map((addOn) => (
                    <Pressable
                      key={addOn.id}
                      onPress={() => toggleAddOn(addOn.name)}
                      className="flex-row items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {addOn.name}
                      </Text>
                      <Text className="text-xs text-gray-400">
                        ${addOn.price}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            )}
          </Section>

          {/* Images */}
          <Section icon="image" title="Images">
            <FieldLabel>Upload Images (Max {MAX_IMAGES})</FieldLabel>
            <Pressable
              onPress={pickImages}
              className="flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-300 dark:border-neutral-700 bg-blue-50 dark:bg-blue-900/20"
            >
              <Feather name="upload" size={16} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                Choose Files ({images.length}/{MAX_IMAGES})
              </Text>
            </Pressable>

            <View className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Text className="text-xs font-medium text-blue-800 dark:text-blue-300">
                📐 Recommended: 16:9 aspect ratio (1280×720 or 1920×1080 pixels)
              </Text>
              <Text className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Images will be cropped to fit the display area. Center your
                subject for best results.
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Max file size: 20MB. Use optimized images for faster loading.
            </Text>

            {images.length > 0 && (
              <View className="mt-4">
                <FieldLabel>Image Previews (as customers will see)</FieldLabel>
                <View className="flex-row flex-wrap gap-3">
                  {images.map((uri, index) => (
                    <View
                      key={index}
                      className="rounded-lg overflow-hidden bg-gray-100 dark:bg-neutral-800"
                      style={{ width: 112, height: 63 }}
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
              </View>
            )}
          </Section>

          {/* Display Order */}
          <Section icon="list" title="Display Order">
            <InputField
              label="Order Position"
              pill={false}
              value={displayOrder}
              onChangeText={setDisplayOrder}
              placeholder="0"
              keyboardType="number-pad"
            />
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Lower numbers appear first on the store page.
            </Text>
          </Section>

          {/* Live Preview — the web's sticky right-rail card, stacked here */}
          <AttractionLivePreview
            name={name}
            category={category}
            description={description}
            price={price}
            pricingType={pricingType}
            duration={duration}
            durationUnit={durationUnit}
            maxCapacity={maxCapacity}
            schedules={schedules}
            imageUri={images[0] ?? null}
          />

          {/* Actions */}
          <View className="flex-row gap-3 border-t border-gray-200 pt-5 dark:border-neutral-800">
            <FormButton
              label="Cancel"
              variant="secondary"
              onPress={() => router.back()}
              disabled={submitting}
            />
            <FormButton
              label={submitting ? "Creating..." : "Create Attraction"}
              onPress={handleSubmit}
              loading={submitting}
            />
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
                pill={false}
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="Add category"
                onSubmitEditing={addCategory}
              />
            </View>
            <Pressable
              onPress={addCategory}
              className="h-14 px-4 items-center justify-center rounded-lg bg-[#0644C7]"
              accessibilityRole="button"
              accessibilityLabel="Add category"
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
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-lg mb-1 ${
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
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
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
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-lg mb-1 ${
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
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
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
                className={`flex-row items-center justify-between px-4 py-3 rounded-lg mb-1 ${
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
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CreateAttractionScreen;
