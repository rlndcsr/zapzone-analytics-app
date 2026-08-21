import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FieldLabel, SelectField } from "../../components/ui/FormControls";
import { InputField } from "../../components/ui/InputField";
import { ScheduleCalendar } from "../../components/ui/ScheduleCalendar";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { eventFullDayOffDatesFor } from "../../lib/attractions/dayOffAvailability";
import { WEEKDAY_NAMES_LOWER, formatFullDate } from "../../lib/date/calendar";
import { markEventPurchasesStale } from "../../lib/hooks/useEventPurchases";
import { getToken } from "../../lib/session";
import { fetchDayOffsByLocation } from "../../services/dayOffsService";
import {
  fetchEventPurchaseForEdit,
  updateEventPurchase,
  type EditableEventPaymentStatus,
  type EventPaymentMethod,
  type EventPurchaseAddonInput,
  type EventPurchaseEditRecord,
  type EventPurchaseStatus,
  type UpdateEventOrderLineInput,
  type UpdateEventPurchaseInput,
} from "../../services/eventPurchasesService";
import {
  fetchEventAvailableDates,
  fetchEventAvailableTimeSlots,
  fetchEventDetail,
  type EventRow,
} from "../../services/eventsService";
import { metricsCacheService } from "../../services/metricsCacheService";
import type {
  AppliedDiscount,
  AppliedFee,
} from "../../services/pricingService";

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

/** The web form's `parseFloat(value) || 0` on every money input. */
const num = (v: string) => parseFloat(v) || 0;

const STATUS_OPTIONS: { label: string; value: EventPurchaseStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const PAYMENT_STATUS_OPTIONS: {
  label: string;
  value: EditableEventPaymentStatus;
}[] = [
  { label: "Paid", value: "paid" },
  { label: "Partial", value: "partial" },
  { label: "Pending", value: "pending" },
];

const PAYMENT_METHOD_OPTIONS: { label: string; value: EventPaymentMethod }[] = [
  { label: "In-Store", value: "in-store" },
  { label: "Authorize.Net", value: "authorize.net" },
  { label: "Card", value: "card" },
  { label: "Pay Later", value: "paylater" },
];

/** Status pill palette, mirroring the web `statusConfig`. */
const STATUS_PILL: Record<EventPurchaseStatus, { bg: string; fg: string }> = {
  pending: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    fg: "text-yellow-800 dark:text-yellow-300",
  },
  confirmed: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    fg: "text-blue-800 dark:text-blue-300",
  },
  "checked-in": {
    bg: "bg-green-100 dark:bg-green-900/30",
    fg: "text-green-800 dark:text-green-300",
  },
  completed: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    fg: "text-emerald-800 dark:text-emerald-300",
  },
  cancelled: {
    bg: "bg-red-100 dark:bg-red-900/30",
    fg: "text-red-800 dark:text-red-300",
  },
};

const statusLabel = (s: EventPurchaseStatus) =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

const pillFor = (s: EventPurchaseStatus) =>
  STATUS_PILL[s] ?? {
    bg: "bg-gray-100 dark:bg-neutral-800",
    fg: "text-gray-800 dark:text-gray-200",
  };

/** "18:30" -> "6:30 PM" (the summary's `toLocaleTimeString` output). */
const formatTime12Hour = (time: string): string => {
  const [h, m] = time.split(":");
  const hours = Number(h);
  return `${hours % 12 || 12}:${m ?? "00"} ${hours >= 12 ? "PM" : "AM"}`;
};

/** Where "Cancel" / the back arrow returns to, for the not-found copy. */
const backLabelFor = (from?: string) => {
  switch (from) {
    case "notifications":
      return "Notifications";
    case "dashboard":
      return "Dashboard";
    case "payments":
      return "Payments";
    case "details":
      return "Purchase Details";
    case "order":
      return "Order Details";
    default:
      return "Event Purchases";
  }
};

/** Add-on as the editor needs it (event catalog or a line already purchased). */
type EditableAddOn = {
  id: number;
  name: string;
  price: number;
  maxQuantity: number;
};

/** Editable fee line — amounts stay strings while typing (web `type=number`). */
type FeeDraft = {
  fee_name: string;
  fee_amount: string;
  fee_application_type: "additive" | "inclusive";
};

type DiscountDraft = {
  discount_name: string;
  discount_amount: string;
  discount_type: "fixed" | "percentage";
  original_price: string;
  special_pricing_id: number | null;
};

