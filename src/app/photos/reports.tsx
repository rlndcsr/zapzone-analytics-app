import { Feather } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
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
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import {
  PhotoReportAuditList,
  PhotoReportDaysList,
  PhotoReportRecordsList,
  readableLabel,
} from "../../components/ui/PhotoReportTables";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import { toKey } from "../../lib/date/calendar";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchPhotoReport,
  type PhotoReport,
  type PhotoReportMetric,
  type PhotoReportSection,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const REPORT_OPTIONS = [
  { label: "Photo activity", value: "activity" },
  { label: "Delivery", value: "delivery" },
  { label: "QR codes", value: "qr" },
  { label: "Kiosk", value: "kiosk" },
  { label: "Slideshow", value: "slideshow" },
  { label: "Daily library", value: "library" },
  { label: "Overlays", value: "overlay" },
  { label: "Audit log", value: "audit" },
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

/** Short enough for a summary cell's big figure; longer text gets a row. */
const isFigure = (value: string) => value.length <= 12;

/** First match wins, so the more specific words come first. */
const METRIC_ICONS: [RegExp, FeatherIconName][] = [
  [/fail|error|bounce|reject/, "alert-triangle"],
  [/download/, "download"],
  [/email/, "mail"],
  [/sms|text/, "message-square"],
  [/qr|scan/, "maximize"],
  [/kiosk/, "tablet"],
  [/slideshow|screen|display/, "monitor"],
  [/overlay|frame/, "layers"],
  [/deliver|sent|send/, "send"],
  [/hidden|hide/, "eye-off"],
  [/view|open/, "eye"],
  [/session|capture|camera/, "camera"],
  [/photo|image|upload/, "image"],
  [/rate|percent/, "percent"],
  [/day|date/, "calendar"],
  [/user|staff|customer|guest/, "users"],
];

const metricIcon = (key: string): FeatherIconName =>
  METRIC_ICONS.find(([re]) => re.test(key.toLowerCase()))?.[1] ?? "bar-chart-2";

const toFigure = (m: PhotoReportMetric, hint: string): SummaryFigure => ({
  icon: metricIcon(m.key),
  title: readableLabel(m.label),
  value: m.value,
  hint,
});

/** Text values too long for a summary cell, as one bordered list. */
function DetailsCard({ metrics }: { metrics: PhotoReportMetric[] }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {metrics.map((m, i) => (
        <View
          key={m.key}
          className={`flex-row items-start justify-between gap-3 px-4 py-3 ${
            i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
          }`}
        >
          <View className="shrink flex-row items-center gap-1.5">
            <Feather name={metricIcon(m.key)} size={13} color="#9CA3AF" />
            <Text className="shrink text-xs font-medium text-gray-500 dark:text-gray-400">
              {readableLabel(m.label)}
            </Text>
          </View>
          <Text className="flex-1 text-right text-sm text-gray-900 dark:text-white">
            {m.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A block of figures: summary panel for the short ones, rows for the rest. */
function FiguresBlock({
  metrics,
  hint,
}: {
  metrics: PhotoReportMetric[];
  hint: string;
}) {
  const figures = metrics.filter((m) => isFigure(m.value));
  const details = metrics.filter((m) => !isFigure(m.value));
  return (
    <View className="gap-3">
      {figures.length > 0 && (
        <SummaryPanel figures={figures.map((m) => toFigure(m, hint))} />
      )}
      {details.length > 0 && <DetailsCard metrics={details} />}
    </View>
  );
}

/**
 * A list in the Manage Attractions layout: title + count with the Table/Cards
 * toggle, the rows, then the pager. Each list pages on its own.
 */
function PagedList<T>({
  title,
  subtitle,
  items,
  mode,
  onModeChange,
  children,
}: {
  title: string;
  subtitle?: string;
  items: T[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  children: (paged: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  // Back to the first page whenever the rows or page size change.
  useEffect(() => {
    setPage(1);
  }, [items, perPage]);

  const paged = useMemo(
    () => items.slice((page - 1) * perPage, page * perPage),
    [items, page, perPage],
  );

  return (
    <View className="mb-4">
      <ListHeader title={title} count={items.length}>
        <ViewToggle mode={mode} onChange={onModeChange} />
      </ListHeader>
      {!!subtitle && (
        <Text className="-mt-1.5 mb-3 text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </Text>
      )}
      {children(paged)}
      <Pagination
        page={page}
        perPage={perPage}
        total={items.length}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
      />
    </View>
  );
}

const hasContent = (s: PhotoReportSection) =>
  s.metrics.length > 0 || s.rows.length > 0;

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
  // Same gate as the Photos hub's manager-only modules (Photo Settings).
  const canManageSubModules =
    user?.role === "company_admin" || user?.role === "location_manager";

  const [report, setReport] = useState<string>(REPORT_OPTIONS[0].value);
  const [range, setRange] = useState(defaultRange);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [data, setData] = useState<PhotoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bumped per run, so switching report/dates/location quickly shows the last
  // choice's figures, not whichever reply happened to arrive last.
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token || !canManage) return;
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPhotoReport(token, {
        report,
        locationId: effectiveLocationId,
        from: range.from,
        to: range.to,
      });
      if (isCurrent()) setData(next);
    } catch (e) {
      if (isCurrent()) {
        setError(errorMessage(e, "Could not run that report."));
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [canManage, effectiveLocationId, range.from, range.to, report]);

  // Runs on open and whenever the report, date range or location changes.
  useEffect(() => {
    void run();
  }, [run]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run();
    } finally {
      setRefreshing(false);
    }
  }, [run]);

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

  // Pull-to-refresh keeps the report on screen; any other run shows skeletons,
  // so a new report's name never sits over the previous report's figures.
  const busy = loading && !refreshing;
  const showReport = !!data && !error && !busy;

  const sections = data?.sections ?? [];
  const root = sections.find((s) => s.label === null) ?? null;
  const nested = sections.filter((s) => s.label !== null && hasContent(s));
  const byDay = data?.byDay ?? [];
  const auditEntries = data?.auditEntries ?? [];
  // The web shows the audit table (with its own empty state) for that report.
  const isAudit = report === "audit";
  const showEmpty =
    showReport &&
    !isAudit &&
    !(root && hasContent(root)) &&
    nested.length === 0 &&
    byDay.length === 0;

  const moreShortcuts: HubQuickLink[] = [
    { label: "Photo Library", icon: "image", route: "/photos/library" },
    { label: "Delivery Log", icon: "send", route: "/photos/delivery-log" },
    {
      label: "Slideshow Queue",
      icon: "monitor",
      route: "/photos/slideshow-queue",
    },
    ...(canManageSubModules
      ? [
          {
            label: "Photo Settings",
            icon: "settings",
            route: "/photos/settings",
          } as HubQuickLink,
        ]
      : []),
  ];

  if (!canManage) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <ModuleHeader title="Photo Reports" />
        <View className="mt-4 px-4">
          <ListEmptyState
            icon="lock"
            title="Reports are managed by a manager"
            message="Your role does not have access to the photo reports. Please ask a manager if you need these figures."
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and Run (the web's Run button). */}
      <ModuleHeader
        title="Photo Reports"
        action={{
          onPress: () => void run(),
          label: "Run",
          icon: "refresh-cw",
          accessibilityLabel: "Run the report",
        }}
      />

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
        <View className="mt-4 px-4">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Capture, delivery, QR, kiosk and slideshow stats
          </Text>
          <Text className="mb-4 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {timezoneNote}
          </Text>

          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {!!error && !busy && (
            <ListErrorBanner
              title={`Could not run ${reportLabel}`}
              message={error}
              onRetry={() => void run()}
            />
          )}

          {/* Summary — the report's top-level figures in one panel. */}
          {busy ? (
            <AttractionsSummarySkeleton />
          ) : (
            showReport &&
            root &&
            root.metrics.length > 0 && (
              <FiguresBlock metrics={root.metrics} hint={dateLabel} />
            )
          )}

          {/* More — the other Photos screens as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Date range — the web's two date inputs. */}
          <View className="mb-3 mt-4 flex-row items-center gap-2">
            <Pressable
              onPress={() => setDateSheetOpen(true)}
              className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel={`Date range, ${dateLabel}`}
            >
              <Feather name="calendar" size={16} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="flex-1 text-sm text-gray-900 dark:text-white"
              >
                {dateLabel}
              </Text>
              <Feather name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Report chips — the web's report select. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="-mx-1 mb-4 px-1"
          >
            {REPORT_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                selected={report === opt.value}
                onPress={() => setReport(opt.value)}
              />
            ))}
          </ScrollView>

          {busy &&
            (viewMode === "table" ? (
              <AttractionsTableSkeleton />
            ) : (
              <AttractionsListSkeleton />
            ))}

          {showEmpty && (
            <ListEmptyState
              icon="bar-chart-2"
              title="Nothing to report"
              message={`${reportLabel} has nothing for this range${
                isCompanyAdmin && activeLocation.id !== "all"
                  ? ` at ${activeLocation.name}`
                  : ""
              }.`}
              actionLabel="Change dates"
              actionIcon="calendar"
              onAction={() => setDateSheetOpen(true)}
            />
          )}

          {showReport && (
            <>
              {/* Top-level records, if the report returned any. */}
              {root && root.rows.length > 0 && (
                <PagedList
                  title="Records"
                  items={root.rows}
                  mode={viewMode}
                  onModeChange={setViewMode}
                >
                  {(paged) => (
                    <PhotoReportRecordsList rows={paged} mode={viewMode} />
                  )}
                </PagedList>
              )}

              {/* Every nested block, in the server's own order. */}
              {nested.map((section) => (
                <View key={section.key}>
                  {section.metrics.length > 0 && (
                    <View className="mb-4">
                      <Text className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
                        {readableLabel(section.label ?? "")}
                      </Text>
                      <FiguresBlock metrics={section.metrics} hint={dateLabel} />
                    </View>
                  )}
                  {section.rows.length > 0 && (
                    <PagedList
                      title={readableLabel(section.label ?? "Records")}
                      items={section.rows}
                      mode={viewMode}
                      onModeChange={setViewMode}
                    >
                      {(paged) => (
                        <PhotoReportRecordsList rows={paged} mode={viewMode} />
                      )}
                    </PagedList>
                  )}
                </View>
              ))}

              {byDay.length > 0 && (
                <PagedList
                  title="Photos by operating day"
                  items={byDay}
                  mode={viewMode}
                  onModeChange={setViewMode}
                >
                  {(paged) => (
                    <PhotoReportDaysList days={paged} mode={viewMode} />
                  )}
                </PagedList>
              )}

              {isAudit &&
                (auditEntries.length > 0 ? (
                  <PagedList
                    title="Audit log"
                    subtitle="Every capture, delivery, download, staff resend, hide and passcode change."
                    items={auditEntries}
                    mode={viewMode}
                    onModeChange={setViewMode}
                  >
                    {(paged) => (
                      <PhotoReportAuditList entries={paged} mode={viewMode} />
                    )}
                  </PagedList>
                ) : (
                  <ListEmptyState
                    icon="file-text"
                    title="No audit entries"
                    message="Nothing recorded in this range."
                    actionLabel="Change dates"
                    actionIcon="calendar"
                    onAction={() => setDateSheetOpen(true)}
                  />
                ))}
            </>
          )}
        </View>
      </ScrollView>

      <DateRangeSheet
        visible={dateSheetOpen}
        initialStart={range.from}
        initialEnd={range.to}
        onClose={() => setDateSheetOpen(false)}
        onApply={(from, to) => {
          setRange({ from, to });
          setDateSheetOpen(false);
        }}
      />
    </View>
  );
}
