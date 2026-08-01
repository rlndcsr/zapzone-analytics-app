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
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { Pagination } from "../../components/ui/Pagination";
import { getToken } from "../../lib/session";
import {
  DATED_REPORT_TYPES,
  fetchWaiverReport,
  type WaiverReportType,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/* ------------------------------------------------------------ report meta -- */

// Same list, labels and order as the web WaiverReports `REPORT_TYPES`.
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

/** Local calendar day as YYYY-MM-DD — the web's `todayStr`. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "adult_name" → "Adult Name" (the web's `titleize`). */
const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Reports run over the whole history when no range is set, like the web. */
const EARLIEST_SELECTABLE = "2000-01-01";

/* ---------------------------------------------------------------- results -- */

type Row = Record<string, unknown>;

/**
 * Rows for the table, straight from the payload the backend returned. The web
 * renders whatever columns come back (`Object.keys(rows[0])`), so the app does
 * the same instead of hand-picking a few per report — that's what kept mobile
 * showing less than the website for the same request.
 */
function toRows(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { items?: unknown }).items)
  ) {
    return (data as { items: Row[] }).items;
  }
  return [];
}

/** A flat count map (marketing-consent) renders as stat tiles, as on the web. */
function asStatMap(data: unknown): Record<string, number> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) return null;
  const entries = Object.entries(obj).filter(
    ([, v]) => typeof v === "number" || typeof v === "string",
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, Number(v) || 0]));
}

/** Column width per key — ids stay narrow, free text gets room to breathe. */
function widthFor(key: string): number {
  if (key === "id" || key === "waiver_id" || key === "count") return 90;
  if (
    key === "email" ||
    key === "template" ||
    key === "name" ||
    key === "label" ||
    key === "reason" ||
    key === "chaperone"
  )
    return 210;
  return 150;
}

const StatCards = ({ stats }: { stats: Record<string, number> }) => (
  <View className="flex-row flex-wrap -mx-1.5">
    {Object.entries(stats).map(([key, value]) => (
      <View key={key} className="w-1/2 px-1.5 mb-3">
        <View className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-5 items-center">
          <Text
            className="text-2xl font-bold text-[#0644C7]"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {value}
          </Text>
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">
            {titleize(key)}
          </Text>
        </View>
      </View>
    ))}
  </View>
);

/**
 * Generic result table — one column per key in the payload (minus `snapshot`,
 * which the web hides too). Horizontally scrollable, since the wider reports
 * carry eight columns.
 */
