import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QrScannerView } from "../../components/checkin/QrScannerView";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  useBookingCheckIn,
  type ResultTone,
} from "../../lib/hooks/useBookingCheckIn";
import type { ScanBooking } from "../../services/bookingsService";

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

export default function BookingCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const {
    phase,
    review,
    result,
    busy,
    handleScan,
    confirm,
    cancelReview,
    reset,
  } = useBookingCheckIn();

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
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
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Check-in Scanner
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="px-5">
          {/* Intro */}
          <View
            className="mb-5 mt-6 rounded-2xl bg-white p-5 shadow-sm dark:bg-neutral-900"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Package Booking Check-In
            </Text>
            <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Scan QR codes or manually check in customers for their package
              bookings
            </Text>
          </View>

          {/* Scanner / processing */}
          {(phase === "scanning" || phase === "processing") && (
            <View>
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
            </View>
          )}

          {/* Review — a valid, confirmed booking awaiting approval */}
          {phase === "review" && review && (
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
                  className="flex-1 items-center justify-center rounded-full border border-gray-200 py-3.5 active:opacity-80 dark:border-neutral-700"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirm}
                  disabled={busy}
                  className={`flex-1 flex-row items-center justify-center rounded-full bg-[#0644C7] py-3.5 active:opacity-90 ${
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
                className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-[#0644C7] py-3.5 active:opacity-90"
                accessibilityRole="button"
              >
                <Feather name="maximize" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  {result.actionLabel}
                </Text>
              </Pressable>
            </View>
          )}

          {/* How to use — only while scanning */}
          {phase === "scanning" && (
            <View className="mt-5 rounded-2xl bg-[#0644C7]/5 p-4">
              <Text className="mb-2 text-sm font-bold text-gray-900 dark:text-white">
                How to use
              </Text>
              {[
                "Ask the customer to open their booking QR code.",
                "Hold the code steady inside the frame.",
                "Review the booking details, then tap Check In.",
              ].map((tip, i) => (
                <View key={i} className="mb-1.5 flex-row">
                  <Text className="mr-2 text-sm font-bold text-[#0644C7]">
                    {i + 1}.
                  </Text>
                  <Text className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
