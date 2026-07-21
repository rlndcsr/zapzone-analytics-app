import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeletionLogTable } from "../../components/ui/DeletionLogTable";
import { Pagination } from "../../components/ui/Pagination";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { WaiversListSkeleton } from "../../components/ui/skeleton/WaiversSkeleton";
import { getToken } from "../../lib/session";
import {
  fetchDeletionLog,
  type WaiverDeletionLogEntry,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWhen(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const LogCard = ({ entry }: { entry: WaiverDeletionLogEntry }) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-start justify-between mb-2">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {entry.guestName ?? "Unknown guest"}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Waiver #{entry.waiverId}
        </Text>
      </View>
      <View className="bg-red-100 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
        <Text className="text-[10px] font-semibold text-red-700 dark:text-red-400">
          Deleted
        </Text>
      </View>
    </View>

    <View className="flex-row items-center gap-1.5">
      <Feather name="calendar" size={12} color="#9CA3AF" />
      <Text className="text-xs text-gray-500 dark:text-gray-400">
        Visit {formatDate(entry.selectedDate)}
      </Text>
    </View>

    {!!entry.reason && (
      <View className="flex-row items-start gap-1.5 mt-1.5">
        <Feather name="message-square" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-600 dark:text-gray-300 flex-1">
          {entry.reason}
        </Text>
      </View>
    )}

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="user" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {entry.deletedBy ?? "—"}
        </Text>
      </View>
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {formatWhen(entry.deletedAt)}
      </Text>
    </View>
  </View>
);

const WaiverDeletionLogScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [logs, setLogs] = useState<WaiverDeletionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  // Presentation layout only — table by default, card view on toggle. Both
  // layouts read the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchDeletionLog(token);
      if (isCurrent()) {
        setLogs(data);
        setError(null);
      }
    } catch (err) {
      if (isCurrent()) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load the deletion log.",
        );
        setLogs([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current++;
    };
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [perPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const paged = useMemo(
    () => logs.slice((page - 1) * perPage, page * perPage),
    [logs, page, perPage],
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Deletion Log
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

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
        <View className="px-5">
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Waiver Deletion Log
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              An audit trail of every deleted waiver
            </Text>
          </View>

          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Couldn&apos;t load the log
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-4">
              <View className="flex-row items-center gap-2 shrink">
                <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                  Deletions
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {logs.length}
                  </Text>
                </View>
              </View>
              {logs.length > 0 && (
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              )}
            </View>
          )}

          {loading ? (
            <WaiversListSkeleton />
          ) : !error && logs.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="trash-2" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No deletions logged
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Deleted waivers will appear here with who removed them and when.
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <DeletionLogTable entries={paged} />
                ) : (
                  paged.map((entry) => <LogCard key={entry.id} entry={entry} />)
                )}
                <Pagination
                  page={page}
                  perPage={perPage}
                  total={logs.length}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default WaiverDeletionLogScreen;
