import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import {
  FilterChip,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  ToneDotBadge,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import { getToken } from "../../lib/session";
import {
  fetchMembershipReport,
  type MembershipReport,
} from "../../services/membershipsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/** Date -> "YYYY-MM-DD" (local). */
function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO/date -> "Jun 9, 2026". */
function prettyDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The last `days` days up to today. 30 matches the web's default range. */
const lastDays = (days: number) => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { from: ymd(start), to: ymd(new Date()) };
};

/** Quick ranges over the same From/To the date field sets. */
const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
];

/* ----------------------------------------------- Manage Attractions table -- */

const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 56;
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";
const CELL_STRONG = "text-sm font-semibold text-gray-900 dark:text-white";

type Column<T> = {
  key: string;
  label: string;
  width: number;
  render: (row: T) => ReactNode;
};

/** Bordered table: grey header row, hairline rows, sideways scroll. */
function Table<T>({
  columns,
  rows,
  keyOf,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
}) {
  const width = columns.reduce((sum, c) => sum + c.width, 0);
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ minWidth: width }}>
          <View
            className="flex-row items-center border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/50"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {columns.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row, i) => (
            <View
              key={keyOf(row, i)}
              className={`flex-row items-center ${
                i < rows.length - 1
                  ? "border-b border-gray-100 dark:border-neutral-800"
                  : ""
              }`}
              style={{ minHeight: ROW_MIN_HEIGHT }}
            >
              {columns.map((col) => (
                <View
                  key={col.key}
                  className="justify-center px-4 py-3"
                  style={{ width: col.width }}
                >
                  {col.render(row)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** One row as a bordered card: title, optional badge, label/value rows. */
function RowCard({
  title,
  badge,
  fields,
}: {
  title: string;
  badge?: ReactNode;
  fields: { label: string; value: string }[];
}) {
  return (
    <View className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          numberOfLines={2}
          className="shrink text-base font-semibold text-gray-900 dark:text-white"
        >
          {title}
        </Text>
        {badge}
      </View>
      {fields.length > 0 && (
        <View className="mt-3 border-t border-gray-100 pt-2 dark:border-neutral-800">
          {fields.map((f) => (
            <View
              key={f.label}
              className="flex-row items-start justify-between gap-3 py-1"
            >
              <Text className="shrink text-xs text-gray-500 dark:text-gray-400">
                {f.label}
              </Text>
              <Text className="flex-1 text-right text-sm text-gray-900 dark:text-white">
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * A list in the Manage Attractions layout: title + count with the Table/Cards
 * toggle, the rows (or an empty card), then the pager. Each list pages alone.
 */
function PagedList<T>({
  title,
  items,
  mode,
  onModeChange,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  children,
}: {
  title: string;
  items: T[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  emptyIcon: FeatherIconName;
  emptyTitle: string;
  emptyMessage: string;
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
        {items.length > 0 && <ViewToggle mode={mode} onChange={onModeChange} />}
      </ListHeader>
      {items.length === 0 ? (
        <ListEmptyState
          icon={emptyIcon}
          title={emptyTitle}
          message={emptyMessage}
        />
      ) : (
        <>
          {children(paged)}
          <Pagination
            page={page}
            perPage={perPage}
            total={items.length}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </>
      )}
    </View>
  );
}

type TopPlan = MembershipReport["topPlans"][number];
type LocationVisits = MembershipReport["visitsByLocation"][number];
type Underused = MembershipReport["underused"][number];

const PLAN_COLUMNS: Column<TopPlan>[] = [
  {
    key: "plan",
    label: "Plan",
    width: 220,
    render: (p) => (
      <Text numberOfLines={2} className={CELL_STRONG}>
        {p.name}
      </Text>
    ),
  },
  {
    key: "price",
    label: "Price",
    width: 120,
    render: (p) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {money(p.price)}
      </Text>
    ),
  },
];

const LOCATION_COLUMNS: Column<LocationVisits>[] = [
  {
    key: "location",
    label: "Location",
    width: 220,
    render: (v) => (
      <Text numberOfLines={2} className={CELL_STRONG}>
        {v.locationName}
      </Text>
    ),
  },
  {
    key: "visits",
    label: "Visits",
    width: 120,
    render: (v) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {v.visits.toLocaleString()}
      </Text>
    ),
  },
];

const usageLabel = (u: Underused) => `${u.visitsUsed}/${u.visitsPerTerm} used`;

const UNDERUSED_COLUMNS: Column<Underused>[] = [
  {
    key: "member",
    label: "Member",
    width: 180,
    render: (u) => (
      <Text numberOfLines={2} className={CELL_STRONG}>
        {u.customerName ?? "Member"}
      </Text>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    width: 180,
    render: (u) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {u.planName ?? "—"}
      </Text>
    ),
  },
  {
    key: "used",
    label: "Used",
    width: 140,
    render: (u) => <ToneDotBadge tone="amber" label={usageLabel(u)} />,
  },
  {
    key: "remaining",
    label: "Remaining",
    width: 110,
    render: (u) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {u.visitsRemaining}
      </Text>
    ),
  },
];

const MembershipReports = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Default to the last 30 days (matching the web's default range).
  const [range, setRange] = useState(() => lastDays(30));
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [report, setReport] = useState<MembershipReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Bumped per load, so picking ranges quickly shows the last choice's
  // figures, not whichever reply happened to arrive last.
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
    setError(null);
    try {
      const next = await fetchMembershipReport({
        token,
        from: range.from || undefined,
        to: range.to || undefined,
      });
      if (isCurrent()) setReport(next);
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [range.from, range.to]);

  // Loads on open and whenever a range is applied (date sheet or chip) —
  // both are explicit choices, like the old Apply button.
  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const dateLabel = `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
  const activePreset = PRESETS.find((p) => {
    const r = lastDays(p.days);
    return r.from === range.from && r.to === range.to;
  });

  const figures: SummaryFigure[] = useMemo(() => {
    const c = report?.counts;
    const rangeHint = report
      ? `${prettyDate(report.dateRange.from)} → ${prettyDate(report.dateRange.to)}`
      : "Selected range";
    const failed = report?.failedPayments ?? 0;
    return [
      { icon: "users", title: "Active", value: String(c?.active ?? 0), hint: "Current members" },
      { icon: "alert-triangle", title: "Past Due", value: String(c?.pastDue ?? 0), hint: "Payment overdue" },
      { icon: "x-circle", title: "Suspended", value: String(c?.suspended ?? 0), hint: "Access suspended" },
      { icon: "pause-circle", title: "Frozen", value: String(c?.frozen ?? 0), hint: "On hold" },
      { icon: "trending-up", title: "New (range)", value: String(c?.newInRange ?? 0), hint: "Joined in range" },
      { icon: "x-circle", title: "Canceled (range)", value: String(c?.canceledInRange ?? 0), hint: "Canceled in range" },
      { icon: "dollar-sign", title: "MRR", value: money(report?.mrr ?? 0), hint: "Monthly recurring" },
      { icon: "dollar-sign", title: "ARR", value: money(report?.arr ?? 0), hint: "Annual recurring" },
      { icon: "credit-card", title: "Revenue", value: money(report?.revenueInRange ?? 0), hint: rangeHint },
      {
        icon: "alert-circle",
        title: "Failed Payments",
        value: String(failed),
        hint: `Failed payment${failed === 1 ? "" : "s"} in range`,
      },
    ];
  }, [report]);

  // Pull-to-refresh keeps the report on screen; any other load shows skeletons.
  const busy = loading && !refreshing;
  const showReport = !!report && !busy && !error;

  const moreShortcuts: HubQuickLink[] = [
    {
      label: "Manage Memberships",
      icon: "credit-card",
      route: "/memberships/memberships",
    },
    {
      label: "Membership Plans",
      icon: "layers",
      route: "/memberships/membership-plan",
    },
    {
      label: "Add Member",
      icon: "user-plus",
      route: "/memberships/memberships?add=1",
    },
    {
      label: "New Plan",
      icon: "plus",
      route: "/memberships/membership-plan?create=1",
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and Run (the old Apply button). */}
      <ModuleHeader
        title="Membership Reports"
        onBack={() => router.back()}
        action={{
          onPress: () => void load(),
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
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            KPIs, revenue, and engagement for the selected range
          </Text>

          {!!error && !busy && (
            <ListErrorBanner
              title="Could not load membership reports"
              message={error}
              onRetry={() => void load()}
            />
          )}

          {/* Summary — every headline figure in one panel. */}
          {busy ? (
            <AttractionsSummarySkeleton />
          ) : (
            showReport && <SummaryPanel figures={figures} />
          )}

          {/* More — the other Memberships screens as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Date range — the web's From / To inputs. */}
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

          {/* Quick ranges. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="-mx-1 mb-4 px-1"
          >
            {PRESETS.map((p) => (
              <FilterChip
                key={p.days}
                label={p.label}
                selected={activePreset?.days === p.days}
                onPress={() => setRange(lastDays(p.days))}
              />
            ))}
            <FilterChip
              label="Custom"
              selected={!activePreset}
              onPress={() => setDateSheetOpen(true)}
            />
          </ScrollView>

          {busy &&
            (viewMode === "table" ? (
              <AttractionsTableSkeleton />
            ) : (
              <AttractionsListSkeleton />
            ))}

          {showReport && (
            <>
              <PagedList
                title="Top Plans"
                items={report.topPlans}
                mode={viewMode}
                onModeChange={setViewMode}
                emptyIcon="star"
                emptyTitle="No plans yet"
                emptyMessage="No plan data for this range."
              >
                {(paged) =>
                  viewMode === "table" ? (
                    <Table
                      columns={PLAN_COLUMNS}
                      rows={paged}
                      keyOf={(p) => String(p.id)}
                    />
                  ) : (
                    paged.map((p) => (
                      <RowCard
                        key={p.id}
                        title={p.name}
                        fields={[{ label: "Price", value: money(p.price) }]}
                      />
                    ))
                  )
                }
              </PagedList>

              <PagedList
                title="Visits by Location"
                items={report.visitsByLocation}
                mode={viewMode}
                onModeChange={setViewMode}
                emptyIcon="map-pin"
                emptyTitle="No visits"
                emptyMessage="No member visits recorded in this range."
              >
                {(paged) =>
                  viewMode === "table" ? (
                    <Table
                      columns={LOCATION_COLUMNS}
                      rows={paged}
                      keyOf={(v, i) => `${v.locationId}-${i}`}
                    />
                  ) : (
                    paged.map((v, i) => (
                      <RowCard
                        key={`${v.locationId}-${i}`}
                        title={v.locationName}
                        fields={[
                          { label: "Visits", value: v.visits.toLocaleString() },
                        ]}
                      />
                    ))
                  )
                }
              </PagedList>

              <PagedList
                title="Underused Memberships"
                items={report.underused}
                mode={viewMode}
                onModeChange={setViewMode}
                emptyIcon="activity"
                emptyTitle="No underused memberships"
                emptyMessage="No underused samples for this range."
              >
                {(paged) =>
                  viewMode === "table" ? (
                    <Table
                      columns={UNDERUSED_COLUMNS}
                      rows={paged}
                      keyOf={(u) => String(u.id)}
                    />
                  ) : (
                    paged.map((u) => (
                      <RowCard
                        key={u.id}
                        title={u.customerName ?? "Member"}
                        badge={<ToneDotBadge tone="amber" label={usageLabel(u)} />}
                        fields={[
                          { label: "Plan", value: u.planName ?? "—" },
                          {
                            label: "Remaining",
                            value: String(u.visitsRemaining),
                          },
                        ]}
                      />
                    ))
                  )
                }
              </PagedList>
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
};

export default MembershipReports;
