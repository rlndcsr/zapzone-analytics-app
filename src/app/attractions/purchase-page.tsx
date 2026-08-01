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
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { CountryPickerSheet } from "../../components/ui/CountryPickerSheet";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { CheckboxRow } from "../../components/ui/FormControls";
import { InputField } from "../../components/ui/InputField";
import { mediaUrl } from "../../lib/api";
import { countryName } from "../../lib/countries";
import {
  availableTimeSlotsForDate,
  computeDayOffAvailability,
} from "../../lib/attractions/dayOffAvailability";
import { formatFullDate, toKey } from "../../lib/date/calendar";
import {
  fetchDayOffsByLocation,
  type DayOff,
} from "../../services/dayOffsService";
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
import { useOnsitePricing } from "../../lib/hooks/useOnsitePricing";
import { SignaturePad } from "../../components/ui/SignaturePad";
import {
  CARD_MONTHS,
  cardYears,
  formatCardNumber,
  getCardType,
  getPaymentErrorMessage,
  isTestCardNumber,
  validateCardNumber,
} from "../../lib/payments/cardUtils";
import { rollbackAttractionPurchase } from "../../lib/payments/rollback";
import {
  attractionPurchaseQrValue,
  useQrDataUri,
} from "../../lib/payments/useQrDataUri";
import {
  CHARGE_UNKNOWN_MESSAGE,
  chargeOutcomeUnknown,
  declineMessage,
  fetchAuthorizeNetPublicKey,
  PAYMENT_TYPE,
  processCardPayment,
  type AuthorizeNetPublicKey,
} from "../../services/paymentsService";

const PRIMARY = "#0644C7";
type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const money = (n: number) => `$${n.toFixed(2)}`;

const pricingSuffix = (t: string) =>
  t === "per_person"
    ? "/person"
    : t === "per_group"
      ? "/group"
      : t === "per_hour"
        ? "/hour"
        : "";

/** Unit-price row label in the Order Summary (web parity). */
const pricingTypeLabel = (t: string) =>
  t === "per_person"
    ? "Per person"
    : t === "per_group"
      ? "Per group"
      : t === "per_hour"
        ? "Per hour"
        : t === "per_game"
          ? "Per game"
          : "Fixed price";

