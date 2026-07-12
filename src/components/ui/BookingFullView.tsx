import {
  AlertCircle,
  Cake,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  DoorOpen,
  MapPin,
  Package,
  QrCode,
  StickyNote,
  Tag,
  Trash2,
  User,
  Users,
  Wallet,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { getToken } from "../../lib/session";
import { deleteBooking, type BookingDetail } from "../../services/bookingsService";
import { BookingQRModal } from "./BookingQRModal";
import { BottomSheet } from "./BottomSheet";

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
const PAYMENT_BADGE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-gray-200 text-gray-700",
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
  /** Called after a successful delete so the caller can refresh + dismiss. */
  onDeleted?: () => void;
};

/**
 * Read-only, web-style "Booking Details" view opened from the detail sheet's
 * View button. Presents the booking as icon-tile sections and offers a
 * scannable/downloadable QR code. Editing lives in the Booking Details sheet.
 */
export function BookingFullView({ visible, detail, onClose, onDeleted }: Props) {
  const [showQR, setShowQR] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const remaining = Math.max(0, detail.totalAmount - detail.amountPaid);

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
          <View className="mt-3">
            <Pressable
              onPress={() => detail.referenceNumber && setShowQR(true)}
              disabled={!detail.referenceNumber}
              className={`py-3 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-80 ${
                detail.referenceNumber ? "" : "opacity-40"
              }`}
            >
              <QrCode size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">
                View QR Code
              </Text>
            </Pressable>
          </View>

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

            <InfoTile icon={Package} label="Package">
              <Text
                className="text-sm font-semibold text-gray-900 dark:text-white uppercase"
                numberOfLines={2}
              >
                {detail.packageName}
              </Text>
              {detail.packagePrice != null && (
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatMoney(detail.packagePrice)}
                </Text>
              )}
            </InfoTile>

            <InfoTile icon={Calendar} label="Date & Time">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(detail.date)}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatTime(detail.time)}
              </Text>
            </InfoTile>

            <InfoTile
              icon={Clock}
              label="Duration"
              value={`${detail.duration} ${detail.durationUnit}`}
            />
            <InfoTile
              icon={Users}
              label="Participants"
              value={`${detail.participants} ${
                detail.participants === 1 ? "person" : "people"
              }`}
            />
            <InfoTile
              icon={MapPin}
              label="Location"
              value={detail.locationName || "—"}
            />
            {!!detail.roomName && (
              <InfoTile icon={DoorOpen} label="Space" value={detail.roomName} />
            )}

            <InfoTile icon={CheckCircle} label="Booking Status">
              <View className="flex-row">
                <Badge
                  text={capitalize(detail.status)}
                  className={STATUS_BADGE[detail.status] ?? PAYMENT_BADGE.pending}
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
            </Section>
          )}

          {/* Add-ons */}
          {detail.addOns.length > 0 && (
            <Section title="Add-ons">
              {detail.addOns.map((a) => (
                <View
                  key={a.id}
                  className="flex-row items-center justify-between py-1.5"
                >
                  <Text className="text-sm text-gray-900 dark:text-white flex-1 mr-2">
                    {a.name}
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    Qty: {a.quantity}
                  </Text>
                </View>
              ))}
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
              label="Remaining Balance"
              accent={remaining > 0 ? "#dc2626" : "#16a34a"}
              tintClass={
                remaining > 0
                  ? "bg-red-100 dark:bg-red-900/20"
                  : "bg-green-100 dark:bg-green-900/20"
              }
            >
              <Text
                className={`text-base font-bold ${
                  remaining > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {formatMoney(remaining)}
              </Text>
            </InfoTile>
            {!!detail.paymentMethod && (
              <InfoTile
                icon={CreditCard}
                label="Payment Method"
                value={detail.paymentMethod}
              />
            )}
            <InfoTile icon={Wallet} label="Payment Status">
              <View className="flex-row">
                <Badge
                  text={capitalize(detail.paymentStatus)}
                  className={
                    PAYMENT_BADGE[detail.paymentStatus] ?? PAYMENT_BADGE.pending
                  }
                />
              </View>
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
          </Section>

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

          {/* Internal Staff Notes — staff-only, read-only (mirrors the web
              ViewBooking "Internal Staff Notes" block; editing is in Edit). */}
          <Text className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-2">
            Internal Staff Notes
          </Text>
          <View className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl px-4 py-3">
            <View className="flex-row items-center gap-1.5 mb-1.5">
              <AlertCircle size={14} color="#d97706" />
              <View className="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">
                <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Staff Only
                </Text>
              </View>
            </View>
            <Text
              className={`text-sm ${
                detail.internalNotes
                  ? "text-gray-800 dark:text-gray-100"
                  : "text-gray-400 dark:text-gray-500 italic"
              }`}
            >
              {detail.internalNotes ?? "No internal notes."}
            </Text>
          </View>

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
