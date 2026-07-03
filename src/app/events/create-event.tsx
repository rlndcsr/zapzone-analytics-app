import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
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
import { markEventsStale } from "../../lib/hooks/useEvents";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import { createEvent, type CreateEventInput, type EventDateType } from "../../services/eventsService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120];

// 30-minute increments, the native stand-in for the web's <input type="time">.
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

function formatTime(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
      <Text className="text-base font-bold text-gray-900 dark:text-white">{title}</Text>
    </View>
    {children}
  </View>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

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
      className={`flex-1 text-base ${value ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
      numberOfLines={1}
    >
      {value ?? placeholder}
    </Text>
    <Feather name="chevron-down" size={18} color="#9CA3AF" />
  </Pressable>
);

const ErrorText = ({ error }: { error?: string }) =>
  error ? <Text className="ml-4 mt-1.5 text-xs text-red-500">{error}</Text> : null;

/** A single line in the Live Preview card. */
const PreviewLine = ({
  icon,
  label,
  value,
  muted,
}: {
  icon: IconName;
  label: string;
  value: string;
  muted?: boolean;
}) => (
  <View className="flex-row items-center gap-2 mb-2">
    <Feather name={icon} size={14} color="#9CA3AF" />
    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}:</Text>
    <Text
      className={`text-sm flex-1 ${muted ? "text-gray-300 dark:text-gray-600" : "text-gray-800 dark:text-gray-100"}`}
      numberOfLines={1}
    >
      {value}
    </Text>
  </View>
);

type FormErrors = Partial<
  Record<"name" | "startDate" | "endDate" | "time" | "location", string>
>;

const CreateEventScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  // --- form state ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [dateType, setDateType] = useState<EventDateType>("one_time");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [maxBookingsPerSlot, setMaxBookingsPerSlot] = useState("");
  const [price, setPrice] = useState("0");
  const [features, setFeatures] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    user?.location_id ?? null,
  );
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<number[]>([]);

  // --- reference data ---
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);

  // --- ui state ---
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sheet, setSheet] = useState<
    | null
    | { kind: "location" }
    | { kind: "interval" }
    | { kind: "time"; field: "start" | "end" }
    | { kind: "date"; field: "start" | "end" }
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

  // Load all add-ons available to the user (not location-scoped), exactly like
  // the web Create Event page — so the full add-on catalog is selectable.
  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;
    fetchAddOns({ token, userId: user.id })
      .then(setAddOns)
      .catch(() => {});
  }, [user?.id]);

  const locationName = useMemo(
    () =>
      locationOptions.find((l) => l.id === selectedLocationId)?.name ??
      (user?.location?.name ?? null),
    [locationOptions, selectedLocationId, user],
  );

  // Date options for the pickers — the next 365 days.
  const dateOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({
        value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        label:
          i === 0
            ? "Today"
            : `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      });
    }
    return out;
  }, []);

  // --- features ---
  const addFeature = () => setFeatures((prev) => [...prev, ""]);
  const removeFeature = (index: number) =>
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  const updateFeature = (index: number, value: string) =>
    setFeatures((prev) => prev.map((f, i) => (i === index ? value : f)));

  // --- add-ons ---
  const toggleAddOn = (id: number) =>
    setSelectedAddOnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // --- image ---
  const pickImage = useCallback(async () => {
    // Loaded lazily so the native module never runs at app startup.
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset?.base64) {
      setImage(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`);
    }
  }, []);

  // --- validation + submit ---
  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Event name is required.";
    if (!startDate) next.startDate = "Start date is required.";
    if (dateType === "date_range" && !endDate)
      next.endDate = "End date is required for a date range.";
    if (timeStart >= timeEnd && timeEnd !== "00:00")
      next.time = "End time must be after start time.";
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

    const maxNum = maxBookingsPerSlot.trim() ? Number(maxBookingsPerSlot) : null;

    const input: CreateEventInput = {
      location_id: selectedLocationId,
      name: name.trim(),
      description: description.trim() || undefined,
      image: image ?? undefined,
      date_type: dateType,
      start_date: startDate,
      end_date: dateType === "date_range" ? endDate : undefined,
      time_start: timeStart,
      time_end: timeEnd,
      interval_minutes: intervalMinutes,
      max_bookings_per_slot: maxNum && !Number.isNaN(maxNum) ? maxNum : null,
      price: Number(price) || 0,
      features: features.map((f) => f.trim()).filter(Boolean),
      add_on_ids: selectedAddOnIds.length > 0 ? selectedAddOnIds : undefined,
      add_ons_order: selectedAddOnIds.length > 0 ? selectedAddOnIds : undefined,
      is_active: isActive,
    };

    setSubmitting(true);
    try {
      await createEvent(token, input);
      markEventsStale();
      Alert.alert("Event created", `"${input.name}" was created successfully.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Couldn't create event",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeFeatures = features.filter((f) => f.trim());

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Create Event</Text>
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
          {/* Intro — mirrors the web "Create Event" heading + helper text, in
              the same white "Overview" card used across the Events section. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Create Event
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Fill in the details below to create a new event.
            </Text>
          </View>

          {/* Live Preview — shown up top so it updates as the form is filled
              (mirrors the web's sticky Live Preview panel). */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 border border-[#0644C7]/20"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-2 mb-4">
              <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
                <Feather name="eye" size={16} color={PRIMARY} />
              </View>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Live Preview
              </Text>
            </View>

            {!!image && (
              <View className="w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800 mb-4" style={{ aspectRatio: 16 / 9 }}>
                <Image source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              </View>
            )}

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={1}>
                {name || <Text className="text-gray-300 dark:text-gray-600">Event Name</Text>}
              </Text>
              <Text className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                ${price || "--"}
              </Text>
            </View>

            <PreviewLine
              icon="calendar"
              label="Date"
              value={
                startDate
                  ? dateType === "one_time"
                    ? formatDateDisplay(startDate)
                    : `${formatDateDisplay(startDate)} – ${endDate ? formatDateDisplay(endDate) : "…"}`
                  : "Not set"
              }
              muted={!startDate}
            />
            <PreviewLine
              icon="clock"
              label="Time"
              value={`${formatTime(timeStart)} – ${formatTime(timeEnd)}`}
            />
            <PreviewLine
              icon="map-pin"
              label="Location"
              value={locationName ?? "Not set"}
              muted={!locationName}
            />
            <PreviewLine icon="repeat" label="Interval" value={`${intervalMinutes} min`} />
            {!!maxBookingsPerSlot && (
              <PreviewLine icon="users" label="Capacity" value={`${maxBookingsPerSlot} per slot`} />
            )}

            <Text
              className={`text-sm mt-1 mb-3 min-h-[36px] ${description ? "text-gray-700 dark:text-gray-200" : "text-gray-300 dark:text-gray-600"}`}
            >
              {description || "Description"}
            </Text>

            <View className="flex-row flex-wrap items-start gap-1.5 mb-3">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Features:</Text>
              {activeFeatures.length > 0 ? (
                activeFeatures.map((f, i) => (
                  <View key={i} className="flex-row items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">
                    <Feather name="star" size={10} color="#EAB308" />
                    <Text className="text-xs text-gray-700 dark:text-gray-200">{f}</Text>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-gray-300 dark:text-gray-600">None</Text>
              )}
            </View>

            <View className="flex-row flex-wrap items-start gap-1.5 mb-3">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add-ons:</Text>
              {selectedAddOnIds.length > 0 ? (
                selectedAddOnIds.map((id) => {
                  const a = addOns.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <View key={id} className="bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                      <Text className="text-xs text-green-700 dark:text-green-300">
                        {a.name} (${a.price.toFixed(2)})
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text className="text-sm text-gray-300 dark:text-gray-600">None</Text>
              )}
            </View>

            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Status:</Text>
              <Text className={`text-sm font-medium ${isActive ? "text-green-600" : "text-gray-400"}`}>
                {isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

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
              label="Event Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Summer Splash Party"
              error={errors.name}
              containerClassName="mb-4"
            />

            <FieldLabel>Description</FieldLabel>
            <View className="rounded-2xl border bg-white dark:bg-neutral-900 px-4 py-3 mb-4 border-gray-200 dark:border-neutral-700">
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the event..."
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                className="min-h-[88px] text-base text-gray-900 dark:text-white"
              />
            </View>

            <FieldLabel>Event Image</FieldLabel>
            <Pressable
              onPress={pickImage}
              className="flex-row items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700"
            >
              <Feather name="upload" size={18} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                {image ? "Change Image" : "Upload Image"}
              </Text>
            </Pressable>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Recommended: 16:9 aspect ratio. Max 20MB.
            </Text>
            {!!image && (
              <View className="w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800 mt-3" style={{ aspectRatio: 16 / 9 }}>
                <Image source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <Pressable
                  onPress={() => setImage(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 items-center justify-center"
                  hitSlop={6}
                >
                  <Feather name="x" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            )}
          </Section>

          {/* Date & Time */}
          <Section icon="calendar" title="Date & Time">
            <FieldLabel>Date Type</FieldLabel>
            <View className="h-14 flex-row items-center rounded-full bg-gray-100 dark:bg-neutral-800 p-1 mb-4">
              {(
                [
                  { key: "one_time", label: "One Time" },
                  { key: "date_range", label: "Date Range" },
                ] as const
              ).map((opt) => {
                const active = dateType === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setDateType(opt.key)}
                    className={`flex-1 h-full items-center justify-center rounded-full ${active ? "bg-[#0644C7]" : ""}`}
                  >
                    <Text
                      className={`text-sm font-semibold ${active ? "text-white" : "text-gray-500 dark:text-gray-300"}`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <FieldLabel>Start Date</FieldLabel>
                <SelectRow
                  icon="calendar"
                  value={startDate ? formatDateDisplay(startDate) : null}
                  placeholder="Select"
                  onPress={() => setSheet({ kind: "date", field: "start" })}
                  error={!!errors.startDate}
                />
              </View>
              {dateType === "date_range" && (
                <View className="flex-1">
                  <FieldLabel>End Date</FieldLabel>
                  <SelectRow
                    icon="calendar"
                    value={endDate ? formatDateDisplay(endDate) : null}
                    placeholder="Select"
                    onPress={() => setSheet({ kind: "date", field: "end" })}
                    error={!!errors.endDate}
                  />
                </View>
              )}
            </View>
            <ErrorText error={errors.startDate || errors.endDate} />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FieldLabel>Start Time</FieldLabel>
                <SelectRow
                  icon="clock"
                  value={formatTime(timeStart)}
                  placeholder="Start"
                  onPress={() => setSheet({ kind: "time", field: "start" })}
                  error={!!errors.time}
                />
              </View>
              <View className="flex-1">
                <FieldLabel>End Time</FieldLabel>
                <SelectRow
                  icon="clock"
                  value={formatTime(timeEnd)}
                  placeholder="End"
                  onPress={() => setSheet({ kind: "time", field: "end" })}
                  error={!!errors.time}
                />
              </View>
            </View>
            <ErrorText error={errors.time} />

            <View className="mt-4">
              <FieldLabel>Slot Interval</FieldLabel>
              <SelectRow
                icon="repeat"
                value={`${intervalMinutes} minutes`}
                placeholder="Select interval"
                onPress={() => setSheet({ kind: "interval" })}
              />
            </View>
          </Section>

          {/* Pricing & Capacity */}
          <Section icon="dollar-sign" title="Pricing & Capacity">
            <InputField
              label="Price per Ticket ($)"
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
              containerClassName="mb-4"
            />
            <InputField
              label="Max Bookings per Slot"
              value={maxBookingsPerSlot}
              onChangeText={setMaxBookingsPerSlot}
              placeholder="Unlimited"
              keyboardType="number-pad"
              containerClassName="mb-2"
            />
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Leave empty for unlimited capacity per slot.
            </Text>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-700 dark:text-gray-200">Active</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Section>

          {/* Features */}
          <Section icon="star" title="Features">
            {features.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                No features added yet.
              </Text>
            ) : (
              features.map((feature, index) => (
                <View key={index} className="flex-row items-center gap-2 mb-2">
                  <View className="flex-1 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4">
                    <TextInput
                      value={feature}
                      onChangeText={(t) => updateFeature(index, t)}
                      placeholder="e.g., Access to all water slides"
                      placeholderTextColor="#9CA3AF"
                      className="h-12 text-base text-gray-900 dark:text-white"
                    />
                  </View>
                  <Pressable onPress={() => removeFeature(index)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color="#EF4444" />
                  </Pressable>
                </View>
              ))
            )}
            <Pressable
              onPress={addFeature}
              className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700 mt-1"
            >
              <Feather name="plus" size={16} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">Add Feature</Text>
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
                  const on = selectedAddOnIds.includes(addOn.id);
                  return (
                    <Pressable
                      key={addOn.id}
                      onPress={() => toggleAddOn(addOn.id)}
                      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      {on && <Feather name="check" size={13} color="#FFFFFF" />}
                      <Text className={`text-sm font-medium ${on ? "text-white" : "text-gray-700 dark:text-gray-200"}`}>
                        {addOn.name}
                      </Text>
                      <Text className={`text-xs ${on ? "text-white/80" : "text-gray-400"}`}>
                        ${addOn.price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
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
                <Text className="text-base font-semibold text-white">Create Event</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Location picker */}
      <BottomSheet
        visible={sheet?.kind === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {locationOptions.length === 0 && (
            <Text className="text-sm text-gray-400 px-4 py-3">No locations available.</Text>
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
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Interval picker */}
      <BottomSheet
        visible={sheet?.kind === "interval"}
        onClose={() => setSheet(null)}
        title="Slot Interval"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {INTERVAL_OPTIONS.map((opt) => {
            const isSelected = intervalMinutes === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  setIntervalMinutes(opt);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {opt} minutes
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
        title={sheet?.kind === "time" && sheet.field === "start" ? "Start Time" : "End Time"}
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {TIME_OPTIONS.map((t) => {
            const current =
              sheet?.kind === "time" ? (sheet.field === "start" ? timeStart : timeEnd) : undefined;
            const isSelected = current === t;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  if (sheet?.kind === "time") {
                    if (sheet.field === "start") setTimeStart(t);
                    else setTimeEnd(t);
                  }
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
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

      {/* Date picker */}
      <BottomSheet
        visible={sheet?.kind === "date"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "date" && sheet.field === "start" ? "Start Date" : "End Date"}
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {dateOptions
            .filter((d) =>
              sheet?.kind === "date" && sheet.field === "end" && startDate
                ? d.value >= startDate
                : true,
            )
            .map((d) => {
              const current =
                sheet?.kind === "date" ? (sheet.field === "start" ? startDate : endDate) : undefined;
              const isSelected = current === d.value;
              return (
                <Pressable
                  key={d.value}
                  onPress={() => {
                    if (sheet?.kind === "date") {
                      if (sheet.field === "start") {
                        setStartDate(d.value);
                        // Keep the range valid if the end date is now before start.
                        if (endDate && endDate < d.value) setEndDate("");
                      } else {
                        setEndDate(d.value);
                      }
                    }
                    setSheet(null);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium ${
                      isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {d.label}
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

export default CreateEventScreen;