const ReportTable = ({ columns, rows }: { columns: string[]; rows: Row[] }) => {
  const totalWidth = columns.reduce((sum, c) => sum + widthFor(c), 0);
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 overflow-hidden mb-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: totalWidth }}>
          <View className="flex-row bg-gray-50 dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-700">
            {columns.map((c) => (
              <Text
                key={c}
                style={{ width: widthFor(c) }}
                numberOfLines={1}
                className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                {titleize(c)}
              </Text>
            ))}
          </View>
          {rows.map((row, i) => (
            <View
              key={i}
              className={`flex-row ${
                i < rows.length - 1
                  ? "border-b border-gray-50 dark:border-neutral-800"
                  : ""
              }`}
            >
              {columns.map((c) => (
                <Text
                  key={c}
                  style={{ width: widthFor(c) }}
                  numberOfLines={2}
                  className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200"
                >
                  {row[c] == null || row[c] === "" ? "—" : String(row[c])}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

/**
 * The web's empty state, word for word — shown for an empty result AND for a
 * failed run (the web toasts the failure and falls back to this), so the screen
 * never dead-ends on a red error panel.
 */
const EmptyState = ({ note }: { note?: string | null }) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl py-12 px-6 items-center shadow-sm">
    <Feather name="bar-chart-2" size={38} color="#BFDBFE" />
    <Text className="text-gray-500 dark:text-gray-400 text-sm mt-3 text-center">
      No data for this report / range.
    </Text>
    {!!note && (
      <Text className="text-gray-400 dark:text-gray-500 text-xs mt-2 text-center">
        {note}
      </Text>
    )}
  </View>
);

/* --------------------------------------------------------------- controls -- */

const FilterLabel = ({ children }: { children: string }) => (
  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
    {children}
  </Text>
);

/** Select/date box styled like the web's small form controls. */
const ControlBox = ({
  value,
  placeholder,
  icon,
  onPress,
}: {
  value?: string | null;
  placeholder: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="h-11 flex-row items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3"
  >
    <Text
      numberOfLines={1}
      className={`flex-1 text-sm ${
        value
          ? "text-gray-900 dark:text-white"
          : "text-gray-400 dark:text-gray-500"
      }`}
    >
      {value || placeholder}
    </Text>
    <Feather name={icon} size={15} color="#9CA3AF" />
  </Pressable>
);

/* ---------------------------------------------------------------- screen -- */

const WaiverReportsScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [type, setType] = useState<WaiverReportType>("completed-by-date");
  // Free start/end dates, exactly like the web's two <input type="date">s:
  // blank means "no range", and the request then omits both params.
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [sheet, setSheet] = useState<"report" | null>(null);
  const [datePicker, setDatePicker] = useState<"start" | "end" | null>(null);

  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
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
      setFailure("Not authenticated.");
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Web parity: the range is sent only for dated reports and only once
      // BOTH ends are filled in; otherwise the backend reports on everything.
      const range =
        isDated(type) && startDate && endDate ? { startDate, endDate } : {};
      const res = await fetchWaiverReport(token, type, range);
      if (isCurrent()) {
        setData(res);
        setFailure(null);
      }
    } catch (err) {
      // The web toasts "Failed to run report" and renders its empty state; the
      // app does the same rather than replacing the results with an error card.
      if (isCurrent()) {
        setData(null);
        setFailure(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't reach the server.",
        );
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [type, startDate, endDate]);

  useEffect(() => {
    run();
    return () => {
      requestIdRef.current++;
    };
  }, [run]);

  // Back to page one whenever the report, range or page size changes.
  useEffect(() => {
    setPage(1);
  }, [type, startDate, endDate, perPage]);

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

  const stats = useMemo(() => asStatMap(data), [data]);
  const rows = useMemo(() => toRows(data), [data]);
  const columns = useMemo(
    () => (rows.length > 0 ? Object.keys(rows[0]).filter((c) => c !== "snapshot") : []),
    [rows],
  );
  const paged = useMemo(
    () => rows.slice((page - 1) * perPage, page * perPage),
    [rows, page, perPage],
  );

  // "215 record(s)" — the web prints this above the table for {count, items}
  // payloads; it falls back to the row count for plain arrays.
  const recordCount = useMemo(() => {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const count = (data as { count?: unknown }).count;
      if (typeof count === "number") return count;
    }
    return rows.length;
  }, [data, rows]);

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
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Waiver Reports
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Completion, sources, marketing consent, group invites, and
              deletions.
            </Text>
          </View>

          {/* Controls — Report · Start date · End date · Today · Run */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-5 border border-gray-100 dark:border-neutral-800">
            <FilterLabel>Report</FilterLabel>
            <ControlBox
              value={activeLabel}
              placeholder="Select a report"
              icon="chevron-down"
              onPress={() => setSheet("report")}
            />

            {dated && (
              <>
                <View className="flex-row gap-3 mt-3">
                  <View className="flex-1">
                    <FilterLabel>Start date</FilterLabel>
                    <ControlBox
                      value={startDate}
                      placeholder="yyyy-mm-dd"
                      icon="calendar"
                      onPress={() => setDatePicker("start")}
                    />
                  </View>
                  <View className="flex-1">
                    <FilterLabel>End date</FilterLabel>
                    <ControlBox
                      value={endDate}
                      placeholder="yyyy-mm-dd"
                      icon="calendar"
                      onPress={() => setDatePicker("end")}
                    />
                  </View>
                </View>

                <View className="flex-row items-center gap-2 mt-3">
                  <Pressable
                    onPress={() => {
                      const t = todayStr();
                      setStartDate(t);
                      setEndDate(t);
                    }}
                    className="h-10 px-4 items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  >
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Today
                    </Text>
                  </Pressable>
                  {(!!startDate || !!endDate) && (
                    <Pressable
                      onPress={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                      className="h-10 px-4 items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Clear
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={run}
                    className="h-10 px-4 flex-row items-center justify-center gap-1.5 rounded-lg bg-[#0644C7] active:opacity-90 ml-auto"
                  >
                    <Feather name="refresh-cw" size={14} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">Run</Text>
                  </Pressable>
                </View>
              </>
            )}

            {!dated && (
              <Pressable
                onPress={run}
                className="h-10 mt-3 px-4 flex-row items-center justify-center gap-1.5 rounded-lg bg-[#0644C7] active:opacity-90 self-end"
              >
                <Feather name="refresh-cw" size={14} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">Run</Text>
              </Pressable>
            )}
          </View>

          {/* Results */}
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : stats ? (
            <StatCards stats={stats} />
          ) : rows.length === 0 ? (
            <EmptyState note={failure} />
          ) : (
            <>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {recordCount} record(s)
              </Text>
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

      {/* Report picker sheet — the mobile stand-in for the web's <select>. */}
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
                  setData(null);
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

      {/* Start / end date calendars — past dates are selectable here, unlike
          the booking pickers, because reports look backwards. */}
      <DatePickerSheet
        visible={datePicker !== null}
        // Seed an unset field with today so the grid opens on the current month
        // rather than on the earliest selectable one.
        value={
          datePicker === "end"
            ? endDate || todayStr()
            : startDate || todayStr()
        }
        minDate={EARLIEST_SELECTABLE}
        title={datePicker === "end" ? "End date" : "Start date"}
        onClose={() => setDatePicker(null)}
        onSelect={(date) => {
          if (datePicker === "end") setEndDate(date);
          else setStartDate(date);
          setDatePicker(null);
        }}
      />
    </View>
  );
};

export default WaiverReportsScreen;
