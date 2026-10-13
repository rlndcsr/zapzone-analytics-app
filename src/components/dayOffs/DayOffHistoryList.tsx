import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { CHANGE_ACTION_LABELS, changedFieldRows } from "../../lib/dayOffs/blockForm";
import { getToken } from "../../lib/session";
import {
  fetchDayOffChanges,
  type DayOffChange,
  type DayOffChangeAction,
} from "../../services/dayOffsService";

const ACTION_TONE: Record<DayOffChangeAction, { chip: string; text: string }> = {
  created: { chip: "bg-red-50 border-red-200", text: "text-red-700" },
  updated: { chip: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  deleted: { chip: "bg-gray-100 border-gray-200", text: "text-gray-700" },
  booked_inside_block: { chip: "bg-amber-50 border-amber-200", text: "text-amber-800" },
  booking_removed: { chip: "bg-gray-100 border-gray-200", text: "text-gray-700" },
};

const FILTERS: { value: DayOffChangeAction | null; label: string }[] = [
  { value: null, label: "All changes" },
  { value: "created", label: "Blocked" },
  { value: "updated", label: "Changed" },
  { value: "deleted", label: "Removed" },
  { value: "booked_inside_block", label: "Booked inside a block" },
  { value: "booking_removed", label: "Booking removed" },
];

function ChangeEntry({ change, showLocation }: { change: DayOffChange; showLocation: boolean }) {
  const tone = ACTION_TONE[change.action] ?? ACTION_TONE.updated;
  const rows = changedFieldRows(change);
  const reference = typeof change.context.reference === "string" ? change.context.reference : null;
  const guest = typeof change.context.guest_name === "string" ? change.context.guest_name : null;
  const booking = change.action === "booked_inside_block" || change.action === "booking_removed";

  return (
    <View className="mb-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
      <View className="flex-row flex-wrap items-center gap-2">
        <View className={`rounded-full border px-2 py-0.5 ${tone.chip}`}>
          <Text className={`text-[11px] font-medium ${tone.text}`}>
            {CHANGE_ACTION_LABELS[change.action] ?? "Changed"}
          </Text>
        </View>
        <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          {change.createdAt ? `${formatDateTimeET(change.createdAt, { month: "short" })} · ` : ""}
          {change.changedByName ?? "Unknown employee"}
          {change.changedByRole ? ` (${change.changedByRole.replace(/_/g, " ")})` : ""}
          {showLocation && change.locationName ? ` · ${change.locationName}` : ""}
          {change.previousLocationName ? ` · moved from ${change.previousLocationName}` : ""}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-gray-800 dark:text-gray-200">{change.summary}</Text>
      {rows.map((row) => (
        <Text key={row.label} className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          <Text className="font-medium text-gray-700 dark:text-gray-300">{row.label}: </Text>
          <Text className="line-through">{row.before}</Text>
          {"  →  "}
          <Text className="text-gray-900 dark:text-white">{row.after}</Text>
        </Text>
      ))}
      {booking && (reference || guest) && (
        <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {[reference ? `Reference ${reference}` : null, guest ? `Guest ${guest}` : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      )}
    </View>
  );
}

/**
 * Who blocked, changed or removed what — one block's history, or every block at
 * a location (web AvailabilityChangeLog). Entries are permanent on the server.
 */
export function DayOffHistoryList({
  dayOffId,
  locationId,
  showLocation,
}: {
  dayOffId?: number;
  locationId?: number | null;
  showLocation: boolean;
}) {
  const [action, setAction] = useState<DayOffChangeAction | null>(null);
  const [changes, setChanges] = useState<DayOffChange[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      const token = getToken();
      if (!token) return;
      const id = ++request.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchDayOffChanges(token, {
          dayOffId,
          locationId: locationId ?? undefined,
          action: action ?? undefined,
          page: nextPage,
          perPage: dayOffId != null ? 50 : 20,
        });
        if (id !== request.current) return;
        setChanges((prev) => (nextPage === 1 ? res.changes : [...prev, ...res.changes]));
        setPage(res.currentPage);
        setLastPage(res.lastPage);
      } catch (e) {
        if (id !== request.current) return;
        setError(e instanceof Error && e.message ? e.message : "Could not load the change history.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [dayOffId, locationId, action],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row gap-2">
          {FILTERS.map((f) => {
            const active = action === f.value;
            return (
              <Pressable
                key={f.label}
                onPress={() => setAction(f.value)}
                className={`rounded-full border px-3 py-1.5 ${
                  active
                    ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-neutral-700"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  className={`text-xs font-medium ${
                    active ? "text-[#0644C7]" : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {error ? (
        <View className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-900/20">
          <Text className="text-sm text-red-700 dark:text-red-300">{error}</Text>
        </View>
      ) : loading && changes.length === 0 ? (
        <View className="items-center py-8">
          <ActivityIndicator color="#0644C7" />
        </View>
      ) : changes.length === 0 ? (
        <Text className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No changes recorded yet.
        </Text>
      ) : (
        changes.map((c) => <ChangeEntry key={c.id} change={c} showLocation={showLocation} />)
      )}

      {!error && page < lastPage && (
        <Pressable
          onPress={() => void load(page + 1)}
          disabled={loading}
          className="mt-1 flex-row items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 active:opacity-80 dark:border-neutral-700"
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#0644C7" />
          ) : (
            <Feather name="chevron-down" size={14} color="#6B7280" />
          )}
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">Load more</Text>
        </Pressable>
      )}

      <Text className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Every change is kept permanently and cannot be edited or removed.
      </Text>
    </View>
  );
}

export default DayOffHistoryList;
