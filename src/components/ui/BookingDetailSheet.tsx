import {
  AlertTriangle,
  Calendar,
  Clock,
  CreditCard,
  DoorOpen,
  Eye,
  LogIn,
  MapPin,
  Package,
  Pencil,
  Users,
} from "lucide-react-native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { clashSummary } from "../../lib/bookings/bookingCell";
import {
  isCheckInEligible,
  outstandingBalanceOf,
} from "../../lib/bookings/bookingCheckIn";
import { isBookingSyncInProgress } from "../../lib/bookings/bookingListCache";
import { resolvePaymentState } from "../../lib/payments/paymentState";
import { phoneDialUrl } from "../../lib/phone";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInBooking,
  fetchBookingDetail,
  type BookingDetail,
} from "../../services/bookingsService";
import {
  fetchEntityWaivers,
  type EntityWaivers,
} from "../../services/waiversService";
import { BookingChangeHistory } from "./BookingChangeHistory";
import { BookingFullView } from "./BookingFullView";
import { BottomSheet } from "./BottomSheet";
import { InternalNotesLog } from "./InternalNotesLog";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { ProcessPaymentSheet } from "./ProcessPaymentSheet";
import { WaiverConnectionCard } from "./WaiverConnectionCard";

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
const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  "checked-in": "bg-indigo-100 text-indigo-700",
  completed: "bg-blue-100 text-blue-700",
};

// Kept only as the neutral fallback for the *booking* status badge; the payment
// colours it used to hold now come from lib/payments/paymentState.ts.
const NEUTRAL_BADGE = "bg-gray-200 text-gray-700";

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatTime(time: string | null): string {
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

function formatDate(date: string): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mt-5 mb-2">
    {children}
  </Text>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <View className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-4">
    {children}
  </View>
);

const Row = ({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) => (
  <View className="flex-row items-center justify-between py-1">
    <Text className="text-sm text-gray-500 dark:text-gray-400">{label}</Text>
    <Text
      className={`text-sm font-medium text-gray-900 dark:text-white ${valueClass}`}
    >
      {value}
    </Text>
  </View>
);

const Badge = ({ text, className }: { text: string; className: string }) => {
  const [bg, fg] = className.split(" ");
  return (
    <View className={`px-3 py-1 rounded-full ${bg}`}>
      <Text className={`text-xs font-semibold ${fg}`}>{text}</Text>
    </View>
  );
};

/** The booking's connected waivers, read-only (web: WaiverConnectionPanel with checkInActions off). */
function BookingWaivers({ bookingId }: { bookingId: number }) {
  const [waivers, setWaivers] = useState<EntityWaivers | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Only the newest lookup may fill the card, so a slow earlier reply can't land last.
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      const next = await fetchEntityWaivers(
        token,
        "booking",
        bookingId,
        controller.signal,
      );
      if (requestId === requestRef.current) setWaivers(next);
    } catch {
      if (requestId !== requestRef.current) return;
      setWaivers(null);
      setFailed(true);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current++;
      controllerRef.current?.abort();
    };
  }, [load]);

  return (
    <WaiverConnectionCard
      type="booking"
      id={bookingId}
      waivers={waivers}
      loading={loading}
      loadFailed={failed}
      onRetry={load}
      compact
      checkInActions={false}
    />
  );
}

const CHECK_IN_FAILED = "Check-in failed. Please try again.";

/**
 * The quick view's Check In button and its confirmation (web:
 * BookingCheckInAction). Keyed by booking, so a request still running for a
 * booking the sheet has moved away from can't show its outcome on another.
 */
