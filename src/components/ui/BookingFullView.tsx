import {
  AlertCircle,
  Cake,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  DoorOpen,
  MapPin,
  Package,
  Pencil,
  QrCode,
  StickyNote,
  Tag,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { bookingDurationMinutes, buildCalendarEventDraft } from "../../lib/calendarEvent";
import { addEventToCalendar } from "../../lib/nativeCalendar";
import {
  cardFromPayments,
  formatCardLabel,
} from "../../lib/payments/cardLabel";
import { resolvePaymentState } from "../../lib/payments/paymentState";
import { formatDuration } from "../../lib/time";
import { getToken } from "../../lib/session";
import { deleteBooking, type BookingDetail } from "../../services/bookingsService";
import { BookingChangeHistory } from "./BookingChangeHistory";
import { BookingQRModal } from "./BookingQRModal";
import { BottomSheet } from "./BottomSheet";
import { InternalNotesLog } from "./InternalNotesLog";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  "checked-in": "bg-indigo-100 text-indigo-700",
  completed: "bg-blue-100 text-blue-700",
};
// Kept only as the neutral fallback for the *booking* status badge below; the
// payment colours it used to hold (amber for partial, grey for unpaid) now come
// from lib/payments/paymentState.ts, which paints anything owing red.
const NEUTRAL_BADGE = "bg-gray-200 text-gray-700";

/** Status pill on a single payment-history row (the web's per-row colours). */
const PAYMENT_ROW_BADGE: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
};

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

