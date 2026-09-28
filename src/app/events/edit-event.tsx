import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
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

import {
  CARD_SHADOW,
  FieldLabel,
  formatDateDisplay,
  formatTime,
  IntervalSheet,
  LocationSheet,
  PRIMARY,
  PreviewLine,
  Section,
  SelectRow,
} from "../../components/events/eventFormKit";
import { CallToBookNotice } from "../../components/ui/attractionFormKit";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { CheckboxRow } from "../../components/ui/FormControls";
import { InputField } from "../../components/ui/InputField";
import { TimePickerSheet } from "../../components/ui/TimePickerSheet";
import { firstFieldError, mediaUrl } from "../../lib/api";
import { venueDateKey } from "../../lib/date/venueTime";
import {
  buildEventUpdate,
  eventToEditForm,
  MIN_INTERVAL_MINUTES,
  moveItem,
  validateEventEdit,
  type EventEditForm,
} from "../../lib/events/eventEditForm";
import { markEventsStale } from "../../lib/hooks/useEvents";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser, getToken } from "../../lib/session";
import { scheduleWindowMinutes } from "../../lib/time";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import { fetchEventDetail, updateEvent } from "../../services/eventsService";

/** Small square icon button (reorder / remove) beside a list row. */
const RowIconButton = ({
  icon,
  color = "#6B7280",
  label,
  disabled = false,
  onPress,
}: {
  icon: "chevron-up" | "chevron-down" | "x" | "trash-2";
  color?: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    className={`w-8 h-8 items-center justify-center rounded-lg active:opacity-60 ${
      disabled ? "opacity-30" : ""
    }`}
  >
    <Feather name={icon} size={16} color={color} />
  </Pressable>
);

type SheetState =
  | null
  | { kind: "location" }
  | { kind: "interval" }
  | { kind: "time"; field: "start" | "end" }
  | { kind: "date"; field: "start" | "end" };

/**
 * Edit Event — the web admin's Edit Event page (pages/admin/events/EditEvent)
 * on mobile: the same fields, checks and PUT /api/events/{id} payload. The
 * form's rules live in lib/events/eventEditForm.
 */
const EditEventScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = Number(params.id);
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  const [form, setForm] = useState<EventEditForm | null>(null);
  const [eventLocationName, setEventLocationName] = useState("");
  /** What the picture box shows: the stored image, a new pick, or nothing. */
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);

  const { locations } = useLocationOptions();
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);
  const addOnsRequest = useRef(0);

  const update = useCallback(
    (patch: Partial<EventEditForm>) =>
      setForm((prev) => (prev ? { ...prev, ...patch } : prev)),
    [],
  );

  // --- load the event ---
  useEffect(() => {
    const token = getToken();
    if (!token || !Number.isFinite(eventId)) {
      setLoadError(!token ? "Not authenticated" : "Event not found.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetchEventDetail(token, eventId, controller.signal)
      .then((event) => {
        if (controller.signal.aborted) return;
        if (!event) {
          setLoadError("Failed to load event data");
          return;
        }
        setForm(eventToEditForm(event));
        setEventLocationName(event.locationName);
        setImagePreview(event.images[0] ? mediaUrl(event.images[0]) : null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(
          err instanceof Error && err.message
            ? err.message
            : "Failed to load event data",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [eventId, reloadKey]);

  // --- add-ons come from the event's location only (web parity) ---
  const locationId = form?.locationId ?? null;
  useEffect(() => {
    const requestId = ++addOnsRequest.current;
    const token = getToken();
    if (locationId == null || !token || !user?.id) {
      setAddOns([]);
      return;
    }
    fetchAddOns({ token, userId: user.id, locationId })
      .then((list) => {
        if (requestId === addOnsRequest.current) setAddOns(list);
      })
      .catch(() => {
        if (requestId === addOnsRequest.current) setAddOns([]);
      });
  }, [locationId, user?.id]);

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
      const dataUrl = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
      update({ image: { kind: "new", dataUrl } });
      setImagePreview(dataUrl);
    }
  }, [update]);

  const removeImage = () => {
    update({ image: { kind: "remove" } });
    setImagePreview(null);
  };

  if (loading || !form) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header headerIcon={headerIcon} />
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : (
          <View className="p-5">
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Could not load this event
              </Text>
              <Text className="text-red-500 text-sm mt-1">
                {loadError ?? "Failed to load event data"}
              </Text>
              <Pressable
                onPress={() => setReloadKey((k) => k + 1)}
                className="self-start mt-3 px-4 py-2 rounded-lg bg-[#0644C7] active:opacity-90"
              >
                <Text className="text-sm font-semibold text-white">Try again</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  // --- derived ---
  const locationName =
    locations.find((l) => l.id === form.locationId)?.name ||
    eventLocationName ||
    (form.locationId != null ? `Location #${form.locationId}` : null);

  const intervalError = (minutes: number): string | null => {
    if (form.noSetTimes) return null;
    const window = scheduleWindowMinutes(form.timeStart, form.timeEnd);
    return window !== null && minutes > window
      ? `Interval (${minutes} min) is longer than the event's time window (${window} min), so no start times could be generated`
      : null;
  };

  const runsPastMidnight =
    !form.noSetTimes && form.timeEnd < form.timeStart;

  // A stored start date may already be past; it can be kept, just not moved
  // further back than it already is.
  const todayKey = venueDateKey(new Date().toISOString()) ?? "";
  const startMinDate =
    form.startDate && form.startDate < todayKey ? form.startDate : undefined;

  // --- features ---
  const addFeature = () => update({ features: [...form.features, ""] });
  const removeFeature = (index: number) =>
    update({ features: form.features.filter((_, i) => i !== index) });
  const updateFeature = (index: number, value: string) =>
    update({
      features: form.features.map((f, i) => (i === index ? value : f)),
    });
  const moveFeature = (index: number, delta: -1 | 1) =>
    update({ features: moveItem(form.features, index, delta) });

  // --- add-ons ---
  const selectedAddOns = form.addOnIds
    .map((id) => addOns.find((a) => a.id === id))
    .filter((a): a is AddOnOption => !!a);
  const unselectedAddOns = addOns.filter((a) => !form.addOnIds.includes(a.id));
  const allSelected = addOns.length > 0 && unselectedAddOns.length === 0;

  const toggleAddOn = (id: number) =>
    update({
      addOnIds: form.addOnIds.includes(id)
        ? form.addOnIds.filter((x) => x !== id)
        : [...form.addOnIds, id],
    });

  // Reorder among the add-ons shown, swapping their places in the saved list.
  const moveAddOn = (id: number, delta: -1 | 1) => {
    const shown = selectedAddOns.map((a) => a.id);
    const at = shown.indexOf(id);
    const neighbour = shown[at + delta];
    if (at < 0 || neighbour == null) return;
    const next = [...form.addOnIds];
    const i = next.indexOf(id);
    const j = next.indexOf(neighbour);
    [next[i], next[j]] = [next[j], next[i]];
    update({ addOnIds: next });
  };

  const toggleSelectAll = () =>
    update({ addOnIds: allSelected ? [] : addOns.map((a) => a.id) });

  // --- submit ---
  const handleSubmit = async () => {
    const problem = validateEventEdit(form);
    if (problem) {
      Alert.alert("Check the form", problem);
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }
    setSubmitting(true);
    try {
      await updateEvent(token, eventId, buildEventUpdate(form));
      markEventsStale();
      Alert.alert("Event updated", "Event updated successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Couldn't update event",
        firstFieldError(err) ??
          (err instanceof Error && err.message
            ? err.message
            : "Failed to update event"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeFeatures = form.features.filter((f) => f.trim());

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header headerIcon={headerIcon} />

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
          {/* Intro — the web page's heading and helper line. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Edit Event
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Update event details
            </Text>
          </View>

          {/* Which location this event belongs to, and so its add-ons. */}
          <View
            className={`flex-row flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-4 py-3 mb-4 ${
              form.locationId != null
                ? "border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20"
                : "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20"
            }`}
          >
            <Feather
              name="map-pin"
              size={15}
              color={form.locationId != null ? PRIMARY : "#B45309"}
            />
            <Text className="text-sm text-gray-700 dark:text-gray-200">Location:</Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white">
              {locationName ?? "none set"}
            </Text>
            <Text className="basis-full text-xs text-gray-500 dark:text-gray-400">
              Add-ons below come from this location only.
            </Text>
          </View>

          {/* Basic Information */}
          <Section icon="calendar" title="Basic Information">
            {isCompanyAdmin && locations.length > 0 && (
              <View className="mb-4">
                <FieldLabel>Location</FieldLabel>
                <SelectRow
                  icon="map-pin"
                  value={locationName}
                  placeholder="Select a location"
                  onPress={() => setSheet({ kind: "location" })}
                />
              </View>
            )}

            <InputField
              label="Event Name *"
              value={form.name}
              onChangeText={(name) => update({ name })}
              placeholder="e.g., Summer Splash Party"
              containerClassName="mb-4"
            />

            <FieldLabel>Description</FieldLabel>
            <View className="rounded-2xl border bg-white dark:bg-neutral-900 px-4 py-3 mb-4 border-gray-200 dark:border-neutral-700">
              <TextInput
                value={form.description}
                onChangeText={(description) => update({ description })}
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
                {imagePreview ? "Change Image" : "Upload Image"}
              </Text>
            </Pressable>
            <View className="mt-2 p-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20">
              <Text className="text-xs font-medium text-blue-800 dark:text-blue-200">
                Recommended: 16:9 aspect ratio (1280×720 or 1920×1080 pixels)
              </Text>
              <Text className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                Images will be cropped to fit the display area. Center your
                subject for best results.
              </Text>
            </View>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Max file size: 20MB. Use optimized images for faster loading.
            </Text>
            {!!imagePreview && (
              <View className="mt-3">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Preview (as customers will see it):
                </Text>
                <View
                  className="w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800"
                  style={{ aspectRatio: 16 / 9 }}
                >
                  <Image
                    source={{ uri: imagePreview }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={removeImage}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 items-center justify-center"
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Remove image"
                  >
                    <Feather name="x" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            )}
          </Section>

          {/* Date & Time */}
          <Section icon="calendar" title="Date & Time">
            <FieldLabel>Date Type</FieldLabel>
            <View className="h-14 flex-row items-center rounded-lg bg-gray-100 dark:bg-neutral-800 p-1 mb-4">
              {(
                [
                  { key: "one_time", label: "One Time" },
                  { key: "date_range", label: "Date Range" },
                ] as const
              ).map((opt) => {
                const active = form.dateType === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => update({ dateType: opt.key })}
                    className={`flex-1 h-full items-center justify-center rounded-md ${active ? "bg-[#0644C7]" : ""}`}
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
                <FieldLabel>Start Date *</FieldLabel>
                <SelectRow
                  icon="calendar"
                  value={form.startDate ? formatDateDisplay(form.startDate) : null}
                  placeholder="Select"
                  onPress={() => setSheet({ kind: "date", field: "start" })}
                  compact
                />
              </View>
              {form.dateType === "date_range" && (
                <View className="flex-1">
                  <FieldLabel>End Date *</FieldLabel>
                  <SelectRow
                    icon="calendar"
                    value={form.endDate ? formatDateDisplay(form.endDate) : null}
                    placeholder="Select"
                    onPress={() => setSheet({ kind: "date", field: "end" })}
                    compact
                  />
                </View>
              )}
            </View>

            <View className="mb-3">
              <CheckboxRow
                label="No set times — guests call to book this event"
                checked={form.noSetTimes}
                onToggle={() => update({ noSetTimes: !form.noSetTimes })}
              />
            </View>
            <CallToBookNotice active={form.noSetTimes} itemLabel="event" />

            {!form.noSetTimes && (
              <>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FieldLabel>Start Time *</FieldLabel>
                    <SelectRow
                      icon="clock"
                      value={formatTime(form.timeStart)}
                      placeholder="Start"
                      onPress={() => setSheet({ kind: "time", field: "start" })}
                      compact
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>End Time *</FieldLabel>
                    <SelectRow
                      icon="clock"
                      value={formatTime(form.timeEnd)}
                      placeholder="End"
                      onPress={() => setSheet({ kind: "time", field: "end" })}
                      compact
                    />
                  </View>
                </View>
                {runsPastMidnight && (
                  <Text className="text-xs text-blue-700 dark:text-blue-300 mt-1.5">
                    Runs past midnight — ends {formatTime(form.timeEnd)} the
                    next day.
                  </Text>
                )}

                <View className="mt-4">
                  <FieldLabel>Time slot length (min) *</FieldLabel>
                  <SelectRow
                    icon="repeat"
                    value={`${form.intervalMinutes} minutes`}
                    placeholder="Select time slot length"
                    onPress={() => setSheet({ kind: "interval" })}
                  />
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    Each session is this long, and the next one starts as soon
                    as it ends.
                  </Text>
                </View>
              </>
            )}
          </Section>

          {/* Pricing & Capacity */}
          <Section icon="dollar-sign" title="Pricing & Capacity">
            <InputField
              label="Price per Ticket ($)"
              value={form.price}
              onChangeText={(price) => update({ price })}
              placeholder="0.00"
              keyboardType="decimal-pad"
              containerClassName="mb-4"
            />
            <InputField
              label="Max groups per time slot"
              value={form.maxBookingsPerSlot}
              onChangeText={(maxBookingsPerSlot) => update({ maxBookingsPerSlot })}
              placeholder="Unlimited"
              keyboardType="number-pad"
              containerClassName="mb-2"
            />
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Leave empty for unlimited
            </Text>
            <InputField
              label="Max people per time slot"
              value={form.maxTicketsPerSlot}
              onChangeText={(maxTicketsPerSlot) => update({ maxTicketsPerSlot })}
              placeholder="Unlimited"
              keyboardType="number-pad"
              containerClassName="mb-2"
            />
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Tickets sellable per slot. Customers see the live count.
            </Text>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-700 dark:text-gray-200">Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(isActive) => update({ isActive })}
                trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Section>

          {/* Features */}
          <Section icon="star" title="Features">
            {form.features.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                No features added yet.
              </Text>
            ) : (
              form.features.map((feature, index) => (
                <View key={index} className="flex-row items-center gap-1 mb-2">
                  <View>
                    <RowIconButton
                      icon="chevron-up"
                      label="Move feature up"
                      disabled={index === 0}
                      onPress={() => moveFeature(index, -1)}
                    />
                    <RowIconButton
                      icon="chevron-down"
                      label="Move feature down"
                      disabled={index === form.features.length - 1}
                      onPress={() => moveFeature(index, 1)}
                    />
                  </View>
                  <View className="flex-1 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4">
                    <TextInput
                      value={feature}
                      onChangeText={(t) => updateFeature(index, t)}
                      placeholder="e.g., Access to all water slides"
                      placeholderTextColor="#9CA3AF"
                      className="h-12 text-base text-gray-900 dark:text-white"
                    />
                  </View>
                  <RowIconButton
                    icon="trash-2"
                    color="#EF4444"
                    label="Remove feature"
                    onPress={() => removeFeature(index)}
                  />
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
          <Section
            icon="plus-circle"
            title="Add-Ons"
            right={
              addOns.length > 0 ? (
                <Pressable
                  onPress={toggleSelectAll}
                  hitSlop={6}
                  className={`px-3 py-1.5 rounded-lg active:opacity-80 ${
                    allSelected ? "bg-[#0644C7]" : ""
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      allSelected ? "text-white" : "text-[#0644C7] dark:text-blue-400"
                    }`}
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </Text>
                </Pressable>
              ) : null
            }
          >
            {addOns.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                No add-ons available.
              </Text>
            ) : (
              <>
                {selectedAddOns.length > 0 && (
                  <View className="mb-4">
                    <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Selected Add-ons{" "}
                      <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        (use the arrows to reorder)
                      </Text>
                    </Text>
                    {selectedAddOns.map((addOn, index) => (
                      <View
                        key={addOn.id}
                        className="flex-row items-center gap-1 p-1.5 mb-2 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20"
                      >
                        <RowIconButton
                          icon="chevron-up"
                          label={`Move ${addOn.name} up`}
                          disabled={index === 0}
                          onPress={() => moveAddOn(addOn.id, -1)}
                        />
                        <RowIconButton
                          icon="chevron-down"
                          label={`Move ${addOn.name} down`}
                          disabled={index === selectedAddOns.length - 1}
                          onPress={() => moveAddOn(addOn.id, 1)}
                        />
                        <Text
                          className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100"
                          numberOfLines={1}
                        >
                          {addOn.name}
                        </Text>
                        <Text className="text-xs text-green-600 dark:text-green-400">
                          ${addOn.price.toFixed(2)}
                        </Text>
                        <RowIconButton
                          icon="x"
                          color="#EF4444"
                          label={`Remove ${addOn.name}`}
                          onPress={() => toggleAddOn(addOn.id)}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {unselectedAddOns.length > 0 && (
                  <View className="flex-row flex-wrap gap-2">
                    {unselectedAddOns.map((addOn) => (
                      <Pressable
                        key={addOn.id}
                        onPress={() => toggleAddOn(addOn.id)}
                        className="flex-row items-center gap-1.5 px-3 py-2 rounded-md border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 active:opacity-70"
                      >
                        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {addOn.name}
                        </Text>
                        <Text className="text-xs text-gray-400">
                          ${addOn.price.toFixed(2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </Section>

          {/* Live Preview — at the foot, as on Create Event (the web keeps it
              in a side rail). */}
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

            <View className="flex-row items-center justify-between mb-3">
              <Text
                className="text-xl font-bold text-gray-900 dark:text-white flex-1 mr-2"
                numberOfLines={1}
              >
                {form.name || (
                  <Text className="text-gray-300 dark:text-gray-600">Event Name</Text>
                )}
              </Text>
              <Text className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                ${form.price || "--"}
              </Text>
            </View>

            <PreviewLine
              icon="calendar"
              label="Date"
              value={
                form.startDate
                  ? form.dateType === "one_time"
                    ? formatDateDisplay(form.startDate)
                    : `${formatDateDisplay(form.startDate)} – ${form.endDate ? formatDateDisplay(form.endDate) : "…"}`
                  : "Not set"
              }
              muted={!form.startDate}
            />
            <PreviewLine
              icon="clock"
              label="Time"
              value={
                form.noSetTimes
                  ? "Call to book — no set times"
                  : `${formatTime(form.timeStart)} – ${formatTime(form.timeEnd)}`
              }
            />
            <PreviewLine
              icon="map-pin"
              label="Location"
              value={locationName ?? "Not set"}
              muted={!locationName}
            />
            <PreviewLine
              icon="repeat"
              label="Time slot"
              value={`${form.intervalMinutes} min`}
            />
            {!!form.maxBookingsPerSlot.trim() && (
              <PreviewLine
                icon="users"
                label="Capacity"
                value={`${form.maxBookingsPerSlot.trim()} per slot`}
              />
            )}

            <Text
              className={`text-sm mt-1 mb-3 min-h-[36px] ${
                form.description
                  ? "text-gray-700 dark:text-gray-200"
                  : "text-gray-300 dark:text-gray-600"
              }`}
            >
              {form.description || "Description"}
            </Text>

            <View className="flex-row flex-wrap items-start gap-1.5 mb-3">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Features:
              </Text>
              {activeFeatures.length > 0 ? (
                activeFeatures.map((f, i) => (
                  <View
                    key={i}
                    className="flex-row items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full"
                  >
                    <Feather name="star" size={10} color="#EAB308" />
                    <Text className="text-xs text-gray-700 dark:text-gray-200">{f}</Text>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-gray-300 dark:text-gray-600">None</Text>
              )}
            </View>

            <View className="flex-row flex-wrap items-start gap-1.5 mb-3">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Add-ons:
              </Text>
              {selectedAddOns.length > 0 ? (
                selectedAddOns.map((a) => (
                  <View
                    key={a.id}
                    className="bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full"
                  >
                    <Text className="text-xs text-green-700 dark:text-green-300">
                      {a.name} (${a.price.toFixed(2)})
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-gray-300 dark:text-gray-600">None</Text>
              )}
            </View>

            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Status:
              </Text>
              <Text
                className={`text-sm font-medium ${form.isActive ? "text-green-600" : "text-gray-400"}`}
              >
                {form.isActive ? "Active" : "Inactive"}
              </Text>
            </View>

            {!!imagePreview && (
              <View
                className="w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800 mt-4"
                style={{ aspectRatio: 16 / 9 }}
              >
                <Image
                  source={{ uri: imagePreview }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              </View>
            )}
          </View>

          {/* Actions */}
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 h-14 items-center justify-center rounded-lg border border-gray-300 dark:border-neutral-700"
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] ${
                submitting ? "opacity-70" : "active:opacity-90"
              }`}
            >
              {submitting ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">Updating...</Text>
                </>
              ) : (
                <Text className="text-base font-semibold text-white">Update Event</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LocationSheet
        visible={sheet?.kind === "location"}
        options={locations}
        selectedId={form.locationId}
        onClose={() => setSheet(null)}
        onSelect={(id) => {
          update({ locationId: id });
          setSheet(null);
        }}
      />

      <IntervalSheet
        visible={sheet?.kind === "interval"}
        value={form.intervalMinutes}
        minMinutes={MIN_INTERVAL_MINUTES}
        validate={intervalError}
        onClose={() => setSheet(null)}
        onApply={(intervalMinutes) => {
          update({ intervalMinutes });
          setSheet(null);
        }}
      />

      <TimePickerSheet
        visible={sheet?.kind === "time"}
        value={
          sheet?.kind === "time"
            ? sheet.field === "start"
              ? form.timeStart
              : form.timeEnd
            : "09:00"
        }
        title={
          sheet?.kind === "time" && sheet.field === "start" ? "Start Time" : "End Time"
        }
        onClose={() => setSheet(null)}
        onSelect={(time) => {
          if (sheet?.kind === "time") {
            update(sheet.field === "start" ? { timeStart: time } : { timeEnd: time });
          }
          setSheet(null);
        }}
      />

      <DatePickerSheet
        visible={sheet?.kind === "date"}
        value={
          sheet?.kind === "date"
            ? sheet.field === "start"
              ? form.startDate
              : form.endDate
            : null
        }
        minDate={
          sheet?.kind === "date" && sheet.field === "end"
            ? form.startDate || undefined
            : startMinDate
        }
        title={
          sheet?.kind === "date" && sheet.field === "start" ? "Start Date" : "End Date"
        }
        onClose={() => setSheet(null)}
        onSelect={(date) => {
          if (sheet?.kind === "date") {
            if (sheet.field === "start") {
              // Keep a range valid when the start moves past its end.
              update(
                form.endDate && form.endDate < date
                  ? { startDate: date, endDate: "" }
                  : { startDate: date },
              );
            } else {
              update({ endDate: date });
            }
          }
          setSheet(null);
        }}
      />
    </View>
  );
};

const Header = ({ headerIcon }: { headerIcon: string }) => (
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
      <Text className="text-gray-900 dark:text-white text-lg font-bold">Edit Event</Text>
      <View style={{ width: 36 }} />
    </View>
  </View>
);

export default EditEventScreen;
