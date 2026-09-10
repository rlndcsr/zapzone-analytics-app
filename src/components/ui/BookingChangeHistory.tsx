import { History, MessageSquare, RotateCw, ShieldCheck, User } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ApiError } from "../../lib/api";
import { getToken } from "../../lib/session";
import {
  fetchBookingChangeLogs,
  type BookingChangeLogEntry,
  type BookingChangeValue,
} from "../../services/bookingsService";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Human labels for the fields the backend logs, mirroring the web view. */
const FIELD_LABELS: Record<string, string> = {
  booking_date: "Date",
  booking_time: "Time",
  participants: "Guests",
  duration: "Duration",
  duration_unit: "Duration unit",
  room_id: "Room",
  package_id: "Package",
  total_amount: "Total",
  amount_paid: "Amount paid",
  discount_amount: "Discount",
  status: "Status",
  payment_status: "Payment status",
  payment_method: "Payment method",
  guest_name: "Guest name",
  guest_email: "Guest email",
  guest_phone: "Guest phone",
  internal_notes: "Internal notes",
  notes: "Notes",
  special_requests: "Special requests",
  location_id: "Location",
  addons: "Add-ons",
  attractions: "Attractions",
  guest_of_honor_name: "Guest of honour",
};

const labelFor = (field: string): string =>
  FIELD_LABELS[field] ??
  field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const describeObject = (row: Record<string, unknown>): string => {
  // Prefer a human label; fall back to key: value pairs rather than emitting
  // "undefined" for a shape this map does not know.
  const label = [row.name, row.title, row.label].find(
    (v) => typeof v === "string" && v !== "",
  );
  const quantity = row.quantity;
  if (typeof label === "string") {
    return quantity === null || quantity === undefined
      ? label
      : `${label} x${quantity}`;
  }
  const pairs = Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${labelFor(k)}: ${String(v)}`);
  return pairs.length > 0 ? pairs.join(", ") : "—";
};

/** Renders a logged value as something a human can read — never
 *  "[object Object]", "undefined" or "null". */
const renderValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .filter((item) => item !== null && item !== undefined && item !== "")
      .map((item) =>
        typeof item === "object"
          ? describeObject(item as Record<string, unknown>)
          : String(item),
      )
      .filter((part) => part !== "" && part !== "—");
    return parts.length > 0 ? parts.join(", ") : "none";
  }
  if (typeof value === "object") {
    return describeObject(value as Record<string, unknown>);
  }
  return String(value);
};

/** "2026-09-01T01:29:00Z" -> "Sep 1, 2026, 1:29 AM" (device local time). */
function formatChangedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, "0");
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hour}:${minute} ${meridian}`;
}

/** Same wording as the web so both surfaces explain a failure identically. */
function describeError(err: unknown): string {
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 403) {
    return "Your account does not have access to the change history. It is staff-only.";
  }
  if (status === 404) {
    return "The change history is not available for this booking.";
  }
  const message = err instanceof Error && err.message ? err.message : "";
  if (status === undefined || status === 0) {
    return message || "Could not load the change history. The request did not reach the server.";
  }
  return `Could not load the change history (${status}${message ? `: ${message}` : ""}).`;
}

