import { Feather } from "@expo/vector-icons";
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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { InputField } from "../../components/ui/InputField";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { markEventPurchasesStale } from "../../lib/hooks/useEventPurchases";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createEventPurchase,
  type CreateEventPurchaseInput,
} from "../../services/eventPurchasesService";
import { fetchEvents, type EventRow } from "../../services/eventsService";
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
    className="h-14 flex-row items-center gap-3 rounded-full border bg-white dark:bg-neutral-900 px-5 border-gray-200 dark:border-neutral-700"
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
  const [paymentMethod, setPaymentMethod] = useState<"in-store" | "paylater">("in-store");
  const [sendEmail, setSendEmail] = useState(true);

  // Customer (email search-as-you-type).
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [foundCustomers, setFoundCustomers] = useState<CustomerHit[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<null | "location" | "date" | "time">(null);
  const submitLockRef = useRef(false);

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
    // Default the date/time to the event's first available slot.
    const dates = eventDateOptions(e);
    const slots = eventTimeSlots(e);
    setPurchaseDate(dates[0]?.value ?? "");
    setPurchaseTime(slots[0] ?? "");
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
    () => (selected ? eventDateOptions(selected) : []),
    [selected],
  );
  const timeOptions = useMemo(
    () => (selected ? eventTimeSlots(selected) : []),
    [selected],
  );

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term),
    );
  }, [events, search]);

  // Totals — base pricing (fees/special-pricing are a later refinement).
  const subtotal = selected ? selected.price * quantity : 0;
  const addOnsTotal = useMemo(() => {
    if (!selected) return 0;
    return selected.addOns.reduce(
      (sum, a) => sum + a.price * (addonQty[a.id] ?? 0),
      0,
    );
  }, [selected, addonQty]);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal + addOnsTotal - discountNum);

  const dateLabel = dateOptions.find((d) => d.value === purchaseDate)?.label ?? null;

  const locationName =
    selectedLocationId == null
      ? "All Locations"
      : (locationOptions.find((l) => l.id === selectedLocationId)?.name ??
        user?.location?.name ??
        null);

  const setAddon = (id: number, n: number) =>
    setAddonQty((prev) => ({ ...prev, [id]: n }));

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
    if (submitLockRef.current) return;

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
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
    const paid = isPayLater ? 0 : Number(amountPaid) > 0 ? Number(amountPaid) : total;

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
      discount_amount: discountNum > 0 ? discountNum : undefined,
      payment_method: paymentMethod,
      payment_status: isPayLater ? "pending" : paid >= total ? "paid" : "partial",
      ...(paymentMethod === "in-store" ? { status: "confirmed" as const } : {}),
      notes:
        notes.trim() ||
        `Event Purchase: ${selected.name} (${quantity} ticket${quantity > 1 ? "s" : ""})`,
      send_email: paymentMethod === "in-store" ? sendEmail : false,
      add_ons: addOnsPayload.length > 0 ? addOnsPayload : undefined,
    };

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await createEventPurchase(token, input);
      markEventPurchasesStale();
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
      submitLockRef.current = false;
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-[#0644C7] pt-12 pb-5 px-5 w-full relative overflow-hidden z-10">
        <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-white/20 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-lg font-bold">New Purchase</Text>
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
                <View className="h-12 flex-row items-center rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 mb-3">
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
              {/* Purchase details */}
              <Section icon="tag" title="Purchase Details">
                <View className="flex-row items-center justify-between mb-4">
                  <FieldLabel>Tickets</FieldLabel>
                  <Stepper value={quantity} onChange={setQuantity} min={1} />
                </View>
                <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-4">
                  {money(selected.price)} × {quantity} ={" "}
                  <Text className="font-semibold text-gray-600 dark:text-gray-300">
                    {money(subtotal)}
                  </Text>
                </Text>

                <InputField
                  label="Discount ($)"
                  value={discount}
                  onChangeText={setDiscount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  containerClassName="mb-4"
                />

                <InputField
                  label="Amount Paid"
                  value={paymentMethod === "paylater" ? "0" : amountPaid}
                  onChangeText={setAmountPaid}
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
                        <Text className="text-xs text-gray-400">{money(addOn.price)} each</Text>
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

              {/* Schedule */}
              <Section icon="calendar" title="Event Date & Slot">
                <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-3">
                  Pick a date and time slot within the events schedule.
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
                      value={purchaseTime ? formatTime(purchaseTime) : null}
                      placeholder="Select time"
                      onPress={() => setSheet("time")}
                    />
                  </View>
                </View>
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
                        onPress={() => {
                          setPaymentMethod(opt.key);
                          if (opt.key === "in-store") setAmountPaid(String(total));
                        }}
                        className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border ${
                          active
                            ? "bg-[#0644C7] border-[#0644C7]"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Feather name={opt.icon} size={16} color={active ? "#FFFFFF" : "#6B7280"} />
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
                      No payment is collected now. The customer will pay later.
                    </Text>
                  </View>
                )}
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  Card (Authorize.Net) payments are available on the web admin.
                </Text>
              </Section>

              {/* Order summary */}
              <Section icon="file-text" title="Order Summary">
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
              </Section>

              {/* Actions */}
              <View className="flex-row gap-3 mt-1">
                <Pressable
                  onPress={() => router.back()}
                  disabled={submitting}
                  className="flex-1 h-14 items-center justify-center rounded-full border border-gray-300 dark:border-neutral-700"
                >
                  <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  className={`flex-1 h-14 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] ${
                    submitting ? "opacity-70" : "active:opacity-90"
                  }`}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-base font-semibold text-white">Complete Purchase</Text>
                  )}
                </Pressable>
              </View>
            </>
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

      {/* Time picker */}
      <BottomSheet visible={sheet === "time"} onClose={() => setSheet(null)} title="Select Time">
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {timeOptions.map((t) => {
            const isSelected = purchaseTime === t;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  setPurchaseTime(t);
                  setSheet(null);
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
                  {formatTime(t)}
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

export default CreateEventPurchaseScreen;
