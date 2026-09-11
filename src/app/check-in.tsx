import { Feather } from "@expo/vector-icons";
import { scanFromURLAsync } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { GuestLookupResults } from "../components/checkin/GuestLookupResults";
import { QrScannerView } from "../components/checkin/QrScannerView";
import { VerifyBookingDetails } from "../components/checkin/VerifyBookingDetails";
import {
  VerifyEventTicketDetails,
  VerifyMembershipDetails,
  VerifyWaiverDetails,
} from "../components/checkin/VerifyEntityDetails";
import { VerifyOrderDetails } from "../components/checkin/VerifyOrderDetails";
import { VerifyTicketDetails } from "../components/checkin/VerifyTicketDetails";
import { BottomSheet } from "../components/ui/BottomSheet";
import { CheckInBookingsTable } from "../components/ui/CheckInBookingsTable";
import { DatePickerSheet } from "../components/ui/DatePickerSheet";
import { Pagination } from "../components/ui/Pagination";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ViewToggle, type ViewMode } from "../components/ui/ViewToggle";
import { resolveScannedCode } from "../lib/checkin/resolveScannedCode";
import {
  useBookingCheckIn,
  type ResultTone,
} from "../lib/hooks/useBookingCheckIn";
import { useEntityCheckIn } from "../lib/hooks/useEntityCheckIn";
import { MIN_GUEST_QUERY, useGuestLookup } from "../lib/hooks/useGuestLookup";
import { getCurrentUser, getToken } from "../lib/session";
import { formatDuration } from "../lib/time";
import {
  fetchBookingsForCheckIn,
  type CalendarBooking,
  type ScanBooking,
} from "../services/bookingsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

/** The desk reconciles days that have already happened, so the past is valid. */
const EARLIEST_CHECK_IN_DATE = "2020-01-01";

/** Per-page choices for the day's bookings — 5 first, as every list here. */
const PER_PAGE_OPTIONS = [5, 10, 25, 50];

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

/** Shared booking summary, for the result surface and the fallback review. */
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
      <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
        {booking.packageName}
      </Text>

      <View className="mt-2 border-t border-gray-100 dark:border-neutral-800">
        <DetailRow label="Schedule" value={schedule} />
        <DetailRow label="Participants" value={`${booking.participants}`} />
        {!hidePayment && (
          <>
            <DetailRow label="Total" value={money(booking.totalAmount)} />
            <DetailRow label="Paid" value={money(booking.amountPaid)} />
          </>
        )}
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
        <Text className="text-sm text-gray-600 dark:text-gray-300">Total Amount</Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {money(booking.totalAmount)}
        </Text>
      </View>
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-sm text-gray-600 dark:text-gray-300">Amount Paid</Text>
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

/** The web page's steps, word for word, so both desks read identically. */
const HOW_TO_USE: { lead?: string; text: string }[] = [
  {
    text: 'Click "Start Camera" to begin scanning or upload a QR code image from your device',
  },
  {
    lead: "Mobile recommended:",
    text: "Point your phone/tablet camera at the customer's QR code",
  },
  {
    text: "Review the booking details in the popup modal and verify customer information",
  },
  {
    text: 'Click "Confirm Check-In" to mark the booking as checked in, or "Cancel" to scan again',
  },
  {
    text: "Alternatively, use the table below to manually search and check in bookings",
  },
];

/** Per-surface heading for the entity panel, so the desk knows what it holds. */
const SURFACE_TITLE: Record<string, string> = {
  ticket: "Verify Ticket Details",
  order: "Verify Order Details",
  membership: "Verify Membership",
  event: "Verify Event Ticket",
  waiver: "Verify Waiver",
};