function BookingCheckInAction({
  booking,
  onCheckedIn,
}: {
  booking: BookingDetail & { referenceNumber: string };
  /** Called only after the API has confirmed the check-in. */
  onCheckedIn: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const confirmingRef = useRef(false);

  const amounts = {
    payment_status: booking.paymentStatus,
    total_amount: booking.totalAmount,
    amount_paid: booking.amountPaid,
  };
  const payment = resolvePaymentState(amounts);
  const balance = outstandingBalanceOf(amounts);
  const owing = !payment.isSettled;

  const submit = async () => {
    if (submittingRef.current) return;
    const token = getToken();
    if (!token) {
      setError("Please sign in again to check in this booking.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await checkInBooking(token, booking.referenceNumber, getCurrentUser()?.id);
      onCheckedIn();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : CHECK_IN_FAILED);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const confirm = () => {
    if (submittingRef.current || confirmingRef.current) return;
    confirmingRef.current = true;
    const settle = () => {
      confirmingRef.current = false;
    };

    let message = `Booking ${booking.referenceNumber} will be marked as checked in.`;
    if (owing) {
      const paidPart =
        payment.amountPaid > 0
          ? ` (${formatMoney(payment.amountPaid)} of ${formatMoney(payment.total)} paid)`
          : "";
      message =
        `This booking is ${payment.label.toLowerCase()}` +
        (balance !== null
          ? ` and has an outstanding balance of ${formatMoney(balance)}${paidPart}.`
          : ".") +
        "\n\nChecking in does not take or record a payment. The balance stays due until it is collected with Process Payment.";
    }

    Alert.alert(
      owing ? "Check in with a balance due?" : "Confirm check-in for this party?",
      message,
      [
        { text: "Cancel", style: "cancel", onPress: settle },
        {
          text: owing ? "Check in anyway" : "Check in",
          style: owing ? "destructive" : "default",
          onPress: () => {
            settle();
            void submit();
          },
        },
      ],
      { cancelable: true, onDismiss: settle },
    );
  };

  return (
    <View className="mb-3">
      <Pressable
        onPress={confirm}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        style={({ pressed }) => (pressed && !submitting ? { opacity: 0.7 } : null)}
        className={`py-3 rounded-xl border border-emerald-300 dark:border-emerald-800 items-center flex-row justify-center gap-2 ${
          submitting ? "opacity-60" : ""
        }`}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#047857" />
        ) : (
          <LogIn size={16} color="#047857" />
        )}
        <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {submitting ? "Checking in..." : "Check In"}
        </Text>
      </Pressable>
      {!!error && (
        <Text
          accessibilityRole="alert"
          className="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </Text>
      )}
    </View>
  );
}

type Props = {
  bookingId: number | null;
  visible: boolean;
  /**
   * Which content the sheet opens on. "hub" (default) shows the summary +
   * action buttons — used by the three-dot's "View Details". "details" opens
   * straight into the full web-parity Booking Details (BookingFullView), so a
   * card tap lands on the details without the extra tap (mirrors the Packages /
   * Attractions sheets' initialMode).
   */
  initialMode?: "hub" | "details";
  onClose: () => void;
  /** Notifies the parent that this booking changed, so it can refetch its list. */
  onChanged?: () => void;
  /** What this booking clashes with, when the opening screen knows (the Space Schedule does). */
  clash?: ReturnType<typeof clashSummary>;
};

/**
 * "Booking Details" sheet — fetches the record and supports View / Edit /
 * Process Payment. The View button opens the full icon-tile detail view
 * (with the downloadable QR code).
 */
export function BookingDetailSheet({
  bookingId,
  visible,
  initialMode = "hub",
  onClose,
  onChanged,
  clash,
}: Props) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [showPayment, setShowPayment] = useState(false);
  const [showFull, setShowFull] = useState(false);

  // Editing is a dedicated full-screen route (matches Packages / Attractions).
  // Dismiss both the full view and the sheet before navigating so nothing
  // lingers over the edit screen.
  const goEdit = () => {
    if (bookingId == null) return;
    setShowFull(false);
    onClose();
    router.push(`/bookings/edit-booking?id=${bookingId}`);
  };

  const load = useCallback(async () => {
    if (bookingId == null) return;
    // TEMP: investigation logging for the detail-sheet timeout.
    if (__DEV__) {
      console.log(`[BookingDetail] Opening booking ${bookingId}`);
      console.log(
        `[BookingDetail] syncInProgress=${isBookingSyncInProgress()}`,
      );
    }
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    setError(null);
    setLoading(true);

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      const d = await fetchBookingDetail(token, bookingId);
      if (isCurrent()) setDetail(d);
    } catch (err) {
      if (isCurrent())
        setError(err instanceof Error ? err.message : "Failed to load booking");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [bookingId]);

  // Fetch whenever a new booking is opened; reset transient UI state. A card tap
  // (initialMode "details") lands straight on the full Booking Details view;
  // the three-dot's "View Details" opens the hub (initialMode "hub").
  useEffect(() => {
    if (bookingId == null) return;
    setDetail(null);
    setShowFull(initialMode === "details");
    load();
    return () => {
      requestIdRef.current++;
    };
  }, [bookingId, initialMode, load]);

  const processPayment = () => {
    if (!detail) return;
    if (Math.max(0, detail.totalAmount - detail.amountPaid) <= 0) return;
    setShowPayment(true);
  };

  // What the booking is sold as, keyed off the package the way the web keys it.
  // The heading below switches on the same thing, so the badge and the section
  // can never disagree — and a booking with no `type` column still gets a label
  // instead of an empty badge.
  const hasPackage = detail?.packageId != null || !!detail?.packageName?.trim();
  const typeLabel = hasPackage ? "Package Booking" : "Activity Booking";
  const remaining = detail
    ? Math.max(0, detail.totalAmount - detail.amountPaid)
    : 0;
  const balanceDue = detail
    ? outstandingBalanceOf({
        payment_status: detail.paymentStatus,
        total_amount: detail.totalAmount,
        amount_paid: detail.amountPaid,
      })
    : null;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Booking Details">
        <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
          {loading && (
            <View className="py-16 items-center">
              <ActivityIndicator color="#0644C7" />
            </View>
          )}

          {!loading && error && (
            <View className="bg-red-50 border border-red-200 rounded-xl p-4 my-4">
              <Text className="text-red-700 font-semibold">Error</Text>
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          )}

          {!loading && !error && detail && (
            <>
              {/* the clash in words: the coloured ring on the grid can be seen but not read */}
              {!!clash && (
                <View
                  className={`mt-4 flex-row items-start gap-2 rounded-lg border px-3 py-2 ${
                    clash.doubleBooked
                      ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40"
                      : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40"
                  }`}
                >
                  <AlertTriangle
                    size={16}
                    color={clash.doubleBooked ? "#9f1239" : "#92400e"}
                    style={{ marginTop: 2 }}
                  />
                  <Text
                    className={`flex-1 text-sm ${
                      clash.doubleBooked
                        ? "text-rose-800 dark:text-rose-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    <Text className="font-bold uppercase">{clash.heading}</Text>{" "}
                    {clash.text}
                  </Text>
                </View>
              )}

              {/* Customer */}
              <SectionTitle>Customer Information</SectionTitle>
              <Card>
                <View className="flex-row items-center gap-2">
                  <Users size={16} color="#9ca3af" />
                  <Text className="flex-1 text-base font-semibold text-gray-900 dark:text-white">
                    {detail.customerName}
                  </Text>
                </View>
                {/* Said out loud when there is none, the way the web says it: a
                    missing phone number is something the desk has to know, and
                    an absent line reads as one nobody thought to show. */}
                <Text className="ml-6 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {detail.customerEmail || "No email provided"}
                </Text>
                {phoneDialUrl(detail.customerPhone) ? (
                  // calling the late party should be one tap, not a retype
                  <Pressable
                    onPress={() => {
                      const url = phoneDialUrl(detail.customerPhone);
                      if (url) void Linking.openURL(url);
                    }}
                    accessibilityRole="link"
                    accessibilityLabel={`Call ${detail.customerPhone}`}
                    hitSlop={8}
                    className="ml-6 mt-0.5 self-start active:opacity-60"
                  >
                    <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-400">
                      {detail.customerPhone}
                    </Text>
                  </Pressable>
                ) : (
                  <Text className="ml-6 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {detail.customerPhone || "No phone provided"}
                  </Text>
                )}
              </Card>

              {/* Directly under the customer, because it is what the desk needs
                  before they speak — the same place the web puts it. Skipped
                  while the full view is stacked on top, so only the visible
                  copy fetches. */}
              {!showFull && (
                <View className="mt-4">
                  <InternalNotesLog
                    bookingId={detail.id}
                    compact
                    onNoteSaved={(summary) =>
                      // Keep the copy this sheet is holding in step with the log, so the
                      // full view stacked on top of it shows the note too. The cached
                      // list row is patched by the log itself.
                      setDetail((current) =>
                        current && current.id === detail.id
                          ? { ...current, internalNotes: summary }
                          : current,
                      )
                    }
                  />
                </View>
              )}

              {/* Booking info */}
              <SectionTitle>Booking Information</SectionTitle>
              <Card>
                <Row label="Booking ID" value={`#${detail.id}`} />
                <Row
                  label="Reference Number"
                  value={detail.referenceNumber ?? "—"}
                />
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Status
                  </Text>
                  <Badge
                    text={capitalize(detail.status)}
                    className={
                      STATUS_BADGE[detail.status] ?? NEUTRAL_BADGE
                    }
                  />
                </View>
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Type
                  </Text>
                  <Badge
                    text={typeLabel}
                    className="bg-blue-100 text-blue-700"
                  />
                </View>
              </Card>

              {/* Date & time */}
              <SectionTitle>Date &amp; Time</SectionTitle>
              <Card>
                <View className="flex-row items-center gap-2">
                  <Calendar size={16} color="#0644C7" />
                  <Text className="text-base font-medium text-gray-900 dark:text-white flex-1">
                    {formatDate(detail.date)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 mt-1.5 mb-2">
                  <Clock size={16} color="#0644C7" />
                  <Text className="text-base font-medium text-gray-900 dark:text-white">
                    {formatTime(detail.time)}
                  </Text>
                </View>
                <View className="border-t border-gray-200 dark:border-neutral-700 pt-2">
                  <Row
                    label="Duration"
                    value={`${detail.duration} ${detail.durationUnit}`}
                  />
                  <Row label="Participants" value={detail.participants} />
                </View>
              </Card>

              {/* Package, or Activity when the booking has no package — the
                  web switches this heading on the same condition. */}
              <SectionTitle>{hasPackage ? "Package" : "Activity"}</SectionTitle>
              <Card>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2 flex-1 mr-2">
                    <Package size={16} color="#0644C7" />
                    <Text
                      className="text-base font-semibold text-[#0644C7] uppercase flex-1"
                      numberOfLines={1}
                    >
                      {detail.packageName?.trim() || "N/A"}
                    </Text>
                  </View>
                  {detail.packagePrice != null && (
                    <Text className="text-base font-bold text-gray-900 dark:text-white">
                      {formatMoney(detail.packagePrice)}
                    </Text>
                  )}
                </View>
              </Card>

              {/* Location & room */}
              <SectionTitle>Location</SectionTitle>
              <Card>
                <View className="flex-row items-center gap-2">
                  <MapPin size={16} color="#0644C7" />
                  <Text className="text-base font-medium text-gray-900 dark:text-white flex-1">
                    {detail.locationName || "—"}
                  </Text>
                </View>
                {!!detail.roomName && (
                  <View className="flex-row items-center gap-2 mt-2">
                    <DoorOpen size={16} color="#9ca3af" />
                    <Text className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                      {detail.roomName}
                    </Text>
                  </View>
                )}
              </Card>

              {/* Guest of honor */}
              {!!detail.guestOfHonorName && (
                <>
                  <SectionTitle>Guest of Honor</SectionTitle>
                  <Card>
                    <Row
                      label="Name"
                      value={
                        detail.guestOfHonorAge != null
                          ? `${detail.guestOfHonorName} (${detail.guestOfHonorAge} years old)`
                          : detail.guestOfHonorName
                      }
                    />
                  </Card>
                </>
              )}

              {/* Additional Attractions — priced at what they cost when the
                  booking was made, which is what the guest agreed to. */}
              {detail.attractions.length > 0 && (
                <>
                  <SectionTitle>Additional Attractions</SectionTitle>
                  <Card>
                    {detail.attractions.map((a, i) => (
                      <View
                        key={a.id}
                        className={`flex-row items-center justify-between py-1 ${
                          i > 0
                            ? "border-t border-gray-200 dark:border-neutral-700"
                            : ""
                        }`}
                      >
                        <Text className="flex-1 mr-2 text-sm text-gray-900 dark:text-white">
                          {a.name}
                        </Text>
                        <Text className="mr-3 text-sm text-gray-500 dark:text-gray-400">
                          Qty: {a.quantity}
                        </Text>
                        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {formatMoney(a.priceAtBooking * a.quantity)}
                        </Text>
                      </View>
                    ))}
                  </Card>
                </>
              )}

              {/* Add-ons */}
              {detail.addOns.length > 0 && (
                <>
                  <SectionTitle>Add-ons</SectionTitle>
                  <Card>
                    {detail.addOns.map((a, i) => (
                      <View
                        key={a.id}
                        className={`flex-row items-center justify-between py-1 ${
                          i > 0
                            ? "border-t border-gray-200 dark:border-neutral-700"
                            : ""
                        }`}
                      >
                        <Text className="text-sm text-gray-900 dark:text-white">
                          {a.name}
                        </Text>
                        <Text className="text-sm text-gray-500 dark:text-gray-400">
                          Qty: {a.quantity}
                        </Text>
                      </View>
                    ))}
                  </Card>
                </>
              )}

              {/* The guest's own words — booking.notes is emailed back to them, so it
                  is never labelled internal (web parity: "Notes & Requests"). */}
              {(!!detail.specialRequests || !!detail.customerNotes) && (
                <>
                  <SectionTitle>Notes &amp; Requests</SectionTitle>
                  <Card>
                    {!!detail.specialRequests && (
                      <View>
                        <Text className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Special Requests
                        </Text>
                        <Text className="mt-1 text-sm text-gray-900 dark:text-white">
                          {detail.specialRequests}
                        </Text>
                      </View>
                    )}
                    {!!detail.specialRequests && !!detail.customerNotes && (
                      <View className="my-3 h-px bg-gray-200 dark:bg-neutral-700" />
                    )}
                    {!!detail.customerNotes && (
                      <View>
                        <Text className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Note from the guest
                        </Text>
                        <Text className="mt-1 text-sm text-gray-900 dark:text-white">
                          {detail.customerNotes}
                        </Text>
                      </View>
                    )}
                  </Card>
                </>
              )}

              {/* Payment */}
              <SectionTitle>Payment</SectionTitle>
              <Card>
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Total Amount
                  </Text>
                  <Text className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatMoney(detail.totalAmount)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Payment Status
                  </Text>
                  <PaymentStatusBadge
                    payment={{
                      payment_status: detail.paymentStatus,
                      total_amount: detail.totalAmount,
                      amount_paid: detail.amountPaid,
                    }}
                  />
                </View>
                {!!detail.paymentMethod && (
                  <Row label="Payment Method" value={detail.paymentMethod} />
                )}
                {!!detail.cardLabel && (
                  <Row
                    label="Card"
                    value={detail.cardLabel}
                    valueClass="text-xs text-gray-500 dark:text-gray-400"
                  />
                )}
                <Row
                  label="Amount Paid"
                  value={formatMoney(detail.amountPaid)}
                />
                {balanceDue !== null && (
                  <View className="flex-row items-center justify-between py-1">
                    <Text className="text-sm text-gray-500 dark:text-gray-400">
                      Balance Due
                    </Text>
                    <Text className="text-sm font-medium text-red-600 dark:text-red-400">
                      {formatMoney(balanceDue)}
                    </Text>
                  </View>
                )}

                {detail.appliedFees.length > 0 && (
                  <View className="border-t border-gray-200 dark:border-neutral-700 mt-2 pt-2">
                    <Text className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                      Applied Fees
                    </Text>
                    {detail.appliedFees.map((f, i) => (
                      <View
                        key={`${f.name}-${i}`}
                        className="flex-row items-center justify-between py-0.5"
                      >
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {f.name} ({f.applicationType})
                        </Text>
                        <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                          {formatMoney(f.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {detail.appliedDiscounts.length > 0 && (
                  <View className="border-t border-gray-200 dark:border-neutral-700 mt-2 pt-2">
                    <Text className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                      Applied Discounts
                    </Text>
                    {detail.appliedDiscounts.map((d, i) => (
                      <View
                        key={`${d.name}-${i}`}
                        className="flex-row items-center justify-between py-0.5"
                      >
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {d.name}
                          {d.type ? ` (${d.type})` : ""}
                        </Text>
                        <Text className="text-xs font-medium text-green-600 dark:text-green-400">
                          −{formatMoney(d.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              {!showFull && (
                <View className="mt-4">
                  <BookingWaivers bookingId={detail.id} />
                </View>
              )}

              {/* Change history — the backend's permanent booking change log
                  (web parity). Skipped while the full view is stacked on top,
                  so only the visible copy fetches it. */}
              {!showFull && <BookingChangeHistory bookingId={detail.id} />}

              {/* ---- Footer actions ---- */}
              <View className="mt-6 mb-2">
                <View className="flex-row gap-2 mb-3">
                  <Pressable
                    onPress={() => setShowFull(true)}
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center flex-row justify-center gap-2"
                  >
                    <Eye size={16} color="#6b7280" />
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      View
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={goEdit}
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center flex-row justify-center gap-2"
                  >
                    <Pencil size={16} color="#6b7280" />
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={processPayment}
                    disabled={remaining <= 0}
                    style={({ pressed }) =>
                      pressed && remaining > 0 ? { opacity: 0.7 } : null
                    }
                    className={`flex-[1.3] py-3 rounded-xl border items-center flex-row justify-center gap-2 ${
                      remaining <= 0
                        ? "border-gray-200 dark:border-neutral-800"
                        : "border-amber-400"
                    }`}
                  >
                    <CreditCard
                      size={16}
                      color={remaining <= 0 ? "#9ca3af" : "#d97706"}
                    />
                    <Text
                      className={`text-sm font-semibold ${
                        remaining <= 0 ? "text-gray-400" : "text-amber-600"
                      }`}
                    >
                      {remaining <= 0 ? "Fully Paid" : "Process Payment"}
                    </Text>
                  </Pressable>
                </View>
                {isCheckInEligible(detail) && !!detail.referenceNumber && (
                  <BookingCheckInAction
                    key={detail.id}
                    booking={{ ...detail, referenceNumber: detail.referenceNumber }}
                    onCheckedIn={() => {
                      const checkedInId = detail.id;
                      // the sheet may have been closed or moved to another booking while the request ran
                      setDetail((current) =>
                        current && current.id === checkedInId
                          ? { ...current, status: "checked-in" }
                          : current,
                      );
                      onChanged?.();
                    }}
                  />
                )}
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                  className="py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
                >
                  <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    Close
                  </Text>
                </Pressable>
              </View>

              <View style={{ height: 24 }} />
            </>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Full icon-tile view + QR. Reached from the hub's View button, or opened
          directly on a card tap (initialMode "details"). When it's the entry
          point, closing dismisses the whole sheet back to the list; when reached
          from the hub, closing returns to the hub. */}
      {/* Process Payment — same sheet the Manage Bookings row action opens. */}
      <ProcessPaymentSheet
        visible={showPayment}
        bookingId={detail?.id ?? null}
        referenceNumber={detail?.referenceNumber ?? null}
        totalAmount={detail?.totalAmount ?? 0}
        amountPaid={detail?.amountPaid ?? 0}
        locationId={detail?.locationId ?? null}
        customerId={detail?.customerId ?? null}
        status={detail?.status ?? null}
        onClose={() => setShowPayment(false)}
        onProcessed={() => {
          load();
          onChanged?.();
        }}
      />

      <BookingFullView
        visible={showFull}
        detail={detail}
        onEdit={goEdit}
        onNoteSaved={(summary) =>
          setDetail((current) =>
            current && detail && current.id === detail.id
              ? { ...current, internalNotes: summary }
              : current,
          )
        }
        onClose={() => {
          setShowFull(false);
          if (initialMode === "details") onClose();
        }}
        onDeleted={() => {
          // Dismiss both surfaces and refresh the list after a delete.
          setShowFull(false);
          onClose();
          onChanged?.();
        }}
      />
    </>
  );
}
