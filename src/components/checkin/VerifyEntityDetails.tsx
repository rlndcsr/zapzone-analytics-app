import { Feather } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import type { ScannedEventTicket } from "../../services/eventPurchasesService";
import type { ScanResult as MembershipScan } from "../../services/membershipsService";
import type { ScannedWaiver } from "../../services/waiversService";

const PRIMARY = "#0644C7";

type IconName = React.ComponentProps<typeof Feather>["name"];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

/** "2026-07-31" -> "7/31/2026", the short form the other verify surfaces use. */
function fmtShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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

/** One icon-led detail tile — same shape as VerifyTicketDetails' InfoTile. */
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
    <View className={`${full ? "w-full" : "w-1/2"} mb-4 px-2`}>
      <View className={`flex-row gap-3 ${alignTop ? "items-start" : "items-center"}`}>
        <View className={`h-9 w-9 items-center justify-center rounded-lg ${tileClass}`}>
          <Feather name={icon} size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            {label}
          </Text>
          <Text className={`text-sm font-medium ${valueClass}`}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

/** Eligibility banner, in the same four flavours the other surfaces use. */
function Banner({
  icon,
  wrap,
  title,
  body,
  accent,
  heading,
  message,
}: {
  icon: IconName;
  wrap: string;
  title: string;
  body: string;
  accent: string;
  heading: string;
  message: string;
}) {
  return (
    <View className={`mb-4 flex-row gap-3 rounded-2xl border p-4 ${wrap}`}>
      <Feather name={icon} size={18} color={accent} />
      <View className="flex-1">
        <Text className={`text-sm font-bold ${title}`}>{heading}</Text>
        <Text className={`mt-0.5 text-xs ${body}`}>{message}</Text>
      </View>
    </View>
  );
}

const SECTION = "rounded-lg bg-gray-50 p-4 dark:bg-neutral-800/40";
const SECTION_TITLE = "mb-4 text-base font-bold text-gray-800 dark:text-white";

const OK_BANNER = {
  wrap: "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20",
  title: "text-green-800 dark:text-green-300",
  body: "text-green-700 dark:text-green-400",
  accent: "#16A34A",
} as const;

const WARN_BANNER = {
  wrap: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20",
  title: "text-amber-800 dark:text-amber-300",
  body: "text-amber-700 dark:text-amber-400",
  accent: "#D97706",
} as const;

const BLOCK_BANNER = {
  wrap: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
  title: "text-red-800 dark:text-red-300",
  body: "text-red-700 dark:text-red-400",
  accent: "#DC2626",
} as const;

/* ------------------------------------------------------------ Membership -- */

/**
 * The scanned-membership surface: the server's eligibility verdict, the
 * member's plan and what their passes have left. Read-only — Deny / Approve
 * live in the screen's fixed footer, as on every other check-in surface.
 */
