import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  formatFollowUpTime,
  ratingsRequestedLine,
  visitRoute,
  type GuestRatingsResponse,
} from "../../lib/visitFollowUp/visitFollowUp";
import { fetchGuestRatings } from "../../services/visitFollowUpService";
import { CheckboxRow } from "./FormControls";

function Stars({ rating }: { rating: number }) {
  return (
    <View className="flex-row items-center gap-0.5" accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={13}
          color={star <= rating ? "#fbbf24" : "#d1d5db"}
          fill={star <= rating ? "#fbbf24" : "transparent"}
        />
      ))}
    </View>
  );
}

/**
 * "Guest ratings" on the Visit Follow-up email's details — web
 * components/admin/visits/GuestRatingsPanel.tsx, scoped to the workspace location.
 */
export function GuestRatingsPanel() {
  const user = getCurrentUser();
  const activeLocation = useActiveLocation();
  const locationId =
    user?.role === "company_admin"
      ? activeLocation.id === "all"
        ? null
        : activeLocation.id
      : (user?.location_id ?? null);

  const [data, setData] = useState<GuestRatingsResponse | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState(locationId);

  if (scope !== locationId) {
    setScope(locationId);
    setPage(1);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetchGuestRatings(
      token,
      { page, perPage: 10, maxRating: lowOnly ? 2 : undefined, locationId },
      controller.signal,
    )
      .then(setData)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [page, lowOnly, locationId]);

  const summary = data?.summary;
  const rated = summary?.rated ?? 0;
  const lastPage = data?.pagination.last_page ?? 1;
  const currentPage = data?.pagination.current_page ?? page;

  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 border border-gray-100 dark:border-neutral-800">
      <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4">
        <View className="flex-row items-center gap-2">
          <Star size={18} color="#f59e0b" />
          <Text className="text-base font-bold text-gray-900 dark:text-white">Guest ratings</Text>
        </View>
        <CheckboxRow
          key={String(lowOnly)}
          checked={lowOnly}
          onToggle={() => {
            setLowOnly((v) => !v);
            setPage(1);
          }}
          label={<Text className="text-sm text-gray-700 dark:text-gray-200">Only 1–2 stars</Text>}
        />
      </View>

      {failed && <Text className="text-sm text-red-600 dark:text-red-400">Ratings could not be loaded.</Text>}

      {summary && (
        <View className="gap-3 mb-5">
          <View className="flex-row gap-3">
            <View className="flex-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <Text className="text-xs text-amber-800 dark:text-amber-300">Average</Text>
              <Text className="text-2xl font-semibold text-amber-900 dark:text-amber-200">
                {summary.average !== null ? summary.average.toFixed(1) : "–"}
              </Text>
              {summary.average !== null && <Stars rating={Math.round(summary.average)} />}
            </View>
            <View className="flex-1 p-3 bg-gray-50 dark:bg-neutral-800 rounded-lg">
              <Text className="text-xs text-gray-600 dark:text-gray-300">Ratings</Text>
              <Text className="text-2xl font-semibold text-gray-900 dark:text-white">{rated}</Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">{ratingsRequestedLine(summary)}</Text>
            </View>
          </View>
          <View className="p-3 bg-gray-50 dark:bg-neutral-800 rounded-lg gap-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.distribution[String(stars)] ?? 0;
              const width = rated > 0 ? Math.round((count / rated) * 100) : 0;
              return (
                <View key={stars} className="flex-row items-center gap-2">
                  <Text className="w-3 text-right text-xs text-gray-600 dark:text-gray-300">{stars}</Text>
                  <View className="flex-1 h-1.5 bg-gray-200 dark:bg-neutral-700 rounded">
                    <View className="h-1.5 bg-amber-400 rounded" style={{ width: `${width}%` }} />
                  </View>
                  <Text className="w-6 text-right text-xs text-gray-600 dark:text-gray-300">{count}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {loading && !data && (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#0644C7" />
          <Text className="text-sm text-gray-500 dark:text-gray-400">Loading ratings…</Text>
        </View>
      )}
      {data && data.ratings.length === 0 && (
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {lowOnly ? "No low ratings yet." : "No guest has rated a visit yet."}
        </Text>
      )}

      {data && data.ratings.length > 0 && (
        <View>
          {data.ratings.map((row, i) => (
            <View
              key={row.id}
              className={`py-3 gap-1 ${i === 0 ? "" : "border-t border-gray-100 dark:border-neutral-800"}`}
            >
              <View className="flex-row flex-wrap items-center gap-2">
                {row.rating !== null && <Stars rating={row.rating} />}
                <Text className="text-sm text-gray-900 dark:text-white">
                  {row.recipient_name || row.recipient_email_masked}
                </Text>
                {!!row.location_name && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400">{row.location_name}</Text>
                )}
              </View>
              {!!row.comment && (
                <Text className="text-sm text-gray-700 dark:text-gray-200">{`“${row.comment}”`}</Text>
              )}
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  Rated {formatFollowUpTime(row.rated_at)}
                </Text>
                <Text
                  className="text-xs font-semibold text-gray-700 dark:text-gray-200 underline"
                  onPress={() => router.push(visitRoute(row) as never)}
                >
                  Open visit
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {data && lastPage > 1 && (
        <View className="mt-4 flex-row items-center justify-between">
          <Pressable
            disabled={currentPage <= 1 || loading}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={{ opacity: currentPage <= 1 ? 0.4 : 1 }}
            className="flex-row items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700"
          >
            <Feather name="chevron-left" size={14} color="#6B7280" />
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">Previous</Text>
          </Pressable>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Page {currentPage} of {lastPage}
          </Text>
          <Pressable
            disabled={currentPage >= lastPage || loading}
            onPress={() => setPage((p) => Math.min(lastPage, p + 1))}
            style={{ opacity: currentPage >= lastPage ? 0.4 : 1 }}
            className="flex-row items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700"
          >
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">Next</Text>
            <Feather name="chevron-right" size={14} color="#6B7280" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
