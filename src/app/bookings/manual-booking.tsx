import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { markBookingsStale } from "../../lib/hooks/useBookings";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  buildAppliedDiscounts,
  buildAppliedFees,
  fetchFeeBreakdown,
  fetchSpecialPricing,
  type FeeBreakdown,
  type SpecialPricingBreakdown,
} from "../../services/pricingService";
import {
  createBooking,
  fetchAvailableTimeSlots,
  fetchBookablePackageDetail,
  fetchPackageAvailabilitySchedules,
  fetchPackageList,
  isDateBookable,
  recordBookingPayment,
  type AvailableSlot,
  type BookablePackage,
  type BookingStatus,
  type PackageAvailabilitySchedule,
  type PackageListItem,
} from "../../services/bookingsService";

const PRIMARY = "#0644C7";
type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_OPTIONS: { label: string; value: BookingStatus }[] = [
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

/** Every 30 minutes across the day, "HH:MM" (24h). Used by Flexible mode's time
 *  picker so a valid time is always produced without a (crash-prone) keyboard. */
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const pad2 = (n: number) => String(n).padStart(2, "0");
const money = (n: number) => `$${n.toFixed(2)}`;
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Local calendar date as YYYY-MM-DD (lexically comparable). */
function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

/** Mirrors the web derivePaymentStatus — paid / partial / pending from the money. */
function derivePaymentStatus(
  amountPaid: number,
  total: number,
): "paid" | "partial" | "pending" {
  if (total > 0 && amountPaid >= total) return "paid";
  if (amountPaid > 0) return "partial";
  return "pending";
}

const durationLabel = (pkg: BookablePackage): string => {
  const u =
    pkg.durationUnit === "minutes"
      ? "min"
      : pkg.durationUnit === "hours and minutes"
        ? "hr"
        : pkg.duration === 1
          ? "hour"
          : "hours";
  return `${pkg.duration} ${u}`;
};

type PaymentMethod = "in-store" | "paylater";
type BookingMode = "standard" | "flexible";

const Section = ({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-4">
      <View className="flex-1 mr-2">
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
        {!!subtitle && (
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
    {children}
  </View>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
    {children}
  </Text>
);

const inputClass =
  "border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-neutral-900";

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

const ManualBookingScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  const [bookingMode, setBookingMode] = useState<BookingMode>("standard");

  // Location filter (company admin). Managers are auth-scoped server-side.
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Package catalog (lightweight list) + the hydrated selection.
  const [packageItems, setPackageItems] = useState<PackageListItem[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [packageSearch, setPackageSearch] = useState("");
  const [pkg, setPkg] = useState<BookablePackage | null>(null);
  const [pickingId, setPickingId] = useState<number | null>(null);

  // Availability (standard mode).
  const [schedules, setSchedules] = useState<PackageAvailabilitySchedule[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Customer + schedule form.
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState(""); // HH:MM (24h)
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [participants, setParticipants] = useState(1);
  const [status, setStatus] = useState<BookingStatus>("confirmed");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  // Extras.
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [attractionQty, setAttractionQty] = useState<Record<number, number>>({});
  const [gohName, setGohName] = useState("");
  const [gohAge, setGohAge] = useState("");
  const [gohGender, setGohGender] = useState<"male" | "female" | "other" | "">("");

  // Payment.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in-store");
  const [totalAmountOverride, setTotalAmountOverride] = useState("");
  const [amountPaidOverride, setAmountPaidOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendEmailToStaff, setSendEmailToStaff] = useState(true);

  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [special, setSpecial] = useState<SpecialPricingBreakdown | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  // ---- Package list -------------------------------------------------------
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoadingPackages(true);
    const delay = packageSearch.trim() ? 350 : 0;
    const timer = setTimeout(() => {
      fetchPackageList(token, {
        locationId: selectedLocationId ?? undefined,
        userId: user?.id,
        search: packageSearch,
      })
        .then((res) => active && setPackageItems(res.items))
        .catch(() => active && setPackageItems([]))
        .finally(() => active && setLoadingPackages(false));
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedLocationId, packageSearch, user?.id]);

  const resetSchedule = () => {
    setScheduledDate("");
    setScheduledTime("");
    setSelectedRoomId(null);
    setSlots([]);
  };

  const pickPackage = async (item: PackageListItem) => {
    const token = getToken();
    if (!token) return;
    setPickingId(item.id);
    try {
      const full = await fetchBookablePackageDetail(token, item.id);
      setPkg(full);
      setParticipants(full.minParticipants || 1);
      setAddonQty({});
      setAttractionQty({});
      setGohName("");
      setGohAge("");
      setGohGender("");
      resetSchedule();
      setAnchor(new Date());
    } catch {
      Alert.alert("Couldn't load package", "Please try selecting it again.");
    } finally {
      setPickingId(null);
    }
  };

  const changePackage = () => {
    setPkg(null);
    setAddonQty({});
    setAttractionQty({});
    resetSchedule();
  };

  // Availability schedules for the calendar (standard mode).
  useEffect(() => {
    if (!pkg || bookingMode !== "standard") {
      setSchedules([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let alive = true;
    fetchPackageAvailabilitySchedules(token, pkg.id)
      .then((s) => alive && setSchedules(s))
      .catch(() => alive && setSchedules([]));
    return () => {
      alive = false;
    };
  }, [pkg, bookingMode]);

  // Real open slots for the chosen date (standard mode).
  useEffect(() => {
    if (bookingMode !== "standard" || !pkg || !scheduledDate) {
      setSlots([]);
      return;
    }
    let alive = true;
    setLoadingSlots(true);
    setScheduledTime("");
    setSelectedRoomId(null);
    fetchAvailableTimeSlots(getToken() ?? undefined, pkg.id, scheduledDate)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoadingSlots(false));
    return () => {
      alive = false;
    };
  }, [pkg, scheduledDate, bookingMode]);

  // ---- Pricing math (mirrors the web / mobile create-booking) -------------
  const subtotal = useMemo(() => {
    if (!pkg) return 0;
    const min = pkg.minParticipants || 1;
    let total =
      participants <= min
        ? pkg.price
        : pkg.price + (participants - min) * pkg.pricePerAdditional;
    for (const a of pkg.attractions) {
      const qty = attractionQty[a.id] ?? 0;
      if (qty > 0)
        total +=
          a.pricingType === "per_person"
            ? a.price * qty * participants
            : a.price * qty;
    }
    for (const a of pkg.addOns) {
      const qty = addonQty[a.id] ?? 0;
      if (qty > 0) total += a.price * qty;
    }
    return Math.max(0, total);
  }, [pkg, participants, attractionQty, addonQty]);

  const effectiveLocationId =
    pkg?.locationId ?? selectedLocationId ?? user?.location_id ?? null;

  // Fees (debounced).
  useEffect(() => {
    if (!pkg || subtotal <= 0) {
      setFeeBreakdown(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setFeeBreakdown(
          await fetchFeeBreakdown({
            token,
            entityType: "package",
            entityId: pkg.id,
            basePrice: subtotal,
            locationId: effectiveLocationId ?? undefined,
            signal: controller.signal,
          }),
        );
      } catch {
        setFeeBreakdown(null);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, subtotal, effectiveLocationId]);

  // Special pricing / discounts (debounced; needs the date).
  useEffect(() => {
    if (!pkg || !scheduledDate) {
      setSpecial(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSpecial(
          await fetchSpecialPricing({
            token,
            entityType: "package",
            entityId: pkg.id,
            basePrice: subtotal,
            date: scheduledDate,
            time: scheduledTime || undefined,
            locationId: effectiveLocationId ?? undefined,
            signal: controller.signal,
          }),
        );
      } catch {
        setSpecial(null);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, scheduledDate, scheduledTime, subtotal, effectiveLocationId]);

  // total_amount is base+fees (discount is sent separately, like the web).
  const feeTotal = feeBreakdown ? feeBreakdown.total : subtotal;
  const discount = special?.has_special_pricing ? special.total_discount : 0;
  const displayTotal = Math.max(0, feeTotal - discount);

  const finalTotal = totalAmountOverride
    ? Math.max(0, Number(totalAmountOverride) || 0)
    : feeTotal;
  const finalAmountPaid =
    paymentMethod === "paylater"
      ? 0
      : amountPaidOverride
        ? Math.max(0, Number(amountPaidOverride) || 0)
        : finalTotal;
  const balance = Math.max(0, finalTotal - finalAmountPaid);
  const paymentStatus = derivePaymentStatus(finalAmountPaid, finalTotal);

  // ---- Calendar cells -----------------------------------------------------
  const today = todayKey();
  const cells = useMemo(() => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: { key: string | null; day: number; bookable: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++)
      out.push({ key: null, day: 0, bookable: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      // Flexible: every date is selectable (past dates allowed). Standard:
      // must satisfy the package's availability rules and not be in the past.
      const bookable =
        bookingMode === "flexible"
          ? true
          : isDateBookable(schedules, new Date(y, m, d)) && key >= today;
      out.push({ key, day: d, bookable });
    }
    while (out.length % 7 !== 0)
      out.push({ key: null, day: 0, bookable: false });
    return out;
  }, [anchor, schedules, bookingMode, today]);

  const stepMonth = (dir: number) => {
    const next = new Date(anchor);
    next.setMonth(anchor.getMonth() + dir);
    setAnchor(next);
  };

  const genderOptions: { label: string; value: "male" | "female" | "other" }[] = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Other", value: "other" },
  ];

  const hasExtras =
    !!pkg && (pkg.addOns.length > 0 || pkg.attractions.length > 0);

  // Time is set differently per mode: standard picks a slot (auto-assigns a
  // room), flexible accepts a free HH:MM entry.
  const canSubmit =
    !!pkg &&
    customerName.trim().length > 0 &&
    email.trim().length > 0 &&
    !!scheduledDate &&
    /^\d{2}:\d{2}$/.test(scheduledTime) &&
    participants >= 1;

  const handleSubmit = async () => {
    if (submitLockRef.current || !pkg) return;
    if (!canSubmit) {
      Alert.alert(
        "Incomplete booking",
        "Enter the customer name, email, and a valid date and time.",
      );
      return;
    }
    if (effectiveLocationId == null) {
      Alert.alert("Missing location", "Could not determine the booking location.");
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const additionalAddons = pkg.addOns
        .filter((a) => (addonQty[a.id] ?? 0) > 0)
        .map((a) => ({
          addon_id: a.id,
          quantity: addonQty[a.id],
          price_at_booking: a.price,
        }));
      const additionalAttractions = pkg.attractions
        .filter((a) => (attractionQty[a.id] ?? 0) > 0)
        .map((a) => ({
          attraction_id: a.id,
          quantity: attractionQty[a.id],
          price_at_booking: a.price,
        }));

      const { id, referenceNumber, customerId } = await createBooking(token, {
        guest_name: customerName.trim(),
        guest_email: email.trim() || undefined,
        guest_phone: phone.trim() || undefined,
        guest_address: address.trim() || undefined,
        guest_city: city.trim() || undefined,
        guest_state: stateField.trim() || undefined,
        guest_zip: zip.trim() || undefined,
        guest_country: country.trim() || undefined,
        location_id: effectiveLocationId,
        package_id: pkg.id,
        room_id: selectedRoomId ?? undefined,
        type: "package",
        booking_date: scheduledDate,
        booking_time: scheduledTime,
        participants,
        duration: pkg.duration,
        duration_unit: pkg.durationUnit,
        total_amount: finalTotal,
        amount_paid: finalAmountPaid,
        payment_method: paymentMethod,
        status,
        payment_status: paymentMethod === "paylater" ? "pending" : paymentStatus,
        is_manual_entry: true,
        skip_date_validation: bookingMode === "flexible",
        notes: notes.trim() || undefined,
        additional_addons: additionalAddons.length ? additionalAddons : undefined,
        additional_attractions: additionalAttractions.length
          ? additionalAttractions
          : undefined,
        created_by: user?.id,
        guest_of_honor_name:
          pkg.hasGuestOfHonor && gohName.trim() ? gohName.trim() : undefined,
        guest_of_honor_age:
          pkg.hasGuestOfHonor && gohAge.trim() ? Number(gohAge) : undefined,
        guest_of_honor_gender:
          pkg.hasGuestOfHonor && gohGender ? gohGender : undefined,
        sent_email_to_staff: sendEmailToStaff,
        applied_fees: buildAppliedFees(feeBreakdown).length
          ? buildAppliedFees(feeBreakdown)
          : null,
        discount_amount: discount > 0 ? discount : undefined,
        applied_discounts: buildAppliedDiscounts(special).length
          ? buildAppliedDiscounts(special)
          : null,
        send_email: sendEmail,
      });

      // Record the collected amount as an in-store payment (matches the web).
      if (finalAmountPaid > 0 && paymentMethod === "in-store") {
        try {
          await recordBookingPayment(token, {
            bookingId: id,
            amount: finalAmountPaid,
            locationId: effectiveLocationId,
            customerId: customerId ?? null,
          });
        } catch {
          // Booking is already created; a failed ledger write shouldn't block it.
        }
      }

      markBookingsStale();
      Alert.alert(
        bookingMode === "standard" ? "Booking created" : "Booking recorded",
        `Reference: ${referenceNumber ?? id}`,
        [{ text: "Done", onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(
        "Failed to create booking",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    pending: "bg-red-100 text-red-700",
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View
        className="w-full border-b border-gray-100 bg-white px-5 pb-4 dark:border-neutral-800 dark:bg-neutral-900"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Manual Booking
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {bookingMode === "standard"
                ? "With availability validation"
                : "Flexible mode (past dates allowed)"}
            </Text>
          </View>
        </View>

        {/* Standard / Flexible mode toggle */}
        <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-0.5 mt-3">
          {(
            [
              { v: "standard", label: "Standard", icon: "calendar" as IconName },
              { v: "flexible", label: "Flexible", icon: "clock" as IconName },
            ] as const
          ).map((m) => {
            const active = bookingMode === m.v;
            return (
              <Pressable
                key={m.v}
                onPress={() => {
                  setBookingMode(m.v);
                  resetSchedule();
                }}
                className={`flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg ${
                  active ? "bg-white dark:bg-neutral-900 shadow-sm" : ""
                }`}
              >
                <Feather
                  name={m.icon}
                  size={14}
                  color={active ? PRIMARY : "#6B7280"}
                />
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-[#0644C7]" : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 24,
          }}
        >
          {/* Location filter (company admin) */}
          {isCompanyAdmin && locationOptions.length > 0 && !pkg && (
            <Section title="Location" subtitle="Narrow the packages to one location">
              <View className="flex-row flex-wrap gap-2">
                {[{ id: "all" as const, name: "All Locations" }, ...locationOptions].map(
                  (o) => {
                    const active =
                      (o.id === "all" && selectedLocationId == null) ||
                      o.id === selectedLocationId;
                    return (
                      <Pressable
                        key={String(o.id)}
                        onPress={() =>
                          setSelectedLocationId(o.id === "all" ? null : o.id)
                        }
                        className={`px-3 py-2 rounded-full border ${
                          active
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            active ? "text-white" : "text-gray-700 dark:text-gray-200"
                          }`}
                          numberOfLines={1}
                        >
                          {o.name}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </Section>
          )}

          {/* ============================ SELECT PACKAGE ==================== */}
          <Section
            title={pkg ? "Selected Package" : "Select Package"}
            subtitle={
              pkg ? "Your chosen package" : "Choose a package for this booking"
            }
            right={
              pkg ? (
                <Pressable
                  onPress={changePackage}
                  className="flex-row items-center gap-1 active:opacity-70"
                >
                  <Feather name="arrow-left" size={13} color="#6B7280" />
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Change
                  </Text>
                </Pressable>
              ) : undefined
            }
          >
            {pkg ? (
              <View className="rounded-xl border border-[#0644C7] bg-[#0644C7]/5 p-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                      {pkg.name}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                      {!!pkg.category && (
                        <View className="px-1.5 py-0.5 rounded bg-[#0644C7]/10">
                          <Text className="text-[10px] font-medium text-[#0644C7]">
                            {pkg.category}
                          </Text>
                        </View>
                      )}
                      <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
                        <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                          {durationLabel(pkg)}
                        </Text>
                      </View>
                      {pkg.maxParticipants > 0 && (
                        <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
                          <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                            Max {pkg.maxParticipants}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="items-end">
                    <Text className="text-base font-bold text-[#0644C7]">
                      {money(pkg.price)}
                    </Text>
                    <Text className="text-[10px] text-gray-500">/booking</Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View className="flex-row items-center gap-2 bg-gray-50 dark:bg-neutral-800 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-700 mb-3">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={packageSearch}
                    onChangeText={setPackageSearch}
                    placeholder="Search packages..."
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 text-sm text-gray-900 dark:text-white"
                  />
                </View>

                {loadingPackages ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : packageItems.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                    {packageSearch.trim()
                      ? "No packages match your search."
                      : "No packages found."}
                  </Text>
                ) : (
                  packageItems.map((p) => {
                    const picking = pickingId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => pickPackage(p)}
                        disabled={pickingId != null}
                        className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 mb-2 active:opacity-80"
                      >
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 mr-2">
                            <Text
                              className="text-sm font-semibold text-gray-900 dark:text-white"
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                            {!!p.description && (
                              <Text
                                className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                                numberOfLines={2}
                              >
                                {p.description}
                              </Text>
                            )}
                            <View className="flex-row flex-wrap gap-1.5 mt-2">
                              {!!p.category && (
                                <View className="px-1.5 py-0.5 rounded bg-[#0644C7]/10">
                                  <Text className="text-[10px] font-medium text-[#0644C7]">
                                    {p.category}
                                  </Text>
                                </View>
                              )}
                              <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
                                <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                  {p.duration}{" "}
                                  {p.durationUnit === "minutes" ? "min" : "hr"}
                                </Text>
                              </View>
                              {p.maxParticipants > 0 && (
                                <View className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800">
                                  <Text className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                    Max {p.maxParticipants}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View className="items-end">
                            {picking ? (
                              <ActivityIndicator size="small" color={PRIMARY} />
                            ) : (
                              <>
                                <Text className="text-base font-bold text-[#0644C7]">
                                  {money(p.price)}
                                </Text>
                                <Text className="text-[10px] text-gray-500">
                                  /booking
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </>
            )}
          </Section>

          {pkg && (
            <>
              {/* ==================== CUSTOMER & BOOKING DETAILS =========== */}
              <Section
                title="Customer & Booking Details"
                subtitle="Enter customer information and schedule"
              >
                <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Customer Information
                </Text>
                <FieldLabel>Full Name *</FieldLabel>
                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="John Doe"
                  placeholderTextColor="#9CA3AF"
                  className={inputClass}
                />
                <View className="flex-row gap-3 mt-3">
                  <View className="flex-1">
                    <FieldLabel>Email *</FieldLabel>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="john@example.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className={inputClass}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Phone</FieldLabel>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 (555) 123-4567"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                      className={inputClass}
                    />
                  </View>
                </View>
                <View className="mt-3">
                  <FieldLabel>Address (Optional)</FieldLabel>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="123 Main St"
                    placeholderTextColor="#9CA3AF"
                    className={inputClass}
                  />
                </View>
                <View className="flex-row gap-3 mt-3">
                  <View className="flex-1">
                    <FieldLabel>City</FieldLabel>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder="New York"
                      placeholderTextColor="#9CA3AF"
                      className={inputClass}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>State</FieldLabel>
                    <TextInput
                      value={stateField}
                      onChangeText={setStateField}
                      placeholder="NY"
                      placeholderTextColor="#9CA3AF"
                      className={inputClass}
                    />
                  </View>
                </View>
                <View className="flex-row gap-3 mt-3">
                  <View className="flex-1">
                    <FieldLabel>ZIP Code</FieldLabel>
                    <TextInput
                      value={zip}
                      onChangeText={setZip}
                      placeholder="10001"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      className={inputClass}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Country</FieldLabel>
                    <TextInput
                      value={country}
                      onChangeText={setCountry}
                      placeholder="United States"
                      placeholderTextColor="#9CA3AF"
                      className={inputClass}
                    />
                  </View>
                </View>

                <View className="h-px bg-gray-100 dark:bg-neutral-800 my-4" />

                <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Select Date & Time
                </Text>

                {/* Calendar */}
                <FieldLabel>Date *</FieldLabel>
                <View className="rounded-2xl border border-gray-100 dark:border-neutral-800 p-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <Pressable
                      onPress={() => stepMonth(-1)}
                      className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                    >
                      <Feather name="chevron-left" size={18} color="#6b7280" />
                    </Pressable>
                    <Text className="text-sm font-bold text-gray-900 dark:text-white">
                      {MONTH_NAMES[anchor.getMonth()]} {anchor.getFullYear()}
                    </Text>
                    <Pressable
                      onPress={() => stepMonth(1)}
                      className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                    >
                      <Feather name="chevron-right" size={18} color="#6b7280" />
                    </Pressable>
                  </View>
                  <View className="flex-row">
                    {WEEKDAYS.map((d) => (
                      <View key={d} className="flex-1 items-center py-1">
                        <Text className="text-[10px] font-semibold text-gray-400 uppercase">
                          {d}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {Array.from({ length: cells.length / 7 }).map((_, row) => (
                    <View key={row} className="flex-row">
                      {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                        const selected = cell.key && cell.key === scheduledDate;
                        const disabled = cell.key === null || !cell.bookable;
                        return (
                          <Pressable
                            key={cell.key ?? `pad-${row}-${col}`}
                            disabled={disabled}
                            onPress={() => cell.key && setScheduledDate(cell.key)}
                            className="flex-1 items-center py-1.5"
                          >
                            <View
                              className={`w-9 h-9 rounded-xl items-center justify-center ${
                                selected ? "bg-[#0644C7]" : ""
                              }`}
                            >
                              {cell.key !== null && (
                                <Text
                                  className={`text-sm ${
                                    selected
                                      ? "text-white font-bold"
                                      : cell.bookable
                                        ? "text-gray-700 dark:text-gray-200"
                                        : "text-gray-300 dark:text-neutral-700"
                                  }`}
                                >
                                  {cell.day}
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {bookingMode === "flexible" && (
                    <Text className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-center">
                      Past dates allowed
                    </Text>
                  )}
                </View>

                {/* Time — standard: slot grid; flexible: tap-to-pick time.
                    The `key` remounts this subtree when the mode changes so
                    react-native-css-interop never has to upgrade a View to a
                    Pressable in place (that post-mount upgrade throws while it
                    serializes props for a dev warning). */}
                <View className="mt-4" key={`time-content-${bookingMode}`}>
                  <FieldLabel>Time *</FieldLabel>
                  {bookingMode === "standard" ? (
                    !scheduledDate ? (
                    <Text className="text-sm text-gray-400 py-2">
                      Pick a date to see available times.
                    </Text>
                  ) : loadingSlots ? (
                    <View className="flex-row items-center gap-2 py-3">
                      <ActivityIndicator size="small" color={PRIMARY} />
                      <Text className="text-sm text-gray-500 dark:text-gray-400">
                        Loading available times…
                      </Text>
                    </View>
                  ) : slots.length > 0 ? (
                    <>
                      <View className="flex-row flex-wrap -mx-1">
                        {slots.map((slot) => {
                          const active =
                            slot.startTime === scheduledTime &&
                            (slot.roomId ?? null) === selectedRoomId;
                          return (
                            <View
                              key={`${slot.startTime}-${slot.roomId ?? ""}`}
                              className="w-1/3 px-1 mb-2"
                            >
                              <Pressable
                                onPress={() => {
                                  setScheduledTime(slot.startTime);
                                  setSelectedRoomId(slot.roomId ?? null);
                                }}
                                className={`rounded-xl border px-2 py-2 ${
                                  active
                                    ? "border-[#0644C7] bg-[#0644C7]/10"
                                    : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                                }`}
                              >
                                <Text
                                  className={`text-xs font-semibold ${
                                    active
                                      ? "text-[#0644C7]"
                                      : "text-gray-800 dark:text-gray-200"
                                  }`}
                                >
                                  {to12h(slot.startTime)}
                                </Text>
                                {!!slot.roomName && (
                                  <Text className="text-[10px] text-gray-400" numberOfLines={1}>
                                    {slot.roomName}
                                  </Text>
                                )}
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                      {!!scheduledTime && selectedRoomId != null && (
                        <Text className="text-xs text-[#0644C7] mt-1">
                          ✓ Room auto-assigned
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text className="text-sm text-amber-600 py-2">
                      No available time slots for this date. Try another date.
                    </Text>
                  )
                ) : (
                  <Pressable
                    onPress={() => setTimePickerOpen(true)}
                    className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-3 active:opacity-80"
                  >
                    <View className="flex-row items-center gap-2">
                      <Feather name="clock" size={16} color="#9CA3AF" />
                      <Text
                        className={`text-sm ${
                          scheduledTime
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-400"
                        }`}
                      >
                        {scheduledTime ? to12h(scheduledTime) : "Select a time"}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={16} color="#9ca3af" />
                  </Pressable>
                  )}
                </View>

                {/* Participants + Status */}
                <View className="flex-row gap-3 mt-4 items-end">
                  <View className="flex-1">
                    <FieldLabel>Participants *</FieldLabel>
                    <View className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-1.5">
                      <Stepper
                        value={participants}
                        onChange={setParticipants}
                        min={1}
                        max={pkg.maxParticipants > 0 ? pkg.maxParticipants : 99}
                      />
                    </View>
                    <Text className="text-[10px] text-gray-500 mt-1">
                      Min: {pkg.minParticipants || 1}
                      {pkg.maxParticipants > 0 ? ` · Max: ${pkg.maxParticipants}` : ""}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Status *</FieldLabel>
                    <Pressable
                      onPress={() => setStatusPickerOpen(true)}
                      className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 active:opacity-80"
                    >
                      <Text className="text-sm text-gray-900 dark:text-white">
                        {STATUS_OPTIONS.find((o) => o.value === status)?.label}
                      </Text>
                      <Feather name="chevron-down" size={16} color="#9ca3af" />
                    </Pressable>
                  </View>
                </View>
              </Section>

              {/* ==================== ADD-ONS & ATTRACTIONS =============== */}
              {hasExtras && (
                <Section title="Add-ons & Attractions" subtitle="Optional extras">
                  {pkg.addOns.map((a) => (
                    <View
                      key={`addon-${a.id}`}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-1 mr-3">
                        <Text
                          className="text-sm font-medium text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {money(a.price)} /unit
                        </Text>
                      </View>
                      <Stepper
                        value={addonQty[a.id] ?? 0}
                        onChange={(n) => setAddonQty((p) => ({ ...p, [a.id]: n }))}
                      />
                    </View>
                  ))}
                  {pkg.attractions.map((a) => (
                    <View
                      key={`attraction-${a.id}`}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-1 mr-3">
                        <Text
                          className="text-sm font-medium text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {money(a.price)}
                          {a.pricingType === "per_person" ? " /person" : " /unit"}
                        </Text>
                      </View>
                      <Stepper
                        value={attractionQty[a.id] ?? 0}
                        onChange={(n) =>
                          setAttractionQty((p) => ({ ...p, [a.id]: n }))
                        }
                      />
                    </View>
                  ))}
                </Section>
              )}

              {/* ==================== PAYMENT DETAILS ===================== */}
              <Section title="Payment Details">
                {/* Price breakdown */}
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-gray-600 dark:text-gray-300">
                      Package (base price, up to {pkg.minParticipants || 1})
                    </Text>
                    <Text className="text-xs font-medium text-gray-900 dark:text-white">
                      {money(pkg.price)}
                    </Text>
                  </View>
                  {participants > (pkg.minParticipants || 1) &&
                    pkg.pricePerAdditional > 0 && (
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs text-amber-700">
                          Additional ({participants - (pkg.minParticipants || 1)} ×{" "}
                          {money(pkg.pricePerAdditional)})
                        </Text>
                        <Text className="text-xs font-medium text-amber-700">
                          {money(
                            (participants - (pkg.minParticipants || 1)) *
                              pkg.pricePerAdditional,
                          )}
                        </Text>
                      </View>
                    )}
                  {pkg.attractions.map((a) => {
                    const qty = attractionQty[a.id] ?? 0;
                    if (qty <= 0) return null;
                    const price =
                      a.pricingType === "per_person"
                        ? a.price * qty * participants
                        : a.price * qty;
                    return (
                      <View
                        key={`sum-attr-${a.id}`}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-xs text-gray-600 dark:text-gray-300" numberOfLines={1}>
                          {a.name} ({qty})
                        </Text>
                        <Text className="text-xs font-medium text-gray-900 dark:text-white">
                          {money(price)}
                        </Text>
                      </View>
                    );
                  })}
                  {pkg.addOns.map((a) => {
                    const qty = addonQty[a.id] ?? 0;
                    if (qty <= 0) return null;
                    return (
                      <View
                        key={`sum-addon-${a.id}`}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-xs text-gray-600 dark:text-gray-300" numberOfLines={1}>
                          {a.name} ({qty})
                        </Text>
                        <Text className="text-xs font-medium text-gray-900 dark:text-white">
                          {money(a.price * qty)}
                        </Text>
                      </View>
                    );
                  })}
                  {!!feeBreakdown?.fees.length &&
                    feeBreakdown.fees.map((f) => (
                      <View
                        key={f.fee_support_id}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {f.fee_label} ({f.fee_application_type})
                        </Text>
                        <Text className="text-xs text-gray-700 dark:text-gray-300">
                          {money(f.fee_amount)}
                        </Text>
                      </View>
                    ))}
                  {discount > 0 && (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-green-600">Discount</Text>
                      <Text className="text-xs text-green-600">
                        −{money(discount)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Total */}
                <View className="flex-row items-center justify-between bg-[#0644C7]/5 border border-[#0644C7]/20 rounded-xl px-3 py-3 mt-3">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Total
                  </Text>
                  <Text className="text-xl font-bold text-[#0644C7]">
                    {money(displayTotal)}
                  </Text>
                </View>

                {/* Method + Status */}
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <FieldLabel>Payment Method</FieldLabel>
                    <View className="flex-row gap-2">
                      {(
                        [
                          { v: "in-store", label: "In-Store" },
                          { v: "paylater", label: "Pay Later" },
                        ] as const
                      ).map((m) => {
                        const active = paymentMethod === m.v;
                        return (
                          <Pressable
                            key={m.v}
                            onPress={() => setPaymentMethod(m.v)}
                            className={`flex-1 items-center py-2.5 rounded-xl border ${
                              active
                                ? "bg-[#0644C7] border-[#0644C7]"
                                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                active ? "text-white" : "text-gray-700 dark:text-gray-200"
                              }`}
                            >
                              {m.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
                <Text className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                  Card payments are handled on the web admin.
                </Text>

                {/* Amounts */}
                <View className="flex-row gap-3 mt-3">
                  <View className="flex-1">
                    <FieldLabel>Total Amount</FieldLabel>
                    <TextInput
                      value={totalAmountOverride}
                      onChangeText={setTotalAmountOverride}
                      placeholder={displayTotal.toFixed(2)}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      className={inputClass}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Amount Paid</FieldLabel>
                    <TextInput
                      value={amountPaidOverride}
                      onChangeText={setAmountPaidOverride}
                      placeholder={paymentMethod === "paylater" ? "0.00" : "Auto"}
                      placeholderTextColor="#9CA3AF"
                      editable={paymentMethod !== "paylater"}
                      keyboardType="decimal-pad"
                      className={`${inputClass} ${
                        paymentMethod === "paylater" ? "opacity-50" : ""
                      }`}
                    />
                  </View>
                </View>

                {/* Payment status */}
                <View className="mt-3">
                  <FieldLabel>Payment Status</FieldLabel>
                  <View
                    className={`items-center py-2 rounded-xl ${
                      statusColor[paymentStatus].split(" ")[0]
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        statusColor[paymentStatus].split(" ")[1]
                      }`}
                    >
                      {capitalize(paymentStatus)}
                    </Text>
                  </View>
                  {balance > 0 && (
                    <Text className="text-xs text-amber-600 mt-1">
                      Balance due: {money(balance)}
                    </Text>
                  )}
                </View>

                {/* Notes */}
                <View className="mt-3">
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional notes..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    className={`${inputClass} min-h-[64px]`}
                  />
                </View>

                {/* Guest of honor */}
                {pkg.hasGuestOfHonor && (
                  <View className="mt-4 pt-4 border-t border-gray-100 dark:border-neutral-800">
                    <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                      Guest of Honor
                    </Text>
                    <FieldLabel>Name</FieldLabel>
                    <TextInput
                      value={gohName}
                      onChangeText={setGohName}
                      placeholder="Name"
                      placeholderTextColor="#9CA3AF"
                      className={inputClass}
                    />
                    <View className="flex-row gap-3 mt-3">
                      <View className="flex-1">
                        <FieldLabel>Age</FieldLabel>
                        <TextInput
                          value={gohAge}
                          onChangeText={setGohAge}
                          placeholder="Age"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="number-pad"
                          className={inputClass}
                        />
                      </View>
                      <View className="flex-1">
                        <FieldLabel>Gender</FieldLabel>
                        <View className="flex-row gap-1.5">
                          {genderOptions.map((g) => {
                            const active = gohGender === g.value;
                            return (
                              <Pressable
                                key={g.value}
                                onPress={() =>
                                  setGohGender(active ? "" : g.value)
                                }
                                className={`flex-1 items-center py-2.5 rounded-xl border ${
                                  active
                                    ? "bg-[#0644C7] border-[#0644C7]"
                                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                                }`}
                              >
                                <Text
                                  className={`text-[11px] font-medium ${
                                    active
                                      ? "text-white"
                                      : "text-gray-700 dark:text-gray-200"
                                  }`}
                                >
                                  {g.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </Section>

              {/* ==================== NOTIFICATIONS ======================= */}
              <Section title="Notifications">
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
                    Send confirmation email to customer
                  </Text>
                  <Switch
                    value={sendEmail}
                    onValueChange={setSendEmail}
                    trackColor={{ true: PRIMARY }}
                  />
                </View>
                <View className="flex-row items-center justify-between py-1 mt-1">
                  <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-3">
                    Send notification to staff
                  </Text>
                  <Switch
                    value={sendEmailToStaff}
                    onValueChange={setSendEmailToStaff}
                    trackColor={{ true: PRIMARY }}
                  />
                </View>
              </Section>
            </>
          )}
        </ScrollView>

        {/* Sticky footer */}
        {pkg && (
          <View
            className="flex-row gap-3 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className="flex-1 py-3.5 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !canSubmit}
              className={`flex-[1.4] py-3.5 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-90 ${
                submitting || !canSubmit ? "opacity-50" : ""
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="save" size={16} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    {bookingMode === "standard"
                      ? "Create Booking"
                      : "Record Booking"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Status picker overlay */}
      {statusPickerOpen && (
        <View style={StyleSheet.absoluteFill} className="justify-end">
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(20,20,20,0.5)" }]}
            onPress={() => setStatusPickerOpen(false)}
          />
          <View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl"
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3 mb-1" />
            <Text className="text-base font-bold text-gray-900 dark:text-white px-5 pt-3 pb-2">
              Status
            </Text>
            {STATUS_OPTIONS.map((o) => {
              const active = o.value === status;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    setStatus(o.value);
                    setStatusPickerOpen(false);
                  }}
                  className="px-5 py-3.5 flex-row items-center justify-between active:bg-gray-50 dark:active:bg-neutral-800"
                >
                  <Text
                    className={`text-sm ${
                      active
                        ? "text-[#0644C7] font-semibold"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {o.label}
                  </Text>
                  {active && <Feather name="check" size={18} color={PRIMARY} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Time picker overlay (Flexible mode) */}
      {timePickerOpen && (
        <View style={StyleSheet.absoluteFill} className="justify-end">
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(20,20,20,0.5)" }]}
            onPress={() => setTimePickerOpen(false)}
          />
          <View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[70%]"
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3 mb-1" />
            <Text className="text-base font-bold text-gray-900 dark:text-white px-5 pt-3 pb-2">
              Select Time
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {TIME_OPTIONS.map((t) => {
                const active = t === scheduledTime;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setScheduledTime(t);
                      setTimePickerOpen(false);
                    }}
                    className="px-5 py-3.5 flex-row items-center justify-between active:bg-gray-50 dark:active:bg-neutral-800"
                  >
                    <Text
                      className={`text-sm ${
                        active
                          ? "text-[#0644C7] font-semibold"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {to12h(t)}
                    </Text>
                    {active && <Feather name="check" size={18} color={PRIMARY} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

export default ManualBookingScreen;
