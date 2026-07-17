import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { Pagination } from "../../components/ui/Pagination";
import { getToken } from "../../lib/session";
import {
  DATED_REPORT_TYPES,
  fetchWaiverReport,
  SOURCE_LABELS,
  type WaiverReportType,
  type WaiverSource,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/* ------------------------------------------------------------ report meta -- */

const REPORT_TYPES: { value: WaiverReportType; label: string }[] = [
  { value: "completed-by-date", label: "Completed by date" },
  { value: "missing", label: "Missing (incomplete)" },
  { value: "bulk-completion", label: "Group invite completion" },
  { value: "by-event", label: "By event" },
  { value: "by-template", label: "By template" },
  { value: "by-source", label: "By source" },
  { value: "marketing-consent", label: "Marketing consent" },
  { value: "deleted", label: "Deleted waivers" },
];

const isDated = (t: WaiverReportType) => DATED_REPORT_TYPES.includes(t);

/* ------------------------------------------------------------ date ranges -- */

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type RangeKey = "all" | "today" | "7d" | "30d" | "month";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
];

const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

/** Resolve a preset to a {startDate,endDate} range, or {} for "all time". */
function rangeFor(key: RangeKey): { startDate?: string; endDate?: string } {
  if (key === "all") return {};
  const now = new Date();
  const end = ymd(now);
  if (key === "today") return { startDate: end, endDate: end };
  if (key === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: ymd(first), endDate: end };
  }
  const days = key === "7d" ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { startDate: ymd(start), endDate: end };
}

/* ------------------------------------------------------------- formatting -- */

const humanize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function fmtDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  const d = new Date(s.length > 10 ? s : `${s.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------------- columns -- */

type Row = Record<string, unknown>;
type Column = {
  label: string;
  flex: number;
  align?: "right";
  get: (row: Row) => string | number;
};

/** Column layout per report — the mobile equivalent of the web report tables. */
const COLUMNS: Record<WaiverReportType, Column[]> = {
  "completed-by-date": [
    { label: "Date", flex: 2, get: (r) => fmtDate(r.date) },
    { label: "Count", flex: 1, align: "right", get: (r) => Number(r.count) },
  ],
  missing: [
    { label: "Guest", flex: 2, get: (r) => String(r.name ?? "—") },
    { label: "Visit", flex: 1.4, get: (r) => fmtDate(r.selected_date) },
    { label: "Template", flex: 1.6, get: (r) => String(r.template ?? "—") },
  ],
  "bulk-completion": [
    { label: "Chaperone", flex: 2, get: (r) => String(r.chaperone ?? "—") },
    { label: "Invited", flex: 1, align: "right", get: (r) => Number(r.invited ?? 0) },
    { label: "Done", flex: 1, align: "right", get: (r) => Number(r.complete ?? 0) },
  ],
  "by-event": [
    { label: "Event", flex: 2, get: (r) => String(r.label ?? "—") },
    { label: "Count", flex: 1, align: "right", get: (r) => Number(r.count) },
  ],
  "by-template": [
    { label: "Template", flex: 2, get: (r) => String(r.label ?? "—") },
    { label: "Count", flex: 1, align: "right", get: (r) => Number(r.count) },
  ],
  "by-source": [
    {
      label: "Source",
      flex: 2,
      get: (r) =>
        SOURCE_LABELS[r.key as WaiverSource] ?? String(r.label ?? r.key ?? "—"),
    },
    { label: "Count", flex: 1, align: "right", get: (r) => Number(r.count) },
  ],
  "marketing-consent": [
    { label: "Consent", flex: 2, get: (r) => humanize(String(r.status)) },
    { label: "Count", flex: 1, align: "right", get: (r) => Number(r.count) },
  ],
  deleted: [
    {
      label: "Guest",
      flex: 1.7,
      get: (r) =>
        String((r.snapshot as { adult_name?: string })?.adult_name ?? "—"),
    },
    { label: "Waiver", flex: 1, get: (r) => `#${r.waiver_id}` },
    { label: "When", flex: 1.7, get: (r) => fmtDateTime(r.deleted_at) },
  ],
};

/** Flatten each report's payload shape into a flat array of table rows. */
function toRows(type: WaiverReportType, data: unknown): Row[] {
  if (type === "marketing-consent") {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return Object.entries(data as Record<string, unknown>).map(
        ([status, count]) => ({ status, count }),
      );
    }
    return [];
  }
  if (Array.isArray(data)) return data as Row[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Row[] }).items;
  }
  return [];
}

/* ------------------------------------------------------------------ table -- */

