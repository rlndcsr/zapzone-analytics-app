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
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FieldLabel, SelectField } from "../../components/ui/FormControls";
import { InputField } from "../../components/ui/InputField";
import { ScheduleCalendar } from "../../components/ui/ScheduleCalendar";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  fullDayOffDatesFor,
  generateTimeSlots,
} from "../../lib/attractions/dayOffAvailability";
import { WEEKDAY_NAMES_LOWER, formatFullDate } from "../../lib/date/calendar";
import { markAttractionPurchasesStale } from "../../lib/hooks/useAttractionPurchases";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchAttractionPurchaseForEdit,
  sendAttractionPurchaseReceipt,
  updateAttractionPurchase,
  type AttractionPaymentMethod,
  type AttractionPurchaseEditRecord,
  type EditablePurchaseStatus,
  type PurchaseAddonInput,
  type UpdateAttractionPurchaseInput,
  type UpdateOrderLineInput,
} from "../../services/attractionPurchasesService";
import {
  fetchAttractions,
  type AvailabilitySchedule,
} from "../../services/attractionsService";
import { fetchDayOffsByLocation } from "../../services/dayOffsService";
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

const STATUS_OPTIONS: { label: string; value: EditablePurchaseStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

const PAYMENT_METHOD_OPTIONS: {
  label: string;
  value: AttractionPaymentMethod;
}[] = [
  { label: "In-Store", value: "in-store" },
  { label: "Authorize.Net", value: "authorize.net" },
  { label: "Card", value: "card" },
  { label: "Pay Later", value: "paylater" },
];

/** Status pill palette, mirroring the web `statusConfig`. */
const STATUS_PILL: Record<EditablePurchaseStatus, { bg: string; fg: string }> = {
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
  cancelled: {
    bg: "bg-red-100 dark:bg-red-900/30",
    fg: "text-red-800 dark:text-red-300",
  },
  refunded: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    fg: "text-purple-800 dark:text-purple-300",
  },
};

const statusLabel = (s: EditablePurchaseStatus) =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

const pillFor = (s: EditablePurchaseStatus) =>
  STATUS_PILL[s] ?? {
    bg: "bg-gray-100 dark:bg-neutral-800",
    fg: "text-gray-800 dark:text-gray-200",
  };

/** "14:00" -> "2:00 PM" (the summary's `toLocaleTimeString` output). */
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
      return "Purchases";
  }
};