export function VerifyMembershipDetails({ scan }: { scan: MembershipScan }) {
  const tone = scan.eligible ? OK_BANNER : BLOCK_BANNER;

  return (
    <View>
      <Banner
        icon={scan.eligible ? "check-circle" : "alert-triangle"}
        {...tone}
        heading={scan.eligible ? "Member Eligible" : "Not Eligible"}
        message={
          scan.eligible
            ? "This membership is in good standing and may be admitted."
            : (scan.reason ??
              "Admitting this member will be recorded as a staff override.")
        }
      />

      {scan.photoRequired && (
        <Banner
          icon="camera"
          {...WARN_BANNER}
          heading="Photo Required"
          message="Check the member's photo on their profile before admitting them."
        />
      )}

      <View className={SECTION}>
        <Text className={SECTION_TITLE}>Member Information</Text>

        <View className="-mx-2 flex-row flex-wrap">
          <InfoTile icon="user" label="Member" value={scan.memberName} />
          <InfoTile icon="award" label="Plan" value={scan.planName} />
          <InfoTile
            icon="check-circle"
            label="Status"
            value={scan.status}
            valueClass={`font-semibold capitalize ${tone.body}`}
            tileClass={scan.eligible ? "bg-green-100 dark:bg-green-900/40" : "bg-red-100 dark:bg-red-900/40"}
            iconColor={tone.accent}
          />
          <InfoTile
            icon="repeat"
            label="Visits Today"
            value={String(scan.visitsToday)}
          />
          {scan.visitsRemaining != null && (
            <InfoTile
              icon="hash"
              label="Visits Remaining"
              value={String(scan.visitsRemaining)}
            />
          )}
          {!!scan.holderName && (
            <InfoTile icon="users" label="Card Holder" value={scan.holderName} />
          )}
          {!!scan.homeLocationName && (
            <InfoTile
              icon="map-pin"
              label="Home Location"
              value={scan.homeLocationName}
              full
            />
          )}
          {!!scan.email && (
            <InfoTile icon="mail" label="Email" value={scan.email} full />
          )}
        </View>
      </View>

      {scan.passes.length > 0 && (
        <View className={`mt-4 ${SECTION}`}>
          <Text className={SECTION_TITLE}>Passes</Text>
          {scan.passes.map((pass, i) => (
            <View
              key={`${pass.benefitId ?? "pass"}-${i}`}
              className="flex-row items-center justify-between border-b border-gray-100 py-2.5 dark:border-neutral-800"
            >
              <Text className="flex-1 text-sm text-gray-800 dark:text-white">
                {pass.label}
              </Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {pass.remaining == null ? "Unlimited" : `${pass.remaining} left`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ---------------------------------------------------------- Event ticket -- */

/**
 * The scanned event-ticket surface. A ticket bought inside a bulk order is
 * shown with a blocking banner rather than hidden: the desk needs to know why
 * it cannot admit this code and what to scan instead.
 */
export function VerifyEventTicketDetails({
  ticket,
}: {
  ticket: ScannedEventTicket;
}) {
  const partOfOrder = ticket.ticketOrderId != null;
  const alreadyIn = ticket.status === "checked-in" || !!ticket.checkedInAt;
  const owes = Math.max(0, ticket.totalAmount - ticket.amountPaid) > 0;
  const time = fmtTime(ticket.purchaseTime);

  return (
    <View>
      {partOfOrder ? (
        <Banner
          icon="package"
          {...BLOCK_BANNER}
          heading="Part of a Bulk Order"
          message="This ticket is admitted through its order — scan the order's QR code instead."
        />
      ) : alreadyIn ? (
        <Banner
          icon="alert-triangle"
          {...WARN_BANNER}
          heading="Already Checked In"
          message="This event ticket has already been used."
        />
      ) : owes ? (
        <Banner
          icon="clock"
          {...WARN_BANNER}
          heading="Balance Outstanding"
          message={`${money(ticket.totalAmount - ticket.amountPaid)} is still owed on this ticket.`}
        />
      ) : (
        <Banner
          icon="check-circle"
          {...OK_BANNER}
          heading="Valid Event Ticket"
          message="Confirm to admit this guest."
        />
      )}

      <View className={SECTION}>
        <Text className={SECTION_TITLE}>Ticket Information</Text>

        <View className="-mx-2 flex-row flex-wrap">
          <InfoTile
            icon="tag"
            label="Reference"
            value={ticket.referenceNumber || `#${ticket.id}`}
          />
          <InfoTile
            icon="user"
            label="Guest"
            value={ticket.guestName || "Walk-in Customer"}
          />
          <InfoTile
            icon="calendar"
            label="Event"
            value={ticket.eventName || "—"}
            full
          />
          <InfoTile
            icon="calendar"
            label="Purchase Date"
            value={`${fmtShort(ticket.purchaseDate)}${time ? ` at ${time}` : ""}`}
          />
          <InfoTile
            icon="tag"
            label="Quantity"
            value={`${ticket.quantity} ${ticket.quantity === 1 ? "ticket" : "tickets"}`}
          />
          <InfoTile
            icon="dollar-sign"
            label="Total"
            value={money(ticket.totalAmount)}
          />
          <InfoTile
            icon="dollar-sign"
            label="Paid"
            value={money(ticket.amountPaid)}
          />
          <InfoTile
            icon="check-circle"
            label="Status"
            value={ticket.status}
            valueClass="font-semibold capitalize text-gray-800 dark:text-white"
          />
          {!!ticket.paymentStatus && (
            <InfoTile
              icon="credit-card"
              label="Payment"
              value={ticket.paymentStatus}
              valueClass="font-medium capitalize text-gray-800 dark:text-white"
            />
          )}
          {!!ticket.locationName && (
            <InfoTile
              icon="map-pin"
              label="Location"
              value={ticket.locationName}
              full
            />
          )}
          {!!ticket.guestEmail && (
            <InfoTile icon="mail" label="Email" value={ticket.guestEmail} full />
          )}
          {!!ticket.notes && (
            <InfoTile
              icon="alert-circle"
              label="Notes"
              value={ticket.notes}
              full
              alignTop
            />
          )}
        </View>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- Waiver -- */

/**
 * The scanned-waiver surface — the web's waiver modal. An unsigned waiver is
 * shown but cannot be admitted; the screen's footer reads the same `isSigned`
 * flag to decide whether Approve is offered at all.
 */
export function VerifyWaiverDetails({ waiver }: { waiver: ScannedWaiver }) {
  const alreadyIn = !!waiver.checkedInAt;

  return (
    <View>
      {!waiver.isSigned ? (
        <Banner
          icon="alert-triangle"
          {...BLOCK_BANNER}
          heading="Waiver Not Signed"
          message="This waiver has not been completed yet, so nobody can be checked in against it."
        />
      ) : alreadyIn ? (
        <Banner
          icon="alert-triangle"
          {...WARN_BANNER}
          heading="Already Checked In"
          message="This waiver's party has already been checked in."
        />
      ) : (
        <Banner
          icon="check-circle"
          {...OK_BANNER}
          heading="Waiver Signed"
          message="Confirm to check this party in."
        />
      )}

      <View className={SECTION}>
        <Text className={SECTION_TITLE}>Waiver Information</Text>

        <View className="-mx-2 flex-row flex-wrap">
          <InfoTile icon="user" label="Signed By" value={waiver.adultName} />
          <InfoTile
            icon="tag"
            label="Reference"
            value={waiver.referenceNumber || `#${waiver.id}`}
          />
          <InfoTile
            icon="calendar"
            label="Visit Date"
            value={fmtShort(waiver.selectedDate)}
          />
          <InfoTile
            icon="check-circle"
            label="Status"
            value={waiver.status}
            valueClass="font-semibold capitalize text-gray-800 dark:text-white"
          />
          {!!waiver.templateTitle && (
            <InfoTile
              icon="file-text"
              label="Template"
              value={waiver.templateTitle}
              full
            />
          )}
          {!!waiver.locationName && (
            <InfoTile
              icon="map-pin"
              label="Location"
              value={waiver.locationName}
              full
            />
          )}
          {/* Server-masked, so showing them here reveals nothing new. */}
          {!!waiver.adultEmail && (
            <InfoTile icon="mail" label="Email" value={waiver.adultEmail} full />
          )}
          {!!waiver.adultPhone && (
            <InfoTile icon="phone" label="Phone" value={waiver.adultPhone} full />
          )}
        </View>
      </View>

      {waiver.minors.length > 0 && (
        <View className={`mt-4 ${SECTION}`}>
          <Text className={SECTION_TITLE}>
            Minors ({waiver.minorsCount})
          </Text>
          {waiver.minors.map((minor) => (
            <View
              key={minor.id}
              className="flex-row items-center gap-2 border-b border-gray-100 py-2.5 dark:border-neutral-800"
            >
              <Feather name="user" size={14} color={PRIMARY} />
              <Text className="flex-1 text-sm text-gray-800 dark:text-white">
                {minor.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
