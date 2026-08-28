import { router, useLocalSearchParams } from "expo-router";
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  Minus,
  Package as PackageIcon,
  Plus,
  Save,
  User,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mediaUrl } from "../../lib/api";
import { markBookingsStale } from "../../lib/hooks/useBookings";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import {
  clampAddOnQuantity,
  DEFAULT_MAX_QUANTITY,
  getAddOnMinQuantity,
  isForceAddOn,
  seedForcedAddOns,
} from "../../lib/addOnQuantity";
import {
  clampParticipants,
  participantLimitsLabel,
} from "../../lib/participants";
import { getToken } from "../../lib/session";
import {
  fetchAvailableTimeSlots,
  fetchBookingDetail,
  fetchBookingsByLocationAndDate,
  fetchPackageAvailabilitySchedules,
  fetchPackages,
  fetchRooms,
  isDateBookable,
  updateBooking,
  type AvailableSlot,
  type BookingDetail,
  type PackageAvailabilitySchedule,
  type PackageOption,
  type RoomOption,
  type ScheduleBooking,
} from "../../services/bookingsService";
import {
  fetchPackageDetail,
  type PackageAddOn,
  type PackageDetail,
} from "../../services/packagesService";

const PRIMARY = "#0644C7";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];
const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
];

// Header status badge tints (mirrors BookingFullView / BookingDetailSheet).
const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  "checked-in": "bg-indigo-100 text-indigo-700",
  completed: "bg-blue-100 text-blue-700",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const meridian = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${pad2(m)} ${meridian}`;
}

/** "2026-08-07" → "Aug 7, 2026" for the existing-bookings label. */
function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}

const inputClass =
  "border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white bg-white dark:bg-neutral-900";

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
    {children}
  </Text>
);

const SectionHeader = ({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
}) => (
  <View className="flex-row items-center gap-2 mt-7 mb-3">
    <Icon size={18} color={PRIMARY} />
    <Text className="text-base font-bold text-gray-900 dark:text-white">
      {title}
    </Text>
  </View>
);

/** One add-on card: image, name, unit price, [-] qty [+] — mirrors the web card. */
const AddOnCard = ({
  addOn,
  quantity,
  unitPrice,
  packageId,
  onChange,
}: {
  addOn: PackageAddOn;
  quantity: number;
  unitPrice: number;
  /** The package being booked; decides whether this add-on is required. */
  packageId: number | null;
  onChange: (addOnId: number, change: number) => void;
}) => {
  const isSelected = quantity > 0;
  const maxQty = addOn.maxQuantity ?? DEFAULT_MAX_QUANTITY;
  const forced = isForceAddOn(addOn, packageId);
  const minQty = forced
    ? Math.max(1, getAddOnMinQuantity(addOn, packageId))
    : getAddOnMinQuantity(addOn, packageId);
  // A required add-on can be raised but never taken below its minimum.
  const canDecrease = forced ? quantity > minQty : isSelected;
  const image = mediaUrl(addOn.image);

  return (
    <View
      className={`rounded-xl overflow-hidden border ${
        isSelected
          ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      }`}
    >
      {!!image && (
        <Image
          source={{ uri: image }}
          className="w-full h-20"
          resizeMode="cover"
        />
      )}
      <View className="p-3">
        <Text
          className="text-sm font-medium text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {addOn.name}
        </Text>
        <View className="flex-row items-baseline gap-1 mb-2">
          <Text className="text-sm font-bold text-[#0644C7]">
            ${unitPrice.toFixed(2)}
          </Text>
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            {addOn.pricingType === "per_person" ? "/person" : "/unit"}
          </Text>
        </View>
        {(forced || minQty > 1) && (
          <Text
            className={`text-[10px] mb-1 ${
              forced
                ? "text-amber-700 dark:text-amber-500"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {forced ? `Required · min ${minQty}` : `Min ${minQty}`}
          </Text>
        )}
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => onChange(addOn.id, -1)}
            disabled={!canDecrease}
            className={`w-9 h-9 rounded-lg items-center justify-center border ${
              canDecrease
                ? "border-gray-300 dark:border-neutral-600"
                : "border-gray-200 dark:border-neutral-800 opacity-40"
            }`}
          >
            <Minus size={16} color={canDecrease ? "#374151" : "#9ca3af"} />
          </Pressable>
          <View className="w-14 h-9 rounded-lg border border-gray-300 dark:border-neutral-600 items-center justify-center">
            <Text className="text-sm font-bold text-gray-900 dark:text-white">
              {quantity}
            </Text>
          </View>
          <Pressable
            onPress={() => onChange(addOn.id, 1)}
            disabled={quantity >= maxQty}
            className={`w-9 h-9 rounded-lg items-center justify-center ${
              quantity >= maxQty ? "bg-blue-200 opacity-50" : "bg-[#0644C7]"
            }`}
          >
            <Plus size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

