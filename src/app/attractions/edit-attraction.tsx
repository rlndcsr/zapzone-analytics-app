import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ALL_DAY_KEYS,
  DAYS,
  ErrorText,
  FieldLabel,
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
import { mediaUrl } from "../../lib/api";
import { markAttractionsStale } from "../../lib/hooks/useAttractions";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import {
  fetchAttractionDetail,
  updateAttraction,
  type AvailabilitySchedule,
  type UpdateAttractionInput,
} from "../../services/attractionsService";
import {
  createCategory,
  fetchCategories,
  type Category,
} from "../../services/categoriesService";

type FormErrors = Partial<
  Record<"name" | "description" | "category" | "price" | "maxCapacity", string>
>;

const toHHMM = (v: string): string => (v ? v.substring(0, 5) : v);

const EditAttractionScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();

  const params = useLocalSearchParams<{ id?: string }>();
  const attractionId = Number(params.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [pricingType, setPricingType] = useState<string>("per_person");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [displayCapacity, setDisplayCapacity] = useState(true);
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">(
    "minutes",
  );
  const [schedules, setSchedules] = useState<AvailabilitySchedule[]>([
    newSchedule(),
  ]);
  const [images, setImages] = useState<string[]>([]);
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationName, setLocationName] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);
  const [newCategory, setNewCategory] = useState("");

  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sheet, setSheet] = useState<
    | null
    | { kind: "category" }
    | { kind: "pricing" }
    | { kind: "time"; index: number; field: "start_time" | "end_time" }
  >(null);

  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});

  const registerSection = (key: string) => (e: LayoutChangeEvent) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  };
  const scrollToSection = (key: string) => {
    const y = sectionY.current[key];
    if (y != null)
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  useEffect(() => {
    if (!Number.isFinite(attractionId) || attractionId <= 0) {
      setLoadError("Missing attraction id.");
      setLoadingDetail(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setLoadError("Not signed in.");
      setLoadingDetail(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const detail = await fetchAttractionDetail(
          token,
          attractionId,
          controller.signal,
        );
        if (!active) return;
        const locId = detail.locationId ?? undefined;
        const [cats, ads] = await Promise.all([
          fetchCategories(token).catch(() => []),
          user?.id
            ? fetchAddOns({ token, userId: user.id, locationId: locId }).catch(
                () => [],
              )
            : Promise.resolve<AddOnOption[]>([]),
        ]);
        if (!active) return;

        setCategories(cats);
        setAddOns(ads);

        // Seed every field from the fetched detail.
        setName(detail.name);
        setDescription(detail.description);
        setCategory(detail.category);
        setPrice(String(detail.price));
        setPricingType(detail.pricingType || "per_person");
        setMaxCapacity(String(detail.maxCapacity));
        setDisplayCapacity(detail.displayCapacityToCustomers);
        setDuration(detail.duration != null ? String(detail.duration) : "");
        setDurationUnit(detail.durationUnit === "hours" ? "hours" : "minutes");
        setDisplayOrder(String(detail.displayOrder));
        setIsActive(detail.status === "active");
        setImages(detail.images ?? []);
        setLocationId(detail.locationId);
        setLocationName(detail.locationName || "Your location");

        setSchedules(
          detail.availability.length > 0
            ? detail.availability.map((s) => ({
                days: s.days,
                start_time: toHHMM(s.start_time),
                end_time: toHHMM(s.end_time),
              }))
            : [newSchedule()],
        );

        // Selected add-ons are tracked by name (as the create screen does), in
        // the saved display order when present.
        const orderedNames =
          detail.addOnsOrder.length > 0
            ? detail.addOnsOrder
            : detail.addOns.map((a) => a.name);
        setSelectedAddOns(orderedNames);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load attraction.",
          );
      } finally {
        if (active) setLoadingDetail(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attractionId, user?.id]);

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
    setSchedules((prev) => [
      ...prev,
      { days: [], start_time: "09:00", end_time: "17:00" },
    ]);

  const removeScheduleRow = (index: number) =>
    setSchedules((prev) => prev.filter((_, i) => i !== index));

  // --- add-ons ---
  const toggleAddOn = (addOnName: string) =>
    setSelectedAddOns((prev) =>
      prev.includes(addOnName)
        ? prev.filter((n) => n !== addOnName)
        : [...prev, addOnName],
    );

  // --- images (base64 uploads appended to the existing stored images) ---
  const pickImages = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
      return;
    }
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

  // --- validation + submit (mirrors the create screen) ---
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
    return next;
  };

  const errorSection = (errs: FormErrors): string | null => {
    if (errs.name || errs.description || errs.category) return "basic";
    if (errs.price || errs.maxCapacity) return "pricing";
    return null;
  };

  const handleSubmit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const sec = errorSection(found);
      if (sec) scrollToSection(sec);
      Alert.alert("Missing information", "Please fix the highlighted fields.");
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    const durationNum = duration === "" ? 0 : Number(duration);
    const addonIds = selectedAddOns
      .map((n) => addOns.find((a) => a.name === n)?.id)
      .filter((id): id is number => typeof id === "number");

    // Same payload contract the sheet used — edited scalars plus the now-editable
    // availability / images / add-ons.
    const input: UpdateAttractionInput = {
      location_id: locationId ?? undefined,
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      price: Number(price),
      pricing_type: pricingType,
      max_capacity: Math.round(Number(maxCapacity)),
      duration: Number.isNaN(durationNum) ? 0 : durationNum,
      duration_unit: durationUnit,
      availability: schedules,
      image: images.length > 0 ? images : undefined,
      is_active: isActive,
      addon_ids: addonIds,
      add_ons_order: selectedAddOns,
      display_capacity_to_customers: displayCapacity,
      display_order: Number(displayOrder) || 0,
    };

    setSubmitting(true);
    try {
      await updateAttraction(token, attractionId, input);
      markAttractionsStale();
      Alert.alert("Attraction updated", `"${input.name}" was saved.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update the attraction.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const imageUris = useMemo(
    () => images.map((i) => mediaUrl(i) ?? i),
    [images],
  );

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
            Edit Attraction
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {loadingDetail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
            {loadError}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Go back</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {/* Location (read-only on edit) */}
            <Section icon="map-pin" title="Location">
              <View className="rounded-2xl px-4 py-3.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
                <Text className="text-base text-gray-700 dark:text-gray-200">
                  {locationName}
                </Text>
              </View>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Location cannot be changed after an attraction is created.
              </Text>
            </Section>

            {/* Basic Information */}
            <Section
              icon="info"
              title="Basic Information"
              onLayout={registerSection("basic")}
            >
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
                  errors.description
                    ? "border-red-400"
                    : "border-gray-200 dark:border-neutral-700"
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

              <View className="flex-row items-center justify-between mt-5">
                <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
                  Active
                </Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Section>

            {/* Pricing & Capacity */}
            <Section
              icon="tag"
              title="Pricing & Capacity"
              onLayout={registerSection("pricing")}
            >
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
                            active
                              ? "text-white"
                              : "text-gray-500 dark:text-gray-300"
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
            <Section
              icon="calendar"
              title="Availability Schedule"
              onLayout={registerSection("availability")}
            >
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
                      <Pressable
                        onPress={() => removeScheduleRow(index)}
                        hitSlop={8}
                      >
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
                            on
                              ? "bg-[#0644C7]"
                              : "bg-gray-100 dark:bg-neutral-800"
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold ${
                              on
                                ? "text-white"
                                : "text-gray-600 dark:text-gray-300"
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
                        {on && (
                          <Feather name="check" size={13} color="#FFFFFF" />
                        )}
                        <Text
                          className={`text-sm font-medium ${
                            on
                              ? "text-white"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {addOn.name}
                        </Text>
                        <Text
                          className={`text-xs ${
                            on ? "text-white/80" : "text-gray-400"
                          }`}
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

              {imageUris.length > 0 && (
                <View className="flex-row flex-wrap gap-3 mt-3">
                  {imageUris.map((uri, index) => (
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
          </ScrollView>

          {/* Sticky footer — Cancel / Update Attraction (matches Packages edit). */}
          <View
            className="flex-row gap-3 px-5 pt-3 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    Update Attraction
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

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

      {/* Time picker */}
      <BottomSheet
        visible={sheet?.kind === "time"}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === "time" && sheet.field === "start_time"
            ? "Start Time"
            : "End Time"
        }
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

export default EditAttractionScreen;