const ChangeRow = ({
  field,
  change,
}: {
  field: string;
  change: BookingChangeValue;
}) => {
  // Internal-note text is deliberately not copied into the permanent log, so
  // only the fact that it changed is shown.
  if (change.redacted) {
    return (
      <View className="flex-row border-t border-gray-100 dark:border-neutral-700 py-1.5">
        <Text className="w-24 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
          {labelFor(field)}
        </Text>
        <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          Changed ({renderValue(change.from)} → {renderValue(change.to)}) — text
          not recorded
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row border-t border-gray-100 dark:border-neutral-700 py-1.5">
      <Text className="w-24 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
        {labelFor(field)}
      </Text>
      <Text className="flex-1 pr-2 text-xs text-red-700 dark:text-red-400 line-through">
        {renderValue(change.from)}
      </Text>
      <Text className="flex-1 text-xs font-semibold text-green-700 dark:text-green-400">
        {renderValue(change.to)}
      </Text>
    </View>
  );
};

type Props = {
  bookingId: number;
  /** Re-fetches whenever this changes, so a save can refresh the log. */
  reloadKey?: number;
};

/**
 * A booking's permanent change history, read from
 * GET /api/bookings/{id}/change-logs (staff-only, append-only on the backend).
 * Mirrors the web admin's "Change history" block on Booking Details.
 */
export function BookingChangeHistory({ bookingId, reloadKey = 0 }: Props) {
  const [logs, setLogs] = useState<BookingChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        setError("Please sign in again to view the change history.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const entries = await fetchBookingChangeLogs(token, bookingId, { signal });
        if (signal?.aborted) return;
        setLogs(entries);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(describeError(err));
        setLogs([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [bookingId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  return (
    <>
      <View className="flex-row items-center justify-between mt-6 mb-2">
        <View className="flex-1 flex-row items-center gap-2">
          <History size={16} color="#0644C7" />
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            Change history
          </Text>
          <View className="flex-row items-center gap-1 bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
            <ShieldCheck size={10} color="#6b7280" />
            <Text className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">
              Permanent record
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => load()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Refresh change history"
          className={`w-8 h-8 rounded-lg items-center justify-center active:opacity-60 ${
            loading ? "opacity-40" : ""
          }`}
        >
          <RotateCw size={14} color="#9ca3af" />
        </Pressable>
      </View>

      {loading && logs.length === 0 ? (
        <View className="flex-row items-center gap-2 bg-gray-50 dark:bg-neutral-800/40 rounded-2xl px-4 py-4">
          <ActivityIndicator size="small" color="#0644C7" />
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Loading history…
          </Text>
        </View>
      ) : error ? (
        <View className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl px-4 py-3">
          <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text>
        </View>
      ) : logs.length === 0 ? (
        <View className="bg-gray-50 dark:bg-neutral-800/40 rounded-2xl px-4 py-4">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            No changes recorded for this booking yet.
          </Text>
        </View>
      ) : (
        logs.map((log) => {
          const fields = log.changes ? Object.entries(log.changes) : [];
          return (
            <View
              key={log.id}
              className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl mb-2 overflow-hidden"
            >
              <View className="flex-row items-baseline justify-between gap-2 border-b border-gray-100 dark:border-neutral-800 px-3 py-2">
                <Text
                  className="flex-1 text-sm font-bold text-gray-900 dark:text-white"
                  numberOfLines={2}
                >
                  {log.action}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                  {formatChangedAt(log.changedAt)}
                </Text>
              </View>

              <View className="px-3 py-2">
                <View className="flex-row items-center gap-2">
                  <User size={11} color="#9ca3af" />
                  <Text className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                    {log.employeeName}
                  </Text>
                  {!!log.employeeRole && (
                    <View className="bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                      <Text className="text-[10px] capitalize text-gray-600 dark:text-gray-400">
                        {log.employeeRole.replace(/_/g, " ")}
                      </Text>
                    </View>
                  )}
                </View>

                {log.reason ? (
                  <View className="flex-row gap-1.5 mt-2 bg-[#0644C7]/5 dark:bg-[#0644C7]/15 rounded-lg px-2 py-1.5">
                    <View className="pt-0.5">
                      <MessageSquare size={11} color="#0644C7" />
                    </View>
                    <Text className="flex-1 text-xs text-gray-800 dark:text-gray-100">
                      <Text className="font-semibold">Reason: </Text>
                      {log.reason}
                    </Text>
                  </View>
                ) : (
                  <Text className="mt-2 text-xs italic text-gray-400 dark:text-gray-500">
                    No reason recorded
                  </Text>
                )}

                {fields.length > 0 && (
                  <View className="mt-2">
                    <View className="flex-row pb-1">
                      <Text className="w-24 pr-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Field
                      </Text>
                      <Text className="flex-1 pr-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Was
                      </Text>
                      <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Now
                      </Text>
                    </View>
                    {fields.map(([field, change]) => (
                      <ChangeRow key={field} field={field} change={change} />
                    ))}
                  </View>
                )}

                {fields.length === 0 && !!log.description && (
                  <Text className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    {log.description}
                  </Text>
                )}
              </View>
            </View>
          );
        })
      )}
    </>
  );
}
