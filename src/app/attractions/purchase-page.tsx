import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { mediaUrl } from "../../lib/api";
import { getToken } from "../../lib/session";
import {
  fetchAttractionDetail,
  type AttractionDetail,
} from "../../services/attractionsService";
import {
  createAttractionPurchase,
  type CreateAttractionPurchaseInput,
} from "../../services/attractionPurchasesService";
import { markAttractionPurchasesStale } from "../../lib/hooks/useAttractionPurchases";

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
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

const pricingSuffix = (t: string) =>
  t === "per_person"
    ? "/person"
    : t === "per_group"
      ? "/group"
      : t === "per_hour"
        ? "/hour"
        : "";

function formatTime(value: string): string {
  const [h, m] = value.split(":");
  let hour = Number(h);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${meridian}`;
}

// Mirrors the web PurchaseAttraction generateTimeSlots (hourly windows from the
// attraction's availability), rather than a fixed slot list.
function generateTimeSlots(
  startTime: string,
  endTime: string,
  intervalMinutes = 60,
): string[] {
  const slots: string[] = [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let cur = sh * 60 + sm;
  const end = eh * 60 + em;
  while (cur < end) {
    slots.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += intervalMinutes;
  }
  return slots;
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

const SelectRow = ({
  icon,
  value,
  placeholder,
  onPress,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="h-14 flex-row items-center gap-3 rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
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

/** +/- stepper (shared with the on-site purchase screen's pattern). */
const Stepper = ({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) => (
  <View className="flex-row items-center gap-3">
    <Pressable
      onPress={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      className={`w-9 h-9 rounded-full items-center justify-center border ${
        value <= min
          ? "border-gray-200 dark:border-neutral-800"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      <Feather name="minus" size={16} color={value <= min ? "#D1D5DB" : "#374151"} />
    </Pressable>
    <Text className="w-8 text-center text-base font-semibold text-gray-900 dark:text-white">
      {value}
    </Text>
    <Pressable
      onPress={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      className={`w-9 h-9 rounded-full items-center justify-center border ${
        value >= max
          ? "border-gray-200 dark:border-neutral-800"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      <Feather name="plus" size={16} color={value >= max ? "#D1D5DB" : "#374151"} />
    </Pressable>
  </View>
);

const PurchasePageScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { id } = useLocalSearchParams<{ id?: string; slug?: string }>();
  const attractionId = id ? Number(id) : null;

  const screenWidth = Dimensions.get("window").width;
  const galleryWidth = screenWidth; // full-bleed hero

  const [detail, setDetail] = useState<AttractionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"in-store" | "paylater">(
    "in-store",
  );
  const [sendEmail, setSendEmail] = useState(true);

  const [sheet, setSheet] = useState<null | "date" | "time">(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const submitLockRef = useRef(false);

  // Load the attraction detail (same GET /api/attractions/{id} the web uses).
  useEffect(() => {
    if (attractionId == null || Number.isNaN(attractionId)) {
      setError("Attraction not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchAttractionDetail(token, attractionId, controller.signal)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load attraction");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attractionId]);

  const images = useMemo(
    () =>
      (detail?.images ?? [])
        .map((p) => mediaUrl(p))
        .filter((u): u is string => !!u),
    [detail],
  );

  const orderedAddOns = useMemo(() => {
    if (!detail) return [];
    const order = detail.addOnsOrder ?? [];
    return [...detail.addOns].sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [detail]);

  // Date options: next 60 days (day-off blocking is a web-only refinement, as in
  // the on-site purchase screen).
  const dateOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({
        value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        label:
          i === 0
            ? "Today"
            : `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
      });
    }
    return out;
  }, []);
  const dateLabel = dateOptions.find((d) => d.value === scheduledDate)?.label ?? null;

  // Time slots derived from the attraction availability for the selected day —
  // mirrors the web getAttractionAvailability + generateTimeSlots.
  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !detail) return [];
    const day = new Date(scheduledDate + "T00:00:00");
    const dayKey = WEEKDAY_KEYS[day.getDay()];
    const slot = detail.availability.find((s) =>
      s.days.map((d) => d.toLowerCase()).includes(dayKey),
    );
    if (!slot) return [];
    return generateTimeSlots(slot.start_time, slot.end_time, 60);
  }, [scheduledDate, detail]);

  // Clear a chosen time if it's no longer valid for the newly picked date.
  useEffect(() => {
    if (scheduledTime && !availableTimeSlots.includes(scheduledTime)) {
      setScheduledTime("");
    }
  }, [availableTimeSlots, scheduledTime]);

  const subtotal = detail ? detail.price * quantity : 0;
  const addOnsTotal = useMemo(() => {
    if (!detail) return 0;
    return detail.addOns.reduce(
      (sum, a) => sum + a.price * (addonQty[a.id] ?? 0),
      0,
    );
  }, [detail, addonQty]);
  const total = Math.max(0, subtotal + addOnsTotal);

  const setAddon = (addonId: number, n: number) =>
    setAddonQty((prev) => ({ ...prev, [addonId]: n }));

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / galleryWidth);
    if (idx !== imageIndex) setImageIndex(idx);
  };

  const handlePurchase = async () => {
    if (!detail) return;
    const locationId = detail.locationId;
    if (locationId == null) {
      Alert.alert("Location unavailable", "This attraction has no location set.");
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert(
        "Missing information",
        "Please enter your first name, last name and email.",
      );
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      Alert.alert(
        "Select a visit date & time",
        "Please choose your visit date and time before purchasing.",
      );
      return;
    }
    if (submitLockRef.current) return;

    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    const additionalAddons = Object.entries(addonQty)
      .filter(([, qty]) => qty > 0)
      .map(([idStr, qty]) => {
        const addOn = detail.addOns.find((a) => a.id === Number(idStr));
        return addOn
          ? { addon_id: addOn.id, quantity: qty, price_at_purchase: addOn.price }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const isPayLater = paymentMethod === "paylater";
    const input: CreateAttractionPurchaseInput = {
      attraction_id: detail.id,
      guest_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      guest_email: email.trim() || undefined,
      guest_phone: phone.trim() || undefined,
      quantity,
      amount: total,
      total_amount: total,
      amount_paid: isPayLater ? 0 : total,
      currency: "USD",
      method: isPayLater ? "paylater" : "cash",
      payment_method: paymentMethod,
      ...(paymentMethod === "in-store" ? { status: "confirmed" as const } : {}),
      location_id: locationId,
      purchase_date: dateOptions[0].value,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      notes: `Attraction Purchase: ${detail.name} (${quantity} ticket${quantity > 1 ? "s" : ""})`,
      send_email: paymentMethod === "in-store" ? sendEmail : false,
      additional_addons: additionalAddons.length > 0 ? additionalAddons : undefined,
    };

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await createAttractionPurchase(token, input);
      markAttractionPurchasesStale();
      setConfirmed(true);
    } catch (err) {
      Alert.alert(
        "Couldn't complete purchase",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  /* --- Loading / error / not-found ---------------------------------------- */

  const Header = ({ title }: { title: string }) => (
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
        <Text className="text-gray-900 dark:text-white text-lg font-bold" numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header title="Purchase" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header title="Purchase" />
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#9CA3AF" />
          <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg mt-3">
            {error ?? "Attraction not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-5 px-5 py-3 rounded-full bg-[#0644C7]"
          >
            <Text className="text-white font-semibold">Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* --- Confirmation ------------------------------------------------------- */

  if (confirmed) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header title="Confirmed" />
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-6 items-center shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center mb-4">
              <Feather name="check" size={30} color="#16A34A" />
            </View>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Purchase confirmed
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1 text-center">
              {paymentMethod === "in-store" && sendEmail
                ? "A receipt has been sent to the email provided."
                : "The purchase has been recorded."}
            </Text>

            <View className="w-full mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800 gap-2">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Attraction</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right">
                  {detail.name}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Tickets</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {quantity}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Visit</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {dateLabel} · {formatTime(scheduledTime)}
                </Text>
              </View>
              <View className="flex-row justify-between pt-2 mt-1 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-base font-bold text-gray-900 dark:text-white">Total</Text>
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  {money(total)}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => router.back()}
            className="mt-5 h-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
          >
            <Text className="text-base font-semibold text-white">Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  /* --- Purchase flow ------------------------------------------------------ */

  const suffix = pricingSuffix(detail.pricingType);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header title="Purchase" />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Hero gallery */}
          {images.length > 0 ? (
            <View>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onGalleryScroll}
              >
                {images.map((uri, i) => (
                  <Image
                    key={i}
                    source={{ uri }}
                    style={{ width: galleryWidth, height: 240 }}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View className="flex-row justify-center gap-1.5 mt-2">
                  {images.map((_, i) => (
                    <View
                      key={i}
                      className={`h-1.5 rounded-full ${
                        i === imageIndex ? "w-5 bg-[#0644C7]" : "w-1.5 bg-gray-300 dark:bg-neutral-700"
                      }`}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View
              style={{ width: galleryWidth, height: 200 }}
              className="items-center justify-center bg-gray-100 dark:bg-neutral-800"
            >
              <Feather name="image" size={36} color="#9CA3AF" />
            </View>
          )}

          <View className="px-5 pt-5">
            {/* Attraction info */}
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-start justify-between">
                <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1 mr-3">
                  {detail.name}
                </Text>
                <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
                  <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                    {detail.category}
                  </Text>
                </View>
              </View>

              <Text className="text-2xl font-bold text-[#0644C7] mt-2">
                {money(detail.price)}
                {!!suffix && (
                  <Text className="text-sm font-normal text-gray-400"> {suffix}</Text>
                )}
              </Text>

              {!!detail.description && (
                <Text className="text-sm text-gray-600 dark:text-gray-300 leading-5 mt-3">
                  {detail.description}
                </Text>
              )}

              <View className="flex-row flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-gray-100 dark:border-neutral-800">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="clock" size={13} color="#9CA3AF" />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {detail.duration
                      ? `${detail.duration} ${detail.durationUnit}`
                      : "Unlimited"}
                  </Text>
                </View>
                {detail.displayCapacityToCustomers && (
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="users" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Up to {detail.maxCapacity} people
                    </Text>
                  </View>
                )}
                {!!detail.locationName && (
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="map-pin" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {detail.locationName}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Quantity */}
            <Section icon="shopping-cart" title="Select Quantity">
              <View className="flex-row items-center justify-between">
                <FieldLabel>How many tickets?</FieldLabel>
                <Stepper value={quantity} onChange={setQuantity} min={1} />
              </View>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {money(detail.price)} × {quantity} ={" "}
                <Text className="font-semibold text-gray-600 dark:text-gray-300">
                  {money(subtotal)}
                </Text>
              </Text>
            </Section>

            {/* Schedule */}
            <Section icon="calendar" title="Schedule Visit">
              <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-3">
                Select your preferred visit date and time.
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <FieldLabel>Date</FieldLabel>
                  <SelectRow
                    icon="calendar"
                    value={dateLabel}
                    placeholder="Select date"
                    onPress={() => setSheet("date")}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Time</FieldLabel>
                  <SelectRow
                    icon="clock"
                    value={scheduledTime ? formatTime(scheduledTime) : null}
                    placeholder="Select time"
                    onPress={() => {
                      if (!scheduledDate) {
                        Alert.alert("Pick a date first", "Choose a visit date, then a time.");
                        return;
                      }
                      setSheet("time");
                    }}
                  />
                </View>
              </View>
              {!!scheduledDate && availableTimeSlots.length === 0 && (
                <Text className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  No available times on this day. Please pick another date.
                </Text>
              )}
            </Section>

            {/* Add-ons */}
            {orderedAddOns.length > 0 && (
              <Section icon="plus-circle" title="Add-ons">
                {orderedAddOns.map((addOn) => (
                  <View
                    key={addOn.id}
                    className="flex-row items-center gap-3 py-2.5 border-b border-gray-100 dark:border-neutral-800"
                  >
                    <View className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 dark:bg-neutral-800 items-center justify-center">
                      {addOn.image ? (
                        <Image
                          source={{ uri: mediaUrl(addOn.image) ?? undefined }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <Feather name="plus" size={16} color="#9CA3AF" />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {addOn.name}
                      </Text>
                      <Text className="text-xs text-gray-400">
                        {money(addOn.price)} each
                      </Text>
                    </View>
                    <Stepper
                      value={addonQty[addOn.id] ?? 0}
                      onChange={(n) => setAddon(addOn.id, n)}
                      min={0}
                      max={addOn.maxQuantity}
                    />
                  </View>
                ))}
              </Section>
            )}

            {/* Your information */}
            <Section icon="user" title="Your Information">
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <InputField
                    label="First Name"
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                  />
                </View>
                <View className="flex-1">
                  <InputField
                    label="Last Name"
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                  />
                </View>
              </View>
              <InputField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                containerClassName="mb-4"
              />
              <InputField
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 123-4567"
                keyboardType="phone-pad"
              />
            </Section>

            {/* Payment */}
            <Section icon="credit-card" title="Payment">
              <View className="flex-row gap-3">
                {(
                  [
                    { key: "in-store", label: "In-Store", icon: "dollar-sign" },
                    { key: "paylater", label: "Pay Later", icon: "clock" },
                  ] as const
                ).map((opt) => {
                  const active = paymentMethod === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setPaymentMethod(opt.key)}
                      className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Feather
                        name={opt.icon}
                        size={16}
                        color={active ? "#FFFFFF" : "#6B7280"}
                      />
                      <Text
                        className={`text-sm font-semibold ${
                          active ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {paymentMethod === "paylater" && (
                <View className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3">
                  <Text className="text-xs text-amber-800 dark:text-amber-300">
                    No payment is collected now. Payment is due on arrival.
                  </Text>
                </View>
              )}
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Card (Authorize.Net) payments are available on the web purchase page.
              </Text>
            </Section>

            {/* Order summary */}
            <Section icon="file-text" title="Order Summary">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {quantity} × {money(detail.price)}
                </Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(subtotal)}
                </Text>
              </View>
              {orderedAddOns
                .filter((a) => (addonQty[a.id] ?? 0) > 0)
                .map((a) => (
                  <View key={a.id} className="flex-row justify-between mb-2">
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      {a.name} × {addonQty[a.id]}
                    </Text>
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      {money(a.price * (addonQty[a.id] ?? 0))}
                    </Text>
                  </View>
                ))}
              <View className="flex-row justify-between pt-3 mt-1 border-t border-gray-200 dark:border-neutral-700">
                <Text className="text-base font-bold text-gray-900 dark:text-white">Total</Text>
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  {money(total)}
                </Text>
              </View>

              {paymentMethod === "in-store" && (
                <View className="flex-row items-center justify-between mt-4">
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    Send email receipt
                  </Text>
                  <Switch
                    value={sendEmail}
                    onValueChange={setSendEmail}
                    trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}
            </Section>

            <Pressable
              onPress={handlePurchase}
              disabled={submitting}
              className={`h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] ${
                submitting ? "opacity-70" : "active:opacity-90"
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="shopping-bag" size={18} color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">
                    Complete Purchase · {money(total)}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <BottomSheet
        visible={sheet === "date"}
        onClose={() => setSheet(null)}
        title="Select Date"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {dateOptions.map((d) => {
            const isSelected = scheduledDate === d.value;
            return (
              <Pressable
                key={d.value}
                onPress={() => {
                  setScheduledDate(d.value);
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
                  {d.label}
                </Text>
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Time picker */}
      <BottomSheet
        visible={sheet === "time"}
        onClose={() => setSheet(null)}
        title="Select Time"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {availableTimeSlots.length === 0 ? (
            <Text className="text-sm text-gray-400 px-4 py-4 text-center">
              No available times for the selected date.
            </Text>
          ) : (
            availableTimeSlots.map((t) => {
              const isSelected = scheduledTime === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    setScheduledTime(t);
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
                  {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default PurchasePageScreen;