const ReportTable = ({ columns, rows }: { columns: Column[]; rows: Row[] }) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 overflow-hidden mb-1">
    {/* Header row */}
    <View className="flex-row bg-gray-50 dark:bg-neutral-800 px-4 py-3 border-b border-gray-100 dark:border-neutral-700">
      {columns.map((c) => (
        <Text
          key={c.label}
          style={{ flex: c.flex, textAlign: c.align ?? "left" }}
          className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
        >
          {c.label}
        </Text>
      ))}
    </View>
    {/* Data rows */}
    {rows.map((row, i) => (
      <View
        key={i}
        className={`flex-row items-center px-4 py-3 ${
          i < rows.length - 1
            ? "border-b border-gray-50 dark:border-neutral-800"
            : ""
        }`}
      >
        {columns.map((c) => {
          const value = c.get(row);
          return (
            <Text
              key={c.label}
              style={{
                flex: c.flex,
                textAlign: c.align ?? "left",
                ...(c.align === "right"
                  ? { fontVariant: ["tabular-nums"] as const }
                  : {}),
              }}
              className={`text-sm ${
                c.align === "right"
                  ? "font-semibold text-gray-900 dark:text-white"
                  : "text-gray-700 dark:text-gray-200"
              }`}
              numberOfLines={1}
            >
              {value}
            </Text>
          );
        })}
      </View>
    ))}
  </View>
);

const EmptyState = () => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
    <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
      <Feather name="bar-chart-2" size={26} color="#9CA3AF" />
    </View>
    <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
      No data
    </Text>
    <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
      Nothing to show for this report and date range.
    </Text>
  </View>
);

/* ---------------------------------------------------------------- screen -- */

const WaiverReportsScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [type, setType] = useState<WaiverReportType>("completed-by-date");
  const [rangeKey, setRangeKey] = useState<RangeKey | "custom">("all");
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const [sheet, setSheet] = useState<"report" | "range" | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const requestIdRef = useRef(0);
  const dated = isDated(type);

  const run = useCallback(async () => {
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
      let range: { startDate?: string; endDate?: string } = {};
      if (isDated(type)) {
        range =
          rangeKey === "custom"
            ? customStart && customEnd
              ? { startDate: customStart, endDate: customEnd }
              : {}
            : rangeFor(rangeKey);
      }
      const res = await fetchWaiverReport(token, type, range);
      if (isCurrent()) {
        setData(res);
        setError(null);
      }
    } catch (err) {
      if (isCurrent()) {
        setError(
          err instanceof Error ? err.message : "Failed to run this report.",
        );
        setData(null);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [type, rangeKey, customStart, customEnd]);

  useEffect(() => {
    run();
    return () => {
      requestIdRef.current++;
    };
  }, [run]);

  // Reset to the first page whenever the report / range / page size changes.
  useEffect(() => {
    setPage(1);
  }, [type, rangeKey, customStart, customEnd, perPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run();
    } finally {
      setRefreshing(false);
    }
  }, [run]);

  const activeLabel = useMemo(
    () => REPORT_TYPES.find((r) => r.value === type)?.label ?? "",
    [type],
  );

  const dateLabel = useMemo(() => {
    if (rangeKey === "custom") {
      if (customStart && customEnd)
        return `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`;
      return "Custom range";
    }
    return RANGE_LABELS[rangeKey];
  }, [rangeKey, customStart, customEnd]);

  const columns = COLUMNS[type];
  const rows = useMemo(() => toRows(type, data), [type, data]);
  const paged = useMemo(
    () => rows.slice((page - 1) * perPage, page * perPage),
    [rows, page, perPage],
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
            Reports
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
              Waiver Reports
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Completion, sources, marketing consent, group invites, and
              deletions
            </Text>
          </View>

          {/* Report filter pill */}
          <Pressable
            onPress={() => setSheet("report")}
            className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3"
          >
            <Feather name="bar-chart-2" size={16} color={PRIMARY} />
            <Text
              className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
              numberOfLines={1}
            >
              {activeLabel}
            </Text>
            <Feather name="chevron-down" size={14} color="#9CA3AF" />
          </Pressable>

          {/* Date range filter pill (dated reports only) */}
          {dated && (
            <Pressable
              onPress={() => setSheet("range")}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {dateLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          )}

          {/* Results header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4 mt-1">
              <Text className="shrink text-lg font-bold text-gray-900 dark:text-white">
                {activeLabel}
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {rows.length}
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : error ? (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Couldn&apos;t run this report
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ReportTable columns={columns} rows={paged} />
              <Pagination
                page={page}
                perPage={perPage}
                total={rows.length}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Report picker sheet */}
      <BottomSheet
        visible={sheet === "report"}
        onClose={() => setSheet(null)}
        title="Report"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {REPORT_TYPES.map((option) => {
            const isSelected = type === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setType(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Date range picker sheet */}
      <BottomSheet
        visible={sheet === "range"}
        onClose={() => setSheet(null)}
        title="Date range"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {RANGE_OPTIONS.map((option) => {
            const isSelected = rangeKey === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  setRangeKey(option.key);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
          {/* Custom range → native calendar sheet */}
          <Pressable
            onPress={() => {
              setSheet(null);
              setCustomOpen(true);
            }}
            className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
              rangeKey === "custom" ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
          >
            <Text
              className={`text-base font-medium ${
                rangeKey === "custom"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              {rangeKey === "custom" && customStart && customEnd
                ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
                : "Custom range…"}
            </Text>
            <Feather name="calendar" size={16} color="#9CA3AF" />
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <DateRangeSheet
        visible={customOpen}
        initialStart={customStart ?? undefined}
        initialEnd={customEnd ?? undefined}
        onClose={() => setCustomOpen(false)}
        onApply={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setRangeKey("custom");
          setCustomOpen(false);
        }}
      />
    </View>
  );
};

export default WaiverReportsScreen;
