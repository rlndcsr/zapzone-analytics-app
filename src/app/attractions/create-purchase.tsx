import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { CheckboxRow } from "../../components/ui/FormControls";
import { InputField } from "../../components/ui/InputField";
import { ScheduleCalendar } from "../../components/ui/ScheduleCalendar";
import { mediaUrl } from "../../lib/api";
import {
  availableTimeSlotsForDate,
  computeDayOffAvailability,
} from "../../lib/attractions/dayOffAvailability";
import {
  PRICING_SUFFIX,
  formatDurationDisplay,
} from "../../lib/attractions/attractionDisplay";
import { toKey } from "../../lib/date/calendar";
import { markAttractionPurchasesStale } from "../../lib/hooks/useAttractionPurchases";
import { useOnsitePricing } from "../../lib/hooks/useOnsitePricing";
import {
  CARD_MONTHS,
  cardYears,
  formatCardNumber,
  getCardType,
  getPaymentErrorMessage,
  isTestCardNumber,
  validateCardNumber,
} from "../../lib/payments/cardUtils";
import { getCurrentUser, getToken } from "../../lib/session";
import { rollbackAttractionPurchase } from "../../lib/payments/rollback";
import {
  attractionPurchaseQrValue,
  useQrDataUri,
} from "../../lib/payments/useQrDataUri";
import {
  createAttractionPurchase,
  type CreateAttractionPurchaseInput,
} from "../../services/attractionPurchasesService";
import {
  fetchAttractions,
  type AttractionRow,
} from "../../services/attractionsService";
import { searchCustomers, type CustomerHit } from "../../services/customersService";
import {
  fetchDayOffsByLocation,
  type DayOff,
} from "../../services/dayOffsService";
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

/** Height cap on the attraction picker, mirroring the web's `max-h-96` list. */
const ATTRACTION_LIST_MAX_HEIGHT = 340;

const money = (n: number) => `$${n.toFixed(2)}`;

const pricingSuffix = (t: string) => PRICING_SUFFIX[t] ?? "";

type PaymentMethod = "authorize.net" | "in-store" | "paylater";

