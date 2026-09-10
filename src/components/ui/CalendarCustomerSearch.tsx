import { CalendarDays, Phone, Search, User, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { getToken } from "../../lib/session";
import { searchBookings, type CalendarBooking } from "../../services/bookingsService";

const MIN_TERM_LENGTH = 2;
const DEBOUNCE_MS = 350;
const RESULT_LIMIT = 20;

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  "checked-in": "bg-blue-100 text-blue-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** "2026-09-08" -> "Sep 8, 2026"; echoes the raw value when unparseable. */
function formatResultDate(date: string): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "17:30:00" -> "5:30 PM". */
function formatResultTime(time: string | null): string {
  if (!time) return "";
  const [hStr, mStr = "00"] = time.split(":");
  let hour = Number(hStr);
  if (Number.isNaN(hour)) return time;
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

/** "+15174567890" -> "(517) 456-7890"; anything else is shown as stored. */
function formatPhoneForDisplay(value: string | null): string {
  if (!value) return "";
  const digits = value.replace(/\D+/g, "");
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return value;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

type Props = {
  /** Scopes the search to one venue; omit for company-wide. */
  locationId?: number | null;
  /** A result was tapped — jump the calendar there and open the booking. */
  onSelect: (booking: CalendarBooking) => void;
  placeholder?: string;
};

/**
 * "Find any booking" typeahead for the calendar toolbar.
 *
 * Unlike the view filter next to it, this searches the backend across every
 * date (GET /api/bookings?search=…) and drops a result panel under the field,
 * mirroring the web admin's CustomerSearch. Tapping a result hands the booking
 * back so the calendar can jump to its day and open it.
 */
export function CalendarCustomerSearch({
  locationId,
  onSelect,
  placeholder = "Search customer name or phone",
}: Props) {
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [results, setResults] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Only the newest search may write state; a slower earlier one is ignored.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (debouncedTerm.length < MIN_TERM_LENGTH) {
      requestRef.current += 1;
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const token = getToken();
    if (!token) {
      setResults([]);
      setError("Please sign in again to search bookings.");
      setLoading(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    searchBookings({
      token,
      term: debouncedTerm,
      locationId,
      limit: RESULT_LIMIT,
      signal: controller.signal,
    })
      .then((rows) => {
        if (requestRef.current !== requestId) return;
        setResults(rows);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setResults([]);
        setError("Could not search bookings. Try again.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedTerm, locationId]);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setTerm("");
    setDebouncedTerm("");
    setResults([]);
    setError(null);
    setLoading(false);
    setOpen(false);
  }, []);

  const choose = useCallback(
    (booking: CalendarBooking) => {
      onSelect(booking);
      reset();
    },
    [onSelect, reset],
  );

  const showPanel = open && debouncedTerm.length >= MIN_TERM_LENGTH;
  const emptyMessage = loading
    ? null
    : error
      ? error
      : results.length === 0
        ? `No bookings match "${debouncedTerm}".`
        : null;

  return (
    // zIndex keeps the result panel above the calendar grid below it; the
    // Android shadow needs `elevation`, which only applies to the panel itself.
    <View style={{ zIndex: 30 }} className="mb-2">
      <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 h-11">
        <Search size={16} color="#9ca3af" />
        <TextInput
          value={term}
          onChangeText={(next) => {
            setTerm(next);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          className="flex-1 text-sm text-gray-900 dark:text-white"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search bookings by customer name or phone number"
        />
        {loading ? (
          <ActivityIndicator size="small" color="#9ca3af" />
        ) : (
          term.length > 0 && (
            <Pressable
              onPress={reset}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <XCircle size={16} color="#9ca3af" />
            </Pressable>
          )
        )}
      </View>

      {showPanel && (
        <View
          style={{
            position: "absolute",
            top: 46,
            left: 0,
            right: 0,
            maxHeight: 320,
            ...Platform.select({
              android: { elevation: 8 },
              default: {
                shadowColor: "#000",
                shadowOpacity: 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
              },
            }),
          }}
          className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl overflow-hidden"
        >
          {emptyMessage ? (
            <Text className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
              {emptyMessage}
            </Text>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {results.map((booking, index) => {
                const phone = formatPhoneForDisplay(booking.customerPhone);
                const time = formatResultTime(booking.time);
                const [badgeBg, badgeFg] = (
                  STATUS_TONE[booking.status] ?? "bg-gray-100 text-gray-600"
                ).split(" ");
                return (
                  <Pressable
                    key={booking.id}
                    onPress={() => choose(booking)}
                    className={`px-3 py-2 active:bg-gray-50 dark:active:bg-neutral-800 ${
                      index < results.length - 1
                        ? "border-b border-gray-100 dark:border-neutral-800"
                        : ""
                    }`}
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="flex-1 flex-row items-center gap-1.5">
                        <User size={13} color="#9ca3af" />
                        <Text
                          className="flex-1 text-sm font-semibold text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {booking.customerName}
                        </Text>
                      </View>
                      <View className={`px-2 py-0.5 rounded-full ${badgeBg}`}>
                        <Text className={`text-[10px] font-semibold ${badgeFg}`}>
                          {capitalize(booking.status)}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-3 mt-1">
                      <View className="flex-row items-center gap-1">
                        <CalendarDays size={11} color="#9ca3af" />
                        <Text className="text-xs text-gray-600 dark:text-gray-400">
                          {formatResultDate(booking.date)}
                          {time ? ` · ${time}` : ""}
                        </Text>
                      </View>
                      {!!phone && (
                        <View className="flex-row items-center gap-1">
                          <Phone size={11} color="#9ca3af" />
                          <Text className="text-xs text-gray-600 dark:text-gray-400">
                            {phone}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      className="text-xs text-gray-500 dark:text-gray-500 mt-0.5"
                      numberOfLines={1}
                    >
                      {booking.packageName || "No package"}
                      {booking.referenceNumber
                        ? ` · ${booking.referenceNumber}`
                        : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
