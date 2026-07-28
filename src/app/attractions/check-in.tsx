import { Feather } from "@expo/vector-icons";
import { scanFromURLAsync } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QrScannerView } from "../../components/checkin/QrScannerView";
import { VerifyTicketDetails } from "../../components/checkin/VerifyTicketDetails";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  useAttractionCheckIn,
  type ResultTone,
} from "../../lib/hooks/useAttractionCheckIn";
import type { PurchaseRow } from "../../services/attractionPurchasesService";

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

/** "2026-01-05" | ISO -> "Jan 5, 2026". */
function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "13:30" | "13:30:00" -> "1:30 PM". */
function fmtTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

/** Tone → color classes for the result banner icon tile + accent. */
const TONE: Record<
  ResultTone,
  { icon: React.ComponentProps<typeof Feather>["name"]; wrap: string; iconColor: string; title: string }
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

/** Label/value line inside a ticket detail card. */
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

/** Shared ticket summary (customer, attraction, schedule, totals, status). */
function TicketDetails({
  purchase,
  hidePayment = false,
}: {
  purchase: PurchaseRow;
  /** Omit the Total/Paid rows when a dedicated PaymentBreakdown is shown. */
  hidePayment?: boolean;
}) {
  const time = fmtTime(purchase.scheduledTime);
  const schedule = purchase.scheduledDate
    ? `${fmtDate(purchase.scheduledDate)}${time ? ` · ${time}` : ""}`
    : "—";

  return (
    <View className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <View className="mb-1 flex-row items-center justify-between">
        <Text
          className="flex-1 text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
        <StatusBadge status={purchase.status} />
      </View>
      <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
        {purchase.attractionName}
      </Text>

      <View className="mt-2 border-t border-gray-100 dark:border-neutral-800">
        <DetailRow label="Schedule" value={schedule} />
        <DetailRow label="Guests" value={`${purchase.quantity}`} />
        {!hidePayment ? (
          <>
            <DetailRow label="Total" value={money(purchase.totalAmount)} />
            <DetailRow label="Paid" value={money(purchase.amountPaid)} />
          </>
        ) : null}
        {purchase.paymentMethod ? (
          <DetailRow
            label="Payment"
            value={purchase.paymentMethod.replace(/_/g, " ")}
          />
        ) : null}
        <DetailRow label="Ticket ID" value={`#${purchase.id}`} />
      </View>
    </View>
  );
}

/**
 * Payment breakdown for a Pending ticket — Total, Paid, and the computed
 * Outstanding Balance (Total − Paid, floored at 0). All values come straight
 * from the verify response (`PurchaseRow.totalAmount` / `amountPaid`); no extra
 * request is made. Mirrors the web's intent of surfacing the unpaid balance
 * before blocking check-in.
 */
function PaymentBreakdown({ purchase }: { purchase: PurchaseRow }) {
  const outstanding = Math.max(0, purchase.totalAmount - purchase.amountPaid);

  return (
    <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
      <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Payment Details
      </Text>

      <View className="flex-row items-center justify-between py-2">
        <Text className="text-sm text-gray-600 dark:text-gray-300">Total Amount</Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {money(purchase.totalAmount)}
        </Text>
      </View>
      <View className="flex-row items-center justify-between py-2">
        <Text className="text-sm text-gray-600 dark:text-gray-300">Amount Paid</Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {money(purchase.amountPaid)}
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
        This ticket can’t be checked in until the outstanding balance is paid.
      </Text>
    </View>
  );
}

/** The web's numbered "How to Use" steps, verbatim. */
const HOW_TO_USE: { lead?: string; text: string }[] = [
  { text: 'Tap "Start Camera" to begin scanning or upload a QR code image from your device' },
  {
    lead: "Mobile recommended:",
    text: "Point your phone/tablet camera at the customer's QR code ticket",
  },
  { text: "Review the ticket details and verify customer information" },
  { text: 'Tap "Check In" to mark the ticket as used, or "Cancel" to scan again' },
  {
    text: "Each ticket can only be used once - already used tickets will be rejected automatically",
  },
];

export default function AttractionCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const {
    phase,
    review,
    waivers,
    result,
    busy,
    handleScan,
    confirm,
    cancelReview,
    startScanning,
    stopScanning,
    reset,
  } = useAttractionCheckIn();

  // "Upload Image" — pick a photo of a ticket and decode the QR out of it,
  // the mobile equivalent of the web's file input.
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
          "That image doesn't contain a readable QR code. Try a clearer photo of the ticket.",
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Sub-screen header (matches the Attractions module chrome). */}
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
              <Feather name="camera" size={16} color={headerIcon} />
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                Attraction Ticket Check-In
              </Text>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Scan QR codes to check in customers and mark tickets as used
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
          {/* Page heading + tip banner (mirrors the web page header) */}
          {/* Tip banner (mirrors the web page header). Hidden once a ticket is
              on screen — the web covers the page with the verify modal there. */}
          {(phase === "idle" || phase === "scanning") && (
            <View className="mt-6 flex-row items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Feather name="smartphone" size={18} color="#2563EB" />
              <Text className="flex-1 text-sm text-blue-800 dark:text-blue-300">
                <Text className="font-bold">Tip:</Text> For best scanning
                experience, hold the device steady with the ticket fully in frame
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
          {(phase === "scanning" || phase === "processing") && (
            <View
              className="mb-5 mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900"
              style={CARD_SHADOW}
            >
              <View className="relative">
                <QrScannerView
                  active={phase === "scanning"}
                  onScan={handleScan}
                />
                {phase === "processing" && (
                  <View className="absolute inset-0 items-center justify-center rounded-3xl bg-black/60">
                    <ActivityIndicator color="#FFFFFF" size="large" />
                    <Text className="mt-3 text-sm font-medium text-white">
                      Processing QR code…
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Point the camera at the ticket’s QR code.
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

          {/* Review — a valid, confirmed ticket awaiting approval */}
          {phase === "review" && review && (
            <View className="mt-1">
              <Text className="mb-3 text-lg font-bold text-gray-800 dark:text-white">
                Verify Ticket Details
              </Text>
              <VerifyTicketDetails purchase={review} waivers={waivers} />
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

                {result.purchase ? (
                  result.purchase.status === "pending" ? (
                    // Pending → surface the unpaid balance, then the rest of the
                    // ticket info without the duplicated Total/Paid rows.
                    <>
                      <PaymentBreakdown purchase={result.purchase} />
                      <TicketDetails purchase={result.purchase} hidePayment />
                    </>
                  ) : (
                    <TicketDetails purchase={result.purchase} />
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

      {/* Verify footer — Deny / Approve, pinned like the web modal's footer */}
      {phase === "review" && review && (
        <View
          className="flex-row gap-3 border-t border-gray-100 bg-white px-5 pt-3 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            onPress={cancelReview}
            disabled={busy}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-red-600 py-3.5 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Deny check-in"
          >
            <Feather name="x-circle" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">Deny</Text>
          </Pressable>

          <Pressable
            onPress={confirm}
            disabled={busy}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-green-600 py-3.5 active:opacity-90 ${
              busy ? "opacity-60" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel="Approve check-in"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="check-circle" size={16} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">Approve</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
