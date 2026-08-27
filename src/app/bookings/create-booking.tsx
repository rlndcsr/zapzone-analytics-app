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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { InputField } from "../../components/ui/InputField";
import {
  MONTHS as CALENDAR_MONTHS,
  addMonths,
  buildMonthCells,
  parseKey,
  toKey,
} from "../../lib/date/calendar";
import { CallToBookCard } from "../../components/ui/CallToBookCard";
import { CallToBookSheet } from "../../components/ui/CallToBookSheet";
import { packageIsCallToBook } from "../../lib/callToBook";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { markBookingsStale } from "../../lib/hooks/useBookings";
import { useVenuePhone } from "../../lib/hooks/useVenuePhone";
import {
  formatCardNumber,
  getCardType,
  getPaymentErrorMessage,
  isTestCardNumber,
  validateCardNumber,
} from "../../lib/payments/cardUtils";
import { rollbackBooking } from "../../lib/payments/rollback";
import { useQrDataUri } from "../../lib/payments/useQrDataUri";
import { getCurrentUser, getToken } from "../../lib/session";
import { isLowRemaining } from "../../lib/ticketLimits";
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
  recordBookingPayment,
  type AvailableSlot,
  type BookablePackage,
  type PackageAvailabilitySchedule,
  type PackageListItem,
} from "../../services/bookingsService";
import { searchCustomers, type CustomerHit } from "../../services/customersService";
import {
  validateGiftCardCode,
  validatePromoCode,
  type DiscountCodeResult,
} from "../../services/discountCodesService";

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
/** Unabbreviated month names for the inline calendar header ("July 2026"). */
const FULL_MONTHS = CALENDAR_MONTHS;

const money = (n: number) => `$${n.toFixed(2)}`;

function formatTime(value: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

type PaymentMethod = "authorize.net" | "in-store" | "paylater";

type PaymentType = "full" | "partial" | "custom";

// Wizard steps (mirrors the web /bookings/create flow order).
const STEP_LABELS = [
  "Package",
  "Date & Time",
  "Add-ons",
  "Customer",
  "Payment",
] as const;

/** Heading shown at the top of each step's content (web wizard headings). */
const STEP_HEADINGS = [
  "Select a Package",
  "Select Space, Date & Time",
  "Add Attractions & Add-ons",
  "Customer Information",
  "Review & Payment",
] as const;
const TOTAL_STEPS = STEP_LABELS.length;


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

/** Label / value line in the step-5 review blocks (web's definition rows). */
const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-1.5">
    <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">{label}</Text>
    <Text
      numberOfLines={2}
      className="flex-1 text-right text-sm font-medium text-gray-900 dark:text-white"
    >
      {value}
    </Text>
  </View>
);

const LEGEND_SWATCH = "w-3 h-3 rounded-sm";

/**
 * One add-on / attraction row — thumbnail placeholder, name, price, then an
 * "Add" button that becomes a ± stepper once any are added (the web shows Add
 * and moves the item into the summary; a stepper is the touch equivalent).
 */
const AddOnRow = ({
  name,
  price,
  qty,
  image,
  onAdd,
  onChange,
}: {
  name: string;
  price: string;
  qty: number;
  /** Thumbnail URL; falls back to the "No Image" tile when absent. */
  image?: string | null;
  onAdd: () => void;
  onChange: (n: number) => void;
}) => (
  <View className="mb-2 flex-row items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
    <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-neutral-800">
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      ) : (
        <Text className="text-[9px] text-gray-400">No Image</Text>
      )}
    </View>
    <View className="flex-1">
      <Text
        numberOfLines={2}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        {name}
      </Text>
      <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-400">
        {price}
      </Text>
    </View>
    {qty > 0 ? (
      <Stepper value={qty} onChange={onChange} />
    ) : (
      <Pressable
        onPress={onAdd}
        className="rounded-md bg-[#0644C7] px-4 py-2 active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel={`Add ${name}`}
      >
        <Text className="text-xs font-semibold text-white">Add</Text>
      </Pressable>
    )}
  </View>
);

/** Thumbnail + name + qty line used by the Booking Summary item lists. */
const SummaryItemRow = ({
  image,
  name,
  meta,
  amount,
}: {
  image?: string | null;
  name: string;
  meta: string;
  amount: string;
}) => (
  <View className="mb-2 flex-row items-start gap-2">
    {!!image && (
      <Image
        source={{ uri: image }}
        style={{ width: 48, height: 48, borderRadius: 6 }}
        contentFit="cover"
      />
    )}
    <View className="flex-1">
      <Text
        numberOfLines={1}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        {name}
      </Text>
      <Text className="text-xs text-gray-500 dark:text-gray-400">{meta}</Text>
    </View>
    <Text className="ml-2 text-sm font-medium text-gray-900 dark:text-white">
      {amount}
    </Text>
  </View>
);

/**
 * Inline month grid for picking the visit date — the web's "Select Date" card.
 * Today onward is selectable; earlier days render as unavailable. Rows are built
 * a week at a time with `flex-1` cells so the seven columns always align.
 */
