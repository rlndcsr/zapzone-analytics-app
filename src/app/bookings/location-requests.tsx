import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { ModuleHeader } from "../../components/ui/ModuleHeader";
import { AttractionsListSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  ToneDotBadge,
  type DotTone,
} from "../../components/ui/SummaryPanel";
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

type Tab = LocationChangeRequestStatus | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

// Same status colours the request pills have always used.
const STATUS_TONE: Record<LocationChangeRequestStatus, DotTone> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};
const STATUS_LABEL: Record<LocationChangeRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const LIST_TITLE: Record<Tab, string> = {
  pending: "Pending Requests",
  approved: "Approved Requests",
  rejected: "Rejected Requests",
  all: "All Requests",
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

  // Bumped per load, so a slower response for a tab the user already left
  // can't overwrite the rows of the tab they switched to.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
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
      if (!isCurrent()) return;
      setRequests(rows);
      setError(null);
    } catch (err) {
      if (!isCurrent()) return;
      setRequests([]);
      setError(
        err instanceof Error ? err.message : "Failed to load requests.",
      );
    } finally {
      if (isCurrent()) setLoading(false);
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
      <ModuleHeader title="Location Change Requests" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-4 mt-4">
        {/* Page description — lives on the screen, not in the header bar. */}
        <Text className="mb-4 text-sm leading-5 text-gray-500 dark:text-gray-400">
          Review requests to move bookings between locations. Approving validates
          scheduling conflicts at the destination.
        </Text>

        {/* Status chips — one status is fetched at a time, so no counts. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 4, gap: 8 }}
          className="mb-4 -mx-1 px-1"
        >
          {TABS.map((t) => (
            <FilterChip
              key={t.key}
              label={t.label}
              selected={tab === t.key}
              onPress={() => setTab(t.key)}
            />
          ))}
        </ScrollView>

        {!loading && !error && <ListHeader title={LIST_TITLE[tab]} count={requests.length} />}

        {/* Each state is keyed so switching between them remounts cleanly. */}
        {loading ? (
          <View key="s-loading">
            <AttractionsListSkeleton />
          </View>
        ) : error ? (
          <View key="s-error">
            <ListErrorBanner
              title="Could not load requests"
              message={error}
              onRetry={load}
            />
          </View>
        ) : requests.length === 0 ? (
          <View key="s-empty">
            <ListEmptyState
              icon="inbox"
              title="No requests"
              message={`No ${tab === "all" ? "" : `${tab} `}location change requests.`}
            />
          </View>
        ) : (
          <View key="s-list">
          {requests.map((r) => {
            const rowConflicts = conflicts[r.id] ?? [];
            const busy = busyId === r.id;
            return (
              <View
                key={r.id}
                className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
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
                      <ToneDotBadge tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
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
          })}
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  );
}