export default function CheckInWaiversScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  /* The booking half keeps its own flow — payments, connected waivers, the
     verify surface — and owns the camera state for the whole screen. */
  const booking = useBookingCheckIn();
  const entity = useEntityCheckIn();
  const guests = useGuestLookup();

  /**
   * Whether the camera was actually running when the current code arrived.
   *
   * Re-arming is gated on this so an uploaded image never switches a camera on
   * that the user had not started. A ref, not state: the scan callback closes
   * over its render's values, so state here would be read stale.
   */
  const cameraWasRunning = useRef(false);
  /** Re-entrancy latch — a camera can fire the same code many times a second. */
  const processingRef = useRef(false);

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [search, setSearch] = useState("");
  const [dayBookings, setDayBookings] = useState<CalendarBooking[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [detailsOnly, setDetailsOnly] = useState(false);
  const [guestQuery, setGuestQuery] = useState("");

  /** True while any record owns the screen — the lists step aside for it. */
  const busySurface =
    entity.surface != null ||
    entity.loading ||
    booking.phase === "processing" ||
    booking.phase === "review" ||
    booking.phase === "result";

  const atRest = !busySurface;

  /* ------------------------------------------------------- scan dispatch -- */

  /**
   * Route one decoded code to the handler for whatever it actually is.
   *
   * Every code goes through `resolveScannedCode` first, so a payload is
   * identified by its declared shape rather than by whichever field a given
   * screen happened to read. A code that resolves to nothing is reported, never
   * guessed at — guessing is what checked strangers in.
   */
  const dispatchScan = useCallback(
    async (decoded: string, fromCamera: boolean) => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const resolution = resolveScannedCode(decoded);

        if (!resolution.ok) {
          entity.setNotice({
            tone: "error",
            message:
              "Code not recognised. Try again, or find the guest by name below.",
          });
          // Nothing was opened, so the camera can simply keep running.
          return;
        }

        const code = resolution.code;

        if (code.kind === "booking") {
          // The booking flow parses the payload itself; hand it the reference
          // when we have one, otherwise the raw payload with its id.
          //
          // The origin is what the code actually came from, not what kind of
          // code it is: an uploaded image is "manual", so closing the booking
          // returns to the landing state instead of switching on a camera the
          // user never started.
          booking.handleScan(code.reference ?? decoded, fromCamera ? "scan" : "manual");
          return;
        }

        // Everything else belongs to the entity surfaces; park the camera while
        // one is on screen so it cannot fire behind the panel.
        booking.stopScanning();
        await entity.open(code);
      } finally {
        processingRef.current = false;
      }
    },
    [booking, entity],
  );

  /** Leave an entity surface, re-arming the camera only if it had been on. */
  const closeEntity = useCallback(() => {
    entity.close();
    if (cameraWasRunning.current) booking.startScanning();
  }, [booking, entity]);

  /** Admit what's on screen, then return the desk to where it came from. */
  const confirmEntity = useCallback(
    async (lineIds?: number[]) => {
      const before = entity.surface;
      await entity.confirm(lineIds);
      // `confirm` clears the surface on success; only then is there a camera to
      // re-arm. A refusal leaves the panel up with its reason.
      if (before && cameraWasRunning.current) booking.startScanning();
    },
    [booking, entity],
  );

  const startCamera = useCallback(() => {
    cameraWasRunning.current = true;
    entity.setNotice(null);
    booking.startScanning();
  }, [booking, entity]);

  const stopCamera = useCallback(() => {
    cameraWasRunning.current = false;
    booking.stopScanning();
  }, [booking]);

  /* ----------------------------------------------- manual lookup (the day) -- */

  const openBooking = (reference: string | null, asDetails: boolean) => {
    if (!reference) return;
    setDetailsOnly(asDetails);
    // Opened from a list, so no camera is involved at any point.
    cameraWasRunning.current = false;
    entity.close();
    booking.handleScan(reference, "manual");
  };

  const closeDetails = () => {
    setDetailsOnly(false);
    booking.cancelReview();
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

  // A finished check-in leaves the row below stale, so refresh the day once the
  // result surface appears.
  useEffect(() => {
    if (booking.phase === "result") loadDay();
  }, [booking.phase, loadDay]);

  useEffect(() => {
    if (booking.phase === "idle" || booking.phase === "result") {
      setDetailsOnly(false);
    }
  }, [booking.phase]);

  const visibleBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return dayBookings;
    // The same five fields the web filters on, which are also the five the rows
    // display — filtering on a name the desk cannot see would look broken.
    return dayBookings.filter(
      (b) =>
        b.guestName?.toLowerCase().includes(term) ||
        b.guestEmail?.toLowerCase().includes(term) ||
        b.guestPhone?.includes(term) ||
        b.referenceNumber?.toLowerCase().includes(term) ||
        b.packageNameRaw?.toLowerCase().includes(term),
    );
  }, [dayBookings, search]);

  /* The day's list is fetched whole (one 100-row page) and paged here, so the
     desk scrolls a short list rather than a wall of rows. Same wiring and the
     same shared pager every other list in the app uses. */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const pagedBookings = useMemo(
    () => visibleBookings.slice((page - 1) * perPage, page * perPage),
    [visibleBookings, page, perPage],
  );

  // Any change to what is being listed puts the desk back on the first page —
  // otherwise a filter that leaves three rows strands it on an empty page 4.
  useEffect(() => {
    setPage(1);
  }, [search, selectedDate, perPage]);

  // The day reloads after every check-in, and can come back shorter. Pull the
  // desk back to the last real page rather than leaving it on an empty one.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleBookings.length / perPage));
    setPage((current) => Math.min(current, lastPage));
  }, [visibleBookings.length, perPage]);

  /* ------------------------------------------------------- upload an image -- */

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
          "That image doesn't contain a readable QR code. Try a clearer photo.",
        );
        return;
      }
      // An upload is not the camera: closing whatever this opens must not turn
      // one on.
      cameraWasRunning.current = false;
      await dispatchScan(data, false);
    } catch {
      Alert.alert("Couldn't read the image", "Please try again.");
    } finally {
      setDecoding(false);
    }
  };

  /* ------------------------------------------------------- guest lookup -- */

  const runGuestSearch = () => {
    entity.setNotice(null);
    guests.search(guestQuery);
  };

  const guestHandlers = {
    onBooking: (reference: string | null) => openBooking(reference, false),
    onWaiver: (reference: string | null) => {
      if (!reference) {
        entity.setNotice({
          tone: "error",
          message: "That waiver has no reference code yet.",
        });
        return;
      }
      cameraWasRunning.current = false;
      entity.openWaiverByReference(reference);
    },
    onTicket: (purchaseId: number) => {
      cameraWasRunning.current = false;
      entity.openTicketById(purchaseId);
    },
    onOrder: (orderId: number) => {
      cameraWasRunning.current = false;
      entity.openOrderById(orderId);
    },
    onEvent: (reference: string) => {
      cameraWasRunning.current = false;
      entity.openEventByReference(reference);
    },
  };

  /* ------------------------------------------------------- booking payment -- */

  const [showPayment, setShowPayment] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const outstanding = booking.reviewDetail
    ? Math.max(0, booking.reviewDetail.totalAmount - booking.reviewDetail.amountPaid)
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
    const okPayment = await booking.addPayment(amount);
    if (okPayment) {
      setShowPayment(false);
      Alert.alert("Payment recorded", `${money(amount)} was added to this booking.`);
    }
  };

  /* ------------------------------------------------------- entity footer -- */

  const surface = entity.surface;

  /** Whether Approve is offered for the surface on screen. */
  const canApprove = (() => {
    if (!surface) return false;
    switch (surface.kind) {
      case "ticket":
        return surface.purchase.status === "confirmed";
      case "order":
        return (
          surface.order.remainingBalance <= 0 &&
          surface.order.status !== "cancelled" &&
          surface.order.status !== "refunded" &&
          surface.order.lines.some((l) => !l.checkedInAt)
        );
      case "membership":
        // An ineligible member can still be admitted — as a recorded override.
        return true;
      case "event":
        return (
          surface.ticket.ticketOrderId == null &&
          surface.ticket.status !== "checked-in" &&
          !surface.ticket.checkedInAt
        );
      case "waiver":
        return surface.waiver.isSigned && !surface.waiver.checkedInAt;
      default:
        return false;
    }
  })();

  const approveLabel =
    surface?.kind === "membership" && !surface.scan.eligible
      ? "Override"
      : surface?.kind === "order"
        ? "Check In All"
        : "Approve";

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
              <Feather name="maximize" size={16} color={headerIcon} />
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                Check-In / Waivers
              </Text>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              One place to check anyone in — scan a booking, attraction ticket,
              bulk order, membership or waiver code, or find the guest by name.
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5">
          {/* A short-lived outcome from the last code or check-in. */}
          {!!entity.notice && (
            <View
              className={`mt-5 flex-row items-center gap-2 rounded-lg border p-3 ${TONE[entity.notice.tone].wrap}`}
            >
              <Feather
                name={TONE[entity.notice.tone].icon}
                size={18}
                color={TONE[entity.notice.tone].iconColor}
              />
              <Text
                className={`flex-1 text-sm font-medium ${TONE[entity.notice.tone].title}`}
              >
                {entity.notice.message}
              </Text>
              <Pressable
                onPress={() => entity.setNotice(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss message"
              >
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            </View>
          )}

          {atRest && booking.phase === "idle" && (
            <View className="mt-6 flex-row items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Feather name="smartphone" size={18} color="#2563EB" />
              {/* The web page's wording, verbatim. */}
              <Text className="flex-1 text-sm text-blue-800 dark:text-blue-300">
                <Text className="font-bold">Tip:</Text> For best scanning
                experience, use a mobile device or tablet with a rear camera
              </Text>
            </View>
          )}

          {/* Landing — camera off */}
          {atRest && booking.phase === "idle" && (
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
                    onPress={startCamera}
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

          {/* Viewfinder — a scan only. Anything opened from a list loads without
              the camera, so tapping a row never turns it on. */}
          {booking.origin === "scan" &&
            !entity.surface &&
            (booking.phase === "scanning" ||
              booking.phase === "processing" ||
              entity.loading) && (
              <View className="mt-5">
                <View className="relative">
                  <QrScannerView
                    active={booking.phase === "scanning" && !entity.loading}
                    onScan={(data) => dispatchScan(data, true)}
                  />
                  {(booking.phase === "processing" || entity.loading) && (
                    <View className="absolute inset-0 items-center justify-center rounded-3xl bg-black/60">
                      <ActivityIndicator color="#FFFFFF" size="large" />
                      <Text className="mt-3 text-sm font-medium text-white">
                        Verifying code…
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Point the camera at the guest’s QR code.
                </Text>

                {booking.phase === "scanning" && !entity.loading && (
                  <Pressable
                    onPress={stopCamera}
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

          {/* Loading a record opened from a list — a plain spinner, no camera. */}
          {((booking.origin === "manual" && booking.phase === "processing") ||
            (entity.loading && booking.origin !== "scan")) && (
            <View className="mt-6 items-center justify-center rounded-xl bg-white py-12 dark:bg-neutral-900">
              <ActivityIndicator color={PRIMARY} size="large" />
              <Text className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Loading…
              </Text>
            </View>
          )}

          {/* ---- Booking surfaces ------------------------------------------ */}

          {booking.phase === "review" && booking.reviewDetail && (
            <View className="mt-2">
              <VerifyBookingDetails
                detail={booking.reviewDetail}
                variant={detailsOnly ? "details" : "verify"}
                waivers={booking.waivers}
                onCheckInWaiver={booking.checkInWaiver}
                checkingWaiverId={booking.checkingWaiverId}
              />
            </View>
          )}

          {booking.phase === "review" && booking.review && !booking.reviewDetail && (
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

              <BookingSummary booking={booking.review} />

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={booking.cancelReview}
                  disabled={booking.busy}
                  className="flex-1 items-center justify-center rounded-xl border border-gray-200 py-3.5 active:opacity-80 dark:border-neutral-700"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={booking.confirm}
                  disabled={booking.busy}
                  className={`flex-1 flex-row items-center justify-center rounded-xl bg-[#0644C7] py-3.5 active:opacity-90 ${
                    booking.busy ? "opacity-60" : ""
                  }`}
                  accessibilityRole="button"
                >
                  {booking.busy ? (
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

          {booking.phase === "result" && booking.result && (
            <View className="mt-2">
              <View className={`rounded-3xl border p-5 ${TONE[booking.result.tone].wrap}`}>
                <View className="flex-row items-center">
                  <Feather
                    name={TONE[booking.result.tone].icon}
                    size={26}
                    color={TONE[booking.result.tone].iconColor}
                  />
                  <Text
                    className={`ml-3 flex-1 text-lg font-bold ${TONE[booking.result.tone].title}`}
                  >
                    {booking.result.title}
                  </Text>
                </View>
                <Text className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {booking.result.message}
                </Text>

                {booking.result.booking ? (
                  booking.result.booking.status === "pending" ? (
                    <>
                      <PaymentBreakdown booking={booking.result.booking} />
                      <BookingSummary booking={booking.result.booking} hidePayment />
                    </>
                  ) : (
                    <BookingSummary booking={booking.result.booking} />
                  )
                ) : null}
              </View>

              {/* A dead scanner after an already-checked-in code is the most
                  common way this screen got stuck; this always leads back. */}
              <Pressable
                onPress={booking.reset}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3.5 active:opacity-90"
                accessibilityRole="button"
              >
                <Feather name="maximize" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  {booking.result.actionLabel}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ---- Entity surfaces ------------------------------------------- */}

          {!!surface && (
            <View className="mt-5">
              <Text className="mb-3 text-base font-bold text-gray-900 dark:text-white">
                {SURFACE_TITLE[surface.kind]}
              </Text>

              {surface.kind === "ticket" && (
                <VerifyTicketDetails
                  purchase={surface.purchase}
                  waivers={surface.waivers}
                />
              )}
              {surface.kind === "order" && (
                <VerifyOrderDetails
                  order={surface.order}
                  busy={entity.orderBusy}
                  notice={null}
                  onCheckInLine={(lineId) => confirmEntity([lineId])}
                />
              )}
              {surface.kind === "membership" && (
                <VerifyMembershipDetails scan={surface.scan} />
              )}
              {surface.kind === "event" && (
                <VerifyEventTicketDetails ticket={surface.ticket} />
              )}
              {surface.kind === "waiver" && (
                <VerifyWaiverDetails waiver={surface.waiver} />
              )}
            </View>
          )}

          {/* ---- Today's bookings, and the guest lookup --------------------- */}
          {atRest && (
            <>
              <View
                className="mb-4 mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900"
                style={CARD_SHADOW}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Feather name="calendar" size={14} color="#6B7280" />
                  <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Date
                  </Text>
                </View>
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
                    Filter today’s bookings
                  </Text>
                </View>
                <View className="flex-row items-center rounded-lg border border-gray-200 px-3 dark:border-neutral-700">
                  <Feather name="search" size={16} color="#9CA3AF" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Narrow the list below by name, email, phone or reference…"
                    placeholderTextColor="#9CA3AF"
                    className="ml-2 flex-1 py-2.5 text-sm text-gray-900 dark:text-white"
                  />
                  {!!search && (
                    <Pressable
                      onPress={() => setSearch("")}
                      accessibilityRole="button"
                      accessibilityLabel="Clear filter"
                      className="p-1 active:opacity-70"
                    >
                      <Feather name="x" size={16} color="#9CA3AF" />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Guest lookup — the server-side search the old screens lacked,
                  so a guest booked on another date is no longer invisible. */}
              <View
                className="mb-4 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900"
                style={CARD_SHADOW}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Feather name="search" size={14} color={PRIMARY} />
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    No ticket or QR? Find the guest
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 flex-row items-center rounded-lg border border-gray-200 px-3 dark:border-neutral-700">
                    <TextInput
                      value={guestQuery}
                      onChangeText={setGuestQuery}
                      onSubmitEditing={runGuestSearch}
                      returnKeyType="search"
                      placeholder="Name, phone or email — any date, any location"
                      placeholderTextColor="#9CA3AF"
                      className="flex-1 py-2.5 text-sm text-gray-900 dark:text-white"
                    />
                    {!!guestQuery && (
                      <Pressable
                        onPress={() => {
                          setGuestQuery("");
                          guests.clear();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear guest search"
                        className="p-1 active:opacity-70"
                      >
                        <Feather name="x" size={16} color="#9CA3AF" />
                      </Pressable>
                    )}
                  </View>
                  <Pressable
                    onPress={runGuestSearch}
                    disabled={guests.searching}
                    className={`flex-row items-center justify-center gap-1.5 rounded-lg bg-[#0644C7] px-4 py-2.5 active:opacity-90 ${
                      guests.searching ? "opacity-60" : ""
                    }`}
                    accessibilityRole="button"
                    accessibilityLabel="Search for guest"
                  >
                    {guests.searching ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Feather name="search" size={14} color="#FFFFFF" />
                    )}
                    <Text className="text-sm font-semibold text-white">Search</Text>
                  </Pressable>
                </View>
                {!!guests.hint && (
                  <Text className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {guests.hint}
                  </Text>
                )}
                {!guests.hint && !guests.searched && (
                  <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    At least {MIN_GUEST_QUERY} characters. Searches bookings,
                    waivers, tickets, orders and event tickets.
                  </Text>
                )}
              </View>

              {!guests.searching && (
                <GuestLookupResults
                  results={guests.results}
                  searched={guests.searched}
                  handlers={guestHandlers}
                />
              )}

              {/* Today's bookings */}
              {!loadingDay && visibleBookings.length > 0 && (
                <View className="mb-2 flex-row items-center">
                  {/* The range, not just the total — with a pager below, a bare
                      count reads as "this is all of them". */}
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {(page - 1) * perPage + 1}–
                    {Math.min(page * perPage, visibleBookings.length)} of{" "}
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
                        : "No bookings match your filter"}
                    </Text>
                  )}
                </View>
              ) : viewMode === "table" ? (
                <CheckInBookingsTable
                  rows={pagedBookings}
                  handlers={{
                    onCheckIn: (b) => openBooking(b.referenceNumber, false),
                    onDetails: (b) => openBooking(b.referenceNumber, true),
                    busy: booking.busy,
                  }}
                />
              ) : (
                <View
                  className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-neutral-900"
                  style={CARD_SHADOW}
                >
                  {pagedBookings.map((b, i) => (
                    <View
                      key={b.id}
                      className={
                        i > 0
                          ? "border-t border-gray-100 px-4 py-3.5 dark:border-neutral-800"
                          : "px-4 py-3.5"
                      }
                    >
                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        #{b.referenceNumber ?? "—"}
                      </Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {b.guestName || "Guest"}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Email: {b.guestEmail || "N/A"}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Phone: {b.guestPhone || "N/A"}
                      </Text>

                      <View className="mt-2 flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text
                            className="text-sm text-gray-900 dark:text-white"
                            numberOfLines={2}
                          >
                            {b.packageNameRaw || "N/A"}
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
                        {b.status === "confirmed" && !!b.referenceNumber && (
                          <Pressable
                            onPress={() => openBooking(b.referenceNumber, false)}
                            disabled={booking.busy}
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

              {/* Pager sits under whichever layout is showing, so switching
                  between table and cards keeps the same page. */}
              {!loadingDay && (
                <Pagination
                  page={page}
                  perPage={perPage}
                  total={visibleBookings.length}
                  options={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              )}

              {/* How to Use */}
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
            </>
          )}
        </View>
      </ScrollView>

      {/* Booking footer — Deny / Add Payment / Approve */}
      {booking.phase === "review" && booking.reviewDetail && (
        <View
          className="flex-row gap-2.5 border-t border-gray-100 bg-white px-5 pt-3 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {detailsOnly ? (
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
                  disabled={booking.paying}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#0644C7] px-2 py-3.5 active:opacity-90"
                  accessibilityRole="button"
                  accessibilityLabel="Add payment"
                >
                  {booking.paying ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Feather name="dollar-sign" size={15} color="#FFFFFF" />
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
                booking.reviewDetail.status === "confirmed" && (
                  <Pressable
                    onPress={booking.confirm}
                    disabled={booking.busy}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-green-600 px-2 py-3.5 active:opacity-90"
                    accessibilityRole="button"
                    accessibilityLabel="Check in now"
                  >
                    {booking.busy ? (
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
              <Pressable
                onPress={booking.deny}
                disabled={booking.busy || booking.paying}
                className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl px-2 py-3.5 active:opacity-90 ${
                  booking.origin === "manual" ? "bg-gray-500" : "bg-red-500"
                }`}
                accessibilityRole="button"
                accessibilityLabel={
                  booking.origin === "manual" ? "Cancel" : "Deny check-in"
                }
              >
                <Feather name="x-circle" size={14} color="#FFFFFF" />
                <Text numberOfLines={1} className="text-xs font-semibold text-white">
                  {booking.origin === "manual" ? "Cancel" : "Deny"}
                </Text>
              </Pressable>

              <Pressable
                onPress={openPayment}
                disabled={booking.busy || booking.paying}
                className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-[#0644C7] px-2 py-3.5 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel="Add payment"
              >
                {booking.paying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather name="dollar-sign" size={14} color="#FFFFFF" />
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
                onPress={booking.confirm}
                disabled={booking.busy || booking.paying}
                className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-green-600 px-2 py-3.5 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel="Approve check-in"
              >
                {booking.busy ? (
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

      {/* Entity footer — Close / Approve, for everything that isn't a booking */}
      {!!surface && (
        <View
          className="flex-row gap-2.5 border-t border-gray-100 bg-white px-5 pt-3 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            onPress={closeEntity}
            disabled={entity.busy || entity.orderBusy != null}
            className="flex-1 items-center justify-center rounded-xl border border-gray-200 py-3.5 active:opacity-80 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-700 dark:text-gray-200"
            >
              Close
            </Text>
          </Pressable>

          {canApprove && (
            <Pressable
              onPress={() => confirmEntity()}
              disabled={entity.busy || entity.orderBusy != null}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-green-600 px-2 py-3.5 active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel={approveLabel}
            >
              {entity.busy || entity.orderBusy != null ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Feather name="check-circle" size={15} color="#FFFFFF" />
                  <Text
                    numberOfLines={1}
                    className="text-sm font-semibold text-white"
                  >
                    {approveLabel}
                  </Text>
                </>
              )}
            </Pressable>
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
          {booking.reviewDetail && (
            <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-600 dark:text-gray-300">Total</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(booking.reviewDetail.totalAmount)}
                </Text>
              </View>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-sm text-gray-600 dark:text-gray-300">Paid</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {money(booking.reviewDetail.amountPaid)}
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
            disabled={booking.paying}
            className={`mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3.5 active:opacity-90 ${
              booking.paying ? "opacity-60" : ""
            }`}
            accessibilityRole="button"
          >
            {booking.paying ? (
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