/** "2026-06-30T23:20:00Z" -> "Jun 30, 2026, 11:20 PM". */
function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, "0");
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hour}:${minute} ${meridian}`;
}

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const Badge = ({ text, className }: { text: string; className: string }) => {
  const [bg, fg] = className.split(" ");
  return (
    <View className={`px-3 py-1 rounded-full ${bg}`}>
      <Text className={`text-xs font-semibold ${fg}`}>{text}</Text>
    </View>
  );
};

/** A titled group of info tiles, rendered on a soft card. */
const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <>
    <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-2">
      {title}
    </Text>
    <View className="bg-gray-50 dark:bg-neutral-800/40 rounded-2xl px-4 py-1.5">
      {children}
    </View>
  </>
);

/**
 * One priced line in Additional Services. Mirrors the web ViewBooking: the
 * quantity line reads "3 × $12.00" once there is more than one, and stays
 * "Quantity: 1" for a single unit, with the line total on the right.
 */
const LineItem = ({
  name,
  quantity,
  unitPrice,
  forced = false,
}: {
  name: string;
  quantity: number;
  unitPrice: number;
  forced?: boolean;
}) => (
  <View className="flex-row items-start justify-between py-1">
    <View className="flex-1 mr-2 flex-row items-start">
      <View className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 mr-2" />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 flex-wrap">
          <Text className="text-sm font-medium text-gray-900 dark:text-white">
            {name}
          </Text>
          {forced && (
            <View className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
              <Text className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Forced
              </Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {quantity > 1
            ? `${quantity} × ${formatMoney(unitPrice)}`
            : `Quantity: ${quantity}`}
        </Text>
      </View>
    </View>
    <Text className="text-sm font-medium text-gray-900 dark:text-white">
      {formatMoney(unitPrice * quantity)}
    </Text>
  </View>
);

/** Icon-tile row: rounded tinted icon + label above value (or custom children). */
const InfoTile = ({
  icon: Icon,
  label,
  value,
  children,
  accent = "#0644C7",
  tintClass = "bg-[#0644C7]/10",
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value?: string | number;
  children?: React.ReactNode;
  accent?: string;
  tintClass?: string;
}) => (
  <View className="flex-row items-start gap-3 py-2">
    <View
      className={`w-9 h-9 rounded-xl items-center justify-center ${tintClass}`}
    >
      <Icon size={16} color={accent} />
    </View>
    <View className="flex-1">
      <Text className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
        {label}
      </Text>
      {children ?? (
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {value}
        </Text>
      )}
    </View>
  </View>
);

type Props = {
  visible: boolean;
  detail: BookingDetail | null;
  onClose: () => void;
  /** Opens the dedicated Edit Booking screen (provided by the host sheet). */
  onEdit?: () => void;
  /** Called after a successful delete so the caller can refresh + dismiss. */
  onDeleted?: () => void;
  /**
   * The booking's rebuilt internal-notes digest, after a note is saved here. `detail` is the host
   * sheet's state, so only it can refresh it.
   */
  onNoteSaved?: (summary: string | null) => void;
};

/**
 * Read-only, web-style "Booking Details" view opened from the detail sheet's
 * View button. Presents the booking as icon-tile sections and offers a
 * scannable/downloadable QR code. Editing lives in the Booking Details sheet.
 */
export function BookingFullView({
  visible,
  detail,
  onClose,
  onEdit,
  onDeleted,
  onNoteSaved,
}: Props) {
  const [showQR, setShowQR] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  // Never leave the QR overlay open across opens/closes of this view.
  useEffect(() => {
    if (!visible) setShowQR(false);
  }, [visible]);

  // Delete this booking (soft-delete, mirrors the web/list action). Native
  // confirm → DELETE /api/bookings/{id} → hand back to the caller to refresh
  // the list and dismiss. Reuses the same pattern as the purchase details.
  const confirmDelete = () => {
    if (!detail) return;
    Alert.alert(
      "Delete booking",
      "Are you sure you want to delete this booking? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again.");
              return;
            }
            setDeleting(true);
            try {
              await deleteBooking(token, detail.id);
              onDeleted?.();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the booking.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!detail) return null;

  const typeLabel =
    detail.type === "package" ? "Package Booking" : capitalize(detail.type);
  // The one payment verdict for this booking: label, colour and balance.
  const payment = resolvePaymentState({
    payment_status: detail.paymentStatus,
    total_amount: detail.totalAmount,
    amount_paid: detail.amountPaid,
  });
  // Clamped for display — an overpayment is called out by `balanceLabel`
  // ("Credit Due") rather than by showing a negative figure here.
  const remaining = Math.max(0, payment.balance);
  // The card behind "Card Used": the completed payment, else the most recent.
  const card = cardFromPayments(detail.payments);

  // Null when the booking has no valid scheduled date/time — the action is
  // hidden rather than falling back to midnight or any other placeholder.
  const calendarDraft = buildCalendarEventDraft({
    title: `Zap Zone: ${detail.packageName}`,
    date: detail.date,
    time: detail.time,
    durationMinutes: bookingDurationMinutes(detail.duration, detail.durationUnit),
    location: detail.locationName,
    description: detail.referenceNumber
      ? `Booking reference: ${detail.referenceNumber}`
      : undefined,
  });

  const handleAddToCalendar = async () => {
    if (!calendarDraft || addingToCalendar) return;
    setAddingToCalendar(true);
    try {
      const result = await addEventToCalendar(calendarDraft);
      if (result.ok) {
        Alert.alert("Added to Calendar", "This booking was added to your calendar.");
      } else if (result.reason === "permission-denied") {
        Alert.alert(
          "Permission needed",
          "Allow calendar access so this booking can be saved to your calendar.",
        );
      } else {
        Alert.alert(
          "Couldn't add to calendar",
          result.message ?? "The booking could not be added to your calendar.",
        );
      }
    } finally {
      setAddingToCalendar(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Booking Details">
        <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
          {/* Reference + primary actions */}
          {!!detail.referenceNumber && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Reference: {detail.referenceNumber}
            </Text>
          )}
          <View className="mt-3 flex-row gap-3">
            <Pressable
              onPress={() => detail.referenceNumber && setShowQR(true)}
              disabled={!detail.referenceNumber}
              className={`flex-1 py-3 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-80 ${
                detail.referenceNumber ? "" : "opacity-40"
              }`}
            >
              <QrCode size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">
                View QR Code
              </Text>
            </Pressable>
            {!!onEdit && (
              <Pressable
                onPress={onEdit}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center flex-row justify-center gap-2 active:opacity-80"
              >
                <Pencil size={16} color="#0644C7" />
                <Text className="text-sm font-semibold text-[#0644C7]">
                  Edit Booking
                </Text>
              </Pressable>
            )}
          </View>

          {!!calendarDraft && (
            <Pressable
              onPress={handleAddToCalendar}
              disabled={addingToCalendar}
              className={`mt-3 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center flex-row justify-center gap-2 active:opacity-80 ${
                addingToCalendar ? "opacity-60" : ""
              }`}
            >
              {addingToCalendar ? (
                <ActivityIndicator size="small" color="#0644C7" />
              ) : (
                <>
                  <Calendar size={16} color="#0644C7" />
                  <Text className="text-sm font-semibold text-[#0644C7]">
                    Add to Calendar
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/* Status banners — the web calls out these two terminal states
              above the details so they are not missed in the status pill. */}
          {detail.status === "cancelled" && (
            <View className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 flex-row items-start gap-2">
              <AlertCircle size={16} color="#dc2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-800 dark:text-red-300">
                  Cancelled Booking
                </Text>
                <Text className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  This booking has been cancelled.
                </Text>
              </View>
            </View>
          )}
          {detail.status === "completed" && (
            <View className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 flex-row items-start gap-2">
              <CheckCircle size={16} color="#16a34a" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Completed Booking
                </Text>
                <Text className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  This booking has been completed successfully.
                </Text>
              </View>
            </View>
          )}

          {/* Booking Information */}
          <Section title="Booking Information">
            <InfoTile icon={User} label="Customer">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {detail.customerName}
              </Text>
              {!!detail.customerEmail && (
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {detail.customerEmail}
                </Text>
              )}
              {!!detail.customerPhone && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {detail.customerPhone}
                </Text>
              )}
            </InfoTile>

            {/* Web parity: the Package tile is omitted entirely when the
                booking has no package, rather than showing a dash. */}
            {!!detail.packageId && (
              <InfoTile icon={Package} label="Package">
                <Text
                  className="text-sm font-semibold text-gray-900 dark:text-white"
                  numberOfLines={2}
                >
                  {detail.packageName}
                </Text>
                {!!detail.packageCategory && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {detail.packageCategory}
                  </Text>
                )}
              </InfoTile>
            )}

            <InfoTile icon={Calendar} label="Date & Time">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(detail.date)}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatTime(detail.time)}
              </Text>
            </InfoTile>

            {/* Not the raw "11 hours" of `duration` + `duration_unit`: the web
                runs both through formatDurationDisplay, so 0 reads "Unlimited",
                90 minutes reads "1 hr 30 min" and 1 reads "1 hour". */}
            <InfoTile
              icon={Clock}
              label="Duration"
              value={formatDuration(detail.duration, detail.durationUnit)}
            />
            <InfoTile
              icon={Users}
              label="Participants"
              value={`${detail.participants} people`}
            />
            {!!detail.locationName && (
              <InfoTile icon={MapPin} label="Location">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {detail.locationName}
                </Text>
                {!!detail.locationAddress && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {detail.locationAddress}
                  </Text>
                )}
              </InfoTile>
            )}
            {/* Web parity: shown only when a space is actually assigned, and
                labelled "Space" as the web labels it. */}
            {!!detail.roomName && (
              <InfoTile icon={DoorOpen} label="Space" value={detail.roomName} />
            )}

            <InfoTile icon={CheckCircle} label="Booking Status">
              <View className="flex-row">
                <Badge
                  text={capitalize(detail.status)}
                  className={STATUS_BADGE[detail.status] ?? NEUTRAL_BADGE}
                />
              </View>
            </InfoTile>
            <InfoTile icon={Tag} label="Type">
              <View className="flex-row">
                <Badge text={typeLabel} className="bg-blue-100 text-blue-700" />
              </View>
            </InfoTile>
          </Section>

          {/* Guest of Honor */}
          {!!detail.guestOfHonorName && (
            <Section title="Guest of Honor">
              <InfoTile icon={User} label="Name" value={detail.guestOfHonorName} />
              {detail.guestOfHonorAge != null && (
                <InfoTile
                  icon={Cake}
                  label="Age"
                  value={`${detail.guestOfHonorAge} years old`}
                />
              )}
              {!!detail.guestOfHonorGender && (
                <InfoTile
                  icon={User}
                  label="Gender"
                  value={capitalize(detail.guestOfHonorGender)}
                />
              )}
            </Section>
          )}

          {/* Additional Services — attractions and add-ons, each priced the way
              the web ViewBooking prices them (unit × qty, with the line total on
              the right) rather than showing a bare quantity. */}
          {(detail.attractions.length > 0 || detail.addOns.length > 0) && (
            <Section title="Additional Services">
              {detail.attractions.length > 0 && (
                <View className="py-1.5">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Attractions ({detail.attractions.length})
                  </Text>
                  {detail.attractions.map((a, i) => (
                    <LineItem
                      key={`attraction-${a.id}-${i}`}
                      name={a.name}
                      quantity={a.quantity}
                      unitPrice={a.priceAtBooking}
                    />
                  ))}
                </View>
              )}
              {detail.addOns.length > 0 && (
                <View className="py-1.5">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Add-Ons ({detail.addOns.length})
                  </Text>
                  {detail.addOns.map((a, i) => (
                    <LineItem
                      key={`addon-${a.id}-${i}`}
                      name={a.name}
                      quantity={a.quantity}
                      unitPrice={a.unitPrice}
                      forced={a.isForceAddOn}
                    />
                  ))}
                </View>
              )}
            </Section>
          )}

          {/* Payment Information */}
          <Section title="Payment Information">
            <InfoTile icon={DollarSign} label="Total Amount">
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                {formatMoney(detail.totalAmount)}
              </Text>
            </InfoTile>
            <InfoTile icon={DollarSign} label="Amount Paid">
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                {formatMoney(detail.amountPaid)}
              </Text>
            </InfoTile>
            <InfoTile
              icon={DollarSign}
              label={payment.balanceLabel}
              accent={payment.isSettled ? "#16a34a" : "#dc2626"}
              tintClass={
                payment.isSettled
                  ? "bg-green-100 dark:bg-green-900/20"
                  : "bg-red-100 dark:bg-red-900/20"
              }
            >
              <Text className={`text-base font-bold ${payment.amountClass}`}>
                {formatMoney(remaining)}
              </Text>
            </InfoTile>
            {detail.discountAmount > 0 && (
              <InfoTile
                icon={DollarSign}
                label="Discount"
                value={formatMoney(detail.discountAmount)}
              />
            )}
            {!!detail.promo && (
              <InfoTile icon={Tag} label="Promo Code">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {detail.promo.code}
                </Text>
                {detail.promo.discountPercentage != null && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {detail.promo.discountPercentage}% off
                  </Text>
                )}
              </InfoTile>
            )}
            {!!detail.giftCard && (
              <InfoTile icon={CreditCard} label="Gift Card">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {detail.giftCard.code}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Balance: {formatMoney(detail.giftCard.balance)}
                </Text>
              </InfoTile>
            )}
            {!!detail.paymentMethod && (
              <InfoTile icon={CreditCard} label="Payment Method">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {detail.paymentMethod}
                </Text>
                {!!detail.cardLabel && (
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {detail.cardLabel}
                  </Text>
                )}
              </InfoTile>
            )}
            {!!card && (
              <InfoTile icon={CreditCard} label="Card Used">
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {card.label}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Ask the guest to confirm the last four digits.
                </Text>
              </InfoTile>
            )}
            <InfoTile icon={Wallet} label="Payment Status">
              <PaymentStatusBadge
                payment={{
                  payment_status: detail.paymentStatus,
                  total_amount: detail.totalAmount,
                  amount_paid: detail.amountPaid,
                }}
              />
            </InfoTile>

            {detail.appliedFees.length > 0 && (
              <View className="border-t border-gray-200 dark:border-neutral-700 mt-1 pt-2 pb-1">
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
              <View className="border-t border-gray-200 dark:border-neutral-700 mt-1 pt-2 pb-1">
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  Applied Discounts
                </Text>
                {detail.appliedDiscounts.map((d, i) => (
                  <View
                    key={`${d.name}-${i}`}
                    className="flex-row items-center justify-between py-0.5"
                  >
                    <Text className="text-xs text-gray-500 dark:text-gray-400 flex-1 mr-2">
                      {d.name}
                      {!!d.type && ` (${d.type})`}
                    </Text>
                    <Text className="text-xs font-medium text-green-600">
                      -{formatMoney(d.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* Payment History — every recorded payment, as the web lists them. */}
          {detail.payments.length > 0 && (
            <Section title="Payment History">
              {detail.payments.map((p, i) => (
                <View
                  key={p.id ?? `payment-${i}`}
                  className="flex-row items-start justify-between py-2"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatMoney(p.amount)}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {p.method
                        ? capitalize(p.method.replace(/_/g, " "))
                        : "N/A"}
                      {" • "}
                      {p.createdAt ? formatCreated(p.createdAt) : "—"}
                    </Text>
                    {!!formatCardLabel(p.cardType, p.cardLastFour) && (
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <CreditCard size={11} color="#9ca3af" />
                        <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatCardLabel(p.cardType, p.cardLastFour)}
                        </Text>
                      </View>
                    )}
                    {!!p.notes && (
                      <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {p.notes}
                      </Text>
                    )}
                  </View>
                  <Badge
                    text={p.status ? capitalize(p.status) : "Unknown"}
                    className={
                      PAYMENT_ROW_BADGE[p.status ?? ""] ?? NEUTRAL_BADGE
                    }
                  />
                </View>
              ))}
            </Section>
          )}

          {/* Extra confirmations — the custom checkbox answers, ticked or not,
              exactly as the web's CustomFieldAnswers block shows them. */}
          {detail.customFieldResponses.length > 0 && (
            <Section title="Extra confirmations">
              {detail.customFieldResponses.map((r) => (
                <View key={r.id} className="flex-row items-start gap-2 py-1.5">
                  {r.value ? (
                    <Check size={15} color="#16a34a" />
                  ) : (
                    <X size={15} color="#9ca3af" />
                  )}
                  <Text
                    className={`flex-1 text-sm ${
                      r.value
                        ? "text-gray-800 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {r.label}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Special Requests — a separate column from customer notes, and the
              web shows it as its own block above them. */}
          {!!detail.specialRequests && (
            <Section title="Special Requests">
              <View className="flex-row items-start gap-3 py-2">
                <View className="w-9 h-9 rounded-xl items-center justify-center bg-[#0644C7]/10">
                  <StickyNote size={16} color="#0644C7" />
                </View>
                <Text className="flex-1 text-sm text-gray-900 dark:text-white">
                  {detail.specialRequests}
                </Text>
              </View>
            </Section>
          )}

          {/* Customer Notes */}
          <Section title="Customer Notes">
            <View className="flex-row items-start gap-3 py-2">
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-[#0644C7]/10">
                <StickyNote size={16} color="#0644C7" />
              </View>
              <Text
                className={`flex-1 text-sm ${
                  detail.customerNotes
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500 italic"
                }`}
              >
                {detail.customerNotes ?? "No customer notes."}
              </Text>
            </View>
          </Section>

          {/* Internal Staff Notes — the booking's log, writable here the way the
              web ViewBooking writes it.

              Exactly one copy of the log is ever mounted: this body renders as
              soon as `detail` exists, whether or not the view is on screen, so
              gate on `visible` — the host sheet shows its own copy until this
              one is stacked on top, and drops it then. Two mounted copies would
              both fetch, and the hidden one would go stale behind this one. */}
          {visible && (
            <View className="mt-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl px-4 py-3">
              <InternalNotesLog
                bookingId={detail.id}
                onNoteSaved={(summary) => onNoteSaved?.(summary)}
              />
            </View>
          )}

          {/* Change history — the backend's permanent booking change log,
              same block the web ViewBooking shows above "Created". */}
          <BookingChangeHistory bookingId={detail.id} />

          {/* Created */}
          {!!detail.createdAt && (
            <View className="flex-row items-center gap-1.5 mt-5">
              <Clock size={13} color="#9ca3af" />
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                Created: {formatCreated(detail.createdAt)}
              </Text>
            </View>
          )}

          {/* Delete Booking — destructive, mirrors the web/list delete action. */}
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            className="mt-6 py-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 items-center flex-row justify-center gap-2 active:opacity-70"
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <>
                <Trash2 size={16} color="#dc2626" />
                <Text className="text-sm font-semibold text-red-600">
                  Delete Booking
                </Text>
              </>
            )}
          </Pressable>

          {/* Close */}
          <Pressable
            onPress={onClose}
            className="mt-3 mb-2 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Close
            </Text>
          </Pressable>

          <View style={{ height: 24 }} />
        </ScrollView>
      </BottomSheet>

      {!!detail.referenceNumber && (
        <BookingQRModal
          visible={showQR}
          onClose={() => setShowQR(false)}
          reference={detail.referenceNumber}
          subtitle={`${detail.customerName} • ${detail.packageName}`}
        />
      )}
    </>
  );
}