const MonthCalendar = ({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (dateKey: string) => void;
}) => {
  const todayKey = useMemo(() => toKey(new Date()), []);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parseKey(value) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const weeks = useMemo(() => {
    const cells = buildMonthCells(viewMonth);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewMonth]);

  const minMonth = useMemo(() => {
    const d = parseKey(todayKey) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [todayKey]);
  const canGoPrev =
    viewMonth.getFullYear() > minMonth.getFullYear() ||
    (viewMonth.getFullYear() === minMonth.getFullYear() &&
      viewMonth.getMonth() > minMonth.getMonth());

  return (
    <View className="rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
      {/* Month navigation */}
      <View className="mb-2.5 flex-row items-center justify-between">
        <Pressable
          onPress={() => canGoPrev && setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
          hitSlop={8}
          accessibilityLabel="Previous month"
          className="w-8 h-8 items-center justify-center rounded-lg active:bg-gray-100 dark:active:bg-neutral-800"
        >
          <Feather
            name="chevron-left"
            size={18}
            color={canGoPrev ? "#4B5563" : "#D1D5DB"}
          />
        </Pressable>
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {`${FULL_MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`}
        </Text>
        <Pressable
          onPress={() => setViewMonth((m) => addMonths(m, 1))}
          hitSlop={8}
          accessibilityLabel="Next month"
          className="w-8 h-8 items-center justify-center rounded-lg active:bg-gray-100 dark:active:bg-neutral-800"
        >
          <Feather name="chevron-right" size={18} color="#4B5563" />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View className="flex-row mb-1">
        {WEEKDAYS.map((w) => (
          <View key={w} className="flex-1 items-center py-1">
            <Text className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {w}
            </Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <View key={`w${wi}`} className="flex-row">
          {week.map((key, di) => {
            if (!key) {
              return <View key={`b${wi}-${di}`} className="flex-1 h-12" />;
            }
            const selected = key === value;
            const unavailable = key < todayKey;
            return (
              <View key={key} className="flex-1 h-12 p-0.5">
                <Pressable
                  onPress={() => !unavailable && onSelect(key)}
                  disabled={unavailable}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: unavailable }}
                  accessibilityLabel={key}
                  className={`flex-1 items-center justify-center rounded-lg ${
                    selected
                      ? "bg-[#0644C7]"
                      : unavailable
                        ? ""
                        : "bg-blue-50 dark:bg-blue-900/20"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected
                        ? "font-bold text-white"
                        : unavailable
                          ? "text-gray-300 dark:text-neutral-700"
                          : "font-medium text-[#0644C7] dark:text-blue-300"
                    }`}
                  >
                    {Number(key.substring(8, 10))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View className="mt-2.5 flex-row items-center justify-center gap-4 border-t border-gray-100 pt-2 dark:border-neutral-800">
        <View className="flex-row items-center gap-1.5">
          <View className={`${LEGEND_SWATCH} bg-blue-50 dark:bg-blue-900/20`} />
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            Available
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className={`${LEGEND_SWATCH} bg-[#0644C7]`} />
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            Selected
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className={`${LEGEND_SWATCH} bg-gray-100 dark:bg-neutral-800`} />
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            Unavailable
          </Text>
        </View>
      </View>
    </View>
  );
};

/**
 * Segmented progress bar with a label under each segment — the web wizard's
 * header. Completed and current steps fill blue; the label of the current step
 * is highlighted.
 */
const StepIndicator = ({ step }: { step: number }) => (
  <View className="px-3 pt-3 pb-2 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800">
    <View className="flex-row gap-1.5">
      {STEP_LABELS.map((label, i) => (
        <View
          key={label}
          className={`flex-1 h-1.5 rounded-full ${
            i + 1 <= step ? "bg-[#0644C7]" : "bg-gray-200 dark:bg-neutral-700"
          }`}
        />
      ))}
    </View>
    <View className="mt-1.5 flex-row gap-1.5">
      {STEP_LABELS.map((label, i) => (
        <View key={label} className="flex-1 items-center">
          <Text
            numberOfLines={1}
            className={`text-[10px] ${
              i + 1 === step
                ? "font-bold text-[#0644C7] dark:text-blue-300"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  </View>
);

const CreateBookingScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  // Wizard step (1..5).
  const [step, setStep] = useState(1);

  // Location filter (company admins only). Left null by default — the backend
  // auth-scopes packages by role, so a location manager is limited to their own
  // location automatically and an admin sees all company packages until they
  // pick a location to narrow by.
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Package catalog — mobile-first: a LIGHTWEIGHT, paginated, server-searchable
  // list (scalars only; relations discarded). The heavy full package is fetched
  // only when one is selected ({@link fetchBookablePackageDetail}). This keeps
  // memory tiny — the /packages index eager-loads 7 relations per package, so
  // retaining a hydrated list is what crashed the app.
  const [packageItems, setPackageItems] = useState<PackageListItem[]>([]);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgLastPage, setPkgLastPage] = useState(1);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  // The selected package, fully hydrated (add-ons/attractions/deposit rules).
  const [pkg, setPkg] = useState<BookablePackage | null>(null);
  const [pickingId, setPickingId] = useState<number | null>(null);

  // Load page 1 on entry and whenever the location filter or search changes.
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
        page: 1,
      })
        .then((res) => {
          if (!active) return;
          setPackageItems(res.items);
          setPkgPage(res.page);
          setPkgLastPage(res.lastPage);
        })
        .catch(() => {
          if (active) setPackageItems([]);
        })
        .finally(() => {
          if (active) setLoadingPackages(false);
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedLocationId, packageSearch, user?.id]);

  const loadMorePackages = () => {
    const token = getToken();
    if (!token || loadingMore || pkgPage >= pkgLastPage) return;
    setLoadingMore(true);
    fetchPackageList(token, {
      locationId: selectedLocationId ?? undefined,
      userId: user?.id,
      search: packageSearch,
      page: pkgPage + 1,
    })
      .then((res) => {
        setPackageItems((prev) => [...prev, ...res.items]);
        setPkgPage(res.page);
        setPkgLastPage(res.lastPage);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
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

  // Payment.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in-store");
  // Deposit-first, matching the web's `paymentType: 'partial'` default.
  const [paymentType, setPaymentType] = useState<PaymentType>("partial");
  const [customAmount, setCustomAmount] = useState("");
  const [inStoreAmount, setInStoreAmount] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  /** Staff notification — the web's second checkbox on the payment step. */
  const [sendStaffEmail, setSendStaffEmail] = useState(true);
  // Card (Authorize.Net) fields — same anatomy as the web Card Details panel.
  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [authorizeCredentials, setAuthorizeCredentials] =
    useState<AuthorizeNetPublicKey | null>(null);
  /** This location has no active merchant account (web's "Authorize.Net Not
   *  Configured" modal). */
  const [authorizeUnavailable, setAuthorizeUnavailable] = useState(false);
  const qr = useQrDataUri();

  // Customer (email search-as-you-type).
  const [customerEmail, setCustomerEmail] = useState("");
  // First/last are the entry fields (matching the web); `customerName` stays the
  // single value the create payload and summary use.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const customerName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [customerPhone, setCustomerPhone] = useState("");

  // Guest address (all optional) — posted as the guest_* fields on create.
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");

  // Discount codes — validated against the running subtotal, redeemed by the
  // backend when the booking is created.
  const [giftCode, setGiftCode] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [giftResult, setGiftResult] = useState<DiscountCodeResult | null>(null);
  const [promoResult, setPromoResult] = useState<DiscountCodeResult | null>(null);
  const [codeBusy, setCodeBusy] = useState<"gift" | "promo" | null>(null);
  const [foundCustomers, setFoundCustomers] = useState<CustomerHit[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  /** Web parity (`lastSubmitTimeRef`): 3s cooldown, so a double-tap can never
   *  produce a second card charge. */
  const lastSubmitAtRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  // Land at the top of each step instead of keeping the previous scroll offset.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);


  // Pricing (fees + special pricing), fetched only on the Payment step.
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [special, setSpecial] = useState<SpecialPricingBreakdown | null>(null);

  // ---- Customer lookup (Step 4) --------------------------------------------
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
          setFirstName(exact.firstName);
          setLastName(exact.lastName);
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
    setFirstName(c.firstName);
    setLastName(c.lastName);
    setCustomerPhone(c.phone ?? "");
    setShowCustomerList(false);
  };

  /**
   * Quote a gift-card or promo code against the current subtotal. The endpoints
   * only validate — the backend redeems on booking creation — so a success here
   * just shows what the code is worth.
   */
  const applyCode = async (kind: "gift" | "promo") => {
    const code = (kind === "gift" ? giftCode : promoCode).trim();
    if (!code) return;
    const token = getToken();
    if (!token) return;
    setCodeBusy(kind);
    try {
      const validate =
        kind === "gift" ? validateGiftCardCode : validatePromoCode;
      const result = await validate({
        token,
        code,
        subtotal,
        locationId: effectiveLocationId,
      });
      if (kind === "gift") setGiftResult(result);
      else setPromoResult(result);
    } catch (err) {
      const failed: DiscountCodeResult = {
        valid: false,
        discountAmount: 0,
        message:
          err instanceof Error ? err.message : "Could not check that code.",
        balance: null,
      };
      if (kind === "gift") setGiftResult(failed);
      else setPromoResult(failed);
    } finally {
      setCodeBusy(null);
    }
  };

  // Hydrate the full package on selection (relations needed for Steps 3 & 5).
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
      setSlot(null);
      setSlots([]);
      setScheduledDate("");
      setGohName("");
      setGohAge("");
      setGohGender("");
    } catch {
      Alert.alert("Couldn't load package", "Please try selecting it again.");
    } finally {
      setPickingId(null);
    }
  };

  // ---- Availability (Step 2: package + date → time slots with room) --------
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

  /**
   * Call to Book: whether the selected package has any usable schedule at all.
   * The package list this screen browses is the slim one, which carries no
   * schedules, so they are read from the same endpoint manual-booking uses.
   * `null` means "not known yet" — the booking UI is left alone until it is.
   */
  const [pkgSchedules, setPkgSchedules] = useState<
    PackageAvailabilitySchedule[] | null
  >(null);
  useEffect(() => {
    setPkgSchedules(null);
    if (!pkg) return;
    const token = getToken();
    if (!token) return;
    let active = true;
    fetchPackageAvailabilitySchedules(token, pkg.id)
      .then((s) => active && setPkgSchedules(s))
      .catch(() => active && setPkgSchedules(null));
    return () => {
      active = false;
    };
  }, [pkg]);

  const callToBook =
    !!pkg && pkgSchedules !== null && packageIsCallToBook(pkgSchedules);
  const [callToBookOpen, setCallToBookOpen] = useState(false);

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

  const extraParticipants = Math.max(0, participants - (pkg?.minParticipants || 1));

  /** Selected add-ons / attractions with line totals, for the summary lists. */
  const chosenAddOns = useMemo(
    () =>
      (pkg?.addOns ?? [])
        .map((item) => ({ item, qty: addonQty[item.id] ?? 0 }))
        .filter(({ qty }) => qty > 0)
        .map(({ item, qty }) => ({ item, qty, lineTotal: item.price * qty })),
    [pkg, addonQty],
  );

  const chosenAttractions = useMemo(
    () =>
      (pkg?.attractions ?? [])
        .map((item) => ({ item, qty: attractionQty[item.id] ?? 0 }))
        .filter(({ qty }) => qty > 0)
        .map(({ item, qty }) => ({
          item,
          qty,
          lineTotal:
            item.pricingType === "per_person"
              ? item.price * qty * participants
              : item.price * qty,
        })),
    [pkg, attractionQty, participants],
  );

  const effectiveLocationId = pkg?.locationId ?? selectedLocationId ?? user?.location_id ?? null;

  /** Venue name + number for the Call to Book card — the booking's own venue. */
  const { name: venueName, phone: venuePhone } =
    useVenuePhone(effectiveLocationId);

  // Accept.js credentials for the booking's location — fetched as soon as the
  // card method is active, exactly like the web `initializeAuthorizeNet`.
  useEffect(() => {
    if (paymentMethod !== "authorize.net" || effectiveLocationId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchAuthorizeNetPublicKey(token, effectiveLocationId, controller.signal)
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
  }, [paymentMethod, effectiveLocationId]);

  // Fees load as soon as a package is picked so the Booking Summary shows the
  // venue fee on every step, as the web's live summary does.
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
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, subtotal, effectiveLocationId]);

  // Special pricing needs a date, matching the web's gate.
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
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pkg, scheduledDate, slot, effectiveLocationId]);

  // Submitted total = base+fees (web); discount is sent separately.
  const submitTotal = feeBreakdown ? feeBreakdown.total : subtotal;
  // Special pricing plus whatever a validated gift card / promo code takes off.
  const codeDiscount =
    (giftResult?.valid ? giftResult.discountAmount : 0) +
    (promoResult?.valid ? promoResult.discountAmount : 0);
  const discount =
    (special?.has_special_pricing ? special.total_discount : 0) + codeDiscount;
  const displayTotal = Math.max(0, submitTotal - discount);

  // Quoted off the pre-fee subtotal, as the web's calculatePartialAmount does.
  const partialDeposit = useMemo(() => {
    if (!pkg) return 0;
    if (pkg.partialPaymentPercentage && pkg.partialPaymentPercentage > 0) {
      return Math.round(subtotal * (pkg.partialPaymentPercentage / 100) * 100) / 100;
    }
    if (pkg.partialPaymentFixed && pkg.partialPaymentFixed > 0) {
      return Math.min(pkg.partialPaymentFixed, subtotal);
    }
    return 0;
  }, [pkg, subtotal]);

  // The partial option is unselectable without a configured deposit.
  useEffect(() => {
    if (pkg && paymentType === "partial" && partialDeposit <= 0) {
      setPaymentType("full");
    }
  }, [pkg, paymentType, partialDeposit]);

  const cardValid = validateCardNumber(cardNumber);
  const inStoreTyped = Math.max(0, Number(inStoreAmount) || 0);

  /** What is owed right now — web order: pay-later 0 → in-store field → custom → partial → full. */
  const dueNow = useMemo(() => {
    if (paymentMethod === "paylater") return 0;
    if (paymentMethod === "in-store" && inStoreTyped > 0) {
      return Math.min(inStoreTyped, submitTotal);
    }
    if (paymentType === "custom") {
      return Math.min(Math.max(0, Number(customAmount) || 0), submitTotal);
    }
    // Packages with no deposit configured fall back to the full amount.
    if (paymentType === "partial" && partialDeposit > 0) {
      return Math.min(partialDeposit, submitTotal);
    }
    return submitTotal;
  }, [
    paymentMethod,
    paymentType,
    submitTotal,
    partialDeposit,
    customAmount,
    inStoreTyped,
  ]);

  // Web parity: the card leg charges exactly what is due now, so the booking
  // records the same figure the gateway is asked for.
  const amountPaid = dueNow;

  /**
   * Card pre-flight — the web's validation order, run before anything is
   * written. Returns the reason to show, or null when the card leg may proceed.
   */
  const cardPreflightError = (): string | null => {
    if (!cardNumber || !cardMonth || !cardYear || !cardCvv)
      return "Please fill in all card details";
    if (!validateCardNumber(cardNumber)) return "Invalid card number";
    if (isTestCardNumber(cardNumber))
      return "Test card numbers are not allowed. Please use a real card.";
    if (!authorizeCredentials?.apiLoginId)
      return "Payment system not initialized. Please reopen this screen and try again.";
    return null;
  };

  const balance = Math.max(0, submitTotal - dueNow);

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


  const genderOptions: { label: string; value: "male" | "female" | "other" }[] = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Other", value: "other" },
  ];

  // ---- Per-step validation -------------------------------------------------
  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return !!pkg;
      case 2:
        // Date + participants are required; a slot only when the package has
        // any (otherwise the backend auto-assigns the space, as on the web).
        return !!scheduledDate && participants >= 1 && (slots.length === 0 || !!slot);
      case 3:
        return true;
      case 4:
        return customerName.trim().length > 0;
      default:
        return true;
    }
  }, [step, pkg, scheduledDate, slot, slots.length, participants, customerName]);

  // A card booking can't be confirmed until the card details are complete and
  // the location actually has a merchant account (web parity).
  const cardIncomplete =
    !cardNumber || !cardMonth || !cardYear || !cardCvv || !cardValid;
  const confirmDisabled =
    submitting ||
    isProcessingPayment ||
    (paymentMethod === "authorize.net" &&
      amountPaid > 0 &&
      (cardIncomplete || authorizeUnavailable));

  const goNext = () => {
    if (!stepValid) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const durationForPayload = (): { duration: number; unit: string } => {
    if (!pkg) return { duration: 0, unit: "hours" };
    return { duration: pkg.duration, unit: pkg.durationUnit };
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    if (!pkg) return;
    if (!customerName.trim() || !scheduledDate || !slot || effectiveLocationId == null) {
      Alert.alert("Incomplete booking", "Please complete every step before submitting.");
      return;
    }
    if (paymentMethod !== "paylater" && paymentType === "custom" && !(Number(customAmount) > 0)) {
      Alert.alert("Invalid amount", "Enter a valid custom payment amount.");
      return;
    }
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 3000) return;
    lastSubmitAtRef.current = now;

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    // The web only runs the card leg when there is something to collect; a
    // zero-due card booking is created like any other unpaid booking.
    const isCardPayment = paymentMethod === "authorize.net" && amountPaid > 0;
    if (isCardPayment) {
      const reason = cardPreflightError();
      if (reason) {
        setPaymentError(reason);
        Alert.alert("Check card details", reason);
        return;
      }
      setPaymentError("");
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setIsProcessingPayment(isCardPayment);
    try {
      const additionalAddons = pkg.addOns
        .filter((a) => (addonQty[a.id] ?? 0) > 0)
        .map((a) => ({ addon_id: a.id, quantity: addonQty[a.id], price_at_booking: a.price }));
      const additionalAttractions = pkg.attractions
        .filter((a) => (attractionQty[a.id] ?? 0) > 0)
        .map((a) => ({ attraction_id: a.id, quantity: attractionQty[a.id], price_at_booking: a.price }));

      const { duration, unit } = durationForPayload();

      const paymentStatus: "paid" | "partial" | "pending" =
        amountPaid >= submitTotal
          ? "paid"
          : amountPaid > 0
            ? "partial"
            : "pending";

      const { id, referenceNumber, customerId } = await createBooking(token, {
        guest_name: customerName.trim(),
        guest_email: customerEmail.trim() || undefined,
        guest_phone: customerPhone.trim() || undefined,
        guest_address: address.trim() || undefined,
        guest_city: city.trim() || undefined,
        guest_state: stateField.trim() || undefined,
        guest_zip: zip.trim() || undefined,
        guest_country: country.trim() || undefined,
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
        // Web parity: in-store confirms immediately, pay-later is pending, and
        // the card leg sends neither — the charge endpoint sets both once the
        // gateway approves.
        ...(paymentMethod === "in-store"
          ? { status: "confirmed" as const, payment_status: paymentStatus }
          : paymentMethod === "paylater"
            ? { payment_status: "pending" as const }
            : {}),
        notes: notes.trim() || undefined,
        additional_addons: additionalAddons.length ? additionalAddons : undefined,
        additional_attractions: additionalAttractions.length ? additionalAttractions : undefined,
        created_by: user?.id,
        guest_of_honor_name:
          pkg.hasGuestOfHonor && gohName.trim() ? gohName.trim() : undefined,
        guest_of_honor_age:
          pkg.hasGuestOfHonor && gohAge.trim() ? Number(gohAge) : undefined,
        guest_of_honor_gender:
          pkg.hasGuestOfHonor && gohGender ? gohGender : undefined,
        sent_email_to_staff: sendStaffEmail,
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

      if (isCardPayment) {
        // The web encodes the booking's reference number (not its id) — that is
        // what the check-in scanner reads off a booking QR.
        const qrCode = referenceNumber ? await qr.generate(referenceNumber) : null;

        let response;
        try {
          response = await processCardPayment(
            token,
            {
              cardNumber: cardNumber.replace(/\s/g, ""),
              month: cardMonth,
              year: cardYear,
              cardCode: cardCvv,
            },
            authorizeCredentials!,
            {
              location_id: effectiveLocationId,
              amount: amountPaid,
              order_id: `P${pkg.id}-${String(Date.now()).slice(-8)}`,
              description: `On-Site Booking: ${pkg.name}`,
              customer_id: customerId ?? undefined,
              payable_id: id,
              payable_type: PAYMENT_TYPE.BOOKING,
              send_email: sendEmail,
              qr_code: qrCode ?? undefined,
              customer: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: customerEmail.trim(),
                phone: customerPhone.trim(),
                address: address.trim(),
                city: city.trim(),
                state: stateField.trim(),
                zip: zip.trim(),
                country: country.trim(),
              },
            },
          );
        } catch (payErr) {
          // A lost response can't prove the card wasn't charged, so keep the
          // booking and let staff reconcile rather than risk a double charge.
          if (chargeOutcomeUnknown(payErr)) {
            setPaymentError(CHARGE_UNKNOWN_MESSAGE);
            Alert.alert("Payment status unknown", CHARGE_UNKNOWN_MESSAGE);
            return;
          }
          await rollbackBooking(token, id);
          markBookingsStale();
          setPaymentError(getPaymentErrorMessage(payErr));
          Alert.alert(
            "Payment failed",
            `${getPaymentErrorMessage(payErr)}\n\nThe booking has been cancelled and no charges were made.`,
          );
          return;
        }

        if (!response.success) {
          await rollbackBooking(token, id);
          markBookingsStale();
          const message = declineMessage(response.message, "booking");
          setPaymentError(message);
          Alert.alert("Payment declined", message);
          return;
        }
        setPaymentError("");
      }

      markBookingsStale();
      Alert.alert("Booking created", `Reference: ${referenceNumber ?? id}`, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(
        "Failed to create booking",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
      setIsProcessingPayment(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Off-screen QR, mounted only while a receipt QR is being generated. */}
      {qr.node}

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

      <StepIndicator step={step} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        >
          {/* Step heading, matching the web wizard's per-step <h2>. */}
          <Text className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            {STEP_HEADINGS[step - 1]}
          </Text>

          {/* ============================ STEP 1 — PACKAGE ==================== */}
          {step === 1 && (
            <>
              {/* Location filter (company admin) — inline chips, optional. */}
              {isCompanyAdmin && locationOptions.length > 0 && (
                <Section icon="map-pin" title="Location">
                  <Text className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                    Optional — narrow the package list to one location.
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[{ id: "all" as const, name: "All Locations" }, ...locationOptions].map(
                      (o) => {
                        const active =
                          (o.id === "all" && selectedLocationId == null) ||
                          o.id === selectedLocationId;
                        return (
                          <Pressable
                            key={String(o.id)}
                            onPress={() => {
                              setSelectedLocationId(o.id === "all" ? null : o.id);
                              setPkg(null);
                            }}
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

              {/* Package list — rendered IN-PAGE (like the web renderStep1), not
                  in a Modal/BottomSheet, with an inline search box. */}
              <Section icon="package" title="Packages">
                <View className="h-12 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 rounded-lg border border-gray-300 dark:border-neutral-700 mb-4">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={packageSearch}
                    onChangeText={setPackageSearch}
                    placeholder="Search packages by name, category, or description..."
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
                    {packageSearch.trim() ? "No packages match your search." : "No packages found."}
                  </Text>
                ) : (
                  <>
                    {packageItems.map((p) => {
                      const active = pkg?.id === p.id;
                      const picking = pickingId === p.id;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => pickPackage(p)}
                          disabled={pickingId != null}
                          className={`rounded-lg border p-4 mb-3 ${
                            active
                              ? "border-[#0644C7] bg-[#0644C7]/5"
                              : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                          }`}
                        >
                          {/* Name + price, price right-aligned with its unit */}
                          <View className="flex-row items-start justify-between gap-3">
                            <Text
                              className="flex-1 text-base font-bold text-gray-900 dark:text-white"
                              numberOfLines={2}
                            >
                              {p.name}
                            </Text>
                            <View className="items-end">
                              <View className="flex-row items-start">
                                <Text className="text-[10px] text-gray-400 mt-1">$</Text>
                                <Text className="text-2xl font-bold text-[#0644C7] dark:text-blue-400">
                                  {p.price % 1 === 0 ? p.price : p.price.toFixed(2)}
                                </Text>
                              </View>
                              <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                                per booking
                              </Text>
                            </View>
                          </View>

                          {!!p.description && (
                            <Text
                              numberOfLines={3}
                              className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300"
                            >
                              {p.description}
                            </Text>
                          )}

                          {/* Chips: location · category · duration · capacity */}
                          <View className="mt-3 flex-row flex-wrap items-center gap-2">
                            {!!p.locationName && (
                              <View className="flex-row items-center gap-1 rounded border border-blue-200 px-2 py-1 dark:border-blue-900/50">
                                <Feather name="map-pin" size={10} color={PRIMARY} />
                                <Text className="text-[11px] text-[#0644C7] dark:text-blue-300">
                                  {p.locationName}
                                </Text>
                              </View>
                            )}
                            {!!p.category && (
                              <View className="flex-row items-center gap-1 rounded border border-gray-200 px-2 py-1 dark:border-neutral-700">
                                <Feather name="tag" size={10} color="#6B7280" />
                                <Text className="text-[11px] text-gray-700 dark:text-gray-200">
                                  {p.category}
                                </Text>
                              </View>
                            )}
                            {p.duration > 0 && (
                              <View className="flex-row items-center gap-1 rounded border border-purple-200 px-2 py-1 dark:border-purple-900/50">
                                <Feather name="clock" size={10} color="#9333EA" />
                                <Text className="text-[11px] text-purple-700 dark:text-purple-300">
                                  {p.duration} {p.durationUnit}
                                </Text>
                              </View>
                            )}
                            {p.maxParticipants > 0 && (
                              <View className="flex-row items-center gap-1 rounded border border-green-200 px-2 py-1 dark:border-green-900/50">
                                <Feather name="users" size={10} color="#16A34A" />
                                <Text className="text-[11px] text-green-700 dark:text-green-300">
                                  Up to {p.maxParticipants}
                                </Text>
                              </View>
                            )}
                            {picking && (
                              <ActivityIndicator size="small" color={PRIMARY} />
                            )}
                            {active && !picking && (
                              <Feather name="check-circle" size={16} color={PRIMARY} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}

                    {pkgPage < pkgLastPage && (
                      <Pressable
                        onPress={loadMorePackages}
                        disabled={loadingMore}
                        className="mt-1 py-3 items-center rounded-xl border border-gray-200 dark:border-neutral-700"
                      >
                        {loadingMore ? (
                          <ActivityIndicator size="small" color={PRIMARY} />
                        ) : (
                          <Text className="text-sm font-semibold text-[#0644C7]">
                            Load more
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </>
                )}
              </Section>
            </>
          )}

          {/* ============================ STEP 2 — DATE & TIME =============== */}
          {step === 2 && pkg && (
            <Section icon="calendar" title="Select Date">
              {/* Inline month grid — past days are unavailable, today onward
                  selectable, matching the web's Select Date card. */}
              <MonthCalendar
                value={scheduledDate}
                onSelect={(key) => {
                  setScheduledDate(key);
                  setSlot(null);
                }}
              />

              {/* Participants — moved here from the add-ons step so the web's
                  "Number of Participants" sits with date + time. */}
              <View className="mt-5 border-t border-gray-100 pt-4 dark:border-neutral-800">
                <View className="mb-2 flex-row items-center gap-1.5">
                  <Feather name="users" size={14} color="#6B7280" />
                  <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Number of Participants
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Stepper
                    value={participants}
                    onChange={setParticipants}
                    min={1}
                    max={pkg.maxParticipants > 0 ? pkg.maxParticipants : 99}
                  />
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {pkg.minParticipants > 0
                      ? `${pkg.minParticipants} included`
                      : ""}
                    {pkg.minParticipants > 0 && pkg.maxParticipants > 0 ? " • " : ""}
                    {pkg.maxParticipants > 0 ? `Max: ${pkg.maxParticipants}` : ""}
                  </Text>
                </View>
              </View>

              {/* Time slots — radio cards showing start and end, as on the web.
                  With no usable schedule at this venue there is nothing to pick,
                  so the Call to Book card takes their place. */}
              <View className="mt-5 border-t border-gray-100 pt-4 dark:border-neutral-800">
                {callToBook ? (
                  <CallToBookCard
                    venueName={venueName}
                    venuePhone={venuePhone}
                    itemLabel="package"
                    onRequestCall={() => setCallToBookOpen(true)}
                  />
                ) : (
                <>
                <View className="mb-2 flex-row items-center gap-1.5">
                  <Feather name="clock" size={14} color="#6B7280" />
                  <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Select Time Slot
                  </Text>
                </View>

                {!scheduledDate ? (
                  <View className="rounded-lg bg-gray-50 p-4 dark:bg-neutral-800/50">
                    <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Pick a date to see available times.
                    </Text>
                  </View>
                ) : loadingSlots ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : slots.length === 0 ? (
                  <View className="rounded-lg bg-gray-50 p-4 dark:bg-neutral-800/50">
                    <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                      No available time slots for the selected date. Space will be
                      auto-assigned.
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap -m-1">
                    {slots.map((s) => {
                      const active =
                        slot?.startTime === s.startTime &&
                        slot?.roomId === s.roomId;
                      return (
                        <View
                          key={`${s.startTime}-${s.roomId ?? "auto"}`}
                          style={{ width: "50%" }}
                          className="p-1"
                        >
                          <Pressable
                            onPress={() => setSlot(s)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            className={`flex-row items-start gap-2 rounded-lg border p-3 ${
                              active
                                ? "border-[#0644C7] bg-[#0644C7]/5"
                                : "border-gray-200 dark:border-neutral-700"
                            }`}
                          >
                            <Feather
                              name={active ? "check-circle" : "circle"}
                              size={14}
                              color={active ? PRIMARY : "#9CA3AF"}
                            />
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                                {formatTime(s.startTime)}
                              </Text>
                              <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                                to {formatTime(s.endTime)}
                              </Text>
                            </View>
                            {/* Live seats left in this slot — amber pill at 3 or
                                fewer, else emerald (web OnsiteBooking). */}
                            {s.remainingTickets != null && (
                              <View
                                className={`rounded-full px-1.5 py-0.5 ${
                                  isLowRemaining(s.remainingTickets)
                                    ? "bg-amber-100 dark:bg-amber-900/30"
                                    : "bg-emerald-100 dark:bg-emerald-900/30"
                                }`}
                              >
                                <Text
                                  className={`text-[11px] font-semibold ${
                                    isLowRemaining(s.remainingTickets)
                                      ? "text-amber-800 dark:text-amber-300"
                                      : "text-emerald-800 dark:text-emerald-300"
                                  }`}
                                >
                                  {s.remainingTickets} left
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
                </>
                )}
              </View>

              {/* Session duration — the web's footer row on this card. */}
              <View className="mt-4 flex-row items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-neutral-800/50">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="clock" size={14} color="#6B7280" />
                  <Text className="text-sm text-gray-600 dark:text-gray-300">
                    Session Duration
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {pkg.duration} {pkg.durationUnit}
                </Text>
              </View>
            </Section>
          )}

          {/* ============================ STEP 3 — ADD-ONS & DETAILS ======== */}
          {step === 3 && pkg && (
            <>
              {pkg.addOns.length > 0 && (
                <Section icon="plus-circle" title="Package Add-ons">
                  {pkg.addOns.map((a) => (
                    <AddOnRow
                      key={a.id}
                      name={a.name}
                      price={money(a.price)}
                      qty={addonQty[a.id] ?? 0}
                      image={a.image}
                      onAdd={() =>
                        setAddonQty((p) => ({ ...p, [a.id]: (p[a.id] ?? 0) + 1 }))
                      }
                      onChange={(n) => setAddonQty((p) => ({ ...p, [a.id]: n }))}
                    />
                  ))}
                </Section>
              )}

              {pkg.attractions.length > 0 && (
                <Section icon="zap" title="Attractions">
                  {pkg.attractions.map((a) => (
                    <AddOnRow
                      key={a.id}
                      name={a.name}
                      price={`${money(a.price)}${a.pricingType === "per_person" ? " /person" : ""}`}
                      qty={attractionQty[a.id] ?? 0}
                      onAdd={() =>
                        setAttractionQty((p) => ({
                          ...p,
                          [a.id]: (p[a.id] ?? 0) + 1,
                        }))
                      }
                      onChange={(n) =>
                        setAttractionQty((p) => ({ ...p, [a.id]: n }))
                      }
                    />
                  ))}
                </Section>
              )}

              {pkg.addOns.length === 0 && pkg.attractions.length === 0 && (
                <Section icon="plus-circle" title="Package Add-ons">
                  <Text className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                    No add-ons or attractions available for this package.
                  </Text>
                </Section>
              )}

            </>
          )}

          {/* ============================ STEP 4 — CUSTOMER ================= */}
          {step === 4 && (
            <>
              <Section icon="user" title="Contact Details">
                <InputField
                  label="Email Address *"
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  placeholder="john.doe@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  We&apos;ll auto-fill info if this customer exists
                </Text>
                {showCustomerList && (
                  <View className="mt-2 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    {foundCustomers.slice(0, 5).map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => selectCustomer(c)}
                        className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 active:bg-gray-50 dark:active:bg-neutral-800"
                      >
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">
                          {`${c.firstName} ${c.lastName}`.trim()}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {c.email}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View className="mt-4 flex-row gap-3">
                  <View className="flex-1">
                    <InputField
                      label="First Name *"
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="John"
                    />
                  </View>
                  <View className="flex-1">
                    <InputField
                      label="Last Name *"
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Doe"
                    />
                  </View>
                </View>

                <View className="mt-4">
                  <InputField
                    label="Phone Number *"
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder="+1 (555) 123-4567"
                    keyboardType="phone-pad"
                  />
                </View>
              </Section>

              {/* Discounts & Promotions — validated against the current subtotal;
                  the codes are redeemed server-side when the booking is created. */}
              <Section icon="gift" title="Discounts &amp; Promotions">
                <FieldLabel>Gift Card Code</FieldLabel>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <InputField
                      label=""
                      value={giftCode}
                      onChangeText={setGiftCode}
                      placeholder="GIFT-XXXX"
                      autoCapitalize="characters"
                    />
                  </View>
                  <Pressable
                    onPress={() => applyCode("gift")}
                    disabled={codeBusy !== null || !giftCode.trim()}
                    className={`h-14 items-center justify-center rounded-lg bg-[#0644C7] px-5 ${
                      codeBusy !== null || !giftCode.trim()
                        ? "opacity-50"
                        : "active:opacity-90"
                    }`}
                  >
                    {codeBusy === "gift" ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text className="text-sm font-semibold text-white">Apply</Text>
                    )}
                  </Pressable>
                </View>
                {!!giftResult && (
                  <Text
                    className={`mt-1 text-xs ${
                      giftResult.valid
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500"
                    }`}
                  >
                    {giftResult.valid
                      ? `Applied — ${money(giftResult.discountAmount)} off${
                          giftResult.balance != null
                            ? ` (balance ${money(giftResult.balance)})`
                            : ""
                        }`
                      : giftResult.message}
                  </Text>
                )}

                <View className="mt-4">
                  <FieldLabel>Promo Code</FieldLabel>
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <InputField
                        label=""
                        value={promoCode}
                        onChangeText={setPromoCode}
                        placeholder="PROMO-XXXX"
                        autoCapitalize="characters"
                      />
                    </View>
                    <Pressable
                      onPress={() => applyCode("promo")}
                      disabled={codeBusy !== null || !promoCode.trim()}
                      className={`h-14 items-center justify-center rounded-lg bg-[#0644C7] px-5 ${
                        codeBusy !== null || !promoCode.trim()
                          ? "opacity-50"
                          : "active:opacity-90"
                      }`}
                    >
                      {codeBusy === "promo" ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text className="text-sm font-semibold text-white">Apply</Text>
                      )}
                    </Pressable>
                  </View>
                  {!!promoResult && (
                    <Text
                      className={`mt-1 text-xs ${
                        promoResult.valid
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-500"
                      }`}
                    >
                      {promoResult.valid
                        ? `Applied — ${money(promoResult.discountAmount)} off`
                        : promoResult.message}
                    </Text>
                  )}
                </View>

                {/* Raw TextInput so the multi-line placeholder wraps instead of
                    being clipped by InputField's fixed-height row. */}
                <View className="mt-4 border-t border-gray-100 pt-4 dark:border-neutral-800">
                  <FieldLabel>Additional Notes (Optional)</FieldLabel>
                  <View className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Any special requests, dietary restrictions, or important information..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      textAlignVertical="top"
                      className="min-h-[88px] text-base text-gray-900 dark:text-white"
                    />
                  </View>
                </View>
              </Section>

              {/* Guest of Honor — only for packages that track one. */}
              {pkg?.hasGuestOfHonor && (
                <Section icon="star" title="Guest of Honor Information">
                  <InputField
                    label="Guest of Honor Name"
                    value={gohName}
                    onChangeText={setGohName}
                    placeholder="Enter guest of honor name"
                  />
                  <View className="mt-4">
                    <InputField
                      label="Age"
                      value={gohAge}
                      onChangeText={setGohAge}
                      placeholder="Age"
                      keyboardType="number-pad"
                    />
                  </View>
                  <View className="mt-4">
                    <FieldLabel>Gender</FieldLabel>
                    <View className="flex-row gap-2">
                      {genderOptions.map((g) => {
                        const active = gohGender === g.value;
                        return (
                          <Pressable
                            key={g.value}
                            onPress={() => setGohGender(active ? "" : g.value)}
                            className={`flex-1 items-center py-2.5 rounded-lg border ${
                              active
                                ? "bg-[#0644C7] border-[#0644C7]"
                                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                            }`}
                          >
                            <Text
                              className={`text-sm font-medium ${
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
                    {!gohGender && (
                      <Text className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                        Select Gender
                      </Text>
                    )}
                  </View>
                </Section>
              )}

              {/* Guest Address — all optional, posted as guest_* on create. */}
              <Section icon="map-pin" title="Guest Address (Optional)">
                {/* Stacked full-width — the web's grid is single-column at this size,
                    and the long labels wrap when squeezed into half a row. */}
                <InputField
                  label="Street Address (Optional)"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Enter street address"
                  autoCapitalize="words"
                />
                <View className="mt-4">
                  <InputField
                    label="City (Optional)"
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    autoCapitalize="words"
                  />
                </View>
                <View className="mt-4">
                  <InputField
                    label="State/Province (Optional)"
                    value={stateField}
                    onChangeText={setStateField}
                    placeholder="State/Province"
                    autoCapitalize="words"
                  />
                </View>
                <View className="mt-4">
                  <InputField
                    label="ZIP/Postal Code (Optional)"
                    value={zip}
                    onChangeText={setZip}
                    placeholder="ZIP/Postal Code"
                    autoCapitalize="characters"
                  />
                </View>
                <View className="mt-4">
                  <InputField
                    label="Country (Optional)"
                    value={country}
                    onChangeText={setCountry}
                    placeholder="Country"
                    autoCapitalize="words"
                  />
                </View>
              </Section>
            </>
          )}

          {/* ============================ STEP 5 — REVIEW & PAYMENT ========== */}
          {step === 5 && pkg && (
            <>
              {/* Review — package, booking details, customer (web's left column) */}
              <Section icon="package" title={pkg.name}>
                {!!pkg.image && (
                  <Image
                    source={{ uri: pkg.image }}
                    style={{
                      width: "100%",
                      height: 140,
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                    contentFit="cover"
                  />
                )}
                {!!pkg.description && (
                  <Text className="text-xs leading-5 text-gray-600 dark:text-gray-300">
                    {pkg.description}
                  </Text>
                )}
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  {!!pkg.category && (
                    <View className="rounded border border-gray-200 px-2 py-1 dark:border-neutral-700">
                      <Text className="text-[11px] text-gray-700 dark:text-gray-200">
                        {pkg.category}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1 rounded border border-purple-200 px-2 py-1 dark:border-purple-900/50">
                    <Feather name="clock" size={10} color="#9333EA" />
                    <Text className="text-[11px] text-purple-700 dark:text-purple-300">
                      {pkg.duration} {pkg.durationUnit}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1 rounded border border-green-200 px-2 py-1 dark:border-green-900/50">
                    <Feather name="users" size={10} color="#16A34A" />
                    <Text className="text-[11px] text-green-700 dark:text-green-300">
                      {participants} Participant{participants === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              </Section>

              <Section icon="calendar" title="Booking Details">
                <ReviewRow label="Date:" value={dateLabel ?? "—"} />
                <ReviewRow
                  label="Time:"
                  value={slot ? formatTime(slot.startTime) : "—"}
                />
                <ReviewRow
                  label="Space:"
                  value={slot?.roomName || "Auto-assigned"}
                />
                <ReviewRow
                  label="Duration:"
                  value={`${pkg.duration} ${pkg.durationUnit}`}
                />
              </Section>

              {chosenAttractions.length > 0 && (
                <Section icon="zap" title="Additional Attractions">
                  {chosenAttractions.map(({ item, qty, lineTotal }) => (
                    <SummaryItemRow
                      key={item.id}
                      name={item.name}
                      meta={`Quantity: ${qty} × ${money(item.price)}${
                        item.pricingType === "per_person"
                          ? ` × ${participants} participants`
                          : ""
                      }`}
                      amount={money(lineTotal)}
                    />
                  ))}
                </Section>
              )}

              {chosenAddOns.length > 0 && (
                <Section icon="plus-circle" title="Add-ons">
                  {chosenAddOns.map(({ item, qty, lineTotal }) => (
                    <SummaryItemRow
                      key={item.id}
                      image={item.image}
                      name={item.name}
                      meta={`Quantity: ${qty} × ${money(item.price)}`}
                      amount={money(lineTotal)}
                    />
                  ))}
                </Section>
              )}

              <Section icon="user" title="Customer Information">
                <ReviewRow label="Name:" value={customerName || "—"} />
                <ReviewRow label="Email:" value={customerEmail.trim() || "—"} />
                <ReviewRow label="Phone:" value={customerPhone.trim() || "—"} />
              </Section>

              {/* Payment Details — the web's right column */}
              <Section icon="credit-card" title="Payment Details">
                <FieldLabel>Payment Method</FieldLabel>
                <View className="flex-row gap-2 mb-4">
                  {(
                    [
                      { v: "authorize.net", label: "Online", icon: "credit-card" as IconName },
                      { v: "in-store", label: "In-Store", icon: "dollar-sign" as IconName },
                      { v: "paylater", label: "Pay Later", icon: "clock" as IconName },
                    ] as const
                  ).map((m) => {
                    const active = paymentMethod === m.v;
                    return (
                      <Pressable
                        key={m.v}
                        onPress={() => setPaymentMethod(m.v)}
                        className={`flex-1 items-center gap-1 py-3 rounded-lg border ${
                          active
                            ? "border-[#0644C7] bg-[#0644C7]/5"
                            : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                        }`}
                      >
                        <Feather
                          name={m.icon}
                          size={18}
                          color={active ? PRIMARY : "#6b7280"}
                        />
                        <Text
                          className={`text-xs font-semibold ${
                            active
                              ? "text-[#0644C7] dark:text-blue-300"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {paymentMethod === "paylater" && (
                  <View className="mb-4 flex-row items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/40 dark:bg-orange-900/20">
                    <Feather name="info" size={16} color="#EA580C" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-orange-800 dark:text-orange-300">
                        Payment will be collected later
                      </Text>
                      <Text className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                        No payment is being processed now. Customer will pay at a
                        later time.
                      </Text>
                    </View>
                  </View>
                )}

                {paymentMethod === "in-store" && (
                  <View className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-900/20">
                    <View className="mb-3 flex-row items-start gap-2">
                      <Feather name="dollar-sign" size={16} color="#16A34A" />
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-green-800 dark:text-green-300">
                          In-Store Payment
                        </Text>
                        <Text className="mt-1 text-xs text-green-700 dark:text-green-400">
                          Enter the amount paid in-store to track this payment.
                        </Text>
                      </View>
                    </View>
                    <FieldLabel>How much was paid in-store?</FieldLabel>
                    <View className="h-12 flex-row items-center rounded-lg border border-gray-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
                      <Text className="mr-1 font-medium text-gray-500">$</Text>
                      <TextInput
                        value={inStoreAmount}
                        onChangeText={setInStoreAmount}
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        className="flex-1 py-0 text-base text-gray-900 dark:text-white"
                      />
                    </View>
                    <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Total: {money(submitTotal)} | Remaining: {money(balance)}
                    </Text>
                  </View>
                )}

                {paymentMethod === "authorize.net" && (
                  <View className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <FieldLabel>Card Details</FieldLabel>

                    {/* Web parity: the "Authorize.Net Not Configured" modal. */}
                    {authorizeUnavailable && (
                      <View className="mb-3 flex-row items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900/40 dark:bg-amber-900/20">
                        <Feather name="alert-triangle" size={13} color="#B45309" />
                        <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                          This location has no active Authorize.Net account, so
                          cards can&apos;t be charged. Use In-Store or Pay Later,
                          or ask an administrator to connect the merchant account.
                        </Text>
                      </View>
                    )}

                    <Text className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                      Card Number
                    </Text>
                    <View
                      className={`h-11 flex-row items-center rounded-lg border px-3 ${
                        cardNumber && cardValid
                          ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                          : cardNumber
                            ? "border-red-400"
                            : "border-gray-300 dark:border-neutral-700"
                      }`}
                    >
                      <TextInput
                        value={cardNumber}
                        onChangeText={(v) => setCardNumber(formatCardNumber(v))}
                        placeholder="1234 5678 9012 3456"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        maxLength={19}
                        className="flex-1 py-0 text-sm text-gray-900 dark:text-white"
                      />
                      {!!cardNumber && cardValid && (
                        <Feather name="check-circle" size={15} color="#16A34A" />
                      )}
                    </View>
                    {!!cardNumber && (
                      <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {getCardType(cardNumber)}
                      </Text>
                    )}

                    <View className="mt-3 flex-row gap-2">
                      {(
                        [
                          { label: "Month", value: cardMonth, set: setCardMonth, ph: "MM", max: 2 },
                          { label: "Year", value: cardYear, set: setCardYear, ph: "YYYY", max: 4 },
                          { label: "CVV", value: cardCvv, set: setCardCvv, ph: "123", max: 4 },
                        ] as const
                      ).map((f) => (
                        <View key={f.label} className="flex-1">
                          <Text className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                            {f.label}
                          </Text>
                          <View className="h-11 justify-center rounded-lg border border-gray-300 px-3 dark:border-neutral-700">
                            <TextInput
                              value={f.value}
                              onChangeText={(v) =>
                                f.set(v.replace(/\D/g, "").substring(0, f.max))
                              }
                              placeholder={f.ph}
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              className="py-0 text-sm text-gray-900 dark:text-white"
                            />
                          </View>
                        </View>
                      ))}
                    </View>

                    {!!paymentError && (
                      <View className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-900/40 dark:bg-red-900/20">
                        <Text className="text-xs text-red-800 dark:text-red-300">
                          {paymentError}
                        </Text>
                      </View>
                    )}

                    <View className="mt-3 flex-row items-center gap-1.5">
                      <Feather name="lock" size={12} color="#9CA3AF" />
                      <Text className="text-xs text-gray-600 dark:text-gray-400">
                        Secure payment powered by Authorize.Net
                      </Text>
                    </View>
                  </View>
                )}

                {paymentMethod !== "paylater" && (
                  <>
                    <FieldLabel>Payment Type</FieldLabel>
                    {(
                      [
                        {
                          v: "full",
                          label: "Full Payment",
                          hint: "Pay the complete amount now",
                        },
                        {
                          v: "partial",
                          label: "Partial Payment",
                          hint: `Pay ${money(partialDeposit)} now, remaining ${money(
                            Math.max(0, submitTotal - partialDeposit),
                          )} later`,
                        },
                        {
                          v: "custom",
                          label: "Custom Amount",
                          hint: "Enter a specific deposit amount",
                        },
                      ] as const
                    ).map((t) => {
                      const active = paymentType === t.v;
                      const disabled = t.v === "partial" && partialDeposit <= 0;
                      return (
                        <Pressable
                          key={t.v}
                          onPress={() => !disabled && setPaymentType(t.v)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active, disabled }}
                          className={`mb-2 flex-row items-start gap-2.5 rounded-lg border p-3 ${
                            active
                              ? "border-[#0644C7] bg-[#0644C7]/5"
                              : "border-gray-200 dark:border-neutral-700"
                          } ${disabled ? "opacity-40" : ""}`}
                        >
                          <Feather
                            name={active ? "check-circle" : "circle"}
                            size={15}
                            color={active ? PRIMARY : "#9CA3AF"}
                          />
                          <View className="flex-1">
                            <Text className="text-sm font-medium text-gray-900 dark:text-white">
                              {t.label}
                            </Text>
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              {t.hint}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {paymentType === "custom" && (
                      <View className="mt-1 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-900/20">
                        <FieldLabel>Enter Custom Amount</FieldLabel>
                        <View className="h-12 flex-row items-center rounded-lg border border-green-300 bg-white px-3 dark:border-green-900/50 dark:bg-neutral-900">
                          <Text className="mr-1 font-medium text-gray-500">$</Text>
                          <TextInput
                            value={customAmount}
                            onChangeText={setCustomAmount}
                            placeholder="0.00"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="decimal-pad"
                            className="flex-1 py-0 text-base text-gray-900 dark:text-white"
                          />
                        </View>
                        <View className="mt-2 flex-row justify-between">
                          <Text className="text-xs text-gray-600 dark:text-gray-400">
                            Remaining: {money(balance)}
                          </Text>
                          <Text className="text-xs text-gray-600 dark:text-gray-400">
                            Total: {money(submitTotal)}
                          </Text>
                        </View>
                        {dueNow > 0 && dueNow >= submitTotal && (
                          <Text className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">
                            ✓ This covers the full amount
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}

                {/* Price Breakdown — the web's summary block on this card. */}
                <View className="mt-4 border-t border-gray-100 pt-3 dark:border-neutral-800">
                  <FieldLabel>Price Breakdown</FieldLabel>
                  <View className="rounded-lg bg-gray-50 p-3 dark:bg-neutral-800/50">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          Package: {pkg.name}
                        </Text>
                        <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          Includes {pkg.minParticipants || 1}{" "}
                          {(pkg.minParticipants || 1) > 1
                            ? "participants"
                            : "participant"}
                        </Text>
                      </View>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {money(pkg.price)}
                      </Text>
                    </View>
                  </View>

                  {extraParticipants > 0 && pkg.pricePerAdditional > 0 && (
                    <View className="mt-2 flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-sm text-gray-700 dark:text-gray-200">
                          Additional Participants
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {extraParticipants} extra × {money(pkg.pricePerAdditional)} each
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {money(extraParticipants * pkg.pricePerAdditional)}
                      </Text>
                    </View>
                  )}

                  <View className="mt-2 flex-row items-center justify-between border-t border-gray-200 py-2 dark:border-neutral-700">
                    <Text className="text-sm text-gray-600 dark:text-gray-400">
                      Total Participants
                    </Text>
                    <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {participants}
                    </Text>
                  </View>

                  {chosenAttractions.length > 0 && (
                    <View className="border-t border-gray-200 pt-2 dark:border-neutral-700">
                      <Text className="mb-1 text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Attractions
                      </Text>
                      {chosenAttractions.map(({ item, qty, lineTotal }) => (
                        <View
                          key={item.id}
                          className="mb-1 flex-row items-start justify-between"
                        >
                          <Text className="flex-1 mr-2 text-sm text-gray-700 dark:text-gray-200">
                            {item.name}{" "}
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              ({qty} × {money(item.price)}
                              {item.pricingType === "per_person"
                                ? ` × ${participants} people`
                                : ""}
                              )
                            </Text>
                          </Text>
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {money(lineTotal)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {chosenAddOns.length > 0 && (
                    <View className="border-t border-gray-200 pt-2 dark:border-neutral-700">
                      <Text className="mb-1 text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Add-ons
                      </Text>
                      {chosenAddOns.map(({ item, qty, lineTotal }) => (
                        <View
                          key={item.id}
                          className="mb-1 flex-row items-start justify-between"
                        >
                          <Text className="flex-1 mr-2 text-sm text-gray-700 dark:text-gray-200">
                            {item.name}{" "}
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              ({qty} × {money(item.price)})
                            </Text>
                          </Text>
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {money(lineTotal)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {!!feeBreakdown?.fees.length && (
                    <View className="mt-2 border-t border-gray-200 pt-2 dark:border-neutral-700">
                      {feeBreakdown.fees.map((f) => (
                        <View
                          key={f.fee_support_id}
                          className="mb-1 flex-row items-center justify-between"
                        >
                          <Text
                            numberOfLines={1}
                            className="flex-1 mr-2 text-sm text-gray-700 dark:text-gray-200"
                          >
                            {f.fee_name}
                            {f.fee_label ? ` (${f.fee_label})` : ""}
                          </Text>
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {f.fee_application_type === "additive" ? "+" : ""}
                            {money(f.fee_amount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {discount > 0 && (
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-sm text-green-600 dark:text-green-400">
                        Discounts
                      </Text>
                      <Text className="text-sm font-medium text-green-600 dark:text-green-400">
                        −{money(discount)}
                      </Text>
                    </View>
                  )}

                  <View className="mt-3 flex-row items-center justify-between border-t border-gray-200 pt-3 dark:border-neutral-700">
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      Total
                    </Text>
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {money(displayTotal)}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center justify-between border-t border-dashed border-gray-200 pt-2 dark:border-neutral-700">
                    <Text
                      className={`text-sm font-semibold ${
                        paymentMethod === "paylater"
                          ? "text-orange-700 dark:text-orange-400"
                          : paymentMethod === "in-store" && inStoreTyped > 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-[#0644C7] dark:text-blue-300"
                      }`}
                    >
                      {paymentMethod === "in-store" && inStoreTyped > 0
                        ? "In-Store Amount Paid"
                        : "Amount Due Now"}
                    </Text>
                    <Text
                      className={`text-sm font-semibold ${
                        paymentMethod === "paylater"
                          ? "text-orange-700 dark:text-orange-400"
                          : paymentMethod === "in-store" && inStoreTyped > 0
                            ? "text-green-700 dark:text-green-400"
                            : "text-[#0644C7] dark:text-blue-300"
                      }`}
                    >
                      {money(dueNow)}
                    </Text>
                  </View>
                  {balance > 0 && (
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-xs text-amber-600 dark:text-amber-400">
                        Balance due later
                      </Text>
                      <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {money(balance)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Email toggles — the web's two checkboxes */}
                <View className="mt-4 gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 mr-3 text-sm text-gray-700 dark:text-gray-200">
                      Send confirmation email to customer
                    </Text>
                    <Switch
                      value={sendEmail}
                      onValueChange={setSendEmail}
                      trackColor={{ false: "#D1D5DB", true: PRIMARY }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 mr-3 text-sm text-gray-700 dark:text-gray-200">
                      Send notification email to staff
                    </Text>
                    <Switch
                      value={sendStaffEmail}
                      onValueChange={setSendStaffEmail}
                      trackColor={{ false: "#D1D5DB", true: PRIMARY }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              </Section>
            </>
          )}

          {/* Booking Summary — the web's sticky side rail, stacked at the
              bottom on mobile so it stays visible on every step. */}
          <View
            className="rounded-2xl bg-white dark:bg-neutral-900 p-5 mb-1 shadow-sm border border-gray-100 dark:border-neutral-800"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Feather name="clipboard" size={16} color={PRIMARY} />
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Booking Summary
              </Text>
            </View>

            {!pkg ? (
              <Text className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                No package selected yet
              </Text>
            ) : (
              <>
                {/* Package */}
                <View className="flex-row items-start gap-3">
                  {!!pkg.image && (
                    <Image
                      source={{ uri: pkg.image }}
                      style={{ width: 64, height: 64, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  )}
                  <View className="flex-1">
                    <Text
                      numberOfLines={2}
                      className="text-sm font-bold text-[#0644C7] dark:text-blue-400"
                    >
                      {pkg.name}
                    </Text>
                    {!!pkg.category && (
                      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {pkg.category}
                      </Text>
                    )}
                    <Text className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                      {money(pkg.price)}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                  <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Details
                  </Text>
                  {!!scheduledDate && (
                    <View className="flex-row items-center gap-1.5 py-0.5">
                      <Feather name="calendar" size={12} color="#9CA3AF" />
                      <Text className="text-sm text-gray-700 dark:text-gray-200">
                        {dateLabel}
                      </Text>
                    </View>
                  )}
                  {!!slot && (
                    <View className="flex-row items-center gap-1.5 py-0.5">
                      <Feather name="clock" size={12} color="#9CA3AF" />
                      <Text className="text-sm text-gray-700 dark:text-gray-200">
                        {formatTime(slot.startTime)}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1.5 py-0.5">
                    <Feather name="users" size={12} color="#9CA3AF" />
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      {participants} Participant{participants === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>

                {/* Chosen attractions / add-ons, with their thumbnails. */}
                {chosenAttractions.length > 0 && (
                  <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                    <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Attractions
                    </Text>
                    {chosenAttractions.map(({ item, qty, lineTotal }) => (
                      <SummaryItemRow
                        key={item.id}
                        name={item.name}
                        meta={`Qty: ${qty} × ${money(item.price)}${
                          item.pricingType === "per_person"
                            ? ` × ${participants}`
                            : ""
                        }`}
                        amount={money(lineTotal)}
                      />
                    ))}
                  </View>
                )}

                {chosenAddOns.length > 0 && (
                  <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                    <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Add-ons
                    </Text>
                    {chosenAddOns.map(({ item, qty, lineTotal }) => (
                      <SummaryItemRow
                        key={item.id}
                        image={item.image}
                        name={item.name}
                        meta={`Qty: ${qty} × ${money(item.price)}`}
                        amount={money(lineTotal)}
                      />
                    ))}
                  </View>
                )}

                {(!!firstName || !!customerEmail) && (
                  <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                    <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Customer
                    </Text>
                    {!!`${firstName} ${lastName}`.trim() && (
                      <Text className="text-sm text-gray-900 dark:text-white">
                        {`${firstName} ${lastName}`.trim()}
                      </Text>
                    )}
                    {!!customerEmail && (
                      <Text
                        numberOfLines={1}
                        className="text-xs text-gray-500 dark:text-gray-400"
                      >
                        {customerEmail}
                      </Text>
                    )}
                    {!!customerPhone && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {customerPhone}
                      </Text>
                    )}
                  </View>
                )}

                {/* Price breakdown */}
                <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                  <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Price Breakdown
                  </Text>
                  <View className="rounded-lg bg-gray-50 p-3 dark:bg-neutral-800/50">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">
                          Base Package
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {pkg.name}
                        </Text>
                        {pkg.minParticipants > 0 && (
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            Covers up to {pkg.minParticipants} participants
                          </Text>
                        )}
                      </View>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {money(pkg.price)}
                      </Text>
                    </View>
                  </View>

                  {extraParticipants > 0 && pkg.pricePerAdditional > 0 && (
                    <View className="mt-2 flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <Text className="text-sm text-gray-700 dark:text-gray-200">
                          Additional Participants
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {extraParticipants} extra × {money(pkg.pricePerAdditional)}
                          /person
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        +{money(extraParticipants * pkg.pricePerAdditional)}
                      </Text>
                    </View>
                  )}

                  <View className="mt-2 flex-row items-center justify-between border-t border-gray-100 pt-2 dark:border-neutral-800">
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Total Participants
                    </Text>
                    <Text className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {participants} people
                    </Text>
                  </View>

                  {chosenAttractions.length > 0 && (
                    <View className="mt-2 border-t border-gray-100 pt-2 dark:border-neutral-800">
                      <Text className="mb-1 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
                        Attractions
                      </Text>
                      {chosenAttractions.map(({ item, qty, lineTotal }) => (
                        <View
                          key={item.id}
                          className="mb-1 flex-row items-start justify-between"
                        >
                          <View className="flex-1 mr-2">
                            <Text className="text-xs text-gray-700 dark:text-gray-200">
                              {item.name}
                            </Text>
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              {qty}× {money(item.price)}
                              {item.pricingType === "per_person"
                                ? ` × ${participants} people`
                                : "/unit"}
                            </Text>
                          </View>
                          <Text className="text-xs font-medium text-gray-800 dark:text-gray-100">
                            +{money(lineTotal)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {chosenAddOns.length > 0 && (
                    <View className="mt-2 border-t border-gray-100 pt-2 dark:border-neutral-800">
                      <Text className="mb-1 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
                        Add-ons
                      </Text>
                      {chosenAddOns.map(({ item, qty, lineTotal }) => (
                        <View
                          key={item.id}
                          className="mb-1 flex-row items-start justify-between"
                        >
                          <View className="flex-1 mr-2">
                            <Text className="text-xs text-gray-700 dark:text-gray-200">
                              {item.name}
                            </Text>
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              {qty}× {money(item.price)}
                            </Text>
                          </View>
                          <Text className="text-xs font-medium text-gray-800 dark:text-gray-100">
                            +{money(lineTotal)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {!!feeBreakdown?.fees.length &&
                    feeBreakdown.fees.map((f) => (
                      <View
                        key={f.fee_support_id}
                        className="mt-1 flex-row items-center justify-between"
                      >
                        <Text
                          numberOfLines={1}
                          className="flex-1 mr-2 text-xs text-gray-500 dark:text-gray-400"
                        >
                          {f.fee_name}
                          {f.fee_label ? ` (${f.fee_label})` : ""}
                        </Text>
                        <Text className="text-xs text-gray-700 dark:text-gray-300">
                          {f.fee_application_type === "additive" ? "+" : ""}
                          {money(f.fee_amount)}
                        </Text>
                      </View>
                    ))}
                  {discount > 0 && (
                    <View className="mt-1 flex-row items-center justify-between">
                      <Text className="text-xs text-green-600 dark:text-green-400">
                        Discount
                      </Text>
                      <Text className="text-xs text-green-600 dark:text-green-400">
                        −{money(discount)}
                      </Text>
                    </View>
                  )}

                  <View className="mt-2 flex-row items-center justify-between border-t border-gray-100 pt-2 dark:border-neutral-800">
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      Total
                    </Text>
                    <Text className="text-base font-bold text-[#0644C7] dark:text-blue-400">
                      {money(displayTotal)}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center justify-between rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                    <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                      Due Now
                    </Text>
                    <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
                      {money(amountPaid)}
                    </Text>
                  </View>
                  {balance > 0 && (
                    <View className="mt-1 flex-row items-center justify-between px-3">
                      <Text className="text-xs text-amber-600 dark:text-amber-400">
                        Balance due later
                      </Text>
                      <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {money(balance)}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* Sticky footer: Back / Next / Create */}
        <View
          className="flex-row gap-3 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {step > 1 && (
            <Pressable
              onPress={goBack}
              disabled={submitting}
              className="flex-1 h-14 flex-row items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-80"
            >
              <Feather name="chevron-left" size={18} color="#6B7280" />
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Back
              </Text>
            </Pressable>
          )}

          {step < TOTAL_STEPS ? (
            <Pressable
              onPress={goNext}
              disabled={!stepValid}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] active:opacity-90 ${
                stepValid ? "" : "opacity-40"
              }`}
            >
              <Text className="text-sm font-semibold text-white">Continue</Text>
              <Feather name="chevron-right" size={18} color="#FFFFFF" />
            </Pressable>
          ) : callToBook ? (
            // Nothing to confirm online — the venue takes this on the phone.
            <View className="flex-1 h-14 items-center justify-center rounded-lg border border-teal-200 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-900/20 px-3">
              <Text className="text-xs font-semibold text-teal-800 dark:text-teal-300 text-center">
                Booked by phone — use Call to Book above
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={confirmDisabled}
              className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] active:opacity-90 ${
                confirmDisabled ? "opacity-60" : ""
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Confirm Booking
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <CallToBookSheet
        visible={callToBookOpen}
        onClose={() => setCallToBookOpen(false)}
        locationId={effectiveLocationId}
        venueName={venueName}
        venuePhone={venuePhone}
        entityType="package"
        entityId={pkg?.id ?? null}
        entityName={pkg?.name ?? null}
        initialName={customerName}
        initialPhone={customerPhone}
        initialEmail={customerEmail}
      />
    </View>
  );
};

export default CreateBookingScreen;
