import { Feather } from "@expo/vector-icons";
import { scanFromURLAsync } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QrScannerView } from "../../components/checkin/QrScannerView";
import { VerifyBookingDetails } from "../../components/checkin/VerifyBookingDetails";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { CheckInBookingsTable } from "../../components/ui/CheckInBookingsTable";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  useBookingCheckIn,
  type ResultTone,
} from "../../lib/hooks/useBookingCheckIn";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDuration } from "../../lib/time";
import {
  fetchBookingsForCheckIn,
  type CalendarBooking,
  type ScanBooking,
} from "../../services/bookingsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const MONTHS = [
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

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar day as YYYY-MM-DD — the venue day, not a UTC one. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * How far back the check-in date picker may go. The picker defaults to
 * disallowing the past, which is wrong here — the desk reconciles days that
 * have already happened — so it is given an explicit floor instead.
 */
const EARLIEST_CHECK_IN_DATE = "2020-01-01";

const TONE: Record<
  ResultTone,
  {
    icon: React.ComponentProps<typeof Feather>["name"];
    wrap: string;
    iconColor: string;
    title: string;
  }
> = {
  success: {
    icon: "check-circle",
    wrap: "bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-900/40",
    iconColor: "#16A34A",
    title: "text-green-700 dark:text-green-400",
  },
  warning: {
    icon: "alert-triangle",
    wrap: "bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/40",
    iconColor: "#D97706",
    title: "text-amber-700 dark:text-amber-400",
  },
  error: {
    icon: "x-circle",
    wrap: "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/40",
    iconColor: "#DC2626",
    title: "text-red-700 dark:text-red-400",
  },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
      <Text
        className="ml-3 flex-1 text-right text-sm font-medium text-gray-900 dark:text-white"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** Shared booking summary (customer, package, schedule, totals, status). */
function BookingSummary({
  booking,
  hidePayment = false,
}: {
  booking: ScanBooking;
  hidePayment?: boolean;
}) {
  const time = fmtTime(booking.time);
  const schedule = booking.date
    ? `${fmtDate(booking.date)}${time ? ` · ${time}` : ""}`
    : "—";

  return (
    <View className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <View className="mb-1 flex-row items-center justify-between">
        <Text
          className="flex-1 text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {booking.customerName}
        </Text>
        <StatusBadge status={booking.status} />
      </View>
      <Text
        className="text-sm text-gray-500 dark:text-gray-400"
        numberOfLines={1}
      >
        {booking.packageName}
      </Text>

      <View className="mt-2 border-t border-gray-100 dark:border-neutral-800">
        <DetailRow label="Schedule" value={schedule} />
        <DetailRow label="Participants" value={`${booking.participants}`} />
        {!hidePayment ? (
          <>
            <DetailRow label="Total" value={money(booking.totalAmount)} />
            <DetailRow label="Paid" value={money(booking.amountPaid)} />
          </>
        ) : null}
        {!!booking.locationName && (
          <DetailRow label="Location" value={booking.locationName} />
        )}
        <DetailRow label="Reference" value={`#${booking.referenceNumber}`} />
      </View>
    </View>
  );
}

/** Outstanding-balance breakdown for a Pending booking (Total − Paid). */
function PaymentBreakdown({ booking }: { booking: ScanBooking }) {
  const outstanding = Math.max(0, booking.totalAmount - booking.amountPaid);
  return (
    <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
      <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Payment Details
      </Text>
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-sm text-gray-600 dark:text-gray-300">
          Total Amount
        </Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {money(booking.totalAmount)}
        </Text>
      </View>
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-sm text-gray-600 dark:text-gray-300">
          Amount Paid
        </Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {money(booking.amountPaid)}
        </Text>
      </View>
      <View className="mt-1 flex-row items-center justify-between border-t border-amber-200 pt-3 dark:border-amber-900/40">
        <Text className="text-sm font-bold text-amber-800 dark:text-amber-300">
          Outstanding Balance
        </Text>
        <Text className="text-base font-bold text-amber-800 dark:text-amber-300">
          {money(outstanding)}
        </Text>
      </View>
      <Text className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
        This booking can’t be checked in until payment is completed.
      </Text>
    </View>
  );
}

/** The web's numbered "How to Use" steps, adapted for touch. */
const HOW_TO_USE: { lead?: string; text: string }[] = [
  { text: 'Tap "Start Camera" to begin scanning or upload a QR code image from your device' },
  {
    lead: "Mobile recommended:",
    text: "Point your phone/tablet camera at the customer's QR code",
  },
  { text: "Review the booking details and verify customer information" },
  { text: 'Tap "Approve" to check the booking in, or "Deny" to scan again' },
  {
    text: "Alternatively, use the list below to manually search and check in bookings",
  },
];

export default function BookingCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const {
    phase,
    origin,
    review,
    reviewDetail,
    waivers,
    result,
    busy,
    paying,
    checkingWaiverId,
    handleScan,
    confirm,
    addPayment,
    checkInWaiver,
    deny,
    cancelReview,
    reset,
    startScanning,
    stopScanning,
  } = useBookingCheckIn();

  /* ---- Manual lookup: the day's bookings, searched and checked in by hand,
          mirroring the table on the web Check In page. ------------------- */
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [search, setSearch] = useState("");
  const [dayBookings, setDayBookings] = useState<CalendarBooking[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Table by default, matching every other list in the app; cards via toggle.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  /**
   * True when the review surface was opened by a row's Details button rather
   * than by a scan. Same fetched booking and the same body — but nothing is
   * being approved, so it heads with a status banner and its footer is
   * Close / Add Payment instead of Deny / Approve.
   */
  const [detailsOnly, setDetailsOnly] = useState(false);

  /**
   * Open a row from the list, either to act on it or just to read it. Passed as
   * "manual" so the camera is never involved — neither while loading, nor when
   * the booking is closed again.
   */
  const openBooking = (reference: string | null, asDetails: boolean) => {
    if (!reference) return;
    setDetailsOnly(asDetails);
    handleScan(reference, "manual");
  };

  /** Leave the read-only view without denying anything. */
  const closeDetails = () => {
    setDetailsOnly(false);
    cancelReview();
  };

  const loadDay = useCallback(
    async (signal?: AbortSignal) => {
      const token = getToken();
      if (!token) return;
      setLoadingDay(true);
      try {
        const rows = await fetchBookingsForCheckIn({
          token,
          date: selectedDate,
          userId: getCurrentUser()?.id,
          signal,
        });
        if (!signal?.aborted) setDayBookings(rows);
      } catch {
        // Leave the last good list on screen; the empty state would read as
        // "no bookings today", which a failed request does not prove.
        if (!signal?.aborted) setDayBookings([]);
      } finally {
        if (!signal?.aborted) setLoadingDay(false);
      }
    },
    [selectedDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadDay(controller.signal);
    return () => controller.abort();
  }, [loadDay]);

  // A finished check-in leaves the row below reading "confirmed", so refresh
  // the day once the result screen appears. Reloading after a failed scan too
  // costs one request and keeps this to a single, obvious trigger.
  useEffect(() => {
    if (phase === "result") loadDay();
  }, [phase, loadDay]);

  // Details is a property of one visit to the review surface: drop it as soon
  // as that surface is left, however it was left (denied, approved, reset).
  useEffect(() => {
    if (phase === "idle" || phase === "result") setDetailsOnly(false);
  }, [phase]);

  /** Name / email / phone / reference / package, as the web searches. */
  const visibleBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return dayBookings;
    return dayBookings.filter(
      (b) =>
        b.customerName?.toLowerCase().includes(term) ||
        b.customerEmail?.toLowerCase().includes(term) ||
        b.customerPhone?.includes(term) ||
        b.referenceNumber?.toLowerCase().includes(term) ||
        b.packageName?.toLowerCase().includes(term),
    );
  }, [dayBookings, search]);

  // "Upload Image" — pick a photo of a booking QR and decode it, the mobile
  // equivalent of the web's file input.
  const [decoding, setDecoding] = useState(false);
  const uploadImage = async () => {
    if (decoding) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (picked.canceled) return;
      const uri = picked.assets[0]?.uri;
      if (!uri) return;

      setDecoding(true);
      const codes = await scanFromURLAsync(uri, ["qr"]);
      const data = codes[0]?.data;
      if (!data) {
        Alert.alert(
          "No QR code found",
          "That image doesn't contain a readable QR code. Try a clearer photo of the booking.",
        );
        return;
      }
      handleScan(data);
    } catch {
      Alert.alert("Couldn't read the image", "Please try again.");
    } finally {
      setDecoding(false);
    }
  };

  // Add Payment sheet (opened from the verify footer).
  const [showPayment, setShowPayment] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const outstanding = reviewDetail
    ? Math.max(0, reviewDetail.totalAmount - reviewDetail.amountPaid)
    : 0;

  const openPayment = () => {
    setAmountInput(outstanding > 0 ? outstanding.toFixed(2) : "");
    setShowPayment(true);
  };

  const submitPayment = async () => {
    const amount = Number(amountInput);
    if (!(amount > 0)) {
      Alert.alert("Invalid amount", "Enter a payment amount greater than 0.");
      return;
    }
    const ok = await addPayment(amount);
    if (ok) {
      setShowPayment(false);
      Alert.alert("Payment recorded", `${money(amount)} was added to this booking.`);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="w-full border-b border-gray-100 bg-white px-5 pb-4 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
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
            <View className="flex-row items-center gap-2">
              <Feather
                name={detailsOnly ? "file-text" : "camera"}
                size={16}
                color={headerIcon}
              />
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                {detailsOnly ? "Booking Details" : "Package Booking Check-In"}
              </Text>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Scan QR codes or manually check in customers for their package
              bookings
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5">
          {/* Tip banner — hidden once a booking is on screen (the web covers
              the page with its verify modal there). */}
          {(phase === "idle" || phase === "scanning") && (
            <View className="mt-6 flex-row items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Feather name="smartphone" size={18} color="#2563EB" />
              <Text className="flex-1 text-sm text-blue-800 dark:text-blue-300">
                <Text className="font-bold">Tip:</Text> For best scanning
                experience, hold the device steady with the QR code fully in
                frame
              </Text>
            </View>
          )}

          {/* Landing state — camera off, matching the web's dashed panel */}
          {phase === "idle" && (
            <View
              className="mb-5 mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900"
              style={CARD_SHADOW}
            >
              <View className="items-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-12 dark:border-neutral-700 dark:bg-neutral-800/40">
                <Feather name="camera" size={56} color="#9CA3AF" />
                <Text className="mt-4 text-base text-gray-600 dark:text-gray-300">
                  Ready to scan QR codes
                </Text>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Feather name="smartphone" size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Works best on mobile devices
                  </Text>
                </View>

                <View className="mt-6 flex-row gap-3 self-stretch">
                  <Pressable
                    onPress={startScanning}
                    disabled={decoding}
                    className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] py-3.5 active:opacity-90 ${
                      decoding ? "opacity-60" : ""
                    }`}
                    accessibilityRole="button"
                  >
                    <Feather name="camera" size={16} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Start Camera
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={uploadImage}
                    disabled={decoding}
                    className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3.5 active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900 ${
                      decoding ? "opacity-60" : ""
                    }`}
                    accessibilityRole="button"
                  >
                    {decoding ? (
                      <ActivityIndicator size="small" color={PRIMARY} />
                    ) : (
                      <Feather name="upload" size={16} color="#374151" />
                    )}
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Upload Image
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* Scanner / processing */}
          {/* Viewfinder — only ever for a scan. A booking opened from the list
              below loads without the camera (see the manual spinner further
              down), so tapping a row never turns it on. */}
          {origin === "scan" &&
            (phase === "scanning" || phase === "processing") && (
            <View className="mt-5">
              <View className="relative">
                <QrScannerView
                  active={phase === "scanning"}
                  onScan={handleScan}
                />
                {phase === "processing" && (
                  <View className="absolute inset-0 items-center justify-center rounded-3xl bg-black/60">
                    <ActivityIndicator color="#FFFFFF" size="large" />
                    <Text className="mt-3 text-sm font-medium text-white">
                      Verifying booking…
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Point the camera at the booking’s QR code.
              </Text>

              {phase === "scanning" && (
                <Pressable
                  onPress={stopScanning}
                  className="mt-4 items-center justify-center self-center rounded-lg border border-red-200 bg-red-50 px-6 py-3 active:opacity-80 dark:border-red-900/40 dark:bg-red-900/20"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Stop Camera
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Loading a booking opened from the list — a plain spinner, with no
              viewfinder anywhere near it. */}
          {origin === "manual" && phase === "processing" && (
            <View className="mt-6 items-center justify-center rounded-xl bg-white py-12 dark:bg-neutral-900">
              <ActivityIndicator color={PRIMARY} size="large" />
              <Text className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Loading booking…
              </Text>
            </View>
          )}

          {/* Review (rich) — full booking detail + waivers from the backend.
              Deny / Add Payment / Approve live in the fixed footer below. */}
          {phase === "review" && reviewDetail && (
            <View className="mt-2">
              <VerifyBookingDetails
                detail={reviewDetail}
                variant={detailsOnly ? "details" : "verify"}
                waivers={waivers}
                onCheckInWaiver={checkInWaiver}
                checkingWaiverId={checkingWaiverId}
              />
            </View>
          )}

          {/* Review (fallback) — detail fetch failed; show the summary-only card. */}
          {phase === "review" && review && !reviewDetail && (
            <View
              className="rounded-3xl bg-white p-5 shadow-sm dark:bg-neutral-900"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-center">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-[#0644C7]/10">
                  <Feather name="check-circle" size={20} color={PRIMARY} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    Valid Booking
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    Confirm to check this customer in.
                  </Text>
                </View>
              </View>

              <BookingSummary booking={review} />

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={cancelReview}
                  disabled={busy}
                  className="flex-1 items-center justify-center rounded-xl border border-gray-200 py-3.5 active:opacity-80 dark:border-neutral-700"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirm}
                  disabled={busy}
                  className={`flex-1 flex-row items-center justify-center rounded-xl bg-[#0644C7] py-3.5 active:opacity-90 ${
                    busy ? "opacity-60" : ""
                  }`}
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">
                      Check In
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Result — terminal outcome (success / blocked / error) */}
          {phase === "result" && result && (
            <View>
              <View
                className={`rounded-3xl border p-5 ${TONE[result.tone].wrap}`}
              >
                <View className="flex-row items-center">
                  <Feather
                    name={TONE[result.tone].icon}
                    size={26}
                    color={TONE[result.tone].iconColor}
                  />
                  <Text
                    className={`ml-3 flex-1 text-lg font-bold ${TONE[result.tone].title}`}
                  >
                    {result.title}
                  </Text>
                </View>
                <Text className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {result.message}
                </Text>

                {result.booking ? (
                  result.booking.status === "pending" ? (
                    <>
                      <PaymentBreakdown booking={result.booking} />
                      <BookingSummary booking={result.booking} hidePayment />
                    </>
                  ) : (
                    <BookingSummary booking={result.booking} />
                  )
                ) : null}
              </View>

              <Pressable
                onPress={reset}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3.5 active:opacity-90"
                accessibilityRole="button"
              >
                <Feather name="maximize" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  {result.actionLabel}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ---- Manual lookup ------------------------------------------
              The web's date + search filters and bookings table. Only on the
              calm surfaces: while a booking is under review the screen belongs
              to that booking, as on the web where a modal covers the page. */}
          {(phase === "idle" || phase === "scanning") && (
            <>
              <View
                className="mb-4 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900"
                style={CARD_SHADOW}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Feather name="calendar" size={14} color="#6B7280" />
                  <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Date
                  </Text>
                </View>
                {/* Tap to open the app's shared month-grid picker — the same
                    date control the Waiver Reports, Day Offs and purchase
                    screens use. */}
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  className="flex-row items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 active:opacity-70 dark:border-neutral-700"
                  accessibilityRole="button"
                  accessibilityLabel="Change date"
                >
                  <Feather name="calendar" size={16} color="#9CA3AF" />
                  <Text className="flex-1 text-sm text-gray-900 dark:text-white">
                    {fmtDate(selectedDate)}
                  </Text>
                  <Feather name="chevron-down" size={16} color="#9CA3AF" />
                </Pressable>
                {selectedDate !== todayKey() && (
                  <Pressable
                    onPress={() => setSelectedDate(todayKey())}
                    className="mt-2 self-start active:opacity-70"
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-semibold text-[#0644C7]">
                      Back to today
                    </Text>
                  </Pressable>
                )}

                <View className="mb-2 mt-4 flex-row items-center gap-2">
                  <Feather name="search" size={14} color="#6B7280" />
                  <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Search Bookings
                  </Text>
                </View>
                <View className="flex-row items-center rounded-lg border border-gray-200 px-3 dark:border-neutral-700">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Name, email, phone, reference, or package…"
                    placeholderTextColor="#9CA3AF"
                    className="ml-2 flex-1 py-2.5 text-sm text-gray-900 dark:text-white"
                  />
                  {!!search && (
                    <Pressable
                      onPress={() => setSearch("")}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      className="p-1 active:opacity-70"
                    >
                      <Feather name="x" size={16} color="#9CA3AF" />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Result count + layout toggle, the same header row the
                  Bookings and Attractions lists use. */}
              {!loadingDay && visibleBookings.length > 0 && (
                <View className="mb-2 flex-row items-center">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {visibleBookings.length} booking
                    {visibleBookings.length === 1 ? "" : "s"}
                  </Text>
                  <View className="ml-auto">
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                  </View>
                </View>
              )}

              {loadingDay || visibleBookings.length === 0 ? (
                <View
                  className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-neutral-900"
                  style={CARD_SHADOW}
                >
                  {loadingDay ? (
                    <View className="flex-row items-center justify-center gap-3 py-12">
                      <ActivityIndicator color={PRIMARY} />
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        Loading bookings…
                      </Text>
                    </View>
                  ) : (
                    <Text className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {dayBookings.length === 0
                        ? "No bookings found for selected date"
                        : "No bookings match your search"}
                    </Text>
                  )}
                </View>
              ) : viewMode === "table" ? (
                <CheckInBookingsTable
                  rows={visibleBookings}
                  handlers={{
                    onCheckIn: (b) => openBooking(b.referenceNumber, false),
                    onDetails: (b) => openBooking(b.referenceNumber, true),
                    busy,
                  }}
                />
              ) : (
              <View
                className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-neutral-900"
                style={CARD_SHADOW}
              >
                {visibleBookings.map((b, i) => (
                    <View
                      key={b.id}
                      className={
                        i > 0
                          ? "border-t border-gray-100 px-4 py-3.5 dark:border-neutral-800"
                          : "px-4 py-3.5"
                      }
                    >
                      {/* Reference / customer — the web's first column. */}
                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        #{b.referenceNumber ?? "—"}
                      </Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {b.customerName || "Guest"}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Email: {b.customerEmail || "N/A"}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Phone: {b.customerPhone || "N/A"}
                      </Text>

                      {/* Package / time / participants — the web's middle
                          columns, paired up rather than spread across a row
                          that would not fit a phone. */}
                      <View className="mt-2 flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text
                            className="text-sm text-gray-900 dark:text-white"
                            numberOfLines={2}
                          >
                            {b.packageName || "N/A"}
                          </Text>
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            {money(b.totalAmount)}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-sm text-gray-900 dark:text-white">
                            {fmtTime(b.time) ?? "—"}
                          </Text>
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDuration(b.duration, b.durationUnit)}
                          </Text>
                          <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {b.participants} participant
                            {b.participants === 1 ? "" : "s"}
                          </Text>
                        </View>
                      </View>

                      <View className="mt-2.5 flex-row items-center gap-2">
                        <StatusBadge status={b.status} />
                        <View className="flex-1" />
                        {/* Check In runs the same review the scanner does, so
                            a manual check-in gets the identical verification,
                            waiver and payment surface. */}
                        {b.status === "confirmed" && !!b.referenceNumber && (
                          <Pressable
                            onPress={() => openBooking(b.referenceNumber, false)}
                            disabled={busy}
                            className="flex-row items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 active:opacity-90"
                            accessibilityRole="button"
                            accessibilityLabel="Check in this booking"
                          >
                            <Feather name="check-circle" size={14} color="#FFFFFF" />
                            <Text className="text-xs font-semibold text-white">
                              Check In
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => openBooking(b.referenceNumber, true)}
                          className="flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90"
                          accessibilityRole="button"
                          accessibilityLabel="View booking details"
                        >
                          <Feather name="eye" size={14} color="#FFFFFF" />
                          <Text className="text-xs font-semibold text-white">
                            Details
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                ))}
              </View>
              )}
            </>
          )}

          {/* How to Use — shown on the calm surfaces, as on the web page */}
          {(phase === "idle" || phase === "scanning") && (
            <View className="mt-1 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-900/20">
              <View className="mb-3 flex-row items-center gap-2">
                <Feather name="alert-circle" size={16} color="#1E3A8A" />
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  How to Use
                </Text>
              </View>
              {HOW_TO_USE.map((step, i) => (
                <View key={i} className="mb-1.5 flex-row">
                  <Text className="mr-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                    {i + 1}.
                  </Text>
                  <Text className="flex-1 text-sm text-blue-800 dark:text-blue-300">
                    {step.lead ? (
                      <Text className="font-bold text-gray-900 dark:text-white">
                        {step.lead}{" "}
                      </Text>
                    ) : null}
                    {step.text}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Verify footer — Deny / Add Payment / Approve */}
      {phase === "review" && reviewDetail && (
        <View
          className="flex-row gap-2.5 border-t border-gray-100 bg-white px-5 pt-3 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {detailsOnly ? (
            /* Opened to read, not to approve — the web's Close / Add Payment
               footer, with Check In Now taking over once nothing is owed. */
            <>
              <Pressable
                onPress={closeDetails}
                className="flex-1 items-center justify-center rounded-xl border border-gray-200 py-3.5 active:opacity-80 dark:border-neutral-700"
                accessibilityRole="button"
                accessibilityLabel="Close booking details"
              >
                <Text
                  numberOfLines={1}
                  className="text-sm font-semibold text-gray-700 dark:text-gray-200"
                >
                  Close
                </Text>
              </Pressable>
              {outstanding > 0 ? (
                <Pressable
                  onPress={openPayment}
                  disabled={paying}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#0644C7] px-2 py-3.5 active:opacity-90"
                  accessibilityRole="button"
                  accessibilityLabel="Add payment"
                >
                  {paying ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Feather name="dollar-sign" size={15} color="#FFFFFF" />
                      {/* numberOfLines keeps "Add Payment" on one line — left to
                          wrap it splits after "Add" and the second line is
                          clipped by the button's fixed height. */}
                      <Text
                        numberOfLines={1}
                        className="text-sm font-semibold text-white"
                      >
                        Add Payment
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : (
                reviewDetail.status === "confirmed" && (
                  <Pressable
                    onPress={confirm}
                    disabled={busy}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-green-600 px-2 py-3.5 active:opacity-90"
                    accessibilityRole="button"
                    accessibilityLabel="Check in now"
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Feather name="check-circle" size={15} color="#FFFFFF" />
                        <Text
                          numberOfLines={1}
                          className="text-sm font-semibold text-white"
                        >
                          Check In Now
                        </Text>
                      </>
                    )}
                  </Pressable>
                )
              )}
            </>
          ) : (
            <>
          {/* A scan is being judged, so "Deny"; a row opened from the list is
              simply being backed out of, so "Cancel". */}
          <Pressable
            onPress={deny}
            disabled={busy || paying}
            className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl px-2 py-3.5 active:opacity-90 ${
              origin === "manual" ? "bg-gray-500" : "bg-red-500"
            }`}
            accessibilityRole="button"
            accessibilityLabel={
              origin === "manual" ? "Cancel" : "Deny check-in"
            }
          >
            <Feather name="x-circle" size={14} color="#FFFFFF" />
            <Text
              numberOfLines={1}
              className="text-xs font-semibold text-white"
            >
              {origin === "manual" ? "Cancel" : "Deny"}
            </Text>
          </Pressable>

          <Pressable
            onPress={openPayment}
            disabled={busy || paying}
            className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-[#0644C7] px-2 py-3.5 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Add payment"
          >
            {paying ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="dollar-sign" size={14} color="#FFFFFF" />
                {/* Three buttons share this row, so the label has little room:
                    without numberOfLines it wraps after "Add" and the second
                    line is clipped by the button's fixed height. */}
                <Text
                  numberOfLines={1}
                  className="text-xs font-semibold text-white"
                >
                  Add Payment
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={confirm}
            disabled={busy || paying}
            className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-green-600 px-2 py-3.5 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Approve check-in"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check-circle" size={14} color="#FFFFFF" />
                <Text
                  numberOfLines={1}
                  className="text-xs font-semibold text-white"
                >
                  Approve
                </Text>
              </>
            )}
          </Pressable>
            </>
          )}
        </View>
      )}

      {/* Add Payment sheet */}
      <BottomSheet
        visible={showPayment}
        onClose={() => setShowPayment(false)}
        title="Add Payment"
      >
        <View className="px-6 pb-6">
          {reviewDetail && (
            <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  Total
                </Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(reviewDetail.totalAmount)}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  Paid
                </Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(reviewDetail.amountPaid)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between border-t border-amber-200 pt-2 dark:border-amber-900/40">
                <Text className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  Outstanding
                </Text>
                <Text className="text-base font-bold text-amber-800 dark:text-amber-300">
                  {money(outstanding)}
                </Text>
              </View>
            </View>
          )}

          <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Payment amount
          </Text>
          <View className="flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="dollar-sign" size={16} color="#9CA3AF" />
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>

          <Pressable
            onPress={submitPayment}
            disabled={paying}
            className={`mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3.5 active:opacity-90 ${
              paying ? "opacity-60" : ""
            }`}
            accessibilityRole="button"
          >
            {paying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="dollar-sign" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  Record Payment
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      {/* Date picker for the manual lookup — a past date is valid here, since
          the desk often reconciles a day that has already happened. */}
      <DatePickerSheet
        visible={datePickerOpen}
        value={selectedDate}
        minDate={EARLIEST_CHECK_IN_DATE}
        title="Select Date"
        onClose={() => setDatePickerOpen(false)}
        onSelect={(date) => {
          setSelectedDate(date);
          setDatePickerOpen(false);
        }}
      />
    </View>
  );
}
