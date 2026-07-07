import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useCallback,
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { markBookingsStale } from "../../lib/hooks/useBookings";
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
  fetchBookablePackages,
  recordBookingPayment,
  type AvailableSlot,
  type BookablePackage,
} from "../../services/bookingsService";
import { searchCustomers, type CustomerHit } from "../../services/customersService";

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

const money = (n: number) => `$${n.toFixed(2)}`;

function formatTime(value: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

type PaymentMethod = "in-store" | "paylater";
type PaymentType = "full" | "partial" | "custom";

const Section = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm" style={CARD_SHADOW}>
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
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">{children}</Text>
);

const SelectRow = ({
  icon,
  value,
  placeholder,
  onPress,
  error,
  disabled,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    className={`h-14 flex-row items-center gap-3 rounded-full border bg-white dark:bg-neutral-900 px-5 ${
      error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
    } ${disabled ? "opacity-50" : ""}`}
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
        value <= min ? "border-gray-200 dark:border-neutral-800" : "border-gray-300 dark:border-neutral-600"
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
        value >= max ? "border-gray-200 dark:border-neutral-800" : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      <Feather name="plus" size={16} color={value >= max ? "#D1D5DB" : "#374151"} />
    </Pressable>
  </View>
);

const CreateBookingScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  // Location (company admins). Non-admins are scoped to their own location.
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    isCompanyAdmin ? null : (user?.location_id ?? null),
  );
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Package catalog (location-scoped). Loaded LAZILY when the picker opens, not
  // on mount: the /packages index eager-loads 7 relations per package, so
  // fetching it during mount built a large synchronous payload that could
  // OOM-crash the screen on entry. Deferring it keeps mount cheap (matches the
  // web's incremental loading), and the fetch is guarded so it runs once per
  // location.
  const [packages, setPackages] = useState<BookablePackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  const [pkg, setPkg] = useState<BookablePackage | null>(null);
  const packagesKeyRef = useRef<string | null>(null);

  const loadPackages = useCallback(() => {
    const token = getToken();
    if (!token) return;
    const key = String(selectedLocationId ?? "all");
    if (packagesKeyRef.current === key) return; // already loaded for this scope
    packagesKeyRef.current = key;
    setLoadingPackages(true);
    fetchBookablePackages(token, selectedLocationId ?? undefined, user?.id)
      .then(setPackages)
      .catch(() => {
        packagesKeyRef.current = null; // allow a retry on next open
      })
      .finally(() => setLoadingPackages(false));
  }, [selectedLocationId, user?.id]);

  const openPackageSheet = () => {
    loadPackages();
    setSheet("package");
  };

  // Booking details.
  const [participants, setParticipants] = useState(1);
  const [scheduledDate, setScheduledDate] = useState("");
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [attractionQty, setAttractionQty] = useState<Record<number, number>>({});
  const [gohName, setGohName] = useState("");
  const [gohAge, setGohAge] = useState("");
  const [gohGender, setGohGender] = useState<"male" | "female" | "other" | "">("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // Payment.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in-store");
  const [paymentType, setPaymentType] = useState<PaymentType>("full");
  const [customAmount, setCustomAmount] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  // Customer (email search-as-you-type).
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [foundCustomers, setFoundCustomers] = useState<CustomerHit[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<null | "location" | "package" | "date" | "time">(null);
  const submitLockRef = useRef(false);

  // Pricing (fees + special pricing), debounced.
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [special, setSpecial] = useState<SpecialPricingBreakdown | null>(null);

  // ---- Customer lookup -----------------------------------------------------
  useEffect(() => {
    const email = customerEmail.trim();
    if (email.length < 3) {
      setFoundCustomers([]);
      setShowCustomerList(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const hits = await searchCustomers(token, email);
        if (!active) return;
        setFoundCustomers(hits);
        setShowCustomerList(hits.length > 0);
        const exact = hits.find((c) => c.email.toLowerCase() === email.toLowerCase());
        if (exact) {
          setCustomerName(`${exact.firstName} ${exact.lastName}`.trim());
          if (exact.phone) setCustomerPhone(exact.phone);
        }
      } catch {
        if (active) setFoundCustomers([]);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerEmail]);

  const selectCustomer = (c: CustomerHit) => {
    setCustomerEmail(c.email);
    setCustomerName(`${c.firstName} ${c.lastName}`.trim());
    setCustomerPhone(c.phone ?? "");
    setShowCustomerList(false);
  };

  const pickPackage = (p: BookablePackage) => {
    setPkg(p);
    setParticipants(p.minParticipants || 1);
    setAddonQty({});
    setAttractionQty({});
    setSlot(null);
    setSlots([]);
    setScheduledDate("");
    setPackageSearch("");
    setGohName("");
    setGohAge("");
    setGohGender("");
    setSheet(null);
  };

  // ---- Availability (package + date → time slots with room) ----------------
  useEffect(() => {
    if (!pkg || !scheduledDate) {
      setSlots([]);
      setSlot(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoadingSlots(true);
    setSlot(null);
    fetchAvailableTimeSlots(token, pkg.id, scheduledDate)
      .then((s) => {
        if (active) setSlots(s);
      })
      .catch(() => {
        if (active) setSlots([]);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [pkg, scheduledDate]);

  const filteredPackages = useMemo(() => {
    const term = packageSearch.trim().toLowerCase();
    if (!term) return packages;
    return packages.filter(
      (p) => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term),
    );
  }, [packages, packageSearch]);

  // ---- Pricing math (mirrors the web calculateTotal) -----------------------
  const subtotal = useMemo(() => {
    if (!pkg) return 0;
    let total = 0;
    const min = pkg.minParticipants || 1;
    total +=
      participants <= min ? pkg.price : pkg.price + (participants - min) * pkg.pricePerAdditional;
    for (const a of pkg.attractions) {
      const qty = attractionQty[a.id] ?? 0;
      if (qty > 0) {
        total += a.pricingType === "per_person" ? a.price * qty * participants : a.price * qty;
      }
    }
    for (const a of pkg.addOns) {
      const qty = addonQty[a.id] ?? 0;
      if (qty > 0) total += a.price * qty;
    }
    return Math.max(0, total);
  }, [pkg, participants, attractionQty, addonQty]);

  const effectiveLocationId = pkg?.locationId ?? selectedLocationId ?? user?.location_id ?? null;

  // Fees on the computed subtotal (base for fees = subtotal, like the web).
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
        const fb = await fetchFeeBreakdown({
          token,
          entityType: "package",
          entityId: pkg.id,
          basePrice: subtotal,
          locationId: effectiveLocationId ?? undefined,
          signal: controller.signal,
        });
        setFeeBreakdown(fb);
      } catch {
        setFeeBreakdown(null);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, subtotal, effectiveLocationId]);

  // Special pricing keyed on the package base price + date/time (like the web).
  useEffect(() => {
    if (!pkg) {
      setSpecial(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = await fetchSpecialPricing({
          token,
          entityType: "package",
          entityId: pkg.id,
          basePrice: pkg.price,
          date: scheduledDate || undefined,
          time: slot?.startTime || undefined,
          locationId: effectiveLocationId ?? undefined,
          signal: controller.signal,
        });
        setSpecial(sp);
      } catch {
        setSpecial(null);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, scheduledDate, slot, effectiveLocationId]);

  // Submitted total = base+fees (web line 1346); discount is sent separately.
  const submitTotal = feeBreakdown ? feeBreakdown.total : subtotal;
  const discount = special?.has_special_pricing ? special.total_discount : 0;
  const displayTotal = Math.max(0, submitTotal - discount);

  const partialDeposit = useMemo(() => {
    if (!pkg) return 0;
    if (pkg.partialPaymentPercentage && pkg.partialPaymentPercentage > 0) {
      return Math.round(submitTotal * (pkg.partialPaymentPercentage / 100) * 100) / 100;
    }
    if (pkg.partialPaymentFixed && pkg.partialPaymentFixed > 0) {
      return Math.min(pkg.partialPaymentFixed, submitTotal);
    }
    return 0;
  }, [pkg, submitTotal]);

  const amountPaid = useMemo(() => {
    if (paymentMethod === "paylater") return 0;
    if (paymentType === "full") return submitTotal;
    if (paymentType === "partial") return Math.min(partialDeposit, submitTotal);
    const custom = Math.max(0, Number(customAmount) || 0);
    return Math.min(custom, submitTotal);
  }, [paymentMethod, paymentType, submitTotal, partialDeposit, customAmount]);

  const balance = Math.max(0, submitTotal - amountPaid);

  const dateOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({
        value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        label: i === 0 ? "Today" : `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
      });
    }
    return out;
  }, []);
  const dateLabel = dateOptions.find((d) => d.value === scheduledDate)?.label ?? null;

  const locationName =
    selectedLocationId == null
      ? "All Locations"
      : (locationOptions.find((l) => l.id === selectedLocationId)?.name ??
        user?.location?.name ??
        null);

  const slotLabel = slot
    ? `${formatTime(slot.startTime)}${slot.roomName ? ` · ${slot.roomName}` : ""}`
    : null;

  const durationForPayload = (): { duration: number; unit: string } => {
    if (!pkg) return { duration: 0, unit: "hours" };
    // Web converts "days" → hours; mobile packages use hours/minutes only.
    return { duration: pkg.duration, unit: pkg.durationUnit };
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    if (!pkg) {
      Alert.alert("Select a package", "Choose a package for this booking.");
      return;
    }
    if (!customerName.trim()) {
      Alert.alert("Customer required", "Enter the customer's name.");
      return;
    }
    if (!scheduledDate || !slot) {
      Alert.alert("Select date & time", "Choose a date and an available time slot.");
      return;
    }
    if (effectiveLocationId == null) {
      Alert.alert("Location unavailable", "This package has no location set.");
      return;
    }
    if (paymentMethod === "in-store" && paymentType === "custom") {
      if (!(Number(customAmount) > 0)) {
        Alert.alert("Invalid amount", "Enter a valid custom payment amount.");
        return;
      }
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
        .map((a) => ({ addon_id: a.id, quantity: addonQty[a.id], price_at_booking: a.price }));
      const additionalAttractions = pkg.attractions
        .filter((a) => (attractionQty[a.id] ?? 0) > 0)
        .map((a) => ({ attraction_id: a.id, quantity: attractionQty[a.id], price_at_booking: a.price }));

      const { duration, unit } = durationForPayload();

      const paymentStatus: "paid" | "partial" | "pending" =
        paymentMethod === "paylater"
          ? "pending"
          : amountPaid >= submitTotal
            ? "paid"
            : amountPaid > 0
              ? "partial"
              : "pending";

      const { id, referenceNumber, customerId } = await createBooking(token, {
        guest_name: customerName.trim(),
        guest_email: customerEmail.trim() || undefined,
        guest_phone: customerPhone.trim() || undefined,
        location_id: effectiveLocationId,
        package_id: pkg.id,
        room_id: slot.roomId ?? undefined,
        type: "package",
        booking_date: scheduledDate,
        booking_time: slot.startTime,
        participants,
        duration,
        duration_unit: unit,
        total_amount: submitTotal,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        ...(paymentMethod === "in-store"
          ? { status: "confirmed" as const, payment_status: paymentStatus }
          : { payment_status: "pending" as const }),
        notes: notes.trim() || undefined,
        internal_notes: internalNotes.trim() || undefined,
        additional_addons: additionalAddons.length ? additionalAddons : undefined,
        additional_attractions: additionalAttractions.length ? additionalAttractions : undefined,
        created_by: user?.id,
        guest_of_honor_name:
          pkg.hasGuestOfHonor && gohName.trim() ? gohName.trim() : undefined,
        guest_of_honor_age:
          pkg.hasGuestOfHonor && gohAge.trim() ? Number(gohAge) : undefined,
        guest_of_honor_gender:
          pkg.hasGuestOfHonor && gohGender ? gohGender : undefined,
        sent_email_to_staff: sendEmail,
        applied_fees: buildAppliedFees(feeBreakdown).length
          ? buildAppliedFees(feeBreakdown)
          : null,
        discount_amount: discount > 0 ? discount : undefined,
        applied_discounts: buildAppliedDiscounts(special).length
          ? buildAppliedDiscounts(special)
          : null,
        send_email: sendEmail,
      });

      // Mirror the web: record the collected amount as a payment (in-store).
      if (amountPaid > 0 && paymentMethod === "in-store") {
        try {
          await recordBookingPayment(token, {
            bookingId: id,
            amount: amountPaid,
            locationId: effectiveLocationId,
            customerId: customerId ?? null,
          });
        } catch {
          // Booking already created; a failed ledger write shouldn't block it.
        }
      }

      markBookingsStale();
      Alert.alert(
        "Booking created",
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

  const genderOptions: { label: string; value: "male" | "female" | "other" }[] = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Other", value: "other" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">New Booking</Text>
          <View style={{ width: 36 }} />
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
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }}
        >
          {/* Location (company admin) */}
          {isCompanyAdmin && (
            <Section icon="map-pin" title="Location">
              <SelectRow
                icon="map-pin"
                value={locationName}
                placeholder="Select a location"
                onPress={() => setSheet("location")}
              />
            </Section>
          )}

          {/* Customer */}
          <Section icon="user" title="Customer">
            <InputField
              label="Email"
              value={customerEmail}
              onChangeText={setCustomerEmail}
              placeholder="customer@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {showCustomerList && (
              <View className="mt-2 rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                {foundCustomers.slice(0, 5).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => selectCustomer(c)}
                    className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 active:bg-gray-50 dark:active:bg-neutral-800"
                  >
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      {`${c.firstName} ${c.lastName}`.trim()}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">{c.email}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View className="h-3" />
            <InputField
              label="Name *"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Full name"
            />
            <View className="h-3" />
            <InputField
              label="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
          </Section>

          {/* Package */}
          <Section icon="package" title="Package">
            <SelectRow
              icon="package"
              value={pkg ? `${pkg.name}${pkg.category ? ` · ${pkg.category}` : ""}` : null}
              placeholder={loadingPackages ? "Loading packages…" : "Select a package"}
              onPress={openPackageSheet}
            />
            {pkg && (
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Base price · {pkg.duration} {pkg.durationUnit}
                </Text>
                <Text className="text-base font-bold text-[#0644C7]">{money(pkg.price)}</Text>
              </View>
            )}
          </Section>

          {pkg && (
            <>
              {/* Date & Space */}
              <Section icon="calendar" title="Date & Time">
                <FieldLabel>Date *</FieldLabel>
                <SelectRow
                  icon="calendar"
                  value={dateLabel}
                  placeholder="Select a date"
                  onPress={() => setSheet("date")}
                />
                <View className="h-3" />
                <FieldLabel>Time & Space *</FieldLabel>
                <SelectRow
                  icon="clock"
                  value={slotLabel}
                  placeholder={
                    !scheduledDate
                      ? "Pick a date first"
                      : loadingSlots
                        ? "Loading availability…"
                        : slots.length === 0
                          ? "No availability"
                          : "Select a time slot"
                  }
                  onPress={() => setSheet("time")}
                  disabled={!scheduledDate || loadingSlots || slots.length === 0}
                />
              </Section>

              {/* Participants */}
              <Section icon="users" title="Participants">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      Guests
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {pkg.minParticipants > 0 ? `Included: ${pkg.minParticipants}` : ""}
                      {pkg.maxParticipants > 0 ? ` · Max ${pkg.maxParticipants}` : ""}
                    </Text>
                  </View>
                  <Stepper
                    value={participants}
                    onChange={setParticipants}
                    min={1}
                    max={pkg.maxParticipants > 0 ? pkg.maxParticipants : 99}
                  />
                </View>
              </Section>

              {/* Add-ons */}
              {pkg.addOns.length > 0 && (
                <Section icon="plus-circle" title="Add-ons">
                  {pkg.addOns.map((a) => (
                    <View
                      key={a.id}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800 last:border-0"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white" numberOfLines={1}>
                          {a.name}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">{money(a.price)}</Text>
                      </View>
                      <Stepper
                        value={addonQty[a.id] ?? 0}
                        onChange={(n) => setAddonQty((p) => ({ ...p, [a.id]: n }))}
                      />
                    </View>
                  ))}
                </Section>
              )}

              {/* Attractions */}
              {pkg.attractions.length > 0 && (
                <Section icon="zap" title="Additional Attractions">
                  {pkg.attractions.map((a) => (
                    <View
                      key={a.id}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800 last:border-0"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white" numberOfLines={1}>
                          {a.name}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {money(a.price)}
                          {a.pricingType === "per_person" ? " /person" : ""}
                        </Text>
                      </View>
                      <Stepper
                        value={attractionQty[a.id] ?? 0}
                        onChange={(n) => setAttractionQty((p) => ({ ...p, [a.id]: n }))}
                      />
                    </View>
                  ))}
                </Section>
              )}

              {/* Guest of Honor */}
              {pkg.hasGuestOfHonor && (
                <Section icon="star" title="Guest of Honor">
                  <InputField
                    label="Name"
                    value={gohName}
                    onChangeText={setGohName}
                    placeholder="Guest of honor"
                  />
                  <View className="h-3" />
                  <InputField
                    label="Age"
                    value={gohAge}
                    onChangeText={setGohAge}
                    placeholder="Age"
                    keyboardType="number-pad"
                  />
                  <View className="h-3" />
                  <FieldLabel>Gender</FieldLabel>
                  <View className="flex-row gap-2">
                    {genderOptions.map((g) => {
                      const active = gohGender === g.value;
                      return (
                        <Pressable
                          key={g.value}
                          onPress={() => setGohGender(active ? "" : g.value)}
                          className={`flex-1 items-center py-2.5 rounded-xl border ${
                            active
                              ? "bg-[#0644C7] border-[#0644C7]"
                              : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                          }`}
                        >
                          <Text
                            className={`text-sm font-medium ${
                              active ? "text-white" : "text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {g.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              )}

              {/* Notes */}
              <Section icon="file-text" title="Notes">
                <InputField
                  label="Customer notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional"
                  multiline
                />
                <View className="h-3" />
                <InputField
                  label="Internal notes (staff only)"
                  value={internalNotes}
                  onChangeText={setInternalNotes}
                  placeholder="Optional"
                  multiline
                />
              </Section>

              {/* Payment */}
              <Section icon="credit-card" title="Payment">
                <FieldLabel>Method</FieldLabel>
                <View className="flex-row gap-2 mb-2">
                  {(
                    [
                      { v: "in-store", label: "In-store", icon: "shopping-bag" as IconName },
                      { v: "paylater", label: "Pay Later", icon: "clock" as IconName },
                    ] as const
                  ).map((m) => {
                    const active = paymentMethod === m.v;
                    return (
                      <Pressable
                        key={m.v}
                        onPress={() => setPaymentMethod(m.v)}
                        className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${
                          active
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Feather name={m.icon} size={15} color={active ? "#FFFFFF" : "#6b7280"} />
                        <Text
                          className={`text-sm font-semibold ${
                            active ? "text-white" : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                  Card payments are handled on the web admin.
                </Text>

                {paymentMethod === "in-store" && (
                  <>
                    <FieldLabel>Amount</FieldLabel>
                    <View className="flex-row gap-2 mb-3">
                      {(
                        [
                          { v: "full", label: "Full" },
                          { v: "partial", label: "Deposit" },
                          { v: "custom", label: "Custom" },
                        ] as const
                      ).map((t) => {
                        const active = paymentType === t.v;
                        const disabled = t.v === "partial" && partialDeposit <= 0;
                        return (
                          <Pressable
                            key={t.v}
                            onPress={() => !disabled && setPaymentType(t.v)}
                            className={`flex-1 items-center py-2.5 rounded-xl border ${
                              active
                                ? "bg-[#0644C7] border-[#0644C7]"
                                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                            } ${disabled ? "opacity-40" : ""}`}
                          >
                            <Text
                              className={`text-sm font-medium ${
                                active ? "text-white" : "text-gray-700 dark:text-gray-200"
                              }`}
                            >
                              {t.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {paymentType === "custom" && (
                      <InputField
                        label="Custom amount"
                        value={customAmount}
                        onChangeText={setCustomAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    )}
                  </>
                )}

                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    Email confirmation
                  </Text>
                  <Switch
                    value={sendEmail}
                    onValueChange={setSendEmail}
                    trackColor={{ true: PRIMARY }}
                  />
                </View>
              </Section>

              {/* Summary */}
              <Section icon="dollar-sign" title="Summary">
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">Subtotal</Text>
                  <Text className="text-sm text-gray-900 dark:text-white">{money(subtotal)}</Text>
                </View>
                {!!feeBreakdown?.fees.length &&
                  feeBreakdown.fees.map((f) => (
                    <View key={f.fee_support_id} className="flex-row items-center justify-between py-1">
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {f.fee_label} ({f.fee_application_type})
                      </Text>
                      <Text className="text-xs text-gray-700 dark:text-gray-300">
                        {money(f.fee_amount)}
                      </Text>
                    </View>
                  ))}
                {discount > 0 && (
                  <View className="flex-row items-center justify-between py-1">
                    <Text className="text-sm text-green-600">Discount</Text>
                    <Text className="text-sm text-green-600">−{money(discount)}</Text>
                  </View>
                )}
                <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">Total</Text>
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    {money(displayTotal)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">Amount paid</Text>
                  <Text className="text-sm text-gray-900 dark:text-white">{money(amountPaid)}</Text>
                </View>
                {balance > 0 && (
                  <View className="flex-row items-center justify-between py-1">
                    <Text className="text-sm text-amber-600">Balance due</Text>
                    <Text className="text-sm font-semibold text-amber-600">{money(balance)}</Text>
                  </View>
                )}
              </Section>
            </>
          )}
        </ScrollView>

        {/* Sticky submit */}
        <View
          className="border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            className={`h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] active:opacity-90 ${
              submitting ? "opacity-60" : ""
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" />
                <Text className="text-base font-semibold text-white">
                  Create Booking{pkg ? ` · ${money(displayTotal)}` : ""}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Location sheet */}
      <BottomSheet visible={sheet === "location"} onClose={() => setSheet(null)} title="Select Location">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: "all" as const, name: "All Locations" }, ...locationOptions].map((o) => {
            const isSel = (o.id === "all" && selectedLocationId == null) || o.id === selectedLocationId;
            return (
              <Pressable
                key={String(o.id)}
                onPress={() => {
                  setSelectedLocationId(o.id === "all" ? null : o.id);
                  // New scope → drop the loaded catalog + selection so the next
                  // "Select a package" reloads packages for this location.
                  packagesKeyRef.current = null;
                  setPackages([]);
                  setPkg(null);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSel ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSel ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {o.name}
                </Text>
                {isSel && <Feather name="check" size={18} color={PRIMARY} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Package sheet */}
      <BottomSheet visible={sheet === "package"} onClose={() => setSheet(null)} title="Select Package">
        <View className="px-4">
          <View className="flex-row items-center gap-2 bg-gray-50 dark:bg-neutral-800 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-700 mb-2">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={packageSearch}
              onChangeText={setPackageSearch}
              placeholder="Search packages..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
          </View>
        </View>
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {filteredPackages.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              {loadingPackages ? "Loading…" : "No packages found."}
            </Text>
          ) : (
            filteredPackages.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => pickPackage(p)}
                className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-base font-medium text-gray-900 dark:text-white" numberOfLines={1}>
                    {p.name}
                  </Text>
                  {!!p.category && (
                    <Text className="text-xs text-gray-500 dark:text-gray-400">{p.category}</Text>
                  )}
                </View>
                <Text className="text-sm font-bold text-[#0644C7]">{money(p.price)}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </BottomSheet>

      {/* Date sheet */}
      <BottomSheet visible={sheet === "date"} onClose={() => setSheet(null)} title="Select Date">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {dateOptions.map((d) => {
            const isSel = d.value === scheduledDate;
            return (
              <Pressable
                key={d.value}
                onPress={() => {
                  setScheduledDate(d.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSel ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSel ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {d.label}
                </Text>
                {isSel && <Feather name="check" size={18} color={PRIMARY} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Time / space sheet */}
      <BottomSheet visible={sheet === "time"} onClose={() => setSheet(null)} title="Select Time & Space">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {slots.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              No available time slots for this date.
            </Text>
          ) : (
            slots.map((s, i) => {
              const isSel =
                slot?.startTime === s.startTime && slot?.roomId === s.roomId;
              return (
                <Pressable
                  key={`${s.startTime}-${s.roomId ?? i}`}
                  onPress={() => {
                    setSlot(s);
                    setSheet(null);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSel ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <View>
                    <Text
                      className={`text-base font-medium ${
                        isSel ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {formatTime(s.startTime)}
                      {s.endTime ? ` – ${formatTime(s.endTime)}` : ""}
                    </Text>
                    {!!s.roomName && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400">{s.roomName}</Text>
                    )}
                  </View>
                  {isSel && <Feather name="check" size={18} color={PRIMARY} />}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CreateBookingScreen;
