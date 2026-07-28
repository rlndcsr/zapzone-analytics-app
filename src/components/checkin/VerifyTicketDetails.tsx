import { Feather } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { ConnectedWaiversPanel } from "../ui/ConnectedWaiversPanel";
import type { PurchaseRow, PurchaseStatus } from "../../services/attractionPurchasesService";
import type { EntityWaivers } from "../../services/waiversService";

const PRIMARY = "#0644C7";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

/** "2026-07-31" -> "7/31/2026" (the web's toLocaleDateString default). */
function fmtShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** "2026-07-31" -> "Friday, July 31, 2026". */
function fmtLong(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "14:00" | "14:00:00" -> "2:00 PM". */
function fmtTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

type IconName = React.ComponentProps<typeof Feather>["name"];

/** Per-status banner + Status tile colours, mirroring the web modal. */
const STATUS_STYLE: Record<
  PurchaseStatus,
  {
    label: string;
    icon: IconName;
    banner: string;
    title: string;
    body: string;
    accent: string;
    tile: string;
    heading: string;
    message: string;
  }
> = {
  confirmed: {
    label: "Confirmed",
    icon: "check-circle",
    banner: "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20",
    title: "text-blue-800 dark:text-blue-300",
    body: "text-blue-600 dark:text-blue-400",
    accent: "#2563EB",
    tile: "bg-blue-100 dark:bg-blue-900/40",
    heading: "Valid Ticket - Ready for Check-In",
    message: "This ticket is paid in full and ready to be checked in.",
  },
  "checked-in": {
    label: "Checked In",
    icon: "x-circle",
    banner: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
    title: "text-red-800 dark:text-red-300",
    body: "text-red-600 dark:text-red-400",
    accent: "#16A34A",
    tile: "bg-green-100 dark:bg-green-900/40",
    heading: "Already Checked In",
    message: "This ticket has already been checked in and cannot be used again.",
  },
  cancelled: {
    label: "Cancelled",
    icon: "x-circle",
    banner: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
    title: "text-red-800 dark:text-red-300",
    body: "text-red-600 dark:text-red-400",
    accent: "#DC2626",
    tile: "bg-red-100 dark:bg-red-900/40",
    heading: "Ticket Cancelled",
    message: "This ticket has been cancelled and cannot be used.",
  },
  refunded: {
    label: "Refunded",
    icon: "x-circle",
    banner:
      "border-purple-200 bg-purple-50 dark:border-purple-900/40 dark:bg-purple-900/20",
    title: "text-purple-800 dark:text-purple-300",
    body: "text-purple-600 dark:text-purple-400",
    accent: "#9333EA",
    tile: "bg-purple-100 dark:bg-purple-900/40",
    heading: "Ticket Refunded",
    message: "This ticket has been refunded and cannot be used.",
  },
  pending: {
    label: "Pending",
    icon: "clock",
    banner:
      "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-900/20",
    title: "text-yellow-800 dark:text-yellow-300",
    body: "text-yellow-600 dark:text-yellow-400",
    accent: "#CA8A04",
    tile: "bg-yellow-100 dark:bg-yellow-900/40",
    heading: "Payment Incomplete",
    message: "Cannot check in until fully paid.",
  },
  voided: {
    label: "Voided",
    icon: "x-circle",
    banner: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
    title: "text-red-800 dark:text-red-300",
    body: "text-red-600 dark:text-red-400",
    accent: "#DC2626",
    tile: "bg-red-100 dark:bg-red-900/40",
    heading: "Ticket Voided",
    message: "This ticket has been voided and cannot be used.",
  },
};

/** One icon-led detail tile (icon square + label + value). */
function InfoTile({
  icon,
  label,
  value,
  full,
  valueClass = "text-gray-800 dark:text-white",
  tileClass = "bg-[#0644C7]/10",
  iconColor = PRIMARY,
  alignTop,
}: {
  icon: IconName;
  label: string;
  value: string;
  full?: boolean;
  valueClass?: string;
  tileClass?: string;
  iconColor?: string;
  alignTop?: boolean;
}) {
  return (
    <View className={`${full ? "w-full" : "w-1/2"} px-2 mb-4`}>
      <View className={`flex-row gap-3 ${alignTop ? "items-start" : "items-center"}`}>
        <View className={`h-9 w-9 items-center justify-center rounded-lg ${tileClass}`}>
          <Feather name={icon} size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">{label}</Text>
          <Text className={`text-sm font-medium ${valueClass}`}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The scanned-ticket verify surface — the mobile counterpart of the web
 * AttractionCheckIn "Verify Ticket Details" modal: scheduled banner, the
 * per-status eligibility banner, the connected-waivers panel, and the
 * Ticket Information grid. Read-only; Deny / Approve live in the screen's
 * fixed footer.
 */
export function VerifyTicketDetails({
  purchase,
  waivers,
  waiversLoading = false,
}: {
  purchase: PurchaseRow;
  waivers: EntityWaivers | null;
  waiversLoading?: boolean;
}) {
  const style = STATUS_STYLE[purchase.status] ?? STATUS_STYLE.pending;
  const time = fmtTime(purchase.scheduledTime);
  const longDate = fmtLong(purchase.scheduledDate);
  const outstanding = Math.max(0, purchase.totalAmount - purchase.amountPaid);

  const schedule = purchase.scheduledDate
    ? `${fmtShort(purchase.scheduledDate)}${time ? ` at ${time}` : ""}`
    : "—";

  return (
    <View>
      {/* Scheduled banner */}
      {(purchase.scheduledDate || purchase.scheduledTime) && (
        <View className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
          <View className="flex-row items-center justify-center gap-2">
            <Feather name="clock" size={20} color="#2563EB" />
            <Text className="text-lg font-bold text-blue-800 dark:text-blue-300">
              Scheduled for {time ?? "No time set"}
            </Text>
          </View>
          {!!longDate && (
            <Text className="mt-1 text-center text-sm text-blue-600 dark:text-blue-400">
              {longDate}
            </Text>
          )}
          {purchase.status === "confirmed" && (
            <Text className="mt-2 text-center text-sm font-medium text-blue-700 dark:text-blue-300">
              Would you like to check this person in now?
            </Text>
          )}
        </View>
      )}

      {/* Eligibility banner */}
      <View className={`mb-4 flex-row gap-3 rounded-lg border p-4 ${style.banner}`}>
        <Feather name={style.icon} size={18} color={style.accent} />
        <View className="flex-1">
          <Text className={`text-sm font-semibold ${style.title}`}>
            {style.heading}
          </Text>
          <Text className={`text-xs ${style.body}`}>
            {purchase.status === "pending"
              ? `${money(outstanding)} outstanding. ${style.message}`
              : style.message}
          </Text>
        </View>
      </View>

      {/* Waivers — same panel (Kiosk / Copy link) as the web modal */}
      <View className="mb-4 rounded-xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="mb-3 flex-row items-center gap-2">
          <Feather name="shield" size={16} color={PRIMARY} />
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            Waivers
          </Text>
        </View>
        <ConnectedWaiversPanel
          sourceType="attraction_purchase"
          sourceId={purchase.id}
          entityLabel="ticket"
          waivers={waivers}
          loading={waiversLoading}
        />
      </View>

      {/* Ticket information */}
      <View className="rounded-lg bg-gray-50 p-4 dark:bg-neutral-800/40">
        <Text className="mb-4 text-base font-bold text-gray-800 dark:text-white">
          Ticket Information
        </Text>

        <View className="-mx-2 flex-row flex-wrap">
          <InfoTile icon="tag" label="Purchase ID" value={`#${purchase.id}`} />
          <InfoTile icon="user" label="Customer" value={purchase.customerName} />
          <InfoTile
            icon="tag"
            label="Attraction"
            value={purchase.attractionName}
            full
          />
          <InfoTile
            icon="calendar"
            label="Purchase Date"
            value={fmtShort(purchase.purchaseDate)}
          />
          <InfoTile icon="calendar" label="Schedule" value={schedule} />
          <InfoTile
            icon="tag"
            label="Quantity"
            value={`${purchase.quantity} ${purchase.quantity === 1 ? "ticket" : "tickets"}`}
          />
          <InfoTile
            icon="dollar-sign"
            label="Total Amount"
            value={money(purchase.totalAmount)}
          />
          <InfoTile
            icon="check-circle"
            label="Status"
            value={style.label}
            valueClass={`font-semibold ${style.body}`}
            tileClass={style.tile}
            iconColor={style.accent}
          />
          {!!purchase.email && (
            <InfoTile icon="user" label="Email" value={purchase.email} full />
          )}
          {!!purchase.notes && (
            <InfoTile
              icon="alert-circle"
              label="Notes"
              value={purchase.notes}
              full
              alignTop
            />
          )}
        </View>
      </View>
    </View>
  );
}
