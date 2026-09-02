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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { CallToBookCard } from "../../components/ui/CallToBookCard";
import { CallToBookSheet } from "../../components/ui/CallToBookSheet";
import { EmailSuggestions } from "../../components/ui/EmailSuggestions";
import { InputField } from "../../components/ui/InputField";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { eventIsCallToBook } from "../../lib/callToBook";
import { markEventPurchasesStale } from "../../lib/hooks/useEventPurchases";
import { useOnsitePricing } from "../../lib/hooks/useOnsitePricing";
import { useVenuePhone } from "../../lib/hooks/useVenuePhone";
import {
  CARD_MONTHS,
  cardYears,
  formatCardNumber,
  getCardType,
  getPaymentErrorMessage,
  isTestCardNumber,
  validateCardNumber,
} from "../../lib/payments/cardUtils";
import { rollbackEventPurchase } from "../../lib/payments/rollback";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  clampAddOnQuantity,
  DEFAULT_MAX_QUANTITY,
} from "../../lib/addOnQuantity";
import { clampAmount, clampAmountText } from "../../lib/orderAmounts";
import {
  clampToRemaining,
  isLowRemaining,
  isSoldOut,
  quantityCeiling,
} from "../../lib/ticketLimits";
import {
  createEventPurchase,
  type CreateEventPurchaseInput,
} from "../../services/eventPurchasesService";
import {
  CHARGE_UNKNOWN_MESSAGE,
  chargeOutcomeUnknown,
  declineMessage,
  fetchAuthorizeNetPublicKey,
  PAYMENT_TYPE,
  processCardPayment,
  type AuthorizeNetPublicKey,
} from "../../services/paymentsService";
import {
  fetchEventAvailableDates,
  fetchEventAvailableTimeSlots,
  fetchEvents,
  type EventRow,
} from "../../services/eventsService";
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

type PaymentMethod = "authorize.net" | "in-store" | "paylater";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTime(value: string): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  let hour = Number(h);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m ?? "00"} ${meridian}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Every date in an event's window (one day for one_time, the full range
 *  otherwise), capped so the picker stays reasonable. */
