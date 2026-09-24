import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { getToken } from "../../lib/session";
import {
  fetchBookingsByLocationAndDate,
  fetchRoomOptions,
  locationConflictsOf,
  updateBookingLocation,
  type CalendarBooking,
  type LocationConflict,
  type RoomOption,
  type ScheduleBooking,
} from "../../services/bookingsService";
import type { LocationOption } from "../../services/locationsService";
import { BottomSheet } from "./BottomSheet";
import { FieldLabel } from "./FormControls";
import { SheetSelect } from "./SheetSelect";

const PRIMARY = "#0644C7";

/** Sentinel for the room picker's "Keep unassigned" row — deliberately not a
 *  number, so it can never collide with a real room id. */
const CLEAR_ROOM = "";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Dec 10, 2026" — the date stamp beside the destination preview. */
function formatPreviewDate(date: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(time: string | null): string {
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

/**
 * Move a booking to another venue — the app's copy of the web admin's "Change
 * Location" modal.
 *
 * The room picker matters more than it looks: rooms belong to a location, so a
 * booking that has one cannot simply follow the move. The backend rejects a
 * location change that would leave such a booking unassigned (422), which is
 * why the room field is required exactly when the booking already has a room.
 *
 * A destination whose room is busy comes back 409 with the reasons rather than
 * an error — the operator can override with "Change anyway", matching the web.
 */
export function ChangeLocationSheet({
  visible,
  booking,
  locations,
  onClose,
  onSaved,
}: {
  visible: boolean;
  booking: CalendarBooking | null;
  /** Venues the signed-in user may move this booking to. */
  locations: LocationOption[];
  onClose: () => void;
  /** Fired after a successful save so the list can refetch. */
  onSaved: () => void;
}) {
  const [locationId, setLocationId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [destBookings, setDestBookings] = useState<ScheduleBooking[]>([]);
  const [loadingDest, setLoadingDest] = useState(false);
  const [conflicts, setConflicts] = useState<LocationConflict[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the booking each time the sheet opens, so a previous edit can
  // never leak into the next booking's form.
  useEffect(() => {
    if (!visible || !booking) return;
    setLocationId(booking.locationId ?? null);
    setRoomId(null);
    setRooms([]);
    setDestBookings([]);
    setConflicts([]);
    setError(null);
  }, [visible, booking]);

  // Preview the destination: what is already booked there that day, and which
  // rooms it offers. Re-runs whenever the chosen venue changes.
  useEffect(() => {
    if (!visible || !booking || locationId == null) {
      setRooms([]);
      setDestBookings([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;

    setLoadingDest(true);
    setLoadingRooms(true);
    const date = booking.date?.split("T")[0] ?? "";

    fetchBookingsByLocationAndDate(token, locationId, date)
      .then((list) => {
        if (!cancelled) setDestBookings(list);
      })
      .catch(() => {
        if (!cancelled) setDestBookings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDest(false);
      });

    fetchRoomOptions(token, locationId, true)
      .then(({ rooms: list }) => {
        if (!cancelled) {
          setRooms(
            [...list].sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRooms([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, booking, locationId]);

  const save = useCallback(
    async (force: boolean) => {
      if (!booking || locationId == null) return;
      const token = getToken();
      if (!token) return;
      setSaving(true);
      setError(null);
      try {
        await updateBookingLocation(token, booking.id, {
          locationId,
          roomId,
          force,
        });
        onSaved();
        onClose();
      } catch (err) {
        const found = locationConflictsOf(err);
        if (found.length) {
          setConflicts(found);
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to update location. Please try again.",
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [booking, locationId, roomId, onSaved, onClose],
  );

  if (!booking) return null;

  const roomRequired = booking.roomId != null;
  // Mirrors the web's disabled rule: a venue must be chosen, a booking that has
  // a room must be given one at the destination, and re-saving the venue it is
  // already at with no room change is a no-op.
  const unchanged = locationId === booking.locationId && roomId == null;
  const canSave =
    locationId != null && !(roomRequired && roomId == null) && !unchanged;

  const roomPlaceholder = loadingRooms
    ? "Loading rooms..."
    : locationId != null && rooms.length === 0
      ? "No spaces at this location"
      : roomRequired
        ? "Select a room"
        : "Keep unassigned";

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Change Location">
      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">
          Booking: {booking.referenceNumber ?? `#${booking.id}`}
        </Text>

        {/* Both pickers open their own sheet rather than expanding in place —
            this sheet is capped at 80% height, so an inline option list would
            be squeezed into whatever room happened to be left. */}
        <FieldLabel>Destination Location</FieldLabel>
        <SheetSelect
          title="Destination Location"
          placeholder="Select a location"
          value={locationId}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          onSelect={(value) => {
            setLocationId(Number(value));
            // Rooms belong to a venue, so the old pick cannot survive the move.
            setRoomId(null);
            setConflicts([]);
          }}
        />
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          Current: {booking.locationName || "Not set"}
        </Text>

        <View className="mt-4">
          <FieldLabel>
            {`Destination Room/Table ${roomRequired ? "(required)" : "(optional)"}`}
          </FieldLabel>
          <SheetSelect
            title="Destination Room/Table"
            placeholder={roomPlaceholder}
            value={roomId}
            options={[
              // The web's blank option, which clears a room back to unassigned.
              // Offered only when the field is optional — a booking that has a
              // room must end the move with one. CLEAR_ROOM never equals a
              // numeric id, so an unassigned booking still shows the
              // contextual placeholder rather than this row's label.
              ...(roomRequired
                ? []
                : [{ value: CLEAR_ROOM, label: "Keep unassigned" }]),
              ...rooms.map((r) => ({ value: r.id, label: r.name })),
            ]}
            onSelect={(value) => {
              setRoomId(value === CLEAR_ROOM ? null : Number(value));
              setConflicts([]);
            }}
            disabled={
              loadingRooms || locationId == null || rooms.length === 0
            }
          />
          {roomRequired && (
            <Text className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">
              Rooms are specific to each location, so pick a room at the
              destination — otherwise this booking would be left unassigned.
            </Text>
          )}
        </View>

        <View className="mt-5">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Existing bookings at destination
            </Text>
            {!!booking.date && (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {formatPreviewDate(booking.date)}
              </Text>
            )}
          </View>

          {locationId == null ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 italic">
              Select a location to preview.
            </Text>
          ) : loadingDest ? (
            <View className="py-5 items-center">
              <ActivityIndicator size="small" color={PRIMARY} />
            </View>
          ) : destBookings.length === 0 ? (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              No bookings at this location on this date.
            </Text>
          ) : (
            <View className="rounded-xl border border-gray-100 dark:border-neutral-800 px-2 py-1">
              {destBookings.map((b) => (
                <View
                  key={b.id}
                  className="flex-row items-center gap-2 py-1.5 border-b border-gray-50 dark:border-neutral-800/60 last:border-b-0"
                >
                  <Feather name="clock" size={11} color="#9CA3AF" />
                  <Text className="text-xs text-gray-700 dark:text-gray-300">
                    {formatTime(b.time)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="text-xs text-gray-700 dark:text-gray-300 flex-1 text-center"
                  >
                    {b.packageName}
                  </Text>
                  {!!b.roomName && (
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      {b.roomName}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {conflicts.length > 0 && (
          <View className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-3">
            <View className="flex-row items-center gap-2 mb-1.5">
              <Feather name="alert-triangle" size={14} color="#ef4444" />
              <Text className="text-sm font-semibold text-red-700 dark:text-red-300">
                Scheduling conflict
              </Text>
            </View>
            {conflicts.map((c, i) => (
              <Text
                key={`${c.type}-${i}`}
                className="text-xs text-red-600 dark:text-red-400 mb-0.5"
              >
                • {c.message}
              </Text>
            ))}
            <Text className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              You can change the location anyway to override these conflicts.
            </Text>
          </View>
        )}

        {!!error && (
          <Text className="text-xs text-red-600 dark:text-red-400 mt-3">
            {error}
          </Text>
        )}

        <View className="flex-row gap-3 mt-6 mb-2">
          <Pressable
            onPress={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          {conflicts.length > 0 ? (
            <Pressable
              onPress={() => save(true)}
              disabled={saving}
              className={`flex-1 py-3 rounded-xl bg-red-600 items-center justify-center active:opacity-80 ${
                saving ? "opacity-60" : ""
              }`}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Change anyway
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => save(false)}
              disabled={saving || !canSave}
              className={`flex-1 py-3 rounded-xl bg-[#0644C7] items-center justify-center active:opacity-80 ${
                saving || !canSave ? "opacity-40" : ""
              }`}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  Save Location
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </BottomSheet>
  );
}
