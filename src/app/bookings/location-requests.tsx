import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  LocationChangeConflictError,
  approveLocationChangeRequest,
  fetchLocationChangeRequests,
  rejectLocationChangeRequest,
  type LocationChangeConflict,
  type LocationChangeRequest,
  type LocationChangeRequestStatus,
} from "../../services/locationChangeRequestsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type Tab = LocationChangeRequestStatus | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_PILL: Record<LocationChangeRequestStatus, string> = {
  pending: "bg-amber-100 dark:bg-amber-900/40",
  approved: "bg-green-100 dark:bg-green-900/40",
  rejected: "bg-red-100 dark:bg-red-900/40",
};
const STATUS_TEXT: Record<LocationChangeRequestStatus, string> = {
  pending: "text-amber-700 dark:text-amber-300",
  approved: "text-green-700 dark:text-green-300",
  rejected: "text-red-700 dark:text-red-300",
};

/** "2026-07-24" -> "Friday, July 24, 2026". */
function formatDateLong(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** ISO -> "Jul 24, 2026 at 3:12 PM ET". The web admin's LocationChangeRequests
 *  page stamps these with formatDateTimeET, so this matches it exactly. */
function formatDateTime(raw: string | null): string {
  return formatDateTimeET(raw, { month: "short", fallback: "" });
}

export default function LocationRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const userLocationId = user?.location_id ?? null;

  const [tab, setTab] = useState<Tab>("pending");
  const [requests, setRequests] = useState<LocationChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<
    Record<number, LocationChangeConflict[]>
  >({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchLocationChangeRequests({
        token,
        status: tab === "all" ? undefined : tab,
      });
      setRequests(rows);
      setError(null);
    } catch (err) {
      setRequests([]);
      setError(
        err instanceof Error ? err.message : "Failed to load requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /**
   * Who may act on a request — company admins always, otherwise only staff at
   * the destination location. Mirrors the web's `canReview`.
   */
  const canReview = (r: LocationChangeRequest): boolean =>
    r.status === "pending" &&
    (isCompanyAdmin ||
      (userLocationId !== null && userLocationId === r.toLocationId));

  const approve = async (r: LocationChangeRequest, force: boolean) => {
    const token = getToken();
    if (!token) return;
    setBusyId(r.id);
    try {
      await approveLocationChangeRequest(token, r.id, force);
      setConflicts((c) => {
        const next = { ...c };
        delete next[r.id];
        return next;
      });
      load();
    } catch (err) {
      if (err instanceof LocationChangeConflictError) {
        // Surface the clashes inline and switch the button to "Approve anyway".
        setConflicts((c) => ({ ...c, [r.id]: err.conflicts }));
      } else {
        Alert.alert(
          "Couldn't approve",
          err instanceof Error ? err.message : "Please try again.",
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r: LocationChangeRequest) => {
    const reason = rejectReason.trim();
    if (!reason) return;
    const token = getToken();
    if (!token) return;
    setBusyId(r.id);
    try {
      await rejectLocationChangeRequest(token, r.id, reason);
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (err) {
      Alert.alert(
        "Couldn't reject",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="w-full border-b border-gray-100 bg-white px-5 pb-4 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1 flex-row items-center gap-2">
            <Feather name="map-pin" size={16} color={PRIMARY} />
            <Text
              numberOfLines={1}
              className="flex-1 text-lg font-bold text-gray-900 dark:text-white"
            >
              Location Change Requests
            </Text>
          </View>
        </View>
      </View>

      {/* Status tabs — underlined, like the web */}
      <View className="flex-row border-b border-gray-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-900">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className={`px-4 py-3 ${
                active ? "border-b-2 border-[#0644C7]" : "border-b-2 border-transparent"
              }`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                className={`text-sm font-medium ${
                  active
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        {/* Page description — lives on the screen, not in the header bar. */}
        <Text className="mb-4 text-sm leading-5 text-gray-500 dark:text-gray-400">
          Review requests to move bookings between locations. Approving validates
          scheduling conflicts at the destination.
        </Text>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : error ? (
          <View className="rounded-2xl border border-red-100 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-900/20">
            <Text className="font-semibold text-red-600 dark:text-red-300">
              Something went wrong
            </Text>
            <Text className="mt-1 text-sm text-red-500 dark:text-red-400">
              {error}
            </Text>
          </View>
        ) : requests.length === 0 ? (
          <View className="py-16 items-center">
            <Feather name="inbox" size={40} color="#9CA3AF" />
            <Text className="mt-3 text-sm text-gray-400 dark:text-gray-500">
              No {tab === "all" ? "" : `${tab} `}location change requests.
            </Text>
          </View>
        ) : (
          requests.map((r) => {
            const rowConflicts = conflicts[r.id] ?? [];
            const busy = busyId === r.id;
            return (
              <View
                key={r.id}
                className="mb-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                style={CARD_SHADOW}
              >
                {/* Booking + status */}
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text
                        className="font-semibold text-gray-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {r.bookingLabel}
                      </Text>
                      <View className={`rounded-full px-2 py-0.5 ${STATUS_PILL[r.status]}`}>
                        <Text
                          className={`text-xs font-semibold capitalize ${STATUS_TEXT[r.status]}`}
                        >
                          {r.status}
                        </Text>
                      </View>
                    </View>
                    {!!r.bookingPackageName && (
                      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {r.bookingPackageName}
                      </Text>
                    )}
                  </View>
                  {!!r.bookingDate && (
                    <View className="flex-row items-center gap-1">
                      <Feather name="clock" size={12} color="#9CA3AF" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateLong(r.bookingDate)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* From → To */}
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <View className="flex-row items-center gap-1 rounded-lg bg-gray-50 px-2 py-1 dark:bg-neutral-800">
                    <Feather name="map-pin" size={12} color="#9CA3AF" />
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      {r.fromLocationName}
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={14} color={PRIMARY} />
                  <View className="flex-row items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 dark:bg-blue-900/30">
                    <Feather name="map-pin" size={12} color={PRIMARY} />
                    <Text className="text-sm font-medium text-[#0644C7] dark:text-blue-300">
                      {r.toLocationName}
                      {r.roomName ? ` · ${r.roomName}` : ""}
                    </Text>
                  </View>
                </View>

                {!!r.reason && (
                  <Text className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    <Text className="text-gray-400">Reason: </Text>
                    {r.reason}
                  </Text>
                )}

                <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  Requested by {r.requesterName ?? "staff"}
                  {r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ""}
                </Text>

                {r.status === "rejected" && !!r.reviewNotes && (
                  <View className="mt-2 rounded-lg border border-red-100 bg-red-50 p-2.5 dark:border-red-900/40 dark:bg-red-900/20">
                    <Text className="text-sm">
                      <Text className="font-medium text-red-700 dark:text-red-300">
                        Rejected:{" "}
                      </Text>
                      <Text className="text-red-600 dark:text-red-400">
                        {r.reviewNotes}
                      </Text>
                    </Text>
                    {!!r.reviewerName && (
                      <Text className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        by {r.reviewerName}
                        {r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ""}
                      </Text>
                    )}
                  </View>
                )}
                {r.status === "approved" && !!r.reviewerName && (
                  <Text className="mt-2 text-xs text-green-600 dark:text-green-400">
                    Approved by {r.reviewerName}
                    {r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ""}
                  </Text>
                )}

                {/* Destination conflicts surfaced by a failed approve */}
                {rowConflicts.length > 0 && (
                  <View className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
                    <View className="mb-1 flex-row items-center gap-2">
                      <Feather name="alert-triangle" size={14} color="#EF4444" />
                      <Text className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Scheduling conflict at destination
                      </Text>
                    </View>
                    {rowConflicts.map((c, i) => (
                      <Text
                        key={i}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        • {c.message}
                      </Text>
                    ))}
                    <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      You can approve anyway to override.
                    </Text>
                  </View>
                )}

                {/* Review actions */}
                {canReview(r) && (
                  <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
                    {rejectingId === r.id ? (
                      <View>
                        <View className="rounded-lg border border-gray-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                          <TextInput
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            editable={!busy}
                            placeholder="Reason for rejection (required)"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            textAlignVertical="top"
                            className="min-h-[56px] text-sm text-gray-900 dark:text-white"
                          />
                        </View>
                        <View className="mt-2 flex-row justify-end gap-2">
                          <Pressable
                            onPress={() => {
                              setRejectingId(null);
                              setRejectReason("");
                            }}
                            disabled={busy}
                            className="h-10 items-center justify-center rounded-lg border border-gray-300 px-4 dark:border-neutral-700"
                          >
                            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              Cancel
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => reject(r)}
                            disabled={busy || !rejectReason.trim()}
                            className={`h-10 items-center justify-center rounded-lg bg-red-600 px-4 ${
                              busy || !rejectReason.trim()
                                ? "opacity-60"
                                : "active:opacity-90"
                            }`}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text className="text-sm font-semibold text-white">
                                Confirm Reject
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row justify-end gap-2">
                        <Pressable
                          onPress={() => {
                            setRejectingId(r.id);
                            setRejectReason("");
                          }}
                          disabled={busy}
                          className="h-10 flex-row items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-4 dark:border-neutral-700"
                        >
                          <Feather name="x" size={14} color="#374151" />
                          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Reject
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => approve(r, rowConflicts.length > 0)}
                          disabled={busy}
                          className={`h-10 flex-row items-center justify-center gap-1.5 rounded-lg px-4 ${
                            rowConflicts.length > 0
                              ? "bg-red-600"
                              : "bg-[#0644C7]"
                          } ${busy ? "opacity-60" : "active:opacity-90"}`}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Feather name="check" size={14} color="#FFFFFF" />
                              <Text className="text-sm font-semibold text-white">
                                {rowConflicts.length > 0
                                  ? "Approve anyway"
                                  : "Approve"}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
