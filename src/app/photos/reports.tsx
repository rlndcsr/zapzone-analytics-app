import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import {
  FilterOptionSheet,
  type FilterOption,
} from "../../components/ui/FilterOptionSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { toKey } from "../../lib/date/calendar";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchPhotoReport,
  type PhotoReport,
  type PhotoReportRow,
  type PhotoReportSection,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/**
 * Every report the web's selector offers, in its order. The value is the URL
 * segment on `/api/photo-reports/{report}`, spelled kebab-case like the rest of
 * this API's routes; the service retries the snake_case spelling once if the
 * server rejects it, so a mismatch self-corrects.
 */
const REPORT_OPTIONS: FilterOption[] = [
  { label: "Photo activity", value: "photo-activity" },
  { label: "Delivery", value: "delivery" },
  { label: "QR codes", value: "qr-codes" },
  { label: "Kiosk", value: "kiosk" },
  { label: "Slideshow", value: "slideshow" },
  { label: "Daily library", value: "daily-library" },
  { label: "Overlays", value: "overlays" },
  { label: "Audit log", value: "audit-log" },
];

/** The web opens on the last 30 days, inclusive of today. */
const DEFAULT_DAY_SPAN = 29;

const defaultRange = (): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - DEFAULT_DAY_SPAN);
  return { from: toKey(start), to: toKey(today) };
};

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** Plain label-over-value tile, as the web renders it — no icon, no hint. */
function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 p-1.5">
      <View
        className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        style={CARD_SHADOW}
      >
        <Text className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </Text>
        <Text
          className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** A record from a list-shaped report, as a label/value card. */
function RecordCard({ row }: { row: PhotoReportRow }) {
  return (
    <View
      className="mb-2 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      style={CARD_SHADOW}
    >
      {row.fields.map((field) => (
        <View
          key={field.key}
          className="flex-row items-start justify-between gap-3 py-1"
        >
          {!!field.label && (
            <Text className="shrink text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {field.label}
            </Text>
          )}
          <Text className="flex-1 text-right text-sm text-gray-800 dark:text-gray-100">
            {field.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One block of a report: its figures as tiles, then its records as cards. */
function ReportSection({ section }: { section: PhotoReportSection }) {
  return (
    <View className="mb-2">
      {!!section.label && (
        <Text className="mb-2 mt-3 text-base font-bold text-gray-900 dark:text-white">
          {section.label}
        </Text>
      )}

      {section.metrics.length > 0 && (
        <View className="-mx-1.5 flex-row flex-wrap">
          {section.metrics.map((metric) => (
            <MetricTile
              key={metric.key}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </View>
      )}

      {section.rows.map((row) => (
        <RecordCard key={`${section.key}-${row.key}`} row={row} />
      ))}
    </View>
  );
}

function ReportSkeleton() {
  const pulse = usePulse();
  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} className="w-1/2 p-1.5">
          <View className="gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <SkeletonBlock pulse={pulse} className="h-3 w-2/3" />
            <SkeletonBlock pulse={pulse} className="h-7 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function PhotoReportsScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  // Photo reports are company_admin / admin / location_manager only.
  const canManage =
    user?.role === "company_admin" ||
    user?.role === "admin" ||
    user?.role === "location_manager";

  const [report, setReport] = useState<string>(REPORT_OPTIONS[0].value as string);
  const [range, setRange] = useState(defaultRange);
  const [sheet, setSheet] = useState<null | "report" | "date">(null);

  const [data, setData] = useState<PhotoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token || !canManage) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchPhotoReport(token, {
          report,
          locationId: effectiveLocationId,
          from: range.from,
          to: range.to,
        }),
      );
    } catch (e) {
      // Also shown in the body — a toast fades, and a failed run must not read
      // as a report with no figures in it.
      const message = errorMessage(e, "Could not run that report.");
      setError(message);
      showToast({ message, type: "error" });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [canManage, effectiveLocationId, range.from, range.to, report, showToast]);

  // First load, on a location change, and on picking a different report —
  // otherwise the previous report's figures would sit under the new report's
  // name until Run was pressed. Editing the dates still waits for Run, as on the
  // web: that is a two-step choice, not one tap.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, effectiveLocationId, report]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run();
    } finally {
      setRefreshing(false);
    }
  }, [run]);

  const sections = data?.sections ?? [];

  const reportLabel =
    REPORT_OPTIONS.find((o) => o.value === report)?.label ??
    REPORT_OPTIONS[0].label;

  const dateLabel = useMemo(
    () => `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`,
    [range.from, range.to],
  );

  const timezoneNote =
    data?.timezoneNote ??
    (data?.timezone
      ? `Date filters are read in ${data.timezone} time.`
      : "Date filters are read in this location's time zone.");

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color="#111827" />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Photo Reports
        </Text>
        <Pressable
          onPress={() => void run()}
          disabled={loading || !canManage}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {loading ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Feather name="refresh-cw" size={18} color="#111827" />
          )}
        </Pressable>
      </View>
    </View>
  );

  if (!canManage) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="lock" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Reports are managed by a manager
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Your role does not have access to the photo reports. Please ask a
              manager if you need these figures.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="mt-5 px-5">
          <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            {timezoneNote}
          </Text>

          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {!!error && (
            <View className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-900/20">
              <Text className="font-semibold text-red-600 dark:text-red-400">
                Something went wrong
              </Text>
              <Text className="mt-1 text-sm text-red-500 dark:text-red-300">
                {error}
              </Text>
            </View>
          )}

          {/* Report · date range — the web's select and its two date inputs. */}
          <FilterPill>
            <PillSegment
              label={reportLabel}
              active={sheet === "report"}
              onPress={() => setSheet("report")}
              renderIcon={(c) => (
                <Feather name="bar-chart-2" size={15} color={c} />
              )}
            />
            <PillSegment
              label={dateLabel}
              active={sheet === "date"}
              onPress={() => setSheet("date")}
              renderIcon={(c) => (
                <Feather name="calendar" size={15} color={c} />
              )}
            />
          </FilterPill>

          {/* Run — the report is fetched when asked for, as on the web. */}
          <Pressable
            onPress={() => void run()}
            disabled={loading}
            className={`mb-5 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90 ${
              loading ? "opacity-60" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel="Run the report"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="refresh-cw" size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-semibold text-white">Run</Text>
          </Pressable>

          {!loaded && loading && <ReportSkeleton />}

          {loaded && !error && sections.length === 0 && (
            <View className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
              <Feather name="bar-chart-2" size={34} color="#D1D5DB" />
              <Text className="mt-3 font-bold text-gray-900 dark:text-white">
                Nothing to report
              </Text>
              <Text className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                {reportLabel} has nothing for this range
                {isCompanyAdmin && activeLocation.id !== "all"
                  ? ` at ${activeLocation.name}`
                  : ""}
                .
              </Text>
            </View>
          )}

          {/* Everything the report returned, in the server's own order. */}
          {sections.map((section) => (
            <ReportSection key={section.key} section={section} />
          ))}
        </View>
      </ScrollView>

      <FilterOptionSheet
        visible={sheet === "report"}
        title="Report"
        value={report}
        options={REPORT_OPTIONS}
        onSelect={(v) => setReport(String(v))}
        onClose={() => setSheet(null)}
      />

      <DateRangeSheet
        visible={sheet === "date"}
        initialStart={range.from}
        initialEnd={range.to}
        onClose={() => setSheet(null)}
        onApply={(from, to) => {
          setRange({ from, to });
          setSheet(null);
        }}
      />

      {!!toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </View>
  );
}