function formatTime(value: string): string {
  const [h, m] = value.split(":");
  let hour = Number(h);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${meridian}`;
}

const Section = ({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View
      className={`flex-row items-center gap-2 ${subtitle ? "mb-1" : "mb-4"}`}
    >
      <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {subtitle ? (
      <Text
        numberOfLines={1}
        className="text-xs text-gray-500 dark:text-gray-400 mb-4"
      >
        {subtitle}
      </Text>
    ) : null}
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
    className="h-14 flex-row items-center gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5"
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

/** Accepted-card badges, mirroring the web admin's four payment marks. */
const CardBrandRow = () => (
  <View className="flex-row items-center gap-1.5">
    <View className="h-6 px-1.5 rounded bg-[#1A1F71] items-center justify-center">
      <Text className="text-[9px] font-extrabold italic text-white">VISA</Text>
    </View>
    <View className="h-6 px-1.5 rounded bg-[#EB001B] items-center justify-center">
      <Text className="text-[8px] font-bold text-white">MC</Text>
    </View>
    <View className="h-6 px-1.5 rounded bg-[#2E77BC] items-center justify-center">
      <Text className="text-[8px] font-bold text-white">AMEX</Text>
    </View>
    <View className="h-6 px-1.5 rounded bg-[#F76B1C] items-center justify-center">
      <Text className="text-[8px] font-bold text-white">DISC</Text>
    </View>
  </View>
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
  const [smsConsent, setSmsConsent] = useState(false);
  const [address, setAddress] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  // 2-letter code, like the web `customerInfo.country`.
  const [country, setCountry] = useState("");
  // Card-only, like the web purchase page (no method selector there).
  const [paymentMethod] = useState<"card" | "in-store" | "paylater">("card");
  const [sendEmail, setSendEmail] = useState(true);

  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signatureTermsErrors, setSignatureTermsErrors] = useState<{
    signature?: string;
    terms?: string;
  }>({});
  const [authorizeCredentials, setAuthorizeCredentials] =
    useState<AuthorizeNetPublicKey | null>(null);
  /** This attraction's location has no active merchant account (web's
   *  "Authorize.Net Not Configured" modal). */
  const [authorizeUnavailable, setAuthorizeUnavailable] = useState(false);
  const qr = useQrDataUri();

  const [sheet, setSheet] = useState<
    null | "date" | "time" | "country" | "month" | "year"
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Location day-offs backing the calendar's blocked / limited dates (same
  // data + endpoint the web purchase calendar uses).
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const submitLockRef = useRef(false);
  /** Web parity (`lastSubmitTimeRef`): 3s cooldown, so a double-tap can never
   *  produce a second card charge. */
  const lastSubmitAtRef = useRef(0);

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

  // Fetch the attraction's location day-offs once the detail (and its location)
  // is known. Errors are swallowed (calendar simply shows no blocks), matching
  // the web behaviour.
  useEffect(() => {
    const token = getToken();
    const locId = detail?.locationId;
    if (!token || locId == null) {
      setDayOffs([]);
      return;
    }
    const controller = new AbortController();
    fetchDayOffsByLocation(token, locId, controller.signal)
      .then(setDayOffs)
      .catch(() => {
        if (!controller.signal.aborted) setDayOffs([]);
      });
    return () => controller.abort();
  }, [detail?.locationId]);

  // Public Accept.js credentials for this location (web `initializeAuthorizeNet`).
  // Errors are swallowed like the web; the card leg reports the missing config.
  useEffect(() => {
    const token = getToken();
    const locId = detail?.locationId;
    if (!token || locId == null) {
      setAuthorizeCredentials(null);
      return;
    }
    const controller = new AbortController();
    fetchAuthorizeNetPublicKey(token, locId, controller.signal)
      .then((creds) => {
        setAuthorizeCredentials(creds.apiLoginId ? creds : null);
        setAuthorizeUnavailable(!creds.apiLoginId);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAuthorizeCredentials(null);
        setAuthorizeUnavailable(true);
      });
    return () => controller.abort();
  }, [detail?.locationId]);

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

  // Today's key (YYYY-MM-DD) — the visit-date floor and the transaction's
  // `purchase_date`. Computed once, timezone-safe.
  const todayKey = useMemo(() => toKey(new Date()), []);
  // Full, unabbreviated date ("Friday, July 24, 2026") — the Date field is now
  // full width, so the selected day is always shown in full, never truncated.
  const dateLabel = !scheduledDate
    ? null
    : scheduledDate === todayKey
      ? `Today · ${formatFullDate(scheduledDate)}`
      : formatFullDate(scheduledDate);

  // Local midnight "now" for the day-off past-date checks.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Calendar availability (full day-offs / limited-hours / open weekdays) —
  // computed from the same Laravel day-off data + attraction availability the
  // web uses. The calendar only renders these sets; the rules live in the
  // shared helper.
  const dayOffAvailability = useMemo(
    () =>
      computeDayOffAvailability({
        dayOffs,
        attractionId: detail?.id ?? -1,
        availability: detail?.availability ?? [],
        today,
      }),
    [dayOffs, detail?.id, detail?.availability, today],
  );

  // Time slots for the selected day: the weekday's availability window minus
  // any partial-closure hours — mirrors the web time-slot recompute.
  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !detail) return [];
    return availableTimeSlotsForDate(
      scheduledDate,
      detail.availability,
      dayOffAvailability.partialClosuresByDate,
    );
  }, [scheduledDate, detail, dayOffAvailability]);

  // Clear a chosen time if it's no longer valid for the newly picked date.
  useEffect(() => {
    if (scheduledTime && !availableTimeSlots.includes(scheduledTime)) {
      setScheduledTime("");
    }
  }, [availableTimeSlots, scheduledTime]);

  // Same pricing pipeline the web purchase page uses: server-side fee support
  // (Venue Fee) applied to the base price, special pricing subtracted.
  const {
    subtotal,
    feeBreakdown,
    specialPricingDiscount,
    total,
    appliedFees,
    appliedDiscounts,
  } = useOnsitePricing({
    entity: detail,
    entityType: "attraction",
    quantity,
    addonQty,
    discountNum: 0,
    purchaseDate: scheduledDate,
    purchaseTime: "",
  });

  const setAddon = (addonId: number, n: number) =>
    setAddonQty((prev) => ({ ...prev, [addonId]: n }));

  const cardValid = validateCardNumber(cardNumber);
  // Same disabled rule as the web Pay button.
  const cardIncomplete =
    !cardNumber || !cardMonth || !cardYear || !cardCVV || !cardValid;
  const submitDisabled =
    submitting ||
    isProcessingPayment ||
    (paymentMethod === "card" && (cardIncomplete || authorizeUnavailable));

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / galleryWidth);
    if (idx !== imageIndex) setImageIndex(idx);
  };

  /**
   * Card pre-flight — signature / terms / card checks in the web's order, run
   * before anything is written. Returns false when the card leg can't proceed
   * (it has already surfaced the reason on the relevant field).
   */
  const cardPreflightOk = (): boolean => {
    const stErrors: { signature?: string; terms?: string } = {};
    if (!signatureImage) {
      stErrors.signature = "Please provide your signature before proceeding.";
    }
    if (!termsAccepted) {
      stErrors.terms = "You must agree to the Terms & Conditions to proceed.";
    }
    if (Object.keys(stErrors).length > 0) {
      setSignatureTermsErrors(stErrors);
      return false;
    }
    setSignatureTermsErrors({});

    if (!cardNumber || !cardMonth || !cardYear || !cardCVV) {
      setPaymentError("Please fill in all card details");
      return false;
    }
    if (!validateCardNumber(cardNumber)) {
      setPaymentError("Invalid card number");
      return false;
    }
    if (isTestCardNumber(cardNumber)) {
      setPaymentError(
        "Test card numbers are not allowed. Please use a real card.",
      );
      return false;
    }
    if (!authorizeCredentials?.apiLoginId) {
      setPaymentError(
        "Payment system not initialized. Please reopen this page and try again.",
      );
      return false;
    }

    setPaymentError("");
    return true;
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
    if (
      !address.trim() ||
      !city.trim() ||
      !stateField.trim() ||
      !zip.trim() ||
      !country
    ) {
      Alert.alert(
        "Missing billing information",
        "Please enter your street address, city, state / province, ZIP / postal code and country.",
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
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 3000) return;
    lastSubmitAtRef.current = now;

    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    const isCardPayment = paymentMethod === "card";
    if (isCardPayment && !cardPreflightOk()) return;

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
      // The purchase record has no separate address2 column, so the apartment /
      // suite line is appended to the street address.
      guest_address: [address.trim(), address2.trim()]
        .filter(Boolean)
        .join(", "),
      guest_city: city.trim(),
      guest_state: stateField.trim(),
      guest_zip: zip.trim(),
      guest_country: country,
      sms_consent: smsConsent,
      quantity,
      amount: total,
      total_amount: total,
      amount_paid: isPayLater ? 0 : total,
      currency: "USD",
      method: isPayLater ? "paylater" : isCardPayment ? "authorize.net" : "cash",
      payment_method: isCardPayment ? "authorize.net" : paymentMethod,
      ...(paymentMethod === "in-store" ? { status: "confirmed" as const } : {}),
      location_id: locationId,
      purchase_date: todayKey,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      notes: `Attraction Purchase: ${detail.name} (${quantity} ticket${quantity > 1 ? "s" : ""})`,
      send_email: paymentMethod === "in-store" ? sendEmail : false,
      additional_addons: additionalAddons.length > 0 ? additionalAddons : undefined,
      applied_fees: appliedFees.length > 0 ? appliedFees : undefined,
      discount_amount:
        specialPricingDiscount > 0 ? specialPricingDiscount : undefined,
      applied_discounts:
        appliedDiscounts.length > 0 ? appliedDiscounts : undefined,
    };

    submitLockRef.current = true;
    setSubmitting(true);
    setIsProcessingPayment(isCardPayment);
    try {
      // Web order: create the purchase (unpaid) first so the charge has a
      // payable to link to, then charge the card.
      const { id: purchaseId } = await createAttractionPurchase(token, input);
      markAttractionPurchasesStale();

      if (isCardPayment) {
        const qrCode = await qr.generate(attractionPurchaseQrValue(purchaseId));

        let response;
        try {
          response = await processCardPayment(
            token,
            {
              cardNumber: cardNumber.replace(/\s/g, ""),
              month: cardMonth,
              year: cardYear,
              cardCode: cardCVV,
            },
            authorizeCredentials!,
            {
              location_id: locationId,
              amount: total,
              order_id: `A${detail.id}-${String(Date.now()).slice(-8)}`,
              description: `Attraction Purchase: ${detail.name}`,
              payable_id: purchaseId,
              payable_type: PAYMENT_TYPE.ATTRACTION_PURCHASE,
              send_email: sendEmail,
              qr_code: qrCode ?? undefined,
              // The web purchase page stores the signed waiver + terms consent
              // on the payment record itself.
              signature_image: signatureImage ?? undefined,
              terms_accepted: termsAccepted,
              customer: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: address.trim(),
                address2: address2.trim(),
                city: city.trim(),
                state: stateField.trim(),
                zip: zip.trim(),
                country,
              },
            },
          );
        } catch (payErr) {
          // A lost response can't prove the card wasn't charged, so keep the
          // purchase and let staff reconcile rather than risk a double charge.
          if (chargeOutcomeUnknown(payErr)) {
            setPaymentError(CHARGE_UNKNOWN_MESSAGE);
            Alert.alert("Payment status unknown", CHARGE_UNKNOWN_MESSAGE);
            return;
          }
          await rollbackAttractionPurchase(token, purchaseId);
          setPaymentError(getPaymentErrorMessage(payErr));
          Alert.alert(
            "Payment failed",
            `${getPaymentErrorMessage(payErr)}\n\nThe purchase has been cancelled and no charges were made.`,
          );
          return;
        }

        if (!response.success) {
          await rollbackAttractionPurchase(token, purchaseId);
          const message = declineMessage(response.message, "purchase");
          setPaymentError(message);
          Alert.alert("Payment declined", message);
          return;
        }
        setPaymentError("");
      }

      setConfirmed(true);
    } catch (err) {
      Alert.alert(
        "Couldn't complete purchase",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
      setIsProcessingPayment(false);
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

          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-4 shadow-sm"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Feather name="map-pin" size={15} color="#6B7280" />
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                Billing Address
              </Text>
            </View>
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {firstName} {lastName}
            </Text>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {address}
            </Text>
            {!!address2 && (
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {address2}
              </Text>
            )}
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {city}, {stateField} {zip}
            </Text>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {countryName(country)}
            </Text>
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
      {/* Off-screen QR, mounted only while a receipt QR is being generated. */}
      {qr.node}

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
              {/* Stacked full-width fields so the selected date + time are
                  always shown in full (side-by-side truncated the date). */}
              <View className="mb-4">
                <FieldLabel>Date</FieldLabel>
                <SelectRow
                  icon="calendar"
                  value={dateLabel}
                  placeholder="Select date"
                  onPress={() => setSheet("date")}
                />
              </View>
              <View>
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
                    label="First Name *"
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                  />
                </View>
                <View className="flex-1">
                  <InputField
                    label="Last Name *"
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                  />
                </View>
              </View>
              <InputField
                label="Email *"
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

              <View className="mt-4">
                <CheckboxRow
                  checked={smsConsent}
                  onToggle={() => setSmsConsent((v) => !v)}
                  alignTop
                  label={
                    <Text className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                      I agree to receive automated delivery notifications and
                      promotional text messages from Zap Zone at the phone number
                      provided. Consent is not a condition of purchase. Message
                      frequency varies. Message and data rates may apply. Reply
                      STOP to cancel or HELP for help. View our{" "}
                      <Text
                        className="text-[#0644C7] dark:text-blue-400 underline"
                        onPress={() =>
                          Linking.openURL(
                            "https://zap-zone.com/terms-conditions/",
                          )
                        }
                      >
                        Terms and Conditions
                      </Text>
                      .
                    </Text>
                  }
                />
              </View>
            </Section>

            {/* Billing information */}
            <Section icon="map-pin" title="Billing Information">
              <InputField
                label="Street Address *"
                value={address}
                onChangeText={setAddress}
                placeholder="123 Main Street"
                containerClassName="mb-4"
              />
              <InputField
                label="Apartment, Suite, Unit (Optional)"
                value={address2}
                onChangeText={setAddress2}
                placeholder="Apt 4B, Suite 200, etc."
                containerClassName="mb-4"
              />
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <InputField
                    label="City *"
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                  />
                </View>
                <View className="flex-1">
                  <InputField
                    label="State / Province *"
                    value={stateField}
                    onChangeText={setStateField}
                    placeholder="State"
                  />
                </View>
              </View>
              <InputField
                label="ZIP / Postal Code *"
                value={zip}
                onChangeText={setZip}
                placeholder="12345"
                keyboardType="number-pad"
                containerClassName="mb-4"
              />
              <View>
                <FieldLabel>Country *</FieldLabel>
                <SelectRow
                  icon="globe"
                  value={country ? countryName(country) : null}
                  placeholder="Select country"
                  onPress={() => setSheet("country")}
                />
              </View>
            </Section>

            {/* Payment Information — web admin step 3 */}
            <Section
              icon="credit-card"
              title="Payment Information"
              subtitle="Secure payment powered by Authorize.Net"
            >
              <View className="mb-4">
                <CardBrandRow />
              </View>

              {/* Web parity: the "Authorize.Net Not Configured" modal, inline. */}
              {authorizeUnavailable && (
                <View className="mb-4 flex-row items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <Feather name="alert-triangle" size={14} color="#B45309" />
                  <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                    This location has no active Authorize.Net account, so cards
                    can&apos;t be charged right now. Please contact staff to
                    complete this purchase.
                  </Text>
                </View>
              )}

              <View className="mb-4">
                <FieldLabel>Card Number</FieldLabel>
                <View
                  className={`h-14 flex-row items-center rounded-xl border px-4 bg-white dark:bg-neutral-900 ${
                    cardNumber && cardValid
                      ? "border-green-400 bg-green-50 dark:bg-green-900/10"
                      : cardNumber
                        ? "border-red-400"
                        : "border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <TextInput
                    value={cardNumber}
                    onChangeText={(v) => {
                      const formatted = formatCardNumber(v);
                      if (formatted.replace(/\s/g, "").length <= 16) {
                        setCardNumber(formatted);
                        setPaymentError("");
                      }
                    }}
                    placeholder="1234 5678 9012 3456"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={19}
                    editable={!isProcessingPayment}
                    className="flex-1 text-base text-gray-900 dark:text-white"
                  />
                  {cardNumber.length > 0 && cardValid && (
                    <Feather name="check-circle" size={18} color="#16A34A" />
                  )}
                </View>
                {!!cardNumber && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    {getCardType(cardNumber)}
                  </Text>
                )}
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <FieldLabel>Exp Month</FieldLabel>
                  <SelectRow
                    icon="calendar"
                    value={cardMonth || null}
                    placeholder="MM"
                    onPress={() => setSheet("month")}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Exp Year</FieldLabel>
                  <SelectRow
                    icon="calendar"
                    value={cardYear || null}
                    placeholder="YYYY"
                    onPress={() => setSheet("year")}
                  />
                </View>
              </View>

              <View>
                <FieldLabel>CVV</FieldLabel>
                <View className="h-14 flex-row items-center rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4">
                  <TextInput
                    value={cardCVV}
                    onChangeText={(v) => {
                      const digits = v.replace(/\D/g, "");
                      if (digits.length <= 4) setCardCVV(digits);
                    }}
                    placeholder="123"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    editable={!isProcessingPayment}
                    className="flex-1 text-base text-gray-900 dark:text-white"
                  />
                </View>
              </View>

              {!!paymentError && (
                <View className="flex-row items-start gap-2 mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <Feather name="x-circle" size={16} color="#B91C1C" />
                  <Text className="flex-1 text-xs text-red-800 dark:text-red-300">
                    {paymentError}
                  </Text>
                </View>
              )}

              <View className="flex-row items-start gap-2 mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                <Feather name="lock" size={16} color="#0644C7" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Secure Payment
                  </Text>
                  <Text className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                    256-bit SSL encrypted • PCI compliant • Powered by
                    Authorize.Net
                  </Text>
                </View>
              </View>
            </Section>

            {/* Signature & Agreement — web admin step 3 */}
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
              style={CARD_SHADOW}
            >
              <Text className="text-base font-bold text-gray-900 dark:text-white mb-4">
                Signature & Agreement
              </Text>

              <SignaturePad
                onSignatureChange={(base64) => {
                  setSignatureImage(base64);
                  if (base64) {
                    setSignatureTermsErrors((prev) => ({
                      ...prev,
                      signature: "",
                    }));
                  }
                }}
                required
                error={signatureTermsErrors.signature}
              />

              <View className="mt-4">
                <CheckboxRow
                  checked={termsAccepted}
                  onToggle={() => {
                    setTermsAccepted((v) => {
                      if (!v) {
                        setSignatureTermsErrors((prev) => ({
                          ...prev,
                          terms: "",
                        }));
                      }
                      return !v;
                    });
                  }}
                  label={
                    <Text className="text-sm leading-5 text-gray-700 dark:text-gray-200">
                      I agree to the{" "}
                      <Text
                        className="font-medium text-[#0644C7] dark:text-blue-400 underline"
                        onPress={() =>
                          Linking.openURL(
                            "https://zap-zone.com/terms-conditions/",
                          )
                        }
                      >
                        Terms &amp; Conditions
                      </Text>
                      <Text className="text-red-500"> *</Text>
                    </Text>
                  }
                />
                {!!signatureTermsErrors.terms && (
                  <Text className="text-xs text-red-500 mt-1.5 ml-7">
                    {signatureTermsErrors.terms}
                  </Text>
                )}
              </View>
            </View>

            {/* Order summary */}
            <Section icon="file-text" title="Order Summary">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {pricingTypeLabel(detail.pricingType)}
                </Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(detail.price)}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Quantity
                </Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {quantity}
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
              {specialPricingDiscount > 0 && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-green-600 dark:text-green-400">
                    Special Pricing
                  </Text>
                  <Text className="text-sm font-medium text-green-600 dark:text-green-400">
                    -{money(specialPricingDiscount)}
                  </Text>
                </View>
              )}
              {feeBreakdown?.fees.map((f) => (
                <View
                  key={f.fee_support_id}
                  className="flex-row justify-between mb-2"
                >
                  <Text
                    className="text-sm text-gray-500 dark:text-gray-400 flex-1 mr-2"
                    numberOfLines={1}
                  >
                    {f.fee_name} ({f.fee_label})
                    {f.fee_application_type === "inclusive" ? " · Included" : ""}
                  </Text>
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {f.fee_application_type === "additive"
                      ? `+${money(f.fee_amount)}`
                      : money(f.fee_amount)}
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
              disabled={submitDisabled}
              className={`h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] ${
                submitDisabled ? "opacity-50" : "active:opacity-90"
              }`}
            >
              {submitting || isProcessingPayment ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">
                    {isProcessingPayment ? "Processing Payment..." : "Processing..."}
                  </Text>
                </>
              ) : (
                <>
                  <Feather
                    name={paymentMethod === "card" ? "lock" : "shopping-bag"}
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text className="text-base font-semibold text-white">
                    {paymentMethod === "card"
                      ? `Pay ${money(total)}`
                      : `Complete Purchase · ${money(total)}`}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker — native calendar (browse months, tap a day). Past dates
          are disabled; the selected date flows through the same `scheduledDate`
          state, which drives the availability-based time slots as before. */}
      <DatePickerSheet
        visible={sheet === "date"}
        value={scheduledDate || null}
        minDate={todayKey}
        dayOffDates={dayOffAvailability.fullDayOffDates}
        limitedDates={dayOffAvailability.partialDates}
        availableWeekdays={dayOffAvailability.availableWeekdays}
        title="Select Visit Date"
        onClose={() => setSheet(null)}
        onSelect={(date) => {
          setScheduledDate(date);
          // Chain straight into the time picker; the sheets are native Modals,
          // so the calendar must fully close before the next one opens.
          setSheet(null);
          setTimeout(() => setSheet("time"), 280);
        }}
      />

      {/* Card expiry pickers — the sheet form of the web's MM / YYYY selects. */}
      <BottomSheet
        visible={sheet === "month" || sheet === "year"}
        onClose={() => setSheet(null)}
        title={sheet === "year" ? "Expiration Year" : "Expiration Month"}
      >
        <ScrollView
          className="px-4 pb-6"
          style={{ maxHeight: 360 }}
          showsVerticalScrollIndicator={false}
        >
          {(sheet === "year" ? cardYears() : CARD_MONTHS).map((option) => {
            const isSelected =
              sheet === "year" ? cardYear === option : cardMonth === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  if (sheet === "year") setCardYear(option);
                  else setCardMonth(option);
                  setPaymentError("");
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
                  {option}
                </Text>
                {isSelected && <Feather name="check" size={16} color={PRIMARY} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Billing country picker (searchable, like the web country field) */}
      <CountryPickerSheet
        visible={sheet === "country"}
        value={country}
        onClose={() => setSheet(null)}
        onSelect={setCountry}
      />

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
