import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { getToken } from "../../lib/session";
import {
  recordBookingPayment,
  updateBooking,
} from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";

const formatMoney = (value: number) =>
  `$${(Number.isNaN(value) ? 0 : value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Props = {
  visible: boolean;
  bookingId: number | null;
  referenceNumber: string | null;
  totalAmount: number;
  amountPaid: number;
  locationId: number | null;
  customerId: number | null;
  /** True while the caller is still fetching the authoritative amounts. */
  loading?: boolean;
  onClose: () => void;
  /** Payment recorded and the booking updated — refresh whatever is on screen. */
  onProcessed: () => void;
};

/**
 * "Process Payment" — the mobile port of the web admin's payment modal
 * (Bookings.tsx handleOpenPaymentModal / handleSubmitPayment): POST /api/payments
 * then PUT the booking's amount_paid / payment_status / status.
 */
export function ProcessPaymentSheet({
  visible,
  bookingId,
  referenceNumber,
  totalAmount,
  amountPaid,
  locationId,
  customerId,
  loading = false,
  onClose,
  onProcessed,
}: Props) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const outstanding = Math.max(0, totalAmount - amountPaid);

  // Reset the form each time a booking is opened, like handleOpenPaymentModal.
  useEffect(() => {
    if (!visible) return;
    setNotes("");
    setSaving(false);
  }, [visible, bookingId]);

  // Default to the outstanding balance, floored to cents exactly as the web does.
  // Re-runs when the caller's fetch refines the amounts.
  useEffect(() => {
    if (!visible) return;
    setAmount((Math.floor(outstanding * 100) / 100).toFixed(2));
  }, [visible, bookingId, outstanding]);

  const handleSubmit = async () => {
    if (bookingId == null) return;

    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid payment amount");
      return;
    }

    const remaining = Math.round((totalAmount - amountPaid) * 100) / 100;
    const rounded = Math.round(value * 100) / 100;
    if (rounded > remaining + 0.01) {
      Alert.alert(
        "Amount too high",
        `Payment amount cannot exceed remaining balance of ${formatMoney(remaining)}`,
      );
      return;
    }

    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated", "Please sign in again.");
      return;
    }

    setSaving(true);
    try {
      await recordBookingPayment(token, {
        bookingId,
        amount: value,
        locationId,
        customerId,
        method: "in-store",
        notes,
        referenceNumber,
      });

      const newAmountPaid = amountPaid + value;
      await updateBooking(token, bookingId, {
        amountPaid: newAmountPaid,
        paymentStatus: newAmountPaid >= totalAmount ? "paid" : "partial",
        status: "confirmed",
      });

      onProcessed();
      onClose();
      Alert.alert("Payment processed successfully!");
    } catch (err) {
      Alert.alert(
        "Payment failed",
        err instanceof Error
          ? err.message
          : "Failed to process payment. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled = saving || loading || !amount || parseFloat(amount) <= 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={() => !saving && onClose()}
      title="Process Payment"
    >
      <View className="px-5 pb-6">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Booking: {referenceNumber ?? `#${bookingId}`}
        </Text>

        {/* Amount summary */}
        <View className="rounded-lg bg-gray-50 dark:bg-neutral-800/50 p-4 mb-4">
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Total Amount:
            </Text>
            <Text className="text-sm font-bold text-gray-900 dark:text-white">
              {formatMoney(totalAmount)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Already Paid:
            </Text>
            <Text className="text-sm font-bold text-green-600 dark:text-green-400">
              {formatMoney(amountPaid)}
            </Text>
          </View>
          <View className="mt-1 flex-row items-center justify-between border-t border-gray-200 pt-2 dark:border-neutral-700">
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Remaining Balance:
            </Text>
            <Text className="text-sm font-bold text-red-500">
              {formatMoney(outstanding)}
            </Text>
          </View>
        </View>

        {/* Amount */}
        <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Payment Amount <Text className="text-red-500">*</Text>
        </Text>
        <View className="h-12 flex-row items-center rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4">
          <Text className="mr-2 text-sm text-gray-400">$</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            editable={!saving}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-base text-gray-900 dark:text-white"
          />
        </View>

        {/* Method — read-only "In-Store", the only option the web modal offers. */}
        <Text className="mt-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Payment Method <Text className="text-red-500">*</Text>
        </Text>
        <View className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 px-4 py-3">
          <Text className="text-sm text-gray-700 dark:text-gray-200">
            In-Store
          </Text>
        </View>

        {/* Notes */}
        <Text className="mt-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Notes (Optional)
        </Text>
        <View className="rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            editable={!saving}
            placeholder="Add any notes about this payment..."
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            className="min-h-[72px] text-sm text-gray-900 dark:text-white"
          />
        </View>

        <View className="flex-row justify-end gap-3 mt-5">
          <Pressable
            onPress={onClose}
            disabled={saving}
            className="h-11 items-center justify-center rounded-lg border border-gray-300 px-5 dark:border-neutral-700"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={submitDisabled}
            className={`h-11 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] px-5 ${
              submitDisabled ? "opacity-60" : "active:opacity-90"
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="dollar-sign" size={15} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">
              {saving ? "Processing..." : "Process Payment"}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
