import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { DoorOpen } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  slotBadge,
  slotHasActivity,
} from "../../../lib/escapeRooms/escapeRooms";
import type {
  EscapeRoomDay,
  EscapeRoomDayRoom,
  EscapeRoomSlot,
} from "../../../services/escapeRoomService";
import { Card, Pill } from "./kit";

/**
 * Every room's games for the day — the web page's left column. A row opens that
 * game; "Only games with bookings or players" hides the empty times.
 */
export function EscapeRoomDayBoard({
  day,
  busyOnly,
  canManageSetup,
  openingKey,
  disabled,
  onOpen,
  onShowAll,
}: {
  day: EscapeRoomDay;
  busyOnly: boolean;
  canManageSetup: boolean;
  openingKey: string | null;
  disabled: boolean;
  onOpen: (room: EscapeRoomDayRoom, slot: EscapeRoomSlot) => void;
  onShowAll: () => void;
}) {
  if (day.rooms.length === 0) {
    return (
      <Card className="items-center py-8">
        <DoorOpen size={30} color="#9CA3AF" />
        <Text className="mt-2 text-center text-sm font-semibold text-gray-900 dark:text-white">
          No escape rooms at this location yet
        </Text>
        {canManageSetup ? (
          <Text className="mt-1 text-center text-sm text-gray-600 dark:text-gray-300">
            {'Turn on "This package is an escape room" in '}
            <Text
              onPress={() => router.push("/packages/packages")}
              className="font-semibold text-[#0644C7] underline dark:text-blue-400"
              accessibilityRole="link"
            >
              Packages
            </Text>{" "}
            for each room, then create an escape-room waiver.
          </Text>
        ) : (
          <Text className="mt-1 text-center text-sm text-gray-600 dark:text-gray-300">
            Ask a manager to switch on the escape rooms for this location.
          </Text>
        )}
      </Card>
    );
  }

  return (
    <View className="gap-4">
      {day.rooms.map((room) => {
        const shown = busyOnly ? room.slots.filter(slotHasActivity) : room.slots;
        return (
          <View
            key={room.id}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          >
            <View className="flex-row items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-neutral-800">
              <Text
                className="flex-1 font-semibold text-gray-900 dark:text-white"
                numberOfLines={1}
              >
                {room.name}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {room.durationMinutes} min{!room.isActive ? " · inactive" : ""}
              </Text>
            </View>

            {room.slots.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                No games scheduled on this day.
              </Text>
            ) : shown.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                No bookings or players yet.{" "}
                <Text
                  onPress={onShowAll}
                  className="font-semibold text-[#0644C7] underline dark:text-blue-400"
                  accessibilityRole="button"
                >
                  Show all times
                </Text>
              </Text>
            ) : (
              shown.map((slot, index) => (
                <SlotRow
                  key={slot.key}
                  slot={slot}
                  first={index === 0}
                  opening={openingKey === slot.key}
                  disabled={disabled}
                  onPress={() => onOpen(room, slot)}
                />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function SlotRow({
  slot,
  first,
  opening,
  disabled,
  onPress,
}: {
  slot: EscapeRoomSlot;
  first: boolean;
  opening: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const badge = slotBadge(slot);
  const playingNow = slot.inProgress && (slot.bookings.length > 0 || slot.signed > 0);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`px-4 py-3 active:bg-gray-50 dark:active:bg-neutral-800 ${
        first ? "" : "border-t border-gray-100 dark:border-neutral-800"
      } ${badge.faded ? "opacity-60" : ""}`}
      accessibilityRole="button"
      accessibilityLabel={`${slot.timeLabel}, ${badge.text}`}
    >
      <View className="flex-row items-center gap-3">
        <View className="w-[74px]">
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {slot.timeLabel}
          </Text>
          {playingNow && (
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Playing now
            </Text>
          )}
        </View>
        <View className="flex-1 flex-row flex-wrap items-center gap-2">
          <Pill label={badge.text} tone={badge.tone} />
        </View>
        {opening ? (
          <ActivityIndicator size="small" color="#9CA3AF" />
        ) : (
          <Feather name="chevron-right" size={16} color="#9CA3AF" />
        )}
      </View>

      <View className="mt-1.5 flex-row items-center gap-3 pl-[86px]">
        <Text
          className="flex-1 text-xs text-gray-600 dark:text-gray-400"
          numberOfLines={2}
        >
          {slot.bookings.length > 0
            ? slot.bookings.map((b) => `${b.name} (${b.participants})`).join(", ")
            : "No booking"}
        </Text>
        <View className="flex-row items-center gap-1">
          <Feather name="users" size={12} color="#6B7280" />
          <Text className="text-xs text-gray-700 dark:text-gray-300">
            {slot.signed} signed
            {slot.unsigned > 0 && (
              <Text className="text-amber-700 dark:text-amber-400">
                {" "}· {slot.unsigned} not signed
              </Text>
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
