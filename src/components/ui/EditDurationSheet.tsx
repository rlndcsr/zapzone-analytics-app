import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { getToken } from "../../lib/session";
import { updateBooking, type CalendarBooking } from "../../services/bookingsService";
import { BottomSheet } from "./BottomSheet";
import { TextField } from "./FormControls";
import { SheetSelect } from "./SheetSelect";
import {
  seedDuration,
  type DurationUnit,
} from "../../lib/bookings/durationEditor";

/** The app's copy of the web admin's "Edit Duration" modal. */
export function EditDurationSheet({
  visible,
  booking,
  onClose,
  onSaved,
}: {
  visible: boolean;
  booking: CalendarBooking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("2");
  const [unit, setUnit] = useState<DurationUnit>("hours");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !booking) return;
    const seed = seedDuration(booking.duration, booking.durationUnit);
    setValue(String(seed.value));
    setUnit(seed.unit);
    setError(null);
  }, [visible, booking]);

  if (!booking) return null;

  const parsed = Number(value);
  // The web's input is `min="1"` and coerces anything unparseable to 1, so a
  // blank or junk value must not reach the API as 0.
  const valid = Number.isFinite(parsed) && parsed >= 1;

  const save = async () => {
    if (!valid) return;
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await updateBooking(token, booking.id, {
        duration: Math.round(parsed),
        durationUnit: unit,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update duration. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Duration">
      <View className="px-5">
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">
          Booking: {booking.referenceNumber ?? `#${booking.id}`}
        </Text>

        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Duration
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder="2"
            />
          </View>
          {/* Opens its own sheet rather than expanding in place — an inline
              list would have to fit inside this sheet's capped height. */}
          <View className="w-40">
            <SheetSelect
              title="Duration Unit"
              value={unit}
              options={[
                { value: "hours", label: "Hours" },
                { value: "minutes", label: "Minutes" },
              ]}
              onSelect={(v) => setUnit(v as DurationUnit)}
            />
          </View>
        </View>

        {!valid && (
          <Text className="text-xs text-amber-600 dark:text-amber-500 mt-2">
            Enter a duration of at least 1.
          </Text>
        )}
        {!!error && (
          <Text className="text-xs text-red-600 dark:text-red-400 mt-2">
            {error}
          </Text>
        )}

        <View className="flex-row gap-3 mt-6 mb-4">
          <Pressable
            onPress={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving || !valid}
            className={`flex-1 py-3 rounded-xl bg-[#0644C7] items-center justify-center active:opacity-80 ${
              saving || !valid ? "opacity-40" : ""
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                Save Duration
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
