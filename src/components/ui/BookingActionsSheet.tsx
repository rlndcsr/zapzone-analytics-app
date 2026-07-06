import { CheckCircle2, Eye, RotateCcw, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { getToken } from "../../lib/session";
import {
  checkInBooking,
  deleteBooking,
  restoreBooking,
  type CalendarBooking,
} from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";

type Props = {
  visible: boolean;
  booking: CalendarBooking | null;
  /** When true the booking is in the "View Deleted" list — only Restore applies. */
  deleted?: boolean;
  onClose: () => void;
  /** Open the full Booking Details sheet (the hub for View / Edit / Process
   *  Payment / Internal Notes — actions that require the fetched detail). */
  onViewDetails: () => void;
  /** Refetch the list after a mutation so the row reflects the new state. */
  onChanged: () => void;
};

type Tone = "default" | "success" | "danger";

const TONE_COLOR: Record<Tone, string> = {
  default: "#374151",
  success: "#16a34a",
  danger: "#dc2626",
};

const ActionRow = ({
  icon: Icon,
  label,
  hint,
  tone = "default",
  busy = false,
  disabled = false,
  onPress,
}: {
  icon: typeof Eye;
  label: string;
  hint?: string;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => {
  const color = TONE_COLOR[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.6 } : null)}
      className={`flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
        {busy ? <ActivityIndicator size="small" color={color} /> : <Icon size={18} color={color} />}
      </View>
      <View className="flex-1">
        <Text
          className="text-base font-medium text-gray-800 dark:text-gray-100"
          style={tone === "danger" ? { color } : undefined}
        >
          {label}
        </Text>
        {!!hint && (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</Text>
        )}
      </View>
    </Pressable>
  );
};

/**
 * Per-booking "More" actions — the mobile equivalent of the web admin's row
 * action buttons (View / Edit / Check In / Record Payment / Delete). Row-level
 * mutations that only need the booking id (Check In, Delete) run here directly
 * via the existing services; detail-dependent actions (View / Edit / Payment /
 * Notes) are reached through "View Details", which opens the Booking Details
 * hub that already fetches the record and hosts them.
 */
export function BookingActionsSheet({
  visible,
  booking,
  deleted = false,
  onClose,
  onViewDetails,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<null | "checkin" | "delete" | "restore">(null);

  if (!booking) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Booking Actions">
        <View />
      </BottomSheet>
    );
  }

  const ref = booking.referenceNumber ?? `#${booking.id}`;
  const isPaid = booking.totalAmount > 0 && booking.amountPaid >= booking.totalAmount;
  // The backend check-in endpoint only accepts confirmed bookings; the web also
  // requires payment to be complete before offering the action. Both must hold,
  // and we need the reference number the endpoint keys on.
  const canCheckIn =
    booking.status === "confirmed" && isPaid && !!booking.referenceNumber;

  const runCheckIn = () => {
    if (!booking.referenceNumber) return;
    const referenceNumber = booking.referenceNumber;
    Alert.alert("Check in booking", `Mark ${ref} as arrived (checked-in)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Check In",
        style: "default",
        onPress: async () => {
          const token = getToken();
          if (!token) {
            Alert.alert("Not authenticated");
            return;
          }
          setBusy("checkin");
          try {
            await checkInBooking(token, referenceNumber);
            onChanged();
            onClose();
            Alert.alert("Checked in", `${ref} is now checked-in.`);
          } catch (err) {
            Alert.alert(
              "Check-in failed",
              err instanceof Error ? err.message : "Could not check in this booking.",
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const runDelete = () => {
    Alert.alert(
      "Delete booking",
      `Are you sure you want to delete booking ${ref}? It will be moved to trash.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not authenticated");
              return;
            }
            setBusy("delete");
            try {
              await deleteBooking(token, booking.id);
              onChanged();
              onClose();
              Alert.alert("Booking deleted", `${ref} was moved to trash.`);
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Could not delete this booking.",
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const runRestore = () => {
    Alert.alert("Restore booking", `Restore booking ${ref} from trash?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        style: "default",
        onPress: async () => {
          const token = getToken();
          if (!token) {
            Alert.alert("Not authenticated");
            return;
          }
          setBusy("restore");
          try {
            await restoreBooking(token, booking.id);
            onChanged();
            onClose();
            Alert.alert("Booking restored", `${ref} was restored.`);
          } catch (err) {
            Alert.alert(
              "Restore failed",
              err instanceof Error ? err.message : "Could not restore this booking.",
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Booking Actions">
      <View className="px-3 pb-6">
        <Text className="text-xs text-gray-400 dark:text-gray-500 px-1 mb-2" numberOfLines={1}>
          {booking.customerName} · {ref}
        </Text>

        {deleted ? (
          <ActionRow
            icon={RotateCcw}
            label="Restore Booking"
            hint="Move this booking back to active"
            tone="success"
            busy={busy === "restore"}
            disabled={busy !== null}
            onPress={runRestore}
          />
        ) : (
          <>
            <ActionRow
              icon={Eye}
              label="View Details"
              hint="View, edit, record payment, or add notes"
              onPress={() => {
                onClose();
                onViewDetails();
              }}
            />

            {canCheckIn && (
              <ActionRow
                icon={CheckCircle2}
                label="Check In"
                hint="Mark the party as arrived"
                tone="success"
                busy={busy === "checkin"}
                disabled={busy !== null}
                onPress={runCheckIn}
              />
            )}

            <ActionRow
              icon={Trash2}
              label="Delete Booking"
              hint="Move this booking to trash"
              tone="danger"
              busy={busy === "delete"}
              disabled={busy !== null}
              onPress={runDelete}
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
