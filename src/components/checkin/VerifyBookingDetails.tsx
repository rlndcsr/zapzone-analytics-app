import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { formatDuration } from "../../lib/time";
import { launchKioskSession } from "../../lib/waivers/kiosk";
import type { BookingDetail } from "../../services/bookingsService";
import type {
  ConnectedWaiver,
  EntityWaivers,
} from "../../services/waiversService";

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

const titleCase = (s: string) =>
  s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Color the payment / booking status value like the web verify modal. */
function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "paid":
    case "confirmed":
    case "completed":
    case "checked-in":
      return "text-green-600 dark:text-green-400";
    case "partial":
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    case "cancelled":
    case "refunded":
    case "failed":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-900 dark:text-white";
  }
}

type IconName = React.ComponentProps<typeof Feather>["name"];

/** One icon-led detail tile (icon square + label + value). */
function InfoTile({
  icon,
  label,
  value,
  subValue,
  valueClass = "text-gray-900 dark:text-white",
  full,
}: {
  icon: IconName;
  label: string;
  value: string;
  subValue?: string | null;
  valueClass?: string;
  full?: boolean;
}) {
  return (
    <View className={`${full ? "w-full" : "w-1/2"} px-2 mb-4`}>
      <View className="flex-row items-start gap-2.5">
        <View className="h-9 w-9 rounded-lg bg-[#0644C7]/10 items-center justify-center">
          <Feather name={icon} size={16} color="#0644C7" />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-gray-400 dark:text-gray-500">
            {label}
          </Text>
          <Text className={`text-sm font-semibold ${valueClass}`} numberOfLines={2}>
            {value}
          </Text>
          {subValue ? (
            <Text className="text-[11px] text-gray-400 dark:text-gray-500">
              {subValue}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Status banner wording and colour, mirroring the web's Booking Details modal. */
const DETAILS_BANNER: Record<
  string,
  { title: string; body: string; icon: IconName; tint: string; box: string }
> = {
  "checked-in": {
    title: "Checked In",
    body: "This booking has been checked in.",
    icon: "check-circle",
    tint: "#16A34A",
    box: "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20",
  },
  completed: {
    title: "Booking Completed",
    body: "This booking has been completed.",
    icon: "check-circle",
    tint: "#2563EB",
    box: "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20",
  },
  cancelled: {
    title: "Booking Cancelled",
    body: "This booking has been cancelled.",
    icon: "x-circle",
    tint: "#DC2626",
    box: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
  },
  confirmed: {
    title: "Confirmed Booking",
    body: "This booking is confirmed and ready to be checked in.",
    icon: "alert-circle",
    tint: "#CA8A04",
    box: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-900/20",
  },
};

const BANNER_TEXT: Record<string, string> = {
  "checked-in": "text-green-800 dark:text-green-300",
  completed: "text-blue-800 dark:text-blue-300",
  cancelled: "text-red-800 dark:text-red-300",
  confirmed: "text-yellow-800 dark:text-yellow-300",
};

const BANNER_BODY_TEXT: Record<string, string> = {
  "checked-in": "text-green-600 dark:text-green-400",
  completed: "text-blue-600 dark:text-blue-400",
  cancelled: "text-red-600 dark:text-red-400",
  confirmed: "text-yellow-700 dark:text-yellow-400",
};

/** The rich, read-only "Verify Booking Details" body (mirrors the web modal). */
export function VerifyBookingDetails({
  detail,
  waivers,
  onCheckInWaiver,
  checkingWaiverId,
  variant = "verify",
}: {
  detail: BookingDetail;
  waivers: EntityWaivers | null;
  onCheckInWaiver: (waiverId: number) => void;
  checkingWaiverId: number | null;
  /**
   * "verify" heads the body with the scan review's Scheduled + Valid Booking
   * banners and its "check this person in now?" prompt. "details" heads it with
   * a single status banner instead — the same body reached from a list's
   * Details action, where nothing is being approved.
   */
  variant?: "verify" | "details";
}) {
  const time = fmtTime(detail.time);
  const dateTime = detail.date
    ? `${fmtDate(detail.date)}${time ? ` at ${time}` : ""}`
    : "—";
  const durationLabel = formatDuration(detail.duration, detail.durationUnit);
  const banner = DETAILS_BANNER[(detail.status ?? "").toLowerCase()] ?? null;

  const [launchingKiosk, setLaunchingKiosk] = React.useState(false);

  const openKiosk = async () => {
    setLaunchingKiosk(true);
    try {
      await launchKioskSession("booking", detail.id);
    } finally {
      setLaunchingKiosk(false);
    }
  };

  const copyLink = async (w: ConnectedWaiver) => {
    if (!w.signingUrl) return;
    try {
      await Clipboard.setStringAsync(w.signingUrl);
      Alert.alert("Link copied", "The waiver link was copied to your clipboard.");
    } catch {
      Alert.alert("Copy failed", "Could not copy the waiver link.");
    }
  };

  return (
    <View>
      {variant === "details" ? (
        /* One status banner — the head of the web's Booking Details modal. */
        banner && (
          <View className={`flex-row gap-3 rounded-2xl border p-4 ${banner.box}`}>
            <Feather name={banner.icon} size={18} color={banner.tint} />
            <View className="flex-1">
              <Text
                className={`text-base font-bold ${
                  BANNER_TEXT[detail.status?.toLowerCase() ?? ""] ??
                  "text-gray-900 dark:text-white"
                }`}
              >
                {banner.title}
              </Text>
              <Text
                className={`mt-0.5 text-sm ${
                  BANNER_BODY_TEXT[detail.status?.toLowerCase() ?? ""] ??
                  "text-gray-600 dark:text-gray-300"
                }`}
              >
                {banner.body}
              </Text>
            </View>
          </View>
        )
      ) : (
        <>
          {/* Scheduled banner */}
          <View className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-900/20">
            <View className="flex-row items-center justify-center gap-2">
              <Feather name="clock" size={18} color="#0644C7" />
              <Text className="text-base font-bold text-[#0644C7] dark:text-blue-300">
                {time ? `Scheduled for ${time}` : "Scheduled"}
              </Text>
            </View>
            {!!detail.date && (
              <Text className="mt-1 text-center text-sm text-gray-600 dark:text-gray-300">
                {fmtDate(detail.date)}
              </Text>
            )}
            <Text className="mt-2 text-center text-sm text-[#0644C7] dark:text-blue-300">
              Would you like to check this person in now?
            </Text>
          </View>

          {/* Valid booking banner */}
          <View className="mt-4 rounded-2xl border border-green-100 bg-green-50/70 p-4 dark:border-green-900/40 dark:bg-green-900/20">
            <View className="flex-row items-center gap-2">
              <Feather name="check-circle" size={18} color="#16A34A" />
              <Text className="text-base font-bold text-green-700 dark:text-green-400">
                Valid Booking
              </Text>
            </View>
            <Text className="mt-0.5 text-sm text-green-700/90 dark:text-green-400/90">
              This booking is ready to be checked in.
            </Text>
          </View>
        </>
      )}

      {/* Waivers */}
      {waivers && (
        <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Feather name="shield" size={16} color="#0644C7" />
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                Waivers
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="flex-row items-center gap-1">
                <Feather name="check-circle" size={12} color="#16A34A" />
                <Text className="text-xs text-green-600 dark:text-green-400">
                  {waivers.summary.completed} signed
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Feather name="clock" size={12} color="#D97706" />
                <Text className="text-xs text-amber-600 dark:text-amber-400">
                  {waivers.summary.pending} pending
                </Text>
              </View>
              {/* Kiosk — opens a prefilled session (Already Completed / form). */}
              <Pressable
                onPress={openKiosk}
                disabled={launchingKiosk}
                hitSlop={6}
                className="flex-row items-center gap-1 active:opacity-70"
                style={launchingKiosk ? { opacity: 0.5 } : undefined}
                accessibilityRole="button"
                accessibilityLabel="Open waiver kiosk"
              >
                {launchingKiosk ? (
                  <ActivityIndicator size="small" color="#0644C7" />
                ) : (
                  <Feather name="monitor" size={12} color="#0644C7" />
                )}
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Kiosk
                </Text>
              </Pressable>
            </View>
          </View>

          {waivers.waivers.length > 0 ? (
            waivers.waivers.map((w) => {
              const signed = w.status === "completed";
              const checking = checkingWaiverId === w.id;
              return (
                <View
                  key={w.id}
                  className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800"
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1 flex-row flex-wrap items-center gap-1.5">
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {w.adultName}
                      </Text>
                      {/* Signed / Not signed */}
                      <View
                        className={`rounded px-2 py-0.5 ${
                          signed
                            ? "bg-green-100 dark:bg-green-900/40"
                            : "bg-amber-100 dark:bg-amber-900/40"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            signed
                              ? "text-green-700 dark:text-green-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {signed ? "Signed" : "Not signed"}
                        </Text>
                      </View>
                      {/* Checked in / Not checked in */}
                      <View
                        className={`rounded px-2 py-0.5 ${
                          w.checkedIn
                            ? "bg-green-100 dark:bg-green-900/40"
                            : "bg-gray-100 dark:bg-neutral-800"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            w.checkedIn
                              ? "text-green-700 dark:text-green-300"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {w.checkedIn ? "Checked In" : "Not Checked In"}
                        </Text>
                      </View>
                    </View>

                    {/* Copy link — only pending waivers still have one. */}
                    {!!w.signingUrl && (
                      <Pressable
                        onPress={() => copyLink(w)}
                        hitSlop={6}
                        className="flex-row items-center gap-1 active:opacity-70"
                        accessibilityRole="button"
                        accessibilityLabel="Copy waiver link"
                      >
                        <Feather name="link" size={12} color="#0644C7" />
                        <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                          Copy link
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {!!w.template && (
                    <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {w.template}
                      {w.selectedDate ? ` · ${fmtDate(w.selectedDate)}` : ""}
                    </Text>
                  )}

                  {/* Per-waiver actions: Check in (hidden once checked in) */}
                  {!w.checkedIn && (
                    <View className="mt-2 flex-row">
                      <Pressable
                        onPress={() => onCheckInWaiver(w.id)}
                        disabled={checking}
                        className={`flex-row items-center gap-1.5 rounded-full bg-[#0644C7] px-3 py-1.5 active:opacity-90 ${
                          checking ? "opacity-60" : ""
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel="Check in waiver"
                      >
                        <Feather name="user-check" size={12} color="#FFFFFF" />
                        <Text className="text-xs font-semibold text-white">
                          {checking ? "Checking in…" : "Check in"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <Text className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              No waivers connected to this booking.
            </Text>
          )}
        </View>
      )}

      {/* Booking information */}
      <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <Text className="mb-3 text-base font-bold text-gray-900 dark:text-white">
          Booking Information
        </Text>

        <View className="flex-row flex-wrap -mx-2">
          <InfoTile
            icon="hash"
            label="Reference Number"
            value={detail.referenceNumber ? `#${detail.referenceNumber}` : "—"}
          />
          <InfoTile icon="user" label="Customer" value={detail.customerName} />
          <InfoTile icon="package" label="Package" value={detail.packageName} full />
          <InfoTile icon="calendar" label="Date & Time" value={dateTime} />
          <InfoTile
            icon="users"
            label="Participants"
            value={`${detail.participants}`}
          />
          <InfoTile icon="clock" label="Duration" value={durationLabel} />
          <InfoTile
            icon="dollar-sign"
            label="Total Amount"
            value={money(detail.totalAmount)}
          />
          <InfoTile
            icon="dollar-sign"
            label="Amount Paid"
            value={money(detail.amountPaid)}
          />
        </View>

        {/* Applied fees */}
        {detail.appliedFees.length > 0 && (
          <View className="mt-1 border-t border-gray-100 pt-3 dark:border-neutral-800">
            <Text className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              Applied Fees
            </Text>
            {detail.appliedFees.map((fee, i) => (
              <View
                key={`${fee.name}-${i}`}
                className="flex-row items-center justify-between py-1"
              >
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  {fee.name}{" "}
                  <Text className="text-xs text-gray-400">
                    ({titleCase(fee.applicationType)})
                  </Text>
                </Text>
                <Text className="text-sm font-semibold text-red-500">
                  +{money(fee.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Payment / status / contact / space / guest of honor */}
        <View className="mt-3 flex-row flex-wrap -mx-2 border-t border-gray-100 pt-4 dark:border-neutral-800">
          {!!detail.paymentMethod && (
            <InfoTile
              icon="credit-card"
              label="Payment Method"
              value={titleCase(detail.paymentMethod)}
            />
          )}
          <InfoTile
            icon="dollar-sign"
            label="Payment Status"
            value={titleCase(detail.paymentStatus)}
            valueClass={statusColor(detail.paymentStatus)}
          />
          <InfoTile
            icon="check-circle"
            label="Booking Status"
            value={titleCase(detail.status)}
            valueClass={statusColor(detail.status)}
          />
          {!!detail.customerEmail && (
            <InfoTile icon="mail" label="Email" value={detail.customerEmail} full />
          )}
          {!!detail.customerPhone && (
            <InfoTile
              icon="smartphone"
              label="Phone"
              value={detail.customerPhone}
            />
          )}
          {!!detail.locationName && (
            <InfoTile
              icon="home"
              label="Location"
              value={detail.locationName}
              full
            />
          )}
          {!!detail.roomName && (
            <InfoTile icon="grid" label="Space" value={detail.roomName} full />
          )}
          {!!detail.guestOfHonorName && (
            <InfoTile
              icon="user"
              label="Guest of Honor"
              value={detail.guestOfHonorName}
              subValue={
                detail.guestOfHonorAge != null
                  ? `${detail.guestOfHonorAge} years old`
                  : null
              }
              full
            />
          )}
        </View>
      </View>
    </View>
  );
}
