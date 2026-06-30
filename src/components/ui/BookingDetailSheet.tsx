import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  fetchBookingDetail,
  recordBookingPayment,
  updateBookingInternalNotes,
  updateBookingPaymentStatus,
  updateBookingStatus,
  type BookingDetail,
} from "../../services/bookingsService";
import { getToken } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const STATUS_OPTIONS = ["pending", "confirmed", "checked-in", "completed", "cancelled"];

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

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mt-5 mb-2">
    {children}
  </Text>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <View className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-4">{children}</View>
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
    <Text className={`text-sm font-medium text-gray-900 dark:text-white ${valueClass}`}>
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

type Props = {
  bookingId: number | null;
  visible: boolean;
  onClose: () => void;
  /** Notifies the parent that this booking changed, so it can refetch its list. */
  onChanged?: () => void;
};

/** Full "Booking Details" sheet — fetches the record and supports View / Edit / Process Payment. */
export function BookingDetailSheet({
  bookingId,
  visible,
  onClose,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("pending");
  const [editPaid, setEditPaid] = useState(false);
  const [editNotes, setEditNotes] = useState("");

  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    if (bookingId == null) return;
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

  // Fetch whenever a new booking is opened; reset transient UI state.
  useEffect(() => {
    if (bookingId == null) return;
    setDetail(null);
    setEditing(false);
    load();
    return () => {
      requestIdRef.current++;
    };
  }, [bookingId, load]);

  const startEdit = () => {
    if (!detail) return;
    setEditStatus(detail.status);
    setEditPaid(detail.paymentStatus === "paid");
    setEditNotes(detail.internalNotes ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!detail) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setSaving(true);
    try {
      if (editStatus !== detail.status) {
        await updateBookingStatus(token, detail.id, editStatus);
      }
      const nextPayment = editPaid ? "paid" : "partial";
      if (nextPayment !== detail.paymentStatus) {
        await updateBookingPaymentStatus(token, detail.id, nextPayment);
      }
      if ((editNotes.trim() || "") !== (detail.internalNotes ?? "")) {
        await updateBookingInternalNotes(token, detail.id, editNotes.trim());
      }
      setEditing(false);
      await load();
      onChanged?.();
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  const processPayment = () => {
    if (!detail) return;
    const remaining = Math.max(0, detail.totalAmount - detail.amountPaid);
    if (remaining <= 0) return;

    Alert.alert(
      "Process Payment",
      `Record an in-store payment of ${formatMoney(remaining)} for ${detail.referenceNumber ?? "this booking"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not authenticated");
              return;
            }
            setProcessing(true);
            try {
              await recordBookingPayment(token, {
                bookingId: detail.id,
                amount: remaining,
                locationId: detail.locationId,
                customerId: detail.customerId,
              });
              await load();
              onChanged?.();
              Alert.alert("Payment recorded", `${formatMoney(remaining)} recorded.`);
            } catch (err) {
              Alert.alert(
                "Payment failed",
                err instanceof Error ? err.message : "Could not record payment.",
              );
            } finally {
              setProcessing(false);
            }
          },
        },
      ],
    );
  };

  const typeLabel =
    detail?.type === "package" ? "Package Booking" : capitalize(detail?.type ?? "");
  const remaining = detail
    ? Math.max(0, detail.totalAmount - detail.amountPaid)
    : 0;

  return (
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
            {/* Customer */}
            <SectionTitle>Customer Information</SectionTitle>
            <Card>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {detail.customerName}
              </Text>
              {!!detail.customerEmail && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {detail.customerEmail}
                </Text>
              )}
              {!!detail.customerPhone && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {detail.customerPhone}
                </Text>
              )}
            </Card>

            {/* Booking info */}
            <SectionTitle>Booking Information</SectionTitle>
            <Card>
              <Row label="Reference Number" value={detail.referenceNumber ?? "—"} />
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Status</Text>
                <Badge
                  text={capitalize(detail.status)}
                  className={STATUS_BADGE[detail.status] ?? PAYMENT_BADGE.pending}
                />
              </View>
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Type</Text>
                <Badge text={typeLabel} className="bg-blue-100 text-blue-700" />
              </View>
            </Card>

            {/* Date & time */}
            <SectionTitle>Date &amp; Time</SectionTitle>
            <Card>
              <Text className="text-base font-medium text-gray-900 dark:text-white">
                📅 {formatDate(detail.date)}
              </Text>
              <Text className="text-base font-medium text-gray-900 dark:text-white mt-1 mb-2">
                🕐 {formatTime(detail.time)}
              </Text>
              <View className="border-t border-gray-200 dark:border-neutral-700 pt-2">
                <Row
                  label="Duration"
                  value={`${detail.duration} ${detail.durationUnit}`}
                />
                <Row label="Participants" value={detail.participants} />
              </View>
            </Card>

            {/* Package */}
            <SectionTitle>Package</SectionTitle>
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-[#0644C7] uppercase flex-1 mr-2">
                  📦 {detail.packageName}
                </Text>
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
              <Text className="text-base font-medium text-gray-900 dark:text-white">
                📍 {detail.locationName || "—"}
              </Text>
              {!!detail.roomName && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  🏠 {detail.roomName}
                </Text>
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
                        ? `${detail.guestOfHonorName} (${detail.guestOfHonorAge})`
                        : detail.guestOfHonorName
                    }
                  />
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
                        i > 0 ? "border-t border-gray-200 dark:border-neutral-700" : ""
                      }`}
                    >
                      <Text className="text-sm text-gray-900 dark:text-white">{a.name}</Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400">
                        Qty: {a.quantity}
                      </Text>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {/* Payment */}
            <SectionTitle>Payment</SectionTitle>
            <Card>
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-gray-500 dark:text-gray-400">Total Amount</Text>
                <Text className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatMoney(detail.totalAmount)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Payment Status
                </Text>
                <Badge
                  text={capitalize(detail.paymentStatus)}
                  className={PAYMENT_BADGE[detail.paymentStatus] ?? PAYMENT_BADGE.pending}
                />
              </View>
              {!!detail.paymentMethod && (
                <Row label="Payment Method" value={detail.paymentMethod} />
              )}
              <Row label="Amount Paid" value={formatMoney(detail.amountPaid)} />
              <Row
                label="Balance Due"
                value={formatMoney(remaining)}
                valueClass={remaining > 0 ? "text-amber-600" : "text-green-600"}
              />

              {detail.appliedFees.length > 0 && (
                <View className="border-t border-gray-200 dark:border-neutral-700 mt-2 pt-2">
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
            </Card>

            {/* Internal notes */}
            <SectionTitle>Internal Notes</SectionTitle>
            <Card>
              <Text
                className={`text-sm ${
                  detail.internalNotes
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500 italic"
                }`}
              >
                {detail.internalNotes ?? "No internal notes."}
              </Text>
            </Card>

            {/* ---- Edit panel ---- */}
            {editing && (
              <>
                <SectionTitle>Edit Booking</SectionTitle>
                <Card>
                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Status
                  </Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {STATUS_OPTIONS.map((s) => {
                      const active = editStatus === s;
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setEditStatus(s)}
                          className={`px-3 py-1.5 rounded-full border ${
                            active
                              ? "bg-[#0644C7] border-[#0644C7]"
                              : "border-gray-300 dark:border-neutral-600"
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold capitalize ${
                              active ? "text-white" : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {s}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Payment Status
                  </Text>
                  <View className="flex-row gap-2 mb-4">
                    {(["partial", "paid"] as const).map((p) => {
                      const active = editPaid === (p === "paid");
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setEditPaid(p === "paid")}
                          className={`px-4 py-1.5 rounded-full border ${
                            active
                              ? "bg-[#0644C7] border-[#0644C7]"
                              : "border-gray-300 dark:border-neutral-600"
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold capitalize ${
                              active ? "text-white" : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {p}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Internal Notes
                  </Text>
                  <TextInput
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Add internal notes…"
                    placeholderTextColor="#9ca3af"
                    multiline
                    className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl p-3 text-sm text-gray-900 dark:text-white min-h-[72px]"
                    textAlignVertical="top"
                  />
                </Card>
              </>
            )}

            {/* ---- Footer actions ---- */}
            <View className="mt-6 mb-2">
              {editing ? (
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => setEditing(false)}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
                  >
                    <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={saveEdit}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-[#0644C7] items-center"
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text className="text-sm font-semibold text-white">Save Changes</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <>
                  <View className="flex-row gap-3 mb-3">
                    <Pressable
                      onPress={load}
                      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                      className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
                    >
                      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        👁 View
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={startEdit}
                      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                      className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
                    >
                      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        ✎ Edit
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={processPayment}
                    disabled={remaining <= 0 || processing}
                    style={({ pressed }) =>
                      pressed && remaining > 0 ? { opacity: 0.7 } : null
                    }
                    className={`py-3 rounded-xl border items-center ${
                      remaining <= 0
                        ? "border-gray-200 dark:border-neutral-800"
                        : "border-amber-400"
                    }`}
                  >
                    {processing ? (
                      <ActivityIndicator color="#d97706" size="small" />
                    ) : (
                      <Text
                        className={`text-sm font-semibold ${
                          remaining <= 0 ? "text-gray-400" : "text-amber-600"
                        }`}
                      >
                        {remaining <= 0
                          ? "Fully Paid"
                          : `$ Process Payment (${formatMoney(remaining)})`}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