function eventDateOptions(event: EventRow): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const start = new Date(`${(event.startDate || "").substring(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime())) return out;
  if (event.dateType !== "date_range" || !event.endDate) {
    const v = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    return [{ value: v, label: formatDateLabel(v) }];
  }
  const end = new Date(`${event.endDate.substring(0, 10)}T00:00:00`);
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 366) {
    const v = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    out.push({ value: v, label: formatDateLabel(v) });
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return out;
}

/** Time slots between the event's start and end, stepped by its interval. */
function eventTimeSlots(event: EventRow): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
  };
  const startMin = toMin(event.timeStart || "09:00");
  const endMin = toMin(event.timeEnd || "17:00");
  const step = event.intervalMinutes > 0 ? event.intervalMinutes : 60;
  const out: string[] = [];
  let guard = 0;
  for (let m = startMin; m <= endMin && guard < 200; m += step, guard++) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out.length > 0 ? out : [event.timeStart || "09:00"];
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
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="h-14 flex-row items-center gap-3 rounded-lg border bg-white dark:bg-neutral-900 px-5 border-gray-200 dark:border-neutral-700"
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

const CreateEventPurchaseScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  // Location (company admins) — options from dashboard metrics locationStats.
  // Default to "All Locations" (null), like the web, so every location's
  // events are available until one is chosen.
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Event catalog (active, location-scoped).
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;
    let active = true;
    setLoadingEvents(true);
    fetchEvents({
      token,
      userId: user.id,
      locationId: selectedLocationId ?? undefined,
    })
      .then((rows) => {
        if (active) setEvents(rows.filter((e) => e.status === "active"));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingEvents(false);
      });
    return () => {
      active = false;
    };
  }, [selectedLocationId, user?.id]);

  // Purchase details.
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseTime, setPurchaseTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in-store");
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
  /** This event's location has no active merchant account (web's
   *  "Authorize.Net Not Configured" modal). */
  const [authorizeUnavailable, setAuthorizeUnavailable] = useState(false);

  // Bookable dates/slots come from the backend (same endpoints as the web); the
  // client-side schedule derivation is only a fallback if those calls fail.
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  /**
   * Tickets left per slot, or null when the event has no `max_tickets_per_slot`.
   * A slot that is already full is dropped from `time_slots` server-side, so a
   * sold-out time is simply not offered (the web behaves the same way).
   */
  const [slotsLeft, setSlotsLeft] = useState<Record<string, number> | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const loadTimeSlots = async (event: EventRow, date: string) => {
    const token = getToken();
    if (!token) return;
    setLoadingSlots(true);
    setPurchaseTime("");
    try {
      const { slots, remainingTickets } = await fetchEventAvailableTimeSlots({
        token,
        eventId: event.id,
        date,
      });
      setTimeSlots(slots.length > 0 ? slots : eventTimeSlots(event));
      // Counts only make sense against the API's own slot list; if we had to
      // fall back to the event's raw schedule there is nothing to count.
      setSlotsLeft(slots.length > 0 ? remainingTickets : null);
    } catch {
      setTimeSlots(eventTimeSlots(event));
      setSlotsLeft(null);
    } finally {
      setLoadingSlots(false);
    }
  };

  const loadAvailableDates = async (event: EventRow) => {
    const token = getToken();
    if (!token) return;
    setLoadingDates(true);
    try {
      const fetched = await fetchEventAvailableDates({ token, eventId: event.id });
      const dates =
        fetched.length > 0
          ? fetched
          : eventDateOptions(event).map((d) => d.value);
      setAvailableDates(dates);
      // The web auto-selects the date for a single-date one-time event.
      if (event.dateType === "one_time" && dates.length === 1) {
        setPurchaseDate(dates[0]);
        await loadTimeSlots(event, dates[0]);
      }
    } catch {
      setAvailableDates(eventDateOptions(event).map((d) => d.value));
    } finally {
      setLoadingDates(false);
    }
  };

  // Customer (email search-as-you-type).
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [foundCustomers, setFoundCustomers] = useState<CustomerHit[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<
    null | "location" | "date" | "time" | "month" | "year"
  >(null);
  const submitLockRef = useRef(false);
  /** Web parity (`lastSubmitTimeRef`): 3s cooldown, so a double-tap can never
   *  produce a second card charge. */
  const lastSubmitAtRef = useRef(0);

  // Accept.js credentials for the event's location — fetched as soon as the
  // card method is active, exactly like the web `initializeAuthorizeNet`.
  const cardLocationId = selected?.locationId ?? selectedLocationId;

  /**
   * Call to Book: an event missing either end of its daily window has no slots
   * to pick, so this venue books it by phone. Evaluated against the selected
   * event at its own location — never a company-wide flag.
   */
  const callToBook = useMemo(
    () => !!selected && eventIsCallToBook(selected),
    [selected],
  );
  const { name: venueName, phone: venuePhone } = useVenuePhone(cardLocationId);
  const [callToBookOpen, setCallToBookOpen] = useState(false);
  useEffect(() => {
    if (paymentMethod !== "authorize.net" || cardLocationId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchAuthorizeNetPublicKey(token, cardLocationId, controller.signal)
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
  }, [paymentMethod, cardLocationId]);

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

  const selectCustomer = (c: CustomerHit) => {
    setSelectedCustomerId(c.id);
    setCustomerEmail(c.email);
    setCustomerName(`${c.firstName} ${c.lastName}`.trim());
    setCustomerPhone(c.phone ?? "");
    setShowCustomerList(false);
  };

  const pickEvent = (e: EventRow) => {
    setSelected(e);
    setQuantity(1);
    setDiscount("");
    setAmountPaid("");
    setAddonQty({});
    setSearch("");
    setPurchaseDate("");
    setPurchaseTime("");
    setTimeSlots([]);
    setSlotsLeft(null);
    setAvailableDates([]);
    // Load the bookable dates from the backend (auto-selects for one-time events).
    loadAvailableDates(e);
  };

  // Ordered add-ons for the selected event (respecting addOnsOrder by id).
  const orderedAddOns = useMemo(() => {
    if (!selected) return [];
    const order = selected.addOnsOrder ?? [];
    return [...selected.addOns].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [selected]);

  const dateOptions = useMemo(
    () => availableDates.map((v) => ({ value: v, label: formatDateLabel(v) })),
    [availableDates],
  );
  const timeOptions = timeSlots;
  /** Tickets left for the picked slot, or null when the event is uncapped. */
  const slotLeft = purchaseTime ? (slotsLeft?.[purchaseTime] ?? null) : null;
  const quantityMax = quantityCeiling(slotLeft, 99);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term),
    );
  }, [events, search]);

  // Totals — same math as the web: base (subtotal + add-ons − manual discount),
  // then server-side fees applied and special-pricing discounts subtracted.
  // The hook bounds the typed discount, so `discountNum` is the effective one —
  // never negative, never more than the order is worth.
  const {
    subtotal,
    discountCeiling,
    discountNum,
    total,
    specialPricingDiscount,
    feeBreakdown,
    appliedFees,
    appliedDiscounts,
  } = useOnsitePricing({
    entity: selected,
    entityType: "event",
    quantity,
    addonQty,
    discountNum: Number(discount) || 0,
    purchaseDate,
    purchaseTime,
  });

  const cardValid = validateCardNumber(cardNumber);
  const cardIncomplete =
    !cardNumber || !cardMonth || !cardYear || !cardCVV || !cardValid;
  const submitDisabled =
    submitting ||
    isProcessingPayment ||
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

  const dateLabel = dateOptions.find((d) => d.value === purchaseDate)?.label ?? null;

  const locationName =
    selectedLocationId == null
      ? "All Locations"
      : (locationOptions.find((l) => l.id === selectedLocationId)?.name ??
        user?.location?.name ??
        null);

  /**
   * Apply an add-on quantity, clamped to its own min/max. Event add-ons are
   * never "forced" — that flag is scoped to packages — so no package is passed.
   */
  const setAddon = (id: number, n: number) => {
    const addOn = orderedAddOns.find((a) => a.id === id);
    setAddonQty((prev) => ({
      ...prev,
      [id]: clampAddOnQuantity(addOn, null, prev[id] ?? 0, n),
    }));
  };

  const handleSubmit = async () => {
    if (!selected) {
      Alert.alert("Select an event", "Choose an event to purchase tickets for.");
      return;
    }
    // The purchase belongs to the event's own location (the web uses
    // `selectedEvent.location_id`), so "All Locations" still submits fine.
    const effectiveLocationId = selected.locationId ?? selectedLocationId;
    if (effectiveLocationId == null) {
      Alert.alert("Location unavailable", "This event has no location set.");
      return;
    }
    if (!purchaseDate || !purchaseTime) {
      Alert.alert(
        "Select a date & time",
        "An event date and time slot are required before purchasing.",
      );
      return;
    }
    // Web requires a guest name unless an existing customer is selected.
    if (!customerName.trim() && !selectedCustomerId) {
      Alert.alert(
        "Customer required",
        "Enter a guest name or select an existing customer.",
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

    const addOnsPayload = Object.entries(addonQty)
      .filter(([, qty]) => qty > 0)
      .map(([idStr, qty]) => {
        const addOn = selected.addOns.find((a) => a.id === Number(idStr));
        return addOn
          ? { add_on_id: addOn.id, quantity: qty, price_at_purchase: addOn.price }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const isPayLater = paymentMethod === "paylater";
    // Web parity: the card leg pays the full total and the record starts unpaid
    // — the charge endpoint marks it paid once the gateway approves.
    // A cash amount is bounded by the order total, so an over-typed figure can
    // never be recorded as paid.
    const typedPaid = clampAmount(amountPaid, total);
    const paid = isPayLater || isCardPayment
      ? 0
      : typedPaid > 0
        ? typedPaid
        : total;

    const input: CreateEventPurchaseInput = {
      event_id: selected.id,
      customer_id: selectedCustomerId ?? undefined,
      guest_name: customerName.trim() || "Walk-in Customer",
      guest_email: customerEmail.trim() || undefined,
      guest_phone: customerPhone.trim() || undefined,
      location_id: effectiveLocationId,
      purchase_date: purchaseDate,
      purchase_time: purchaseTime,
      quantity,
      total_amount: total,
      amount_paid: paid,
      // Web sends the special-pricing discount here (the manual discount is
      // already folded into total_amount via the base price).
      discount_amount: specialPricingDiscount > 0 ? specialPricingDiscount : undefined,
      payment_method: paymentMethod,
      payment_status:
        isPayLater || isCardPayment
          ? "pending"
          : paid >= total
            ? "paid"
            : "partial",
      ...(paymentMethod === "in-store" ? { status: "confirmed" as const } : {}),
      notes:
        notes.trim() ||
        `Event Purchase: ${selected.name} (${quantity} ticket${quantity > 1 ? "s" : ""})`,
      send_email: paymentMethod === "in-store" ? sendEmail : false,
      add_ons: addOnsPayload.length > 0 ? addOnsPayload : undefined,
      applied_fees: appliedFees.length > 0 ? appliedFees : undefined,
      applied_discounts: appliedDiscounts.length > 0 ? appliedDiscounts : undefined,
    };

    submitLockRef.current = true;
    setSubmitting(true);
    setIsProcessingPayment(isCardPayment);
    try {
      // Web order: create the purchase (unpaid) first so the charge has a
      // payable to link to, then charge the card.
      const { id: purchaseId } = await createEventPurchase(token, input);
      markEventPurchasesStale();

      if (isCardPayment) {
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
              order_id: `E${selected.id}-${String(Date.now()).slice(-8)}`,
              description: `Event Purchase: ${selected.name}`,
              customer_id: selectedCustomerId ?? undefined,
              payable_id: purchaseId,
              payable_type: PAYMENT_TYPE.EVENT_PURCHASE,
              send_email: sendEmail,
              // The web event flow sends no QR here — the ticket QR is built
              // from the purchase's reference number on the details screen.
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
          await rollbackEventPurchase(token, purchaseId);
          setPaymentError(getPaymentErrorMessage(payErr));
          Alert.alert(
            "Payment failed",
            `${getPaymentErrorMessage(payErr)}\n\nThe purchase has been cancelled and no charges were made.`,
          );
          return;
        }

        if (!response.success) {
          await rollbackEventPurchase(token, purchaseId);
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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">New Purchase</Text>
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
          {/* Location */}
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

          {/* Select event */}
          <Section icon="calendar" title="Select Event">
            {selected ? (
              <View className="flex-row items-center gap-3 border border-[#0644C7]/40 bg-[#0644C7]/5 rounded-2xl p-3">
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900 dark:text-white">
                    {selected.name}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatTime(selected.timeStart)} – {formatTime(selected.timeEnd)}
                  </Text>
                  <Text className="text-sm font-bold text-[#0644C7] mt-1">
                    {money(selected.price)}
                    <Text className="text-xs font-normal text-gray-400"> /ticket</Text>
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                  <Feather name="x" size={20} color="#9CA3AF" />
                </Pressable>
              </View>
            ) : (
              <>
                <View className="h-12 flex-row items-center rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 mb-3">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search events..."
                    placeholderTextColor="#9CA3AF"
                    className="ml-2 flex-1 text-base text-gray-900 dark:text-white"
                  />
                </View>
                {loadingEvents ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : filteredEvents.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
                    No active events found.
                  </Text>
                ) : (
                  filteredEvents.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => pickEvent(e)}
                      className="flex-row items-center gap-3 border border-gray-100 dark:border-neutral-800 rounded-2xl p-3 mb-2"
                    >
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 dark:text-white">
                          {e.name}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {formatTime(e.timeStart)} – {formatTime(e.timeEnd)}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-[#0644C7]">{money(e.price)}</Text>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </Pressable>
                  ))
                )}
              </>
            )}
          </Section>

          {/* Customer */}
          <Section icon="user" title="Customer Information">
            <View className="mb-1">
              <InputField
                label="Email"
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
              <EmailSuggestions
                value={customerEmail}
                onSelect={(email) => {
                  setCustomerEmail(email);
                  setSelectedCustomerId(null);
                }}
                suppressed={showCustomerList && foundCustomers.length > 0}
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
                    <Text className="text-xs text-gray-500 dark:text-gray-400">{c.email}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <InputField
              label="Customer Name"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Walk-in Customer"
              editable={!selectedCustomerId}
              containerClassName="mb-4 mt-3"
            />
            <InputField
              label="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              editable={!selectedCustomerId}
            />
            {selectedCustomerId ? (
              <Pressable
                onPress={() => {
                  setSelectedCustomerId(null);
                  setCustomerEmail("");
                  setCustomerName("");
                  setCustomerPhone("");
                  setFoundCustomers([]);
                  setShowCustomerList(false);
                }}
                className="mt-3 self-start"
                hitSlop={8}
              >
                <Text className="text-sm font-semibold text-[#0644C7]">
                  Clear Customer
                </Text>
              </Pressable>
            ) : null}
          </Section>

          {selected && (
            <>
              {/* Purchase details */}
              <Section icon="tag" title="Purchase Details">
                <View className="flex-row items-center justify-between mb-4">
                  <FieldLabel>Tickets</FieldLabel>
                  <Stepper
                    value={quantity}
                    onChange={setQuantity}
                    min={1}
                    max={quantityMax}
                  />
                </View>
                <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-1">
                  {money(selected.price)} × {quantity} ={" "}
                  <Text className="font-semibold text-gray-600 dark:text-gray-300">
                    {money(subtotal)}
                  </Text>
                </Text>
                {/* Live cap for the picked slot — the "+" above stops here. */}
                {slotLeft != null ? (
                  <Text
                    className={`mb-4 text-[11px] font-semibold ${
                      isLowRemaining(slotLeft)
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {slotLeft} ticket{slotLeft === 1 ? "" : "s"} left for this
                    time
                  </Text>
                ) : (
                  <View className="mb-4" />
                )}

                <InputField
                  label="Discount ($)"
                  value={discount}
                  onChangeText={setDiscount}
                  onBlur={() =>
                    setDiscount(clampAmountText(discount, discountCeiling))
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  containerClassName="mb-4"
                />

                <InputField
                  label="Amount Paid"
                  value={paymentMethod === "paylater" ? "0" : amountPaid}
                  onChangeText={setAmountPaid}
                  onBlur={() =>
                    setAmountPaid(
                      amountPaid.trim()
                        ? clampAmountText(amountPaid, total)
                        : "",
                    )
                  }
                  editable={paymentMethod !== "paylater"}
                  placeholder={money(total)}
                  keyboardType="decimal-pad"
                  containerClassName="mb-4"
                />

                <FieldLabel>Notes</FieldLabel>
                <View className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3">
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional notes..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    className="min-h-[64px] text-base text-gray-900 dark:text-white"
                  />
                </View>
              </Section>

              {/* Add-ons */}
              {orderedAddOns.length > 0 && (
                <Section icon="plus-circle" title="Add-ons">
                  {orderedAddOns.map((addOn) => (
                    <View
                      key={addOn.id}
                      className="flex-row items-center gap-3 py-2.5 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">
                          {addOn.name}
                        </Text>
                        <Text className="text-xs text-gray-400">
                          {money(addOn.price)} each
                          {addOn.minQuantity > 1 ? ` · min ${addOn.minQuantity}` : ""}
                        </Text>
                      </View>
                      <Stepper
                        value={addonQty[addOn.id] ?? 0}
                        onChange={(n) => setAddon(addOn.id, n)}
                        min={0}
                        max={addOn.maxQuantity || DEFAULT_MAX_QUANTITY}
                      />
                    </View>
                  ))}
                </Section>
              )}

              {/* Schedule — or, for an event with no start/end time, the Call
                  to Book card in its place. */}
              {callToBook ? (
                <CallToBookCard
                  venueName={venueName}
                  venuePhone={venuePhone}
                  itemLabel="event"
                  onRequestCall={() => setCallToBookOpen(true)}
                />
              ) : (
              <Section icon="calendar" title="Event Date & Slot">
                <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-3">
                  Pick a date and time slot within the events schedule.
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FieldLabel>Date</FieldLabel>
                    <SelectRow
                      icon="calendar"
                      value={loadingDates ? "Loading dates…" : dateLabel}
                      placeholder="Select date"
                      onPress={() => setSheet("date")}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel>Time</FieldLabel>
                    <SelectRow
                      icon="clock"
                      value={
                        loadingSlots
                          ? "Loading slots…"
                          : purchaseTime
                            ? slotLeft != null
                              ? `${formatTime(purchaseTime)} — ${slotLeft} left`
                              : formatTime(purchaseTime)
                            : null
                      }
                      placeholder="Select time"
                      onPress={() => setSheet("time")}
                    />
                  </View>
                </View>
                {!loadingSlots && purchaseDate && timeOptions.length === 0 ? (
                  <Text className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    No available time slots for this date.
                  </Text>
                ) : null}
              </Section>
              )}

              {/* Payment — nothing is taken online for a Call to Book event. */}
              {callToBook ? null : (
              <Section icon="credit-card" title="Payment">
                <View className="flex-row gap-2">
                  {(
                    [
                      { key: "authorize.net", label: "Authorize.Net", icon: "credit-card" },
                      { key: "in-store", label: "In-Store", icon: "dollar-sign" },
                      { key: "paylater", label: "Pay Later", icon: "clock" },
                    ] as const
                  ).map((opt) => {
                    const active = paymentMethod === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          setPaymentMethod(opt.key);
                          setPaymentError("");
                          // Clear the override so Amount Paid defaults to the
                          // live total (which updates as fees/discounts load).
                          setAmountPaid("");
                        }}
                        className={`flex-1 items-center justify-center gap-1 py-3 rounded-2xl border ${
                          active
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Feather name={opt.icon} size={16} color={active ? "#FFFFFF" : "#6B7280"} />
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
                  <View className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3">
                    <Text className="text-xs text-amber-800 dark:text-amber-300">
                      No payment is collected now. The customer will pay later.
                    </Text>
                  </View>
                )}

                {paymentMethod === "authorize.net" && (
                  <View className="mt-3 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
                    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                      Card Details
                    </Text>

                    {/* Web parity: the "Authorize.Net Not Configured" modal. */}
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

                    <FieldLabel>Card Number</FieldLabel>
                    <View
                      className={`h-12 flex-row items-center rounded-xl border px-3 bg-white dark:bg-neutral-900 ${
                        cardNumber && cardValid
                          ? "border-green-400"
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
                        <FieldLabel>Month</FieldLabel>
                        <SelectRow
                          icon="calendar"
                          value={cardMonth || null}
                          placeholder="MM"
                          onPress={() => setSheet("month")}
                        />
                      </View>
                      <View className="flex-1">
                        <FieldLabel>Year</FieldLabel>
                        <SelectRow
                          icon="calendar"
                          value={cardYear || null}
                          placeholder="YYYY"
                          onPress={() => setSheet("year")}
                        />
                      </View>
                    </View>

                    <View className="mt-3">
                      <FieldLabel>CVV</FieldLabel>
                      <View className="h-12 justify-center rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3">
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
                          className="text-sm text-gray-900 dark:text-white"
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
              )}

            </>
          )}

          {/* Order summary — always mounted so the empty state reads like the
              web's "Select an event to begin" placeholder card. */}
          <Section icon="file-text" title="Order Summary">
            {!selected ? (
              <View className="items-center py-8">
                <Feather name="shopping-cart" size={44} color="#D1D5DB" />
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Select an event to begin
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {quantity} × {money(selected.price)}
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
                {discountNum > 0 && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-sm text-red-500">Discount</Text>
                    <Text className="text-sm font-medium text-red-500">-{money(discountNum)}</Text>
                  </View>
                )}
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
                  <View key={f.fee_support_id} className="flex-row justify-between mb-2">
                    <Text
                      className="text-sm text-gray-500 dark:text-gray-400 flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {f.fee_label || f.fee_name}
                      {f.fee_application_type === "inclusive" ? " (incl.)" : ""}
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

                <View className="flex-row items-center justify-between mt-4">
                  <Text className="text-sm text-gray-700 dark:text-gray-200">Send email receipt</Text>
                  <Switch
                    value={sendEmail}
                    onValueChange={setSendEmail}
                    trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </>
            )}
          </Section>

          {/* Actions — no purchase action for a Call to Book event; the venue
              takes it on the phone. */}
          {selected && !callToBook && (
            <View className="flex-row gap-3 mt-1">
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
                disabled={submitDisabled}
                className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] ${
                  submitDisabled ? "opacity-70" : "active:opacity-90"
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-base font-semibold text-white">Complete Purchase</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Location picker */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: null as number | null, name: "All Locations" }, ...locationOptions].map((loc) => {
            const isSelected = selectedLocationId === loc.id;
            return (
              <Pressable
                key={String(loc.id)}
                onPress={() => {
                  setSelectedLocationId(loc.id);
                  setSelected(null);
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

      {/* Date picker */}
      <BottomSheet visible={sheet === "date"} onClose={() => setSheet(null)} title="Select Date">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {dateOptions.map((d) => {
            const isSelected = purchaseDate === d.value;
            return (
              <Pressable
                key={d.value}
                onPress={() => {
                  setPurchaseDate(d.value);
                  setSheet(null);
                  if (selected) loadTimeSlots(selected, d.value);
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

      {/* Time picker — each slot carries its live ticket count, like the web's
          "10:00 AM — 8 left" option labels. */}
      <BottomSheet visible={sheet === "time"} onClose={() => setSheet(null)} title="Select Time">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {timeOptions.map((t) => {
            const isSelected = purchaseTime === t;
            const left = slotsLeft?.[t] ?? null;
            const soldOut = isSoldOut(left);
            return (
              <Pressable
                key={t}
                onPress={() => {
                  setPurchaseTime(t);
                  setQuantity((prev) => clampToRemaining(prev, left));
                  setSheet(null);
                }}
                disabled={soldOut}
                accessibilityState={{ disabled: soldOut }}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
                  soldOut
                    ? "opacity-50"
                    : isSelected
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                }`}
              >
                <View className="flex-row items-baseline gap-2">
                  <Text
                    className={`text-base font-medium ${
                      soldOut
                        ? "text-gray-400 dark:text-gray-500"
                        : isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {formatTime(t)}
                  </Text>
                  {left != null && (
                    <Text
                      className={`text-xs font-semibold ${
                        soldOut
                          ? "text-red-600 dark:text-red-400"
                          : isLowRemaining(left)
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {soldOut ? "— Sold out" : `— ${left} left`}
                    </Text>
                  )}
                </View>
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Card expiry pickers — the mobile stand-in for the web's MM / YYYY
          selects, so the same values reach Accept tokenization. */}
      <BottomSheet
        visible={sheet === "month"}
        onClose={() => setSheet(null)}
        title="Expiration Month"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {CARD_MONTHS.map((m) => {
            const isSelected = cardMonth === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setCardMonth(m);
                  setPaymentError("");
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
                  {m}
                </Text>
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={sheet === "year"}
        onClose={() => setSheet(null)}
        title="Expiration Year"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {cardYears().map((y) => {
            const isSelected = cardYear === y;
            return (
              <Pressable
                key={y}
                onPress={() => {
                  setCardYear(y);
                  setPaymentError("");
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
                  {y}
                </Text>
                {isSelected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <CallToBookSheet
        visible={callToBookOpen}
        onClose={() => setCallToBookOpen(false)}
        locationId={cardLocationId ?? null}
        venueName={venueName}
        venuePhone={venuePhone}
        entityType="event"
        entityId={selected?.id ?? null}
        entityName={selected?.name ?? null}
        initialName={customerName}
        initialPhone={customerPhone}
        initialEmail={customerEmail}
      />
    </View>
  );
};

export default CreateEventPurchaseScreen;