const Section = ({
  icon,
  title,
  children,
  locked,
}: {
  icon?: IconName;
  title: string;
  children: React.ReactNode;
  /** Managed on the bulk order instead — shown, but not editable. */
  locked?: boolean;
}) => (
  <View
    pointerEvents={locked ? "none" : "auto"}
    className={`bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm ${locked ? "opacity-50" : ""}`}
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

/** Compact money input with a leading "$", used by the fee/discount rows. */
const MoneyInput = ({
  value,
  onChangeText,
  placeholder = "0.00",
  prefix = "$",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}) => (
  <View className="flex-row items-center rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-3">
    <Text className="text-sm text-gray-400 mr-1.5">{prefix}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType="decimal-pad"
      className="flex-1 py-0 text-sm text-gray-900 dark:text-white"
    />
  </View>
);

/** +/- stepper around a typed value (the web's Minus / input / Plus trio). */
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
      accessibilityRole="button"
      accessibilityLabel="Decrease"
      className={`w-9 h-9 rounded-full items-center justify-center border ${
        value <= min
          ? "border-gray-200 dark:border-neutral-800"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      <Feather name="minus" size={16} color={value <= min ? "#D1D5DB" : "#374151"} />
    </Pressable>
    <Text className="w-8 text-center text-base font-bold text-gray-900 dark:text-white">
      {value}
    </Text>
    <Pressable
      onPress={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      accessibilityRole="button"
      accessibilityLabel="Increase"
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

const SummaryRow = ({
  label,
  value,
  labelClass = "text-sm text-gray-500 dark:text-gray-400",
  valueClass = "text-sm font-medium text-gray-900 dark:text-white",
}: {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}) => (
  <View className="flex-row justify-between items-center mb-2">
    <Text className={`flex-1 mr-2 ${labelClass}`} numberOfLines={1}>
      {label}
    </Text>
    <Text className={valueClass}>{value}</Text>
  </View>
);

const EditEventPurchaseScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const purchaseId = id ? Number(id) : null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(
    null,
  );

  const [record, setRecord] = useState<EventPurchaseEditRecord | null>(null);
  const [eventFull, setEventFull] = useState<EventRow | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [originalPurchaseDate, setOriginalPurchaseDate] = useState("");
  const [originalPurchaseTime, setOriginalPurchaseTime] = useState("");

  const [quantity, setQuantity] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [status, setStatus] = useState<EventPurchaseStatus>("pending");
  const [paymentStatus, setPaymentStatus] =
    useState<EditableEventPaymentStatus>("pending");
  const [paymentMethod, setPaymentMethod] =
    useState<EventPaymentMethod>("in-store");
  const [amountPaid, setAmountPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseTime, setPurchaseTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [dayOffDates, setDayOffDates] = useState<Set<string>>(new Set());
  const [selectedAddOns, setSelectedAddOns] = useState<Record<number, number>>({});
  const [appliedFees, setAppliedFees] = useState<FeeDraft[]>([]);
  const [appliedDiscounts, setAppliedDiscounts] = useState<DiscountDraft[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");

  const submitLockRef = useRef(false);
  const isOrderLine = record?.ticketOrderId != null;

  /* --- Load the purchase, then its event + bookable dates ------------------ */

  useEffect(() => {
    if (purchaseId == null || Number.isNaN(purchaseId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const controller = new AbortController();

    (async () => {
      try {
        const purchase = await fetchEventPurchaseForEdit(
          token,
          purchaseId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!purchase) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setRecord(purchase);
        setQuantity(purchase.quantity);
        setGuestName(purchase.guestName);
        setGuestEmail(purchase.guestEmail);
        setGuestPhone(purchase.guestPhone);
        setStatus(purchase.status);
        setPaymentStatus(purchase.paymentStatus);
        setPaymentMethod(purchase.paymentMethod);
        setAmountPaid(String(purchase.amountPaid));
        setNotes(purchase.notes);
        setSpecialRequests(purchase.specialRequests);
        setPurchaseDate(purchase.purchaseDate);
        setPurchaseTime(purchase.purchaseTime);
        setOriginalPurchaseDate(purchase.purchaseDate);
        setOriginalPurchaseTime(purchase.purchaseTime);

        const initialAddOns: Record<number, number> = {};
        purchase.addOns.forEach((a) => {
          if (a.quantity > 0) initialAddOns[a.id] = a.quantity;
        });
        setSelectedAddOns(initialAddOns);
        setAppliedFees(
          purchase.appliedFees.map((f) => ({
            fee_name: f.fee_name,
            fee_amount: String(f.fee_amount),
            fee_application_type: f.fee_application_type,
          })),
        );
        setAppliedDiscounts(
          purchase.appliedDiscounts.map((d) => ({
            discount_name: d.discount_name,
            discount_amount: String(d.discount_amount),
            discount_type: d.discount_type,
            original_price: String(d.original_price),
            special_pricing_id: d.special_pricing_id,
          })),
        );
        setDiscountAmount(String(purchase.discountAmount));
        setLoading(false);

        const eventId = purchase.eventId;
        if (eventId == null) return;

        // The full event carries the add-on catalog + daily hours; the purchase's
        // own embedded event is the fallback, as on the web.
        try {
          const detail = await fetchEventDetail(token, eventId, controller.signal);
          if (!controller.signal.aborted && detail) setEventFull(detail);
        } catch {
          // Falls back to `record.event`.
        }
        try {
          const dates = await fetchEventAvailableDates({
            token,
            eventId,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setAvailableDates(dates);
        } catch {
          // Calendar simply offers no extra dates.
        }
      } catch {
        if (controller.signal.aborted) return;
        setNotFound(true);
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [purchaseId]);

  const eventPrice = eventFull?.price ?? record?.event?.price ?? 0;
  const eventName = eventFull?.name ?? record?.event?.name ?? "Unknown Event";
  const eventLocationName =
    eventFull?.locationName || record?.locationName || record?.event?.locationName;
  const locationId = record?.locationId ?? null;
  const eventId = record?.eventId ?? null;

  /* --- Add-ons ------------------------------------------------------------- */

  // Prices frozen at purchase time win over the add-on's current price.
  const frozenAddOnPrices = useMemo(() => {
    const map: Record<number, number> = {};
    (record?.addOns ?? []).forEach((a) => {
      map[a.id] = a.priceAtPurchase;
    });
    return map;
  }, [record]);

  const availableAddOns = useMemo<EditableAddOn[]>(() => {
    const list: EditableAddOn[] = (eventFull?.addOns ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      maxQuantity: a.maxQuantity,
    }));
    const ids = new Set(list.map((a) => a.id));
    (record?.addOns ?? []).forEach((a) => {
      if (ids.has(a.id)) return;
      list.push({ id: a.id, name: a.name, price: a.price, maxQuantity: 99 });
      ids.add(a.id);
    });
    return list;
  }, [eventFull, record]);

  const getAddOnUnitPrice = useCallback(
    (addOnId: number, price: number) =>
      Object.prototype.hasOwnProperty.call(frozenAddOnPrices, addOnId)
        ? frozenAddOnPrices[addOnId]
        : price,
    [frozenAddOnPrices],
  );

  const handleAddOnChange = (addOnId: number, next: number) => {
    setSelectedAddOns((prev) => {
      if (next <= 0) {
        const { [addOnId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [addOnId]: next };
    });
  };

  /* --- Totals (identical to the web EditEventPurchase) --------------------- */

  const discountNum = num(discountAmount);
  const amountPaidNum = num(amountPaid);
  const baseSubtotal = eventPrice * quantity;
  const addOnsTotal = useMemo(
    () =>
      Object.entries(selectedAddOns).reduce((sum, [addId, qty]) => {
        const addOn = availableAddOns.find((a) => a.id === Number(addId));
        if (!addOn) return sum;
        return sum + getAddOnUnitPrice(addOn.id, addOn.price) * qty;
      }, 0),
    [selectedAddOns, availableAddOns, getAddOnUnitPrice],
  );
  const additiveFeeTotal = appliedFees
    .filter((f) => f.fee_application_type === "additive")
    .reduce((s, f) => s + num(f.fee_amount), 0);
  const displayTotal = Math.max(
    0,
    baseSubtotal + addOnsTotal + additiveFeeTotal - discountNum,
  );
  const balance = displayTotal - amountPaidNum;

  /* --- Schedule ------------------------------------------------------------ */

  // One window covering every weekday the event has a bookable date on, plus
  // the purchase's own weekday, at the event's daily hours — the web's rule.
  const scheduleAvailability = useMemo(() => {
    const days = new Set<string>();
    availableDates.forEach((d) => {
      const parsed = new Date(`${d.split("T")[0]}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        days.add(WEEKDAY_NAMES_LOWER[parsed.getDay()]);
      }
    });
    if (originalPurchaseDate) {
      days.add(
        WEEKDAY_NAMES_LOWER[new Date(`${originalPurchaseDate}T00:00:00`).getDay()],
      );
    }
    if (days.size === 0) return [];
    return [
      {
        days: [...days],
        start_time: eventFull?.timeStart || record?.event?.timeStart || "09:00",
        end_time: eventFull?.timeEnd || record?.event?.timeEnd || "17:00",
      },
    ];
  }, [availableDates, originalPurchaseDate, eventFull, record]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || locationId == null || eventId == null) {
      setDayOffDates(new Set());
      return;
    }
    const controller = new AbortController();
    fetchDayOffsByLocation(token, locationId, controller.signal)
      .then((dayOffs) =>
        setDayOffDates(eventFullDayOffDatesFor({ dayOffs, eventId, today })),
      )
      .catch(() => {
        if (!controller.signal.aborted) setDayOffDates(new Set());
      });
    return () => controller.abort();
  }, [locationId, eventId, today]);

  // The purchase's own date is never blocked by a day-off added later.
  const effectiveDayOffDates = useMemo(() => {
    const set = new Set(dayOffDates);
    if (originalPurchaseDate) set.delete(originalPurchaseDate);
    return set;
  }, [dayOffDates, originalPurchaseDate]);

  // Slots come from the event's own endpoint, per selected date (web parity).
  useEffect(() => {
    const token = getToken();
    if (!token || !purchaseDate || eventId == null) {
      setAvailableTimeSlots([]);
      return;
    }
    const controller = new AbortController();
    const keepOriginal = (slots: string[]) =>
      purchaseDate === originalPurchaseDate &&
      originalPurchaseTime &&
      !slots.includes(originalPurchaseTime)
        ? [...slots, originalPurchaseTime].sort()
        : slots;

    fetchEventAvailableTimeSlots({
      token,
      eventId,
      date: purchaseDate,
      signal: controller.signal,
    })
      .then((slots) => setAvailableTimeSlots(keepOriginal(slots)))
      .catch(() => {
        if (controller.signal.aborted) return;
        // The saved time stays pickable even when the lookup fails.
        setAvailableTimeSlots(keepOriginal([]));
      });
    return () => controller.abort();
  }, [purchaseDate, eventId, originalPurchaseDate, originalPurchaseTime]);

  /* --- Save ---------------------------------------------------------------- */

  const handleSubmit = async () => {
    if (!record) return;
    if (!purchaseDate || !purchaseTime) {
      setToast({ message: "Please select a date and time.", type: "error" });
      return;
    }
    const token = getToken();
    if (!token) {
      setToast({
        message: "Error updating purchase. Please try again.",
        type: "error",
      });
      return;
    }
    if (submitLockRef.current) return;

    const addOns: EventPurchaseAddonInput[] = Object.entries(selectedAddOns)
      .filter(([, qty]) => qty > 0)
      .map(([addId, qty]) => {
        const addOn = availableAddOns.find((a) => a.id === Number(addId));
        return addOn
          ? {
              add_on_id: addOn.id,
              quantity: qty,
              price_at_purchase: getAddOnUnitPrice(addOn.id, addOn.price),
            }
          : null;
      })
      .filter((x): x is EventPurchaseAddonInput => x !== null);

    const fees: AppliedFee[] = appliedFees.map((f) => ({
      fee_name: f.fee_name,
      fee_amount: num(f.fee_amount),
      fee_application_type: f.fee_application_type,
    }));
    const discounts: AppliedDiscount[] = appliedDiscounts.map((d) => ({
      discount_name: d.discount_name,
      discount_amount: num(d.discount_amount),
      discount_type: d.discount_type,
      original_price: num(d.original_price),
      special_pricing_id: d.special_pricing_id,
    }));

    const body: UpdateEventPurchaseInput | UpdateEventOrderLineInput = isOrderLine
      ? {
          purchase_date: purchaseDate,
          purchase_time: purchaseTime,
          notes: notes || undefined,
          special_requests: specialRequests || undefined,
        }
      : {
      guest_name: guestName || undefined,
      guest_email: guestEmail || undefined,
      guest_phone: guestPhone || undefined,
      quantity,
      purchase_date: purchaseDate,
      purchase_time: purchaseTime,
      status,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      amount_paid: amountPaidNum,
      total_amount: displayTotal,
      discount_amount: discountNum,
      applied_fees: fees.length > 0 ? fees : null,
      applied_discounts: discounts.length > 0 ? discounts : null,
      notes: notes || undefined,
      special_requests: specialRequests || undefined,
      add_ons: addOns,
    };

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const ok = await updateEventPurchase(token, record.id, body);
      if (!ok) {
        setToast({
          message: "Failed to update purchase. Please try again.",
          type: "error",
        });
        setSubmitting(false);
        submitLockRef.current = false;
        return;
      }

      // Refresh what the web refreshes: the metrics caches (+ the mobile list).
      markEventPurchasesStale();
      void metricsCacheService.clearAllCaches();

      setToast({
        message: "Event purchase updated successfully!",
        type: "success",
      });
      setTimeout(() => router.back(), 1200);
    } catch {
      setToast({
        message: "Error updating purchase. Please try again.",
        type: "error",
      });
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  /* --- Chrome -------------------------------------------------------------- */

  const pill = pillFor(status);

  const header = (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
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
            Edit Event Purchase
          </Text>
          {!!record && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Reference:{" "}
              <Text className="font-medium text-gray-700 dark:text-gray-300">
                {record.referenceNumber || `#${record.id}`}
              </Text>
            </Text>
          )}
        </View>
        {!!record && (
          <View className={`px-3 py-1 rounded-full ${pill.bg}`}>
            <Text className={`text-xs font-medium ${pill.fg}`}>
              {statusLabel(status)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (notFound || !record) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#EF4444" />
          <Text className="text-gray-800 dark:text-gray-100 font-bold text-xl mt-3">
            Purchase Not Found
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1 text-center">
            The event purchase you&apos;re looking for doesn&apos;t exist.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-5 px-5 py-3 rounded-full bg-[#0644C7]"
          >
            <Text className="text-white font-semibold">
              Back to {backLabelFor(from)}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 40,
          }}
        >
          {/* Event — read-only */}
          {isOrderLine && (
            <View className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Text className="text-sm text-blue-900 dark:text-blue-200">
                <Text className="font-bold">Part of bulk order</Text>
                {record?.linePosition != null ? ` — line ${record.linePosition}` : ""}
                . Only the visit schedule and notes can be changed here; tickets,
                pricing, customer and status are managed on the order.
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/attractions/order-details",
                    params: { id: String(record?.ticketOrderId) },
                  })
                }
                accessibilityRole="button"
                className="mt-2 flex-row items-center gap-1.5 active:opacity-70"
              >
                <Feather name="external-link" size={13} color={PRIMARY} />
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
                  Open the order
                </Text>
              </Pressable>
            </View>
          )}

          <Section icon="map-pin" title="Event" locked={isOrderLine}>
            <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {eventName}
              </Text>
              {!!eventLocationName && (
                <View className="flex-row items-center gap-1 mt-1">
                  <Feather name="map-pin" size={11} color="#9CA3AF" />
                  <Text className="text-sm text-gray-600 dark:text-gray-300">
                    {eventLocationName}
                  </Text>
                </View>
              )}
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {money(eventPrice)} per ticket
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                The event and location cannot be changed on an existing purchase.
              </Text>
            </View>

            <View className="mt-4">
              <FieldLabel>Quantity</FieldLabel>
              <View className="flex-row items-center justify-between">
                <Stepper
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={9999}
                />
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {money(eventPrice)} × {quantity} ={" "}
                  <Text className="font-semibold text-gray-800 dark:text-gray-100">
                    {money(baseSubtotal)}
                  </Text>
                </Text>
              </View>
            </View>
          </Section>

          {/* Customer Information */}
          <Section icon="user" title="Customer Information" locked={isOrderLine}>
            {record.customerId != null && (
              <View className="mb-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-3">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  Linked customer account{" "}
                  <Text className="font-medium text-gray-800 dark:text-gray-100">
                    #{record.customerId}
                  </Text>
                  {!!record.customerName && (
                    <Text className="text-gray-500 dark:text-gray-400">
                      {" "}
                      — {record.customerName}
                    </Text>
                  )}
                </Text>
              </View>
            )}
            <InputField
              label="Full Name"
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Enter customer name"
              containerClassName="mb-4"
            />
            <InputField
              label="Email"
              value={guestEmail}
              onChangeText={setGuestEmail}
              placeholder="customer@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              containerClassName="mb-4"
            />
            <InputField
              label="Phone"
              value={guestPhone}
              onChangeText={setGuestPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
            />
          </Section>

          {/* Reschedule */}
          <Section icon="calendar" title="Reschedule">
            <View className="flex-row items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-3 mb-4">
              <Feather name="alert-circle" size={15} color="#D97706" />
              <Text className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                Changing the date or time will automatically notify the customer
                by email. Setting the status to Cancelled will also send a
                cancellation email.
              </Text>
            </View>
            {scheduleAvailability.length > 0 ? (
              <ScheduleCalendar
                availability={scheduleAvailability}
                dayOffDates={effectiveDayOffDates}
                scheduledDate={purchaseDate}
                scheduledTime={purchaseTime}
                availableTimeSlots={availableTimeSlots}
                onDateSelect={(dateKey) => {
                  setPurchaseDate(dateKey);
                  setPurchaseTime("");
                }}
                onTimeSelect={setPurchaseTime}
              />
            ) : (
              <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  No available dates configured for this event.
                </Text>
              </View>
            )}
          </Section>

          {/* Add-ons */}
          {availableAddOns.length > 0 && (
            <Section icon="plus-circle" title="Add-ons" locked={isOrderLine}>
              <Text className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-3">
                Add or adjust extras for this purchase. Changing add-ons updates
                the total.
              </Text>
              {availableAddOns.map((addOn) => {
                const qty = selectedAddOns[addOn.id] ?? 0;
                const unit = getAddOnUnitPrice(addOn.id, addOn.price);
                return (
                  <View
                    key={addOn.id}
                    className={`flex-row items-center gap-3 rounded-xl border p-3 mb-2 ${
                      qty > 0
                        ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className="text-sm font-medium text-gray-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {addOn.name}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        <Text className="font-bold text-[#0644C7] dark:text-blue-400">
                          {money(unit)}
                        </Text>{" "}
                        /unit
                      </Text>
                    </View>
                    <Stepper
                      value={qty}
                      onChange={(n) => handleAddOnChange(addOn.id, n)}
                      min={0}
                      max={addOn.maxQuantity || 99}
                    />
                  </View>
                );
              })}
            </Section>
          )}

          {/* Fees */}
          <Section icon="file-text" title="Fees" locked={isOrderLine}>
            {appliedFees.map((fee, index) => (
              <View
                key={`fee-${index}`}
                className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40 p-3 mb-3"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    Fee #{index + 1}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setAppliedFees(appliedFees.filter((_, i) => i !== index))
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove fee ${index + 1}`}
                  >
                    <Text className="text-xs font-medium text-red-400">
                      Remove
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  value={fee.fee_name}
                  onChangeText={(v) => {
                    const updated = [...appliedFees];
                    updated[index] = { ...updated[index], fee_name: v };
                    setAppliedFees(updated);
                  }}
                  placeholder="Fee name"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white mb-2"
                />
                <MoneyInput
                  value={fee.fee_amount}
                  onChangeText={(v) => {
                    const updated = [...appliedFees];
                    updated[index] = { ...updated[index], fee_amount: v };
                    setAppliedFees(updated);
                  }}
                />
                <View className="mt-2">
                  <SelectField
                    value={fee.fee_application_type}
                    options={[
                      { label: "Additive", value: "additive" },
                      { label: "Inclusive", value: "inclusive" },
                    ]}
                    onSelect={(v) => {
                      const updated = [...appliedFees];
                      updated[index] = {
                        ...updated[index],
                        fee_application_type: v as "additive" | "inclusive",
                      };
                      setAppliedFees(updated);
                    }}
                  />
                </View>
              </View>
            ))}
            <Pressable
              onPress={() =>
                setAppliedFees([
                  ...appliedFees,
                  { fee_name: "", fee_amount: "0", fee_application_type: "additive" },
                ])
              }
              accessibilityRole="button"
              className="self-start"
            >
              <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-400">
                + Add Fee
              </Text>
            </Pressable>
          </Section>

          {/* Discounts */}
          <Section icon="percent" title="Discounts" locked={isOrderLine}>
            {appliedDiscounts.map((discount, index) => (
              <View
                key={`discount-${index}`}
                className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40 p-3 mb-3"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    Discount #{index + 1}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setAppliedDiscounts(
                        appliedDiscounts.filter((_, i) => i !== index),
                      )
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove discount ${index + 1}`}
                  >
                    <Text className="text-xs font-medium text-red-400">
                      Remove
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  value={discount.discount_name}
                  onChangeText={(v) => {
                    const updated = [...appliedDiscounts];
                    updated[index] = { ...updated[index], discount_name: v };
                    setAppliedDiscounts(updated);
                  }}
                  placeholder="Discount name"
                  placeholderTextColor="#9CA3AF"
                  className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white mb-2"
                />
                <MoneyInput
                  value={discount.discount_amount}
                  onChangeText={(v) => {
                    const updated = [...appliedDiscounts];
                    updated[index] = { ...updated[index], discount_amount: v };
                    setAppliedDiscounts(updated);
                  }}
                />
                <View className="mt-2">
                  <SelectField
                    value={discount.discount_type}
                    options={[
                      { label: "Fixed", value: "fixed" },
                      { label: "Percentage", value: "percentage" },
                    ]}
                    onSelect={(v) => {
                      const updated = [...appliedDiscounts];
                      updated[index] = {
                        ...updated[index],
                        discount_type: v as "fixed" | "percentage",
                      };
                      setAppliedDiscounts(updated);
                    }}
                  />
                </View>
                <View className="mt-2">
                  <MoneyInput
                    prefix="Orig $"
                    placeholder="Original price"
                    value={discount.original_price}
                    onChangeText={(v) => {
                      const updated = [...appliedDiscounts];
                      updated[index] = { ...updated[index], original_price: v };
                      setAppliedDiscounts(updated);
                    }}
                  />
                </View>
              </View>
            ))}
            <Pressable
              onPress={() =>
                setAppliedDiscounts([
                  ...appliedDiscounts,
                  {
                    discount_name: "",
                    discount_amount: "0",
                    discount_type: "fixed",
                    original_price: String(baseSubtotal),
                    special_pricing_id: null,
                  },
                ])
              }
              accessibilityRole="button"
              className="self-start"
            >
              <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-400">
                + Add Discount
              </Text>
            </Pressable>

            <View className="mt-4">
              <FieldLabel>Discount Amount (applied to total)</FieldLabel>
              <MoneyInput value={discountAmount} onChangeText={setDiscountAmount} />
            </View>
          </Section>

          {/* Status & Payment */}
          <Section icon="dollar-sign" title="Status & Payment" locked={isOrderLine}>
            <View className="mb-4">
              <SelectField
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onSelect={(v) => setStatus(v as EventPurchaseStatus)}
              />
            </View>
            <View className="mb-4">
              <SelectField
                label="Payment Status"
                value={paymentStatus}
                options={PAYMENT_STATUS_OPTIONS}
                onSelect={(v) =>
                  setPaymentStatus(v as EditableEventPaymentStatus)
                }
              />
            </View>
            <View className="mb-4">
              <SelectField
                label="Payment Method"
                value={paymentMethod}
                options={PAYMENT_METHOD_OPTIONS}
                onSelect={(v) => setPaymentMethod(v as EventPaymentMethod)}
              />
            </View>
            <View className="mb-4">
              <FieldLabel>Amount Paid</FieldLabel>
              <MoneyInput value={amountPaid} onChangeText={setAmountPaid} />
            </View>
            {balance > 0 ? (
              <View className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                  Balance Due:{" "}
                  <Text className="font-bold">{money(balance)}</Text>
                </Text>
              </View>
            ) : (
              <View className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3">
                <Text className="text-sm font-medium text-green-700 dark:text-green-300">
                  Fully Paid
                </Text>
              </View>
            )}
          </Section>

          {/* Notes */}
          <Section icon="file-text" title="Notes">
            <FieldLabel>Notes</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 88 }}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white mb-4"
            />
            <FieldLabel>Special Requests</FieldLabel>
            <TextInput
              value={specialRequests}
              onChangeText={setSpecialRequests}
              placeholder="Any special requests from the customer..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 88 }}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
            />
          </Section>

          {/* Order Summary — the web's sticky sidebar, stacked here as it is on
              the web's own narrow layout. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-[#0644C7] dark:text-blue-400 pb-2 mb-2">
              Order Summary
            </Text>

            <View className="pb-4 mb-4 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Event
              </Text>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {eventName}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {money(eventPrice)} × {quantity}
              </Text>
            </View>

            <View className="pb-4 mb-4 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Customer
              </Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {guestName || "Walk-in Customer"}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {guestEmail || "No email"}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {guestPhone || "No phone"}
              </Text>
            </View>

            <View className="pb-4 mb-4 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Scheduled
              </Text>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {purchaseDate ? formatFullDate(purchaseDate) : "Not set"}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {purchaseTime ? formatTime12Hour(purchaseTime) : "Not set"}
              </Text>
            </View>

            <View className="pb-4 mb-4 border-b border-gray-100 dark:border-neutral-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Status
              </Text>
              <View className="flex-row">
                <View className={`px-3 py-1 rounded-full ${pill.bg}`}>
                  <Text className={`text-xs font-medium ${pill.fg}`}>
                    {statusLabel(status)}
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Payment Breakdown
            </Text>

            <SummaryRow label="Subtotal" value={money(baseSubtotal)} />

            {Object.keys(selectedAddOns).length > 0 && (
              <View className="pt-2 mt-1 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Add-ons
                </Text>
                {Object.entries(selectedAddOns).map(([addId, qty]) => {
                  const addOn = availableAddOns.find((a) => a.id === Number(addId));
                  if (!addOn) return null;
                  return (
                    <SummaryRow
                      key={addId}
                      label={`${addOn.name}${qty > 1 ? ` ×${qty}` : ""}`}
                      value={money(getAddOnUnitPrice(addOn.id, addOn.price) * qty)}
                      labelClass="text-sm text-gray-600 dark:text-gray-300"
                      valueClass="text-sm text-gray-900 dark:text-white"
                    />
                  );
                })}
              </View>
            )}

            {appliedFees.length > 0 && (
              <View className="pt-2 mt-1 border-t border-gray-100 dark:border-neutral-800">
                {appliedFees.map((fee, i) => (
                  <SummaryRow
                    key={`fee-line-${i}`}
                    label={`${fee.fee_name || "Fee"} (${
                      fee.fee_application_type === "inclusive" ? "Included" : "Fee"
                    })`}
                    value={`${
                      fee.fee_application_type === "additive" ? "+" : ""
                    }${money(num(fee.fee_amount))}`}
                    labelClass="text-xs text-gray-500 dark:text-gray-400"
                    valueClass="text-xs text-gray-500 dark:text-gray-400"
                  />
                ))}
              </View>
            )}

            {discountNum > 0 && (
              <View className="pt-2 mt-1 border-t border-gray-100 dark:border-neutral-800">
                <SummaryRow
                  label="Discount"
                  value={`-${money(discountNum)}`}
                  labelClass="text-sm text-red-600 dark:text-red-400"
                  valueClass="text-sm font-medium text-red-600 dark:text-red-400"
                />
              </View>
            )}

            <View className="pt-3 mt-2 border-t border-gray-200 dark:border-neutral-700">
              <SummaryRow
                label="Total Amount"
                value={money(displayTotal)}
                labelClass="text-sm font-semibold text-gray-900 dark:text-white"
                valueClass="text-base font-bold text-gray-900 dark:text-white"
              />
            </View>

            <SummaryRow
              label="Amount Paid"
              value={money(amountPaidNum)}
              valueClass="text-sm font-semibold text-green-600 dark:text-green-400"
            />

            <View className="pt-2 mt-1 border-t border-gray-100 dark:border-neutral-800">
              {balance > 0 ? (
                <SummaryRow
                  label="Balance Due"
                  value={money(balance)}
                  labelClass="text-sm font-medium text-red-700 dark:text-red-300"
                  valueClass="text-sm font-bold text-red-600 dark:text-red-400"
                />
              ) : (
                <SummaryRow
                  label="Payment Status"
                  value="Fully Paid"
                  labelClass="text-sm font-medium text-green-700 dark:text-green-300"
                  valueClass="text-sm font-bold text-green-600 dark:text-green-400"
                />
              )}
            </View>
          </View>

          {/* Save actions — below the summary, so the totals are the last thing
              read before committing the change. */}
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              disabled={submitting}
              className={`flex-1 h-14 items-center justify-center rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${
                submitting ? "opacity-50" : "active:opacity-70"
              }`}
            >
              <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] ${
                submitting ? "opacity-50" : "active:opacity-90"
              }`}
            >
              {submitting ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">
                    Saving...
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="save" size={18} color="#FFFFFF" />
                  <Text className="text-base font-semibold text-white">
                    Save Changes
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {!!toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </View>
  );
};

export default EditEventPurchaseScreen;