type Option = { label: string; value: string | number };

type SelectConfig = {
  label: string;
  value: string | number | null;
  options: Option[];
  onSelect: (v: string | number) => void;
};

const SelectField = ({
  label,
  value,
  placeholder,
  options,
  onSelect,
  onOpen,
}: {
  label: string;
  value: string | number | null;
  placeholder: string;
  options: Option[];
  onSelect: (v: string | number) => void;
  onOpen: (config: SelectConfig) => void;
}) => {
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => onOpen({ label, value, options, onSelect })}
        className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 active:opacity-80"
      >
        <Text
          className={`text-sm flex-1 mr-2 ${
            current ? "text-gray-900 dark:text-white" : "text-gray-400"
          }`}
          numberOfLines={1}
        >
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color="#9ca3af" />
      </Pressable>
    </View>
  );
};

/** Dedicated full-screen "Edit Booking" screen (mirrors the web /bookings/edit/{id}
 *  and the Package / Attraction edit screens). Reached from the Booking Details
 *  screen's Edit button. */
const EditBookingScreen = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const bookingId = Number(params.id);

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [schedules, setSchedules] = useState<PackageAvailabilitySchedule[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [activeSelect, setActiveSelect] = useState<SelectConfig | null>(null);

  // Existing bookings for the selected date (conflict awareness, web parity).
  const [existing, setExisting] = useState<ScheduleBooking[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Form state.
  const [locationId, setLocationId] = useState<number | null>(null);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [participants, setParticipants] = useState("");
  const [status, setStatus] = useState("pending");
  // Add-ons: quantity per catalog add-on id, seeded from the booking's pivots.
  const [selectedAddOns, setSelectedAddOns] = useState<{
    [id: number]: number;
  }>({});
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null);
  /** Set when the user picks a different package; see handlePackageChange. */
  const clampOnPackageLoadRef = useRef(false);
  const [gohName, setGohName] = useState("");
  const [gohAge, setGohAge] = useState("");
  const [gohGender, setGohGender] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Company-admin location options (same source as create-booking; the heavy
  // /api/locations endpoint is avoided in favour of dashboard metrics).
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  // Load + seed the booking.
  useEffect(() => {
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      setLoadError("Missing booking id.");
      setLoadingDetail(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setLoadError("Not signed in.");
      setLoadingDetail(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const d = await fetchBookingDetail(token, bookingId);
        if (!active) return;
        setDetail(d);
        setLocationId(d.locationId);
        setPackageId(d.packageId);
        setRoomId(d.roomId);
        setFullName(d.customerName ?? "");
        setEmail(d.customerEmail ?? "");
        setPhone(d.customerPhone ?? "");
        setDate(d.date ?? "");
        setTime(d.time ?? "");
        setParticipants(String(d.participants ?? ""));
        setStatus(d.status ?? "pending");
        const initialAddOns: { [id: number]: number } = {};
        d.addOns.forEach((a) => {
          if (a.addOnId && a.quantity > 0) initialAddOns[a.addOnId] = a.quantity;
        });
        setSelectedAddOns(initialAddOns);
        setGohName(d.guestOfHonorName ?? "");
        setGohAge(d.guestOfHonorAge != null ? String(d.guestOfHonorAge) : "");
        setGohGender(d.guestOfHonorGender ?? null);
        setCustomerNotes(d.customerNotes ?? "");
        setInternalNotes(d.internalNotes ?? "");
        setAnchor(d.date ? new Date(`${d.date}T00:00:00`) : new Date());
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load booking.",
          );
      } finally {
        if (active) setLoadingDetail(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [bookingId]);

  // Selectable packages/spaces for the CURRENT location (re-fetches when the
  // location is changed).
  useEffect(() => {
    if (loadingDetail) return;
    const token = getToken();
    if (!token) return;
    let alive = true;
    const locId = locationId ?? undefined;
    fetchPackages(token, locId)
      .then((p) => alive && setPackages(p))
      .catch(() => {});
    fetchRooms(token, locId)
      .then((r) => alive && setRooms(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loadingDetail, locationId]);

  // The selected package's booking-day rules restrict the calendar.
  useEffect(() => {
    if (packageId == null) {
      setSchedules([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let alive = true;
    fetchPackageAvailabilitySchedules(token, packageId)
      .then((s) => alive && setSchedules(s))
      .catch(() => alive && setSchedules([]));
    return () => {
      alive = false;
    };
  }, [packageId]);

  // The selected package's add-on catalog (the web's packageService.getPackage).
  useEffect(() => {
    if (packageId == null) {
      setPackageDetail(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchPackageDetail(token, packageId, controller.signal)
      .then((detail) => {
        setPackageDetail(detail);
        if (clampOnPackageLoadRef.current) {
          clampOnPackageLoadRef.current = false;
          setParticipants((prev) => String(clampParticipants(prev, detail)));
          // The new package's required add-ons come in at their minimum, as
          // they do on the web's handlePackageChange.
          setSelectedAddOns(seedForcedAddOns(detail));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [packageId]);

  const originalDate = detail?.date ?? "";
  const originalTime = detail?.time ?? "";

  // Load the open slots for the currently-selected date — on initial load (so an
  // existing booking's date immediately shows its available times, with the
  // current time highlighted) and whenever the date or package changes. Same
  // service used everywhere; no duplicated availability logic.
  useEffect(() => {
    if (!date || packageId == null) {
      setAvailableSlots([]);
      setLoadingSlots(false);
      return;
    }
    let alive = true;
    setLoadingSlots(true);
    fetchAvailableTimeSlots(getToken() ?? undefined, packageId, date)
      .then((slots) => alive && setAvailableSlots(slots))
      .catch(() => alive && setAvailableSlots([]))
      .finally(() => alive && setLoadingSlots(false));
    return () => {
      alive = false;
    };
  }, [date, packageId]);

  // Existing bookings at this location on the chosen date — reuses the web
  // admin's dedicated /bookings/location-date endpoint (location-scoped).
  useEffect(() => {
    if (!date || locationId == null) {
      setExisting([]);
      setLoadingExisting(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let alive = true;
    setLoadingExisting(true);
    fetchBookingsByLocationAndDate(token, locationId, date)
      .then((b) => alive && setExisting(b))
      .catch(() => alive && setExisting([]))
      .finally(() => alive && setLoadingExisting(false));
    return () => {
      alive = false;
    };
  }, [date, locationId]);

  const packageOptions: Option[] = useMemo(() => {
    const opts = packages.map((p) => ({
      label: p.price != null ? `${p.name} – $${p.price.toFixed(2)}` : p.name,
      value: p.id,
    }));
    if (
      detail?.packageId != null &&
      !opts.some((o) => o.value === detail.packageId)
    ) {
      opts.unshift({ label: detail.packageName, value: detail.packageId });
    }
    return opts;
  }, [packages, detail]);

  const roomOptions: Option[] = useMemo(() => {
    const opts = rooms.map((r) => ({ label: r.name, value: r.id }));
    if (
      detail?.roomId != null &&
      !opts.some((o) => o.value === detail.roomId)
    ) {
      opts.unshift({
        label: detail.roomName ?? "Current space",
        value: detail.roomId,
      });
    }
    return opts;
  }, [rooms, detail]);

  const locationSelectOptions: Option[] = useMemo(() => {
    const opts = locationOptions.map((l) => ({ label: l.name, value: l.id }));
    if (locationId != null && !opts.some((o) => o.value === locationId)) {
      opts.unshift({
        label: detail?.locationName || "Current location",
        value: locationId,
      });
    }
    return opts;
  }, [locationOptions, locationId, detail]);

  // Changing the location resets the package, space, date, and time — exactly
  // like the web admin, since those are all location-scoped.
  const handleLocationChange = (v: string | number) => {
    const next = Number(v);
    if (next === locationId) return;
    setLocationId(next);
    setPackageId(null);
    setRoomId(null);
    setDate("");
    setTime("");
  };

  const cells = useMemo(() => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: { key: string | null; day: number; bookable: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++)
      out.push({ key: null, day: 0, bookable: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const bookable = isDateBookable(schedules, new Date(y, m, d));
      out.push({ key: `${y}-${pad2(m + 1)}-${pad2(d)}`, day: d, bookable });
    }
    while (out.length % 7 !== 0)
      out.push({ key: null, day: 0, bookable: false });
    return out;
  }, [anchor, schedules]);

  const stepMonth = (dir: number) => {
    const next = new Date(anchor);
    next.setMonth(anchor.getMonth() + dir);
    setAnchor(next);
  };

  // Changing package clears the add-on selection, like the web's handlePackageChange.
  const handlePackageChange = (value: string | number) => {
    setPackageId(Number(value));
    setSelectedAddOns({});
    // The new package's limits only arrive with its detail fetch, so defer the
    // player-count adjustment until then. Not armed on the initial load, which
    // would otherwise rewrite the count already saved on the booking.
    clampOnPackageLoadRef.current = true;
  };

  const handleSelectDate = (key: string) => {
    setDate(key);
    setTime(key === originalDate ? (originalTime ?? "") : "");
  };

  // Package catalog plus any add-on the booking already carries that the package
  // no longer offers (kept selectable, flat-priced) — the web's availableAddOns.
  const availableAddOns = useMemo<PackageAddOn[]>(() => {
    const list: PackageAddOn[] = [...(packageDetail?.addOns ?? [])];
    const ids = new Set(list.map((a) => a.id));
    (detail?.addOns ?? []).forEach((a) => {
      if (!ids.has(a.addOnId)) {
        list.push({
          id: a.addOnId,
          name: a.name,
          price: a.price ?? a.priceAtBooking ?? 0,
          image: null,
          pricingType: "flat",
          minQuantity: null,
          maxQuantity: null,
          // A legacy line the package dropped: no rules left to enforce, and
          // never forced, so it stays freely removable.
          isForced: false,
          priceEachPackages: null,
        });
        ids.add(a.addOnId);
      }
    });
    return list;
  }, [packageDetail, detail]);

  // Prices frozen at booking time win over the current catalog price.
  const frozenAddOnPrices = useMemo(() => {
    const map: { [id: number]: number } = {};
    (detail?.addOns ?? []).forEach((a) => {
      if (a.addOnId != null) map[a.addOnId] = a.priceAtBooking;
    });
    return map;
  }, [detail]);

  const getAddOnUnitPrice = useCallback(
    (addonId: number, addOn: PackageAddOn | undefined) => {
      if (Object.prototype.hasOwnProperty.call(frozenAddOnPrices, addonId)) {
        return frozenAddOnPrices[addonId];
      }
      return Number(addOn?.price) || 0;
    },
    [frozenAddOnPrices],
  );

  const handleAddOnChange = useCallback(
    (addOnId: number, change: number) => {
      const addOn = availableAddOns.find((a) => a.id === addOnId);

      setSelectedAddOns((prev) => {
        const currentValue = prev[addOnId] || 0;
        const newValue = clampAddOnQuantity(
          addOn,
          packageId,
          currentValue,
          currentValue + change,
        );
        if (newValue <= 0) {
          const { [addOnId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [addOnId]: newValue };
      });
    },
    [availableAddOns, packageId],
  );

  const computeAddonsTotal = useCallback(
    (addons: { [id: number]: number }, participantCount: number) =>
      Object.entries(addons).reduce((sum, [id, quantity]) => {
        const addonId = parseInt(id);
        const addOn = availableAddOns.find((a) => a.id === addonId);
        if (!addOn) return sum;
        const price = getAddOnUnitPrice(addonId, addOn);
        const lineTotal =
          addOn.pricingType === "per_person"
            ? price * quantity * participantCount
            : price * quantity;
        return sum + lineTotal;
      }, 0),
    [availableAddOns, getAddOnUnitPrice],
  );

  const buildAdditionalAddons = useCallback(
    () =>
      Object.entries(selectedAddOns)
        .filter(([, quantity]) => quantity > 0)
        .map(([id, quantity]) => {
          const addonId = parseInt(id);
          const addOn = availableAddOns.find((a) => a.id === addonId);
          if (isNaN(addonId) || !addOn) return null;
          return {
            addon_id: addonId,
            quantity,
            price_at_booking: getAddOnUnitPrice(addonId, addOn),
          };
        })
        .filter(
          (
            item,
          ): item is {
            addon_id: number;
            quantity: number;
            price_at_booking: number;
          } => item !== null,
        ),
    [selectedAddOns, availableAddOns, getAddOnUnitPrice],
  );

  const addOnsChanged = useMemo(() => {
    const originalMap: { [id: number]: number } = {};
    (detail?.addOns ?? []).forEach((a) => {
      if (a.addOnId && a.quantity > 0) originalMap[a.addOnId] = a.quantity;
    });
    const norm = (m: { [id: number]: number }) =>
      Object.entries(m)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => `${id}:${q}`)
        .sort()
        .join(",");
    return norm(originalMap) !== norm(selectedAddOns);
  }, [detail, selectedAddOns]);

  const handleSave = async () => {
    if (!detail || saving) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }
    setSaving(true);
    try {
      // Clamp once more at save: the field may never have blurred, and this is
      // the value that gets priced and persisted.
      const participantCount = clampParticipants(participants, packageDetail);
      if (String(participantCount) !== participants) {
        setParticipants(String(participantCount));
      }
      const isPackageChanged = packageId !== detail.packageId;
      const isParticipantsChanged = participantCount !== detail.participants;

      // Recompute the total only when something priced changed, exactly as the
      // web does (fees are not editable here, so feesChanged is always false).
      let updatedTotal: number | undefined;
      if (isPackageChanged || isParticipantsChanged || addOnsChanged) {
        const basePackagePrice = packageDetail ? Number(packageDetail.price) : 0;
        const minParticipants = packageDetail?.minParticipants || 1;
        const pricePerAdditional = Number(packageDetail?.pricePerAdditional || 0);
        const additionalCount = Math.max(0, participantCount - minParticipants);
        const packagePrice =
          basePackagePrice + additionalCount * pricePerAdditional;

        const attractionsTotal = isPackageChanged
          ? 0
          : detail.attractions.reduce(
              (sum, attr) => sum + attr.priceAtBooking * attr.quantity,
              0,
            );

        const addonsTotal = computeAddonsTotal(selectedAddOns, participantCount);

        const additiveFeeTotal = detail.appliedFees
          .filter((f) => f.applicationType === "additive")
          .reduce((sum, f) => sum + f.amount, 0);

        updatedTotal =
          packagePrice + attractionsTotal + addonsTotal + additiveFeeTotal;
      }

      await updateBooking(token, detail.id, {
        locationId,
        packageId,
        roomId,
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim(),
        date,
        time,
        participants: participantCount,
        status,
        guestOfHonorName: gohName.trim() || null,
        guestOfHonorAge: gohAge ? Number(gohAge) : null,
        guestOfHonorGender: gohGender,
        customerNotes: customerNotes.trim() || null,
        internalNotes: internalNotes.trim() || null,
        sendEmail,
        ...(addOnsChanged && { additionalAddons: buildAdditionalAddons() }),
        ...(updatedTotal !== undefined && {
          totalAmount: updatedTotal,
          amountPaid: detail.amountPaid,
        }),
      });
      markBookingsStale();
      router.back();
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not update the booking.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View
        className="bg-white dark:bg-neutral-900 px-5 pb-4 border-b border-gray-100 dark:border-neutral-800"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={20} color="#111827" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Edit Booking
            </Text>
            {!!detail?.referenceNumber && (
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                Reference: {detail.referenceNumber}
              </Text>
            )}
          </View>
          {!!detail && (
            <View
              className={`px-3 py-1 rounded-full ${
                (STATUS_BADGE[status] ?? STATUS_BADGE.pending).split(" ")[0]
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  (STATUS_BADGE[status] ?? STATUS_BADGE.pending).split(" ")[1]
                }`}
              >
                {capitalize(status)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {loadingDetail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-gray-600 dark:text-gray-300 text-center">
            {loadError}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Go back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1 px-5"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Location */}
            <SectionHeader icon={MapPin} title="Location" />
            <SelectField
              label="Location"
              value={locationId}
              placeholder="Select a location"
              options={locationSelectOptions}
              onSelect={handleLocationChange}
              onOpen={setActiveSelect}
            />
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              Changing the location resets the package, space, date, and time.
            </Text>

            {/* Existing bookings */}
            {!!date && (
              <View className="mt-3 rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                {loadingExisting ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color={PRIMARY} />
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      Checking existing bookings…
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {existing.length === 0
                        ? `No other bookings at this location on ${longDate(date)}`
                        : `Existing bookings at this location on ${longDate(date)}`}
                    </Text>
                    {existing.slice(0, 5).map((b) => (
                      <View
                        key={b.id}
                        className="flex-row items-center justify-between mt-2"
                      >
                        <Text
                          className="text-xs text-gray-600 dark:text-gray-300 flex-1 mr-2"
                          numberOfLines={1}
                        >
                          {b.time ? to12h(b.time) : "—"} · {b.customerName}
                        </Text>
                        <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                          {capitalize(b.status)}
                        </Text>
                      </View>
                    ))}
                    {existing.length > 5 && (
                      <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                        +{existing.length - 5} more
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Package / Party */}
            <SectionHeader icon={PackageIcon} title="Package / Party" />
            <SelectField
              label="Package"
              value={packageId}
              placeholder="Select a package"
              options={packageOptions}
              onSelect={handlePackageChange}
              onOpen={setActiveSelect}
            />

            {/* Space Assignment */}
            <SectionHeader icon={CalendarIcon} title="Space Assignment" />
            {roomOptions.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                No spaces available for this location.
              </Text>
            ) : (
              <SelectField
                label="Assigned Table / Space"
                value={roomId}
                placeholder="Select a space"
                options={roomOptions}
                onSelect={(v) => setRoomId(Number(v))}
                onOpen={setActiveSelect}
              />
            )}

            {/* Customer Information */}
            <SectionHeader icon={User} title="Customer Information" />
            <FieldLabel>Full Name</FieldLabel>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor="#9ca3af"
              className={inputClass}
            />
            {/* Email + Phone stacked full-width (matches the web admin). */}
            <View className="mt-3">
              <FieldLabel>Email</FieldLabel>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                className={inputClass}
              />
            </View>
            <View className="mt-3">
              <FieldLabel>Phone</FieldLabel>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                className={inputClass}
              />
            </View>

            {/* Booking Details: date */}
            <SectionHeader icon={CalendarIcon} title="Booking Details" />
            <FieldLabel>Date</FieldLabel>
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-3">
              <View className="flex-row items-center justify-between mb-2">
                <Pressable
                  onPress={() => stepMonth(-1)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                >
                  <ChevronLeft size={18} color="#6b7280" />
                </Pressable>
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  {MONTH_NAMES[anchor.getMonth()]} {anchor.getFullYear()}
                </Text>
                <Pressable
                  onPress={() => stepMonth(1)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                >
                  <ChevronRight size={18} color="#6b7280" />
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
                    const selected = cell.key && cell.key === date;
                    const disabled = cell.key === null || !cell.bookable;
                    return (
                      <Pressable
                        key={cell.key ?? `pad-${row}-${col}`}
                        disabled={disabled}
                        onPress={() => cell.key && handleSelectDate(cell.key)}
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
            </View>

            {/* Booking Details: time */}
            <View className="mt-4">
              <FieldLabel>Time</FieldLabel>
            </View>
            {loadingSlots ? (
              <View className="flex-row items-center gap-2 py-4">
                <ActivityIndicator size="small" color="#0644C7" />
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Loading available times…
                </Text>
              </View>
            ) : availableSlots.length > 0 ? (
              <>
                <View className="flex-row flex-wrap -mx-1">
                  {availableSlots.map((slot) => {
                    const active = slot.startTime === time;
                    return (
                      <View
                        key={`${slot.startTime}-${slot.roomId ?? ""}`}
                        className="w-1/3 px-1 mb-2"
                      >
                        <Pressable
                          onPress={() => {
                            setTime(slot.startTime);
                            if (slot.roomId != null) setRoomId(slot.roomId);
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
                          <Text className="text-[10px] text-gray-400">
                            {to12h(slot.endTime)}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
                {!!time && (
                  <Text className="text-xs text-gray-400 mt-1">
                    Selected: {to12h(time)}
                  </Text>
                )}
              </>
            ) : (
              <Text className="text-sm text-gray-400 py-4">
                No available times for the selected date.
              </Text>
            )}

            {/* Participants + Status */}
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <FieldLabel>Participants</FieldLabel>
                <TextInput
                  value={participants}
                  // Whole numbers only: number-pad still admits a decimal point
                  // and separators on some keyboards, so strip as we go.
                  onChangeText={(t) => setParticipants(t.replace(/\D/g, ""))}
                  // Clamping on blur rather than per-keystroke lets a count be
                  // retyped from empty without the field fighting the typing.
                  onBlur={() =>
                    setParticipants((prev) =>
                      String(clampParticipants(prev, packageDetail)),
                    )
                  }
                  placeholder={String(clampParticipants("", packageDetail))}
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  className={inputClass}
                />
                {!!packageDetail && (
                  <Text className="text-[10px] text-gray-500 mt-1">
                    {participantLimitsLabel(packageDetail)}
                  </Text>
                )}
              </View>
              <View className="flex-1">
                <SelectField
                  label="Status"
                  value={status}
                  placeholder="Select status"
                  options={STATUS_OPTIONS}
                  onSelect={(v) => setStatus(String(v))}
                  onOpen={setActiveSelect}
                />
              </View>
            </View>

            {/* Add-ons */}
            {availableAddOns.length > 0 && (
              <>
                <SectionHeader icon={Gift} title="Add-ons" />
                <Text className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-3">
                  Add or adjust extras for this booking. Changing add-ons updates
                  the total.
                </Text>
                <View className="flex-row flex-wrap -mx-1.5">
                  {availableAddOns.map((addOn) => (
                    <View key={addOn.id} className="w-1/2 px-1.5 mb-3">
                      <AddOnCard
                        addOn={addOn}
                        quantity={selectedAddOns[addOn.id] || 0}
                        unitPrice={getAddOnUnitPrice(addOn.id, addOn)}
                        packageId={packageId}
                        onChange={handleAddOnChange}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Guest of Honor */}
            <SectionHeader icon={User} title="Guest of Honor" />
            <FieldLabel>Name</FieldLabel>
            <TextInput
              value={gohName}
              onChangeText={setGohName}
              placeholder="Guest of honor name"
              placeholderTextColor="#9ca3af"
              className={inputClass}
            />
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <FieldLabel>Age</FieldLabel>
                <TextInput
                  value={gohAge}
                  onChangeText={setGohAge}
                  placeholder="Age"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  className={inputClass}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label="Gender"
                  value={gohGender}
                  placeholder="Select"
                  options={GENDER_OPTIONS}
                  onSelect={(v) => setGohGender(String(v))}
                  onOpen={setActiveSelect}
                />
              </View>
            </View>

            {/* Customer Notes */}
            <SectionHeader icon={User} title="Customer Notes" />
            <TextInput
              value={customerNotes}
              onChangeText={setCustomerNotes}
              placeholder="Special requests or notes from the customer…"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              className={`${inputClass} min-h-[80px]`}
            />

            {/* Internal Staff Notes */}
            <View className="flex-row items-center gap-2 mt-7 mb-3">
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Internal Staff Notes
              </Text>
              <View className="px-2 py-0.5 rounded-full bg-amber-100">
                <Text className="text-[10px] font-semibold text-amber-700">
                  Staff Only
                </Text>
              </View>
            </View>
            <View className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-3">
              <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Private notes visible only to staff. Never shown to customers.
              </Text>
              <TextInput
                value={internalNotes}
                onChangeText={setInternalNotes}
                placeholder="e.g., VIP customer, dietary restrictions, special arrangements…"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl p-3 text-sm text-gray-900 dark:text-white min-h-[80px]"
              />
            </View>

            {/* Email Notification */}
            <SectionHeader icon={Bell} title="Email Notification" />
            <View className="flex-row items-center justify-between bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl px-4 py-3">
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <Bell size={16} color="#16a34a" />
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  Customer will receive update
                </Text>
              </View>
              <View className="flex-row rounded-full border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <Pressable
                  onPress={() => setSendEmail(false)}
                  className={`px-3 py-1.5 ${!sendEmail ? "bg-gray-100 dark:bg-neutral-800" : ""}`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      !sendEmail
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-400"
                    }`}
                  >
                    Don&apos;t Send
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSendEmail(true)}
                  className={`px-3 py-1.5 ${sendEmail ? "bg-green-600" : ""}`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      sendEmail ? "text-white" : "text-gray-400"
                    }`}
                  >
                    Send Email
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            className="flex-row gap-3 px-5 pt-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={() => router.back()}
              disabled={saving}
              className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-80"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Save size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    Save Changes
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* Option picker overlay — one in-page layer shared by every SelectField. */}
      {activeSelect && (
        <View style={StyleSheet.absoluteFill} className="justify-end">
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(20,20,20,0.5)" },
            ]}
            onPress={() => setActiveSelect(null)}
          />
          <View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[70%]"
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3 mb-1" />
            <Text className="text-base font-bold text-gray-900 dark:text-white px-5 pt-3 pb-2">
              {activeSelect.label}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {activeSelect.options.length === 0 ? (
                <Text className="text-sm text-gray-400 px-5 py-4">
                  No options available.
                </Text>
              ) : (
                activeSelect.options.map((o) => {
                  const active = String(o.value) === String(activeSelect.value);
                  return (
                    <Pressable
                      key={String(o.value)}
                      onPress={() => {
                        activeSelect.onSelect(o.value);
                        setActiveSelect(null);
                      }}
                      className="px-5 py-3.5 flex-row items-center justify-between active:bg-gray-50 dark:active:bg-neutral-800"
                    >
                      <Text
                        className={`text-sm flex-1 mr-2 ${
                          active
                            ? "text-[#0644C7] font-semibold"
                            : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {o.label}
                      </Text>
                      {active && <Check size={18} color="#0644C7" />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

export default EditBookingScreen;