const Section = ({
  icon,
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-center gap-2 mb-4">
      {!!icon && (
        <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
          <Feather name={icon} size={16} color={PRIMARY} />
        </View>
      )}
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

/** +/- stepper used for quantity and add-on counts. */
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

/** Square thumbnail with the web's "No Image" placeholder. */
const Thumb = ({
  uri,
  size,
  placeholder = "No Image",
}: {
  uri: string | null;
  size: number;
  placeholder?: string;
}) => (
  <View
    style={{ width: size, height: size }}
    className="rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 items-center justify-center"
  >
    {uri ? (
      <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
    ) : (
      <Text className="text-[10px] text-gray-400">{placeholder}</Text>
    )}
  </View>
);

/**
 * One attraction in the picker (and, with `selected`, the chosen-attraction
 * card). Same anatomy as the web: thumbnail, name, category, then price with
 * its pricing-type suffix on the left and the duration on the right.
 */
const AttractionCard = ({
  attraction,
  selected,
  onPress,
  onClear,
}: {
  attraction: AttractionRow;
  selected?: boolean;
  onPress?: () => void;
  onClear?: () => void;
}) => {
  const body = (
    <View className="flex-row items-start gap-3">
      <Thumb uri={mediaUrl(attraction.images[0])} size={72} />
      <View className="flex-1">
        <Text
          className="font-semibold text-gray-900 dark:text-white"
          numberOfLines={2}
        >
          {attraction.name}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
          {attraction.category}
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-[#0644C7] dark:text-blue-400">
            {money(attraction.price)}
            <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
              {" "}
              {pricingSuffix(attraction.pricingType)}
            </Text>
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {formatDurationDisplay(attraction.duration, attraction.durationUnit)}
          </Text>
        </View>
      </View>
      {!!onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear selection">
          <Feather name="x" size={18} color="#9CA3AF" />
        </Pressable>
      )}
    </View>
  );

  if (selected) {
    return (
      <View className="rounded-xl border border-[#0644C7] bg-[#0644C7]/5 dark:bg-blue-900/20 p-4">
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl border border-gray-200 dark:border-neutral-700 p-4 mb-3 active:border-[#0644C7]/50"
    >
      {body}
    </Pressable>
  );
};

const CreatePurchaseScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();

  // Attraction catalog — active only, already scoped to the caller's locations
  // by the API (the web takes its scope from the global location context, so
  // there is no per-screen location picker on either platform).
  const [attractions, setAttractions] = useState<AttractionRow[]>([]);
  const [loadingAttractions, setLoadingAttractions] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AttractionRow | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;
    let active = true;
    setLoadingAttractions(true);
    fetchAttractions({ token, userId: user.id })
      .then((rows) => {
        if (active) setAttractions(rows.filter((a) => a.status === "active"));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingAttractions(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Purchase details.
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("authorize.net");
  const [sendEmail, setSendEmail] = useState(true);

  // Card (Authorize.Net) fields — same anatomy as the web Card Details panel.
  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [authorizeCredentials, setAuthorizeCredentials] =
    useState<AuthorizeNetPublicKey | null>(null);
  /** True once the public-key lookup has confirmed this location has no active
   *  merchant account — the web's "Authorize.Net Not Configured" modal. */
  const [authorizeUnavailable, setAuthorizeUnavailable] = useState(false);
  const qr = useQrDataUri();

  // Customer (email search-as-you-type).
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [foundCustomers, setFoundCustomers] = useState<CustomerHit[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<null | "month" | "year">(null);
  const submitLockRef = useRef(false);
  /** Web parity (`lastSubmitTimeRef`): a 3s cooldown after any submit, so a
   *  double-tap can never produce a second card charge. */
  const lastSubmitAtRef = useRef(0);

  // Debounced customer lookup by email (mirrors the web).
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
    setSearchingCustomer(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchCustomers(token, email);
        if (!active) return;
        setFoundCustomers(hits);
        setShowCustomerList(hits.length > 0);
        const exact = hits.find((c) => c.email.toLowerCase() === email.toLowerCase());
        if (exact) {
          setSelectedCustomerId(exact.id);
          setCustomerName(`${exact.firstName} ${exact.lastName}`.trim());
          if (exact.phone) setCustomerPhone(exact.phone);
        }
      } catch {
        if (active) setFoundCustomers([]);
      } finally {
        if (active) setSearchingCustomer(false);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerEmail]);

  // Day-offs for the chosen attraction's location — feeds the calendar's
  // blocked / limited-hours dates.
  useEffect(() => {
    const locationId = selected?.locationId;
    if (locationId == null) {
      setDayOffs([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchDayOffsByLocation(token, locationId, controller.signal)
      .then((rows) => setDayOffs(rows))
      .catch(() => {
        if (!controller.signal.aborted) setDayOffs([]);
      });
    return () => controller.abort();
  }, [selected]);

  // Accept.js credentials for the attraction's location (web parity: fetched
  // as soon as the card method is active so the form can tokenize).
  useEffect(() => {
    if (paymentMethod !== "authorize.net" || !selected) return;
    const locationId = selected.locationId;
    if (locationId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchAuthorizeNetPublicKey(token, locationId, controller.signal)
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
  }, [paymentMethod, selected]);

  const selectCustomer = (c: CustomerHit) => {
    setSelectedCustomerId(c.id);
    setCustomerEmail(c.email);
    setCustomerName(`${c.firstName} ${c.lastName}`.trim());
    setCustomerPhone(c.phone ?? "");
    setShowCustomerList(false);
  };

  const pickAttraction = (a: AttractionRow) => {
    setSelected(a);
    setQuantity(1);
    setDiscount("0");
    setAmountPaid("0");
    setAddonQty({});
    setScheduledDate("");
    setScheduledTime("");
    setSearch("");
  };

  // Ordered add-ons for the selected attraction (respecting addOnsOrder).
  const orderedAddOns = useMemo(() => {
    if (!selected) return [];
    const order = selected.addOnsOrder ?? [];
    return [...selected.addOns].sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [selected]);

  const filteredAttractions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return attractions;
    return attractions.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.category.toLowerCase().includes(term),
    );
  }, [attractions, search]);

  // Local midnight "now" for the day-off past-date checks.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Calendar availability (full day-offs / limited hours / open weekdays),
  // computed from the same Laravel day-off data the web uses.
  const dayOffAvailability = useMemo(
    () =>
      computeDayOffAvailability({
        dayOffs,
        attractionId: selected?.id ?? -1,
        availability: selected?.availability ?? [],
        today,
      }),
    [dayOffs, selected?.id, selected?.availability, today],
  );

  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !selected) return [];
    return availableTimeSlotsForDate(
      scheduledDate,
      selected.availability,
      dayOffAvailability.partialClosuresByDate,
    );
  }, [scheduledDate, selected, dayOffAvailability]);

  // Drop a chosen time that is no longer valid for the newly picked date.
  useEffect(() => {
    if (scheduledTime && !availableTimeSlots.includes(scheduledTime)) {
      setScheduledTime("");
    }
  }, [availableTimeSlots, scheduledTime]);

  const discountNum = Math.max(0, Number(discount) || 0);

  // Same pricing pipeline as the web: base = subtotal + add-ons − manual
  // discount, then server-side fees applied and special pricing subtracted.
  const {
    subtotal,
    feeBreakdown,
    specialPricing,
    specialPricingDiscount,
    total,
    appliedFees,
    appliedDiscounts,
  } = useOnsitePricing({
    entity: selected,
    entityType: "attraction",
    quantity,
    addonQty,
    discountNum,
    purchaseDate: scheduledDate,
    purchaseTime: scheduledTime,
  });

  // Today's key (YYYY-MM-DD) — the visit-date floor and the transaction's
  // `purchase_date`. Computed once, timezone-safe.
  const todayKey = useMemo(() => toKey(new Date()), []);

  const setAddon = (id: number, n: number) =>
    setAddonQty((prev) => ({ ...prev, [id]: n }));

  const cardValid = validateCardNumber(cardNumber);
  const cardIncomplete =
    !cardNumber || !cardMonth || !cardYear || !cardCVV || !cardValid;
  const submitDisabled =
    submitting ||
    isProcessingPayment ||
    !selected ||
    (paymentMethod === "authorize.net" &&
      (cardIncomplete || authorizeUnavailable));

  /**
   * Card pre-flight — the web's validation order, run before anything is
   * written. Returns the reason to show, or null when the card leg may proceed.
   */
  const cardPreflightError = (): string | null => {
    if (!cardNumber || !cardMonth || !cardYear || !cardCVV)
      return "Please fill in all card details";
    if (!validateCardNumber(cardNumber)) return "Invalid card number";
    if (isTestCardNumber(cardNumber))
      return "Test card numbers are not allowed. Please use a real card.";
    if (!authorizeCredentials?.apiLoginId)
      return "Payment system not initialized. Please reopen this screen and try again.";
    return null;
  };

  const handleSubmit = async () => {
    if (!selected) {
      Alert.alert("Select an attraction", "Choose an attraction to purchase.");
      return;
    }
    // The purchase belongs to the attraction's own location, exactly like the
    // web's `selectedAttraction.locationId`.
    const effectiveLocationId = selected.locationId;
    if (effectiveLocationId == null) {
      Alert.alert("Location unavailable", "This attraction has no location set.");
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      Alert.alert(
        "Select a visit date & time",
        "A visit date and time are required before purchasing.",
      );
      return;
    }
    if (submitLockRef.current) return;
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 3000) return;
    lastSubmitAtRef.current = now;

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    const isCardPayment = paymentMethod === "authorize.net";
    if (isCardPayment) {
      const reason = cardPreflightError();
      if (reason) {
        setPaymentError(reason);
        return;
      }
      setPaymentError("");
    }

    const additionalAddons = Object.entries(addonQty)
      .filter(([, qty]) => qty > 0)
      .map(([idStr, qty]) => {
        const addOn = selected.addOns.find((a) => a.id === Number(idStr));
        return addOn
          ? { addon_id: addOn.id, quantity: qty, price_at_purchase: addOn.price }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const isPayLater = paymentMethod === "paylater";
    // Web parity: a card always pays the full total; cash honours the typed
    // amount and falls back to the total; pay-later collects nothing now.
    const paid = isPayLater
      ? 0
      : isCardPayment
        ? total
        : Number(amountPaid) > 0
          ? Number(amountPaid)
          : total;

    const input: CreateAttractionPurchaseInput = {
      attraction_id: selected.id,
      customer_id: selectedCustomerId ?? undefined,
      guest_name: customerName.trim() || "Walk-in Customer",
      guest_email: customerEmail.trim() || undefined,
      guest_phone: customerPhone.trim() || undefined,
      quantity,
      amount: total,
      total_amount: total,
      amount_paid: paid,
      currency: "USD",
      method: isPayLater ? "paylater" : isCardPayment ? "authorize.net" : "cash",
      payment_method: paymentMethod,
      ...(paymentMethod === "in-store" ? { status: "confirmed" as const } : {}),
      location_id: effectiveLocationId,
      purchase_date: todayKey,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      notes:
        notes.trim() ||
        `Attraction Purchase: ${selected.name} (${quantity} ticket${quantity > 1 ? "s" : ""})`,
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
      // Web order: the purchase row is created first (unpaid), then charged, so
      // the charge can be linked to a payable that already exists.
      const { id: purchaseId } = await createAttractionPurchase(token, input);
      markAttractionPurchasesStale();

      if (isCardPayment) {
        // The QR rides along on the charge so the receipt email carries a
        // scannable ticket, exactly as the web attaches `qr_code`.
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
              location_id: effectiveLocationId,
              amount: total,
              order_id: `A${selected.id}-${String(Date.now()).slice(-8)}`,
              description: `Attraction Purchase: ${selected.name}`,
              customer_id: selectedCustomerId ?? undefined,
              payable_id: purchaseId,
              payable_type: PAYMENT_TYPE.ATTRACTION_PURCHASE,
              send_email: sendEmail,
              qr_code: qrCode ?? undefined,
              customer: {
                first_name: customerName.trim().split(/\s+/)[0] || "",
                last_name:
                  customerName.trim().split(/\s+/).slice(1).join(" ") || "",
                email: customerEmail.trim(),
                phone: customerPhone.trim(),
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
          // Anything else proves no money moved, so the unpaid purchase must
          // not survive (web `forceDeletePurchase`).
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
        Alert.alert(
          "Purchase confirmed",
          `${money(total)} · ${selected.name}\n${
            sendEmail ? "Receipt sent to email." : "Email not sent per request."
          }`,
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }

      Alert.alert("Purchase created", `${money(total)} · ${selected.name}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Couldn't create purchase",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
      setIsProcessingPayment(false);
      submitLockRef.current = false;
    }
  };

  const paymentOptions: { key: PaymentMethod; label: string; icon: IconName }[] = [
    { key: "authorize.net", label: "Authorize.Net", icon: "credit-card" },
    { key: "in-store", label: "In-Store", icon: "dollar-sign" },
    { key: "paylater", label: "Pay Later", icon: "clock" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Off-screen QR, mounted only while a receipt QR is being generated. */}
      {qr.node}

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
              Create New Purchase
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Process on-site ticket purchases for customers
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
          

          {/* Select attraction */}
          <Section title="Select Attraction">
            {selected ? (
              <AttractionCard
                attraction={selected}
                selected
                onClear={() => setSelected(null)}
              />
            ) : (
              <>
                <View className="h-12 flex-row items-center rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 mb-4">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search attractions..."
                    placeholderTextColor="#9CA3AF"
                    className="ml-2 flex-1 text-base text-gray-900 dark:text-white"
                  />
                </View>
                {loadingAttractions ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : filteredAttractions.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
                    No active attractions found.
                  </Text>
                ) : (
                  <ScrollView
                    style={{ maxHeight: ATTRACTION_LIST_MAX_HEIGHT }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {filteredAttractions.map((a) => (
                      <AttractionCard
                        key={a.id}
                        attraction={a}
                        onPress={() => pickAttraction(a)}
                      />
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </Section>

          {/* Customer */}
          <Section title="Customer Information">
            <View className="mb-1">
              <InputField
                label={selectedCustomerId ? "Email  (Customer Found)" : "Email"}
                value={customerEmail}
                onChangeText={(t) => {
                  setCustomerEmail(t);
                  setSelectedCustomerId(null);
                }}
                onFocus={() => foundCustomers.length > 0 && setShowCustomerList(true)}
                placeholder="customer@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                rightAccessory={
                  searchingCustomer ? (
                    <ActivityIndicator size="small" color="#9CA3AF" />
                  ) : selectedCustomerId ? (
                    <Feather name="check-circle" size={18} color="#22C55E" />
                  ) : undefined
                }
              />
            </View>
            {showCustomerList && foundCustomers.length > 0 && (
              <View className="border border-gray-200 dark:border-neutral-700 rounded-2xl mb-3 overflow-hidden">
                {foundCustomers.slice(0, 5).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => selectCustomer(c)}
                    className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800"
                  >
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      {c.firstName} {c.lastName}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {c.email}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <InputField
              label="Customer Name"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Walk-in Customer"
              containerClassName="mb-4 mt-3"
            />
            <InputField
              label="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
            />
          </Section>

          {selected && (
            <>
              {/* Purchase details — quantity / discount / paid / notes, then
                  add-ons and the schedule, matching the web card. */}
              <Section icon="tag" title="Purchase Details">
                <FieldLabel>Quantity</FieldLabel>
                <View className="flex-row items-center gap-3 mb-4">
                  <Stepper value={quantity} onChange={setQuantity} min={1} />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {money(selected.price)} × {quantity} ={" "}
                    <Text className="font-semibold text-gray-800 dark:text-gray-200">
                      {money(subtotal)}
                    </Text>
                  </Text>
                </View>

                <InputField
                  label="Discount ($)"
                  value={discount}
                  onChangeText={setDiscount}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  containerClassName="mb-4"
                />

                <InputField
                  label={
                    paymentMethod === "paylater"
                      ? "Amount Paid  (Auto: $0.00)"
                      : "Amount Paid"
                  }
                  value={paymentMethod === "paylater" ? "0" : amountPaid}
                  onChangeText={setAmountPaid}
                  editable={paymentMethod !== "paylater"}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  containerClassName="mb-4"
                />

                <FieldLabel>Notes</FieldLabel>
                <View className="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3">
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional notes..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    className="min-h-[56px] text-base text-gray-900 dark:text-white"
                  />
                </View>

                {/* Add-ons */}
                {orderedAddOns.length > 0 && (
                  <View className="mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800">
                    <View className="flex-row items-center gap-2 mb-3">
                      <Feather name="tag" size={14} color="#6B7280" />
                      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Add-ons
                      </Text>
                    </View>
                    {orderedAddOns.map((addOn) => (
                      <View
                        key={addOn.id}
                        className="flex-row items-center gap-2.5 p-2 mb-2 rounded-lg bg-gray-50 dark:bg-neutral-800"
                      >
                        <Thumb
                          uri={mediaUrl(addOn.image)}
                          size={40}
                          placeholder="No Img"
                        />
                        <View className="flex-1">
                          <Text
                            className="text-xs font-medium text-gray-800 dark:text-gray-100"
                            numberOfLines={1}
                          >
                            {addOn.name}
                          </Text>
                          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
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
                  </View>
                )}

                {/* Schedule */}
                {selected.availability.length > 0 && (
                  <View className="mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Feather name="calendar" size={14} color="#6B7280" />
                      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Schedule <Text className="text-red-500">*</Text>
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      A visit date and time are required.
                    </Text>
                    <ScheduleCalendar
                      availability={selected.availability}
                      dayOffDates={dayOffAvailability.fullDayOffDates}
                      limitedDates={dayOffAvailability.partialDates}
                      scheduledDate={scheduledDate}
                      scheduledTime={scheduledTime}
                      availableTimeSlots={availableTimeSlots}
                      minDate={todayKey}
                      onDateSelect={setScheduledDate}
                      onTimeSelect={setScheduledTime}
                    />
                  </View>
                )}
              </Section>

              {/* Payment */}
              <Section icon="credit-card" title="Payment">
                <View className="flex-row gap-2 mb-4">
                  {paymentOptions.map((opt) => {
                    const active = paymentMethod === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          setPaymentMethod(opt.key);
                          setPaymentError("");
                          if (opt.key === "in-store") setAmountPaid(String(total));
                        }}
                        className={`flex-1 items-center justify-center gap-1 py-3 rounded-lg border ${
                          active
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
                        }`}
                      >
                        <Feather
                          name={opt.icon}
                          size={16}
                          color={active ? "#FFFFFF" : "#6B7280"}
                        />
                        <Text
                          className={`text-xs font-semibold ${
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
                  <View className="flex-row gap-2 rounded-lg border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-900/20 p-4">
                    <Feather name="info" size={16} color="#EA580C" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-orange-800 dark:text-orange-300">
                        Payment will be collected later
                      </Text>
                      <Text className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                        No payment is being processed now. Customer will pay at a
                        later time.
                      </Text>
                    </View>
                  </View>
                )}

                {paymentMethod === "authorize.net" && (
                  <View className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
                    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                      Card Details
                    </Text>

                    {/* Web parity: the "Authorize.Net Not Configured" modal,
                        inline here — cash and pay-later still work. */}
                    {authorizeUnavailable && (
                      <View className="mb-3 flex-row items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-2.5">
                        <Feather name="alert-triangle" size={13} color="#B45309" />
                        <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                          This location has no active Authorize.Net account, so
                          cards can&apos;t be charged. Use In-Store or Pay Later,
                          or ask an administrator to connect the merchant account.
                        </Text>
                      </View>
                    )}

                    <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Card Number
                    </Text>
                    <View
                      className={`h-12 flex-row items-center rounded-lg border px-3 bg-white dark:bg-neutral-900 ${
                        cardNumber && cardValid
                          ? "border-green-400"
                          : cardNumber
                            ? "border-red-400"
                            : "border-gray-300 dark:border-neutral-700"
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
                        className="flex-1 text-sm text-gray-900 dark:text-white"
                      />
                      {!!cardNumber && cardValid && (
                        <Feather name="check-circle" size={16} color="#16A34A" />
                      )}
                    </View>
                    {!!cardNumber && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {getCardType(cardNumber)}
                      </Text>
                    )}

                    <View className="flex-row gap-2 mt-3">
                      <View className="flex-1">
                        <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                          Month
                        </Text>
                        <SelectRow
                          icon="calendar"
                          value={cardMonth || null}
                          placeholder="MM"
                          onPress={() => setSheet("month")}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                          Year
                        </Text>
                        <SelectRow
                          icon="calendar"
                          value={cardYear || null}
                          placeholder="YYYY"
                          onPress={() => setSheet("year")}
                        />
                      </View>
                    </View>

                    <View className="mt-3">
                      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                        CVV
                      </Text>
                      <View className="h-12 flex-row items-center rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3">
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
                          editable={!isProcessingPayment}
                          className="flex-1 text-sm text-gray-900 dark:text-white"
                        />
                      </View>
                    </View>

                    {!!paymentError && (
                      <View className="mt-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-2">
                        <Text className="text-xs text-red-800 dark:text-red-300">
                          {paymentError}
                        </Text>
                      </View>
                    )}

                    <View className="flex-row items-center gap-2 mt-3">
                      <Feather name="lock" size={14} color="#9CA3AF" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Secure payment powered by Authorize.Net
                      </Text>
                    </View>
                  </View>
                )}
              </Section>
            </>
          )}

          {/* Order summary */}
          <Section title="Order Summary">
            {selected ? (
              <>
                <View className="flex-row items-start gap-3 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-neutral-800">
                  <Thumb uri={mediaUrl(selected.images[0])} size={56} placeholder="N/A" />
                  <View className="flex-1">
                    <View className="flex-row items-start justify-between gap-1">
                      <Text
                        className="flex-1 text-sm font-semibold text-gray-800 dark:text-white"
                        numberOfLines={1}
                      >
                        {selected.name}
                      </Text>
                      <Pressable
                        onPress={() => setSelected(null)}
                        hitSlop={8}
                        accessibilityLabel="Remove attraction"
                      >
                        <Feather name="x" size={14} color="#9CA3AF" />
                      </Pressable>
                    </View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {selected.category}
                    </Text>
                    <Text className="text-sm font-bold text-[#0644C7] dark:text-blue-400 mt-1">
                      {money(selected.price)}
                      <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        {" "}
                        {pricingSuffix(selected.pricingType)}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Qty: {quantity} × {money(selected.price)}
                  </Text>
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {money(subtotal)}
                  </Text>
                </View>

                {orderedAddOns
                  .filter((a) => (addonQty[a.id] ?? 0) > 0)
                  .map((a) => (
                    <View key={a.id} className="flex-row justify-between mb-2">
                      <Text
                        className="flex-1 mr-2 text-sm text-gray-500 dark:text-gray-400"
                        numberOfLines={1}
                      >
                        {a.name} × {addonQty[a.id]}
                      </Text>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {money(a.price * (addonQty[a.id] ?? 0))}
                      </Text>
                    </View>
                  ))}

                {discountNum > 0 && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-sm text-red-500">Discount</Text>
                    <Text className="text-sm font-medium text-red-500">
                      -{money(discountNum)}
                    </Text>
                  </View>
                )}

                {specialPricing?.has_special_pricing &&
                  specialPricing.discounts_applied.map((d, i) => (
                    <View key={i} className="flex-row justify-between mb-2">
                      <Text
                        className="flex-1 mr-2 text-sm text-green-700 dark:text-green-400"
                        numberOfLines={1}
                      >
                        {d.name}
                      </Text>
                      <Text className="text-sm font-medium text-green-700 dark:text-green-400">
                        -{money(d.discount_amount)}
                      </Text>
                    </View>
                  ))}

                {feeBreakdown?.fees.map((f) => (
                  <View
                    key={f.fee_support_id}
                    className="flex-row justify-between mb-2"
                  >
                    <Text
                      className="flex-1 mr-2 text-sm text-gray-500 dark:text-gray-400"
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
                  <Text className="text-lg font-bold text-gray-900 dark:text-white">
                    Total
                  </Text>
                  <Text className="text-lg font-bold text-gray-900 dark:text-white">
                    {money(total)}
                  </Text>
                </View>
                {paymentMethod === "paylater" && (
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                      Amount Due Now
                    </Text>
                    <Text className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                      $0.00
                    </Text>
                  </View>
                )}

                <View className="mt-4 mb-4">
                  <CheckboxRow
                    checked={sendEmail}
                    onToggle={() => setSendEmail((v) => !v)}
                    label={
                      <View className="flex-row items-center gap-1.5">
                        <Feather name="mail" size={14} color="#9CA3AF" />
                        <Text className="text-sm text-gray-700 dark:text-gray-200">
                          Send email receipt
                        </Text>
                      </View>
                    }
                  />
                </View>

                <Pressable
                  onPress={handleSubmit}
                  disabled={submitDisabled}
                  className={`h-14 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] ${
                    submitDisabled ? "opacity-50" : "active:opacity-90"
                  }`}
                >
                  {submitting || isProcessingPayment ? (
                    <>
                      <ActivityIndicator color="#FFFFFF" />
                      <Text className="text-base font-semibold text-white">
                        Processing...
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="shopping-cart" size={18} color="#FFFFFF" />
                      <Text className="text-base font-semibold text-white">
                        Complete Purchase
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <View className="items-center py-8">
                <Feather name="shopping-cart" size={44} color="#D1D5DB" />
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Select an attraction to begin
                </Text>
              </View>
            )}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Card expiry pickers */}
      <BottomSheet
        visible={sheet === "month" || sheet === "year"}
        onClose={() => setSheet(null)}
        title={sheet === "year" ? "Expiry Year" : "Expiry Month"}
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {(sheet === "year" ? cardYears() : CARD_MONTHS).map((option) => {
            const isSelected =
              sheet === "year" ? cardYear === option : cardMonth === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  if (sheet === "year") setCardYear(option);
                  else setCardMonth(option);
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
                  {option}
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

export default CreatePurchaseScreen;