/** Attraction as the picker + schedule need it (a slim `AttractionRow`). */
type PickerAttraction = {
  id: number;
  name: string;
  price: number;
  locationId: number | null;
  availability: AvailabilitySchedule[];
  addOns: { id: number; name: string; price: number; maxQuantity: number }[];
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
    className={`bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm ${
      locked ? "opacity-50" : ""
    }`}
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

const EditPurchaseScreen = () => {
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

  const [record, setRecord] = useState<AttractionPurchaseEditRecord | null>(null);
  const [originalScheduledDate, setOriginalScheduledDate] = useState("");
  const [originalScheduledTime, setOriginalScheduledTime] = useState("");
  const [attractions, setAttractions] = useState<PickerAttraction[]>([]);

  const [attractionId, setAttractionId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [status, setStatus] = useState<EditablePurchaseStatus>("pending");
  const [paymentMethod, setPaymentMethod] =
    useState<AttractionPaymentMethod>("in-store");
  const [amountPaid, setAmountPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [dayOffDates, setDayOffDates] = useState<Set<string>>(new Set());
  const [selectedAddOns, setSelectedAddOns] = useState<Record<number, number>>({});
  const [appliedFees, setAppliedFees] = useState<FeeDraft[]>([]);
  const [appliedDiscounts, setAppliedDiscounts] = useState<DiscountDraft[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [sendNotification, setSendNotification] = useState(true);

  // Off-screen QR used only to build the receipt attachment on save (the web's
  // `generatePurchaseQRCode`); `toDataURL` is the only way to get its PNG here.
  const qrRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void } | null>(
    null,
  );
  const submitLockRef = useRef(false);
  const isOrderLine = record?.ticketOrderId != null;

  /* --- Load the purchase, then its location's attractions ------------------ */

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
        const purchase = await fetchAttractionPurchaseForEdit(
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
        setAttractionId(purchase.attractionId);
        setQuantity(purchase.quantity);
        setGuestName(purchase.guestName);
        setGuestEmail(purchase.guestEmail);
        setGuestPhone(purchase.guestPhone);
        setStatus(purchase.status);
        setPaymentMethod(purchase.paymentMethod);
        setAmountPaid(String(purchase.amountPaid));
        setNotes(purchase.notes);
        setScheduledDate(purchase.scheduledDate);
        setScheduledTime(purchase.scheduledTime);
        setOriginalScheduledDate(purchase.scheduledDate);
        setOriginalScheduledTime(purchase.scheduledTime);

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

        // Active attractions at this location back the picker; the purchase's
        // own attraction is appended when it isn't among them (web parity).
        const locationId = purchase.locationId;
        const userId = getCurrentUser()?.id;
        if (locationId == null || userId == null) return;
        try {
          const rows = await fetchAttractions({
            token,
            userId,
            locationId,
            isActive: true,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const list: PickerAttraction[] = rows.map((a) => ({
            id: a.id,
            name: a.name,
            price: a.price,
            locationId: a.locationId,
            availability: a.availability,
            addOns: a.addOns.map((x) => ({
              id: x.id,
              name: x.name,
              price: x.price,
              maxQuantity: x.maxQuantity,
            })),
          }));
          if (
            purchase.attraction &&
            !list.some((a) => a.id === purchase.attractionId)
          ) {
            list.push({
              id: purchase.attraction.id,
              name: purchase.attraction.name,
              price: purchase.attraction.price,
              locationId: purchase.attraction.locationId ?? locationId,
              availability: [],
              addOns: [],
            });
          }
          setAttractions(list);
        } catch {
          // Picker stays empty — the web swallows this failure too.
        }
      } catch {
        if (controller.signal.aborted) return;
        setNotFound(true);
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [purchaseId]);

  const selectedAttraction = useMemo(
    () => attractions.find((a) => a.id === attractionId) ?? null,
    [attractions, attractionId],
  );

  const locationId = record?.locationId ?? null;

  /* --- Add-ons ------------------------------------------------------------- */

  // Prices frozen at purchase time win over the add-on's current price.
  const frozenAddOnPrices = useMemo(() => {
    const map: Record<number, number> = {};
    (record?.addOns ?? []).forEach((a) => {
      map[a.id] = a.priceAtPurchase;
    });
    return map;
  }, [record]);

  const availableAddOns = useMemo(() => {
    const list = [...(selectedAttraction?.addOns ?? [])];
    const ids = new Set(list.map((a) => a.id));
    (record?.addOns ?? []).forEach((a) => {
      if (ids.has(a.id)) return;
      list.push({ id: a.id, name: a.name, price: a.price, maxQuantity: 99 });
      ids.add(a.id);
    });
    return list;
  }, [selectedAttraction, record]);

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

  // Only send `additional_addons` when the lines actually changed, like the web
  // (the endpoint rewrites the whole pivot table when the key is present).
  const addOnsChanged = useMemo(() => {
    const original: Record<number, number> = {};
    (record?.addOns ?? []).forEach((a) => {
      if (a.quantity > 0) original[a.id] = a.quantity;
    });
    const norm = (m: Record<number, number>) =>
      Object.entries(m)
        .filter(([, q]) => q > 0)
        .map(([k, q]) => `${k}:${q}`)
        .sort()
        .join(",");
    return norm(original) !== norm(selectedAddOns);
  }, [record, selectedAddOns]);

  /* --- Totals (identical to the web EditPurchase) -------------------------- */

  const discountNum = num(discountAmount);
  const amountPaidNum = num(amountPaid);
  const baseSubtotal = selectedAttraction ? selectedAttraction.price * quantity : 0;
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

  const attractionAvailability = useMemo(
    () => selectedAttraction?.availability ?? [],
    [selectedAttraction],
  );

  // Keep the saved visit day pickable even when the attraction no longer opens
  // on that weekday, so an edit never silently loses the existing schedule.
  const scheduleAvailability = useMemo(() => {
    if (!originalScheduledDate) return attractionAvailability;
    const savedWeekday =
      WEEKDAY_NAMES_LOWER[new Date(`${originalScheduledDate}T00:00:00`).getDay()];
    const covered = attractionAvailability.some((s) =>
      s.days.map((d) => d.toLowerCase()).includes(savedWeekday),
    );
    if (covered) return attractionAvailability;
    return [
      ...attractionAvailability,
      { days: [savedWeekday], start_time: "00:00", end_time: "23:59" },
    ];
  }, [attractionAvailability, originalScheduledDate]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || locationId == null || attractionId == null) {
      setDayOffDates(new Set());
      return;
    }
    const controller = new AbortController();
    fetchDayOffsByLocation(token, locationId, controller.signal)
      .then((dayOffs) =>
        setDayOffDates(fullDayOffDatesFor({ dayOffs, attractionId, today })),
      )
      .catch(() => {
        if (!controller.signal.aborted) setDayOffDates(new Set());
      });
    return () => controller.abort();
  }, [locationId, attractionId, today]);

  // The purchase's own visit date is never blocked by a day-off added later.
  const effectiveDayOffDates = useMemo(() => {
    const set = new Set(dayOffDates);
    if (originalScheduledDate) set.delete(originalScheduledDate);
    return set;
  }, [dayOffDates, originalScheduledDate]);

  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !selectedAttraction) return [];
    const weekday =
      WEEKDAY_NAMES_LOWER[new Date(`${scheduledDate}T00:00:00`).getDay()];
    const daySlot = attractionAvailability.find((s) =>
      s.days.map((d) => d.toLowerCase()).includes(weekday),
    );
    let slots = daySlot
      ? generateTimeSlots(daySlot.start_time, daySlot.end_time, 60)
      : [];
    // The saved time survives even if it falls outside the current window.
    if (
      scheduledDate === originalScheduledDate &&
      originalScheduledTime &&
      !slots.includes(originalScheduledTime)
    ) {
      slots = [...slots, originalScheduledTime].sort();
    }
    return slots;
  }, [
    scheduledDate,
    selectedAttraction,
    attractionAvailability,
    originalScheduledDate,
    originalScheduledTime,
  ]);

  /* --- Save ---------------------------------------------------------------- */

  /** Base64 PNG of the ticket QR, in the data-URL form the web posts. */
  const buildQrDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const svg = qrRef.current;
      if (!svg?.toDataURL) {
        reject(new Error("QR code not ready"));
        return;
      }
      // Guard the native callback so a save can never hang on the receipt leg.
      const timer = setTimeout(() => reject(new Error("QR code timed out")), 5000);
      svg.toDataURL((data) => {
        clearTimeout(timer);
        resolve(`data:image/png;base64,${data}`);
      });
    });

  const handleSubmit = async () => {
    if (!record) return;
    if (!scheduledDate || !scheduledTime) {
      setToast({
        message: "Please select a visit date and time.",
        type: "error",
      });
      return;
    }
    const token = getToken();
    if (!token) {
      setToast({ message: "Error updating purchase. Please try again.", type: "error" });
      return;
    }
    if (submitLockRef.current) return;

    const additionalAddons: PurchaseAddonInput[] = Object.entries(selectedAddOns)
      .filter(([, qty]) => qty > 0)
      .map(([addId, qty]) => {
        const addOn = availableAddOns.find((a) => a.id === Number(addId));
        return addOn
          ? {
              addon_id: addOn.id,
              quantity: qty,
              price_at_purchase: getAddOnUnitPrice(addOn.id, addOn.price),
            }
          : null;
      })
      .filter((x): x is PurchaseAddonInput => x !== null);

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

    const body: UpdateAttractionPurchaseInput | UpdateOrderLineInput = isOrderLine
      ? {
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          notes: notes || undefined,
        }
      : {
      attraction_id: attractionId ?? undefined,
      guest_name: guestName || undefined,
      guest_email: guestEmail || undefined,
      guest_phone: guestPhone || undefined,
      quantity,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status,
      payment_method: paymentMethod,
      amount_paid: amountPaidNum,
      notes: notes || undefined,
      applied_fees: fees.length > 0 ? fees : null,
      applied_discounts: discounts.length > 0 ? discounts : null,
      discount_amount: discountNum,
      total_amount: displayTotal,
      ...(addOnsChanged && { additional_addons: additionalAddons }),
    };

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const ok = await updateAttractionPurchase(token, record.id, body);
      if (!ok) {
        setToast({
          message: "Failed to update purchase. Please try again.",
          type: "error",
        });
        setSubmitting(false);
        submitLockRef.current = false;
        return;
      }

      // Refresh what the web refreshes: the purchase list cache + the metrics.
      markAttractionPurchasesStale();
      void metricsCacheService.clearAllCaches();

      if (sendNotification) {
        try {
          const qr = await buildQrDataUrl();
          await sendAttractionPurchaseReceipt(token, record.id, qr, true);
        } catch {
          // The receipt is best-effort on the web too; the save still stands.
        }
      }

      setToast({ message: "Purchase updated successfully!", type: "success" });
      setTimeout(() => router.back(), 1200);
    } catch (err) {
      // Show what the API said when it refuses the save — a full time slot comes
      // back as "That time slot is already full." / "Only N tickets fit in that
      // time slot.", and retrying blindly would never work.
      setToast({
        message:
          err instanceof Error && err.message
            ? err.message
            : "Error updating purchase. Please try again.",
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
            Edit Purchase
          </Text>
          {!!record && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Purchase ID:{" "}
              <Text className="font-medium text-gray-700 dark:text-gray-300">
                #{record.id}
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
            The purchase you&apos;re looking for doesn&apos;t exist.
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

          {/* Attraction */}
          <Section icon="tag" title="Attraction" locked={isOrderLine}>
            <SelectField
              placeholder="Select an attraction"
              value={attractionId}
              options={attractions.map((a) => ({
                label: `${a.name} - ${money(a.price)}`,
                value: a.id,
              }))}
              onSelect={(v) => setAttractionId(Number(v))}
            />

            {!!selectedAttraction && (
              <View className="mt-3 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 p-3">
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  <Text className="font-medium">Selected:</Text>{" "}
                  {selectedAttraction.name} • {money(selectedAttraction.price)}
                </Text>
                {!!record.attraction?.locationName && (
                  <View className="flex-row items-center gap-1 mt-1">
                    <Feather name="map-pin" size={11} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {record.attraction.locationName}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View className="mt-4">
              <FieldLabel>Quantity</FieldLabel>
              <View className="flex-row items-center justify-between">
                <Stepper
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={9999}
                />
                {!!selectedAttraction && (
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {money(selectedAttraction.price)} × {quantity} ={" "}
                    <Text className="font-semibold text-gray-800 dark:text-gray-100">
                      {money(baseSubtotal)}
                    </Text>
                  </Text>
                )}
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

          {/* Schedule */}
          <Section icon="calendar" title="Schedule">
            {scheduleAvailability.length > 0 ? (
              <ScheduleCalendar
                availability={scheduleAvailability}
                dayOffDates={effectiveDayOffDates}
                scheduledDate={scheduledDate}
                scheduledTime={scheduledTime}
                availableTimeSlots={availableTimeSlots}
                onDateSelect={(dateKey) => {
                  setScheduledDate(dateKey);
                  setScheduledTime("");
                }}
                onTimeSelect={setScheduledTime}
              />
            ) : (
              <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 p-4">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  No availability configured for this attraction.
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
                onSelect={(v) => setStatus(v as EditablePurchaseStatus)}
              />
            </View>
            <View className="mb-4">
              <SelectField
                label="Payment Method"
                value={paymentMethod}
                options={PAYMENT_METHOD_OPTIONS}
                onSelect={(v) => setPaymentMethod(v as AttractionPaymentMethod)}
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
          <Section title="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 88 }}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white"
            />
          </Section>

          {/* Email Notification */}
          <Section title="Email Notification" locked={isOrderLine}>
            <View className="flex-row items-center gap-2 mb-3">
              <Feather
                name={sendNotification ? "bell" : "bell-off"}
                size={16}
                color={sendNotification ? "#16A34A" : "#9CA3AF"}
              />
              <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                {sendNotification
                  ? "Customer will receive an updated receipt"
                  : "Silent update (no email)"}
              </Text>
            </View>
            <View className="flex-row">
              <Pressable
                onPress={() => setSendNotification(false)}
                accessibilityRole="button"
                accessibilityState={{ selected: !sendNotification }}
                className={`flex-1 items-center py-2.5 rounded-l-xl border ${
                  !sendNotification
                    ? "bg-gray-700 border-gray-700"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    !sendNotification
                      ? "text-white"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  Don&apos;t Send
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSendNotification(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: sendNotification }}
                className={`flex-1 items-center py-2.5 rounded-r-xl border-y border-r ${
                  sendNotification
                    ? "bg-green-600 border-green-600"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    sendNotification
                      ? "text-white"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  Send Email
                </Text>
              </Pressable>
            </View>
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

            {!!selectedAttraction && (
              <View className="pb-4 mb-4 border-b border-gray-100 dark:border-neutral-800">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Attraction
                </Text>
                <Text className="text-base font-semibold text-gray-900 dark:text-white">
                  {selectedAttraction.name}
                </Text>
                <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {money(selectedAttraction.price)} × {quantity}
                </Text>
              </View>
            )}

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
                {scheduledDate ? formatFullDate(scheduledDate) : "Not set"}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {scheduledTime ? formatTime12Hour(scheduledTime) : "Not set"}
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

      {/* Off-screen ticket QR — only read via `toDataURL` for the receipt email. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: -10000, top: 0 }}
      >
        <QRCode
          value={JSON.stringify({ type: "attraction_purchase", id: record.id })}
          size={300}
          backgroundColor="#FFFFFF"
          color="#000000"
          getRef={(c) => {
            qrRef.current = c as unknown as typeof qrRef.current;
          }}
        />
      </View>

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

export default EditPurchaseScreen;
