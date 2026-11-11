import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
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
import { ListErrorBanner } from "../../components/ui/SummaryPanel";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import { getToken } from "../../lib/session";
import {
  fetchMembershipReport,
  type MembershipReport,
} from "../../services/membershipsService";

const PRIMARY = "#0644C7";

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

/** ISO/date -> "6/9/2026". */
function shortDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** One month back to today — the web's default range. */
const lastMonth = () => {
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { from: ymd(start), to: ymd(new Date()) };
};

/** The web's ⓘ tooltips, as a tap-to-read alert. */
function InfoButton({ title, text }: { title: string; text: string }) {
  return (
    <Pressable
      onPress={() => Alert.alert(title, text)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`About ${title}`}
      className="active:opacity-60"
    >
      <Feather name="info" size={14} color="#9CA3AF" />
    </Pressable>
  );
}

/* ----------------------------------------------------------- KPI tiles -- */

type Accent = "blue" | "orange" | "red" | "green";

const ACCENT: Record<Accent, { bg: string; fg: string }> = {
  blue: { bg: "#DBEAFE", fg: "#2563EB" },
  orange: { bg: "#FFEDD5", fg: "#EA580C" },
  red: { bg: "#FEE2E2", fg: "#DC2626" },
  green: { bg: "#DCFCE7", fg: "#16A34A" },
};

type Stat = {
  label: string;
  value: string;
  accent: Accent;
  tooltip: string;
  icon: FeatherIconName;
  /** For an icon Feather lacks (the web's Frozen snowflake). */
  renderIcon?: (color: string) => ReactNode;
};

function StatTile({ stat }: { stat: Stat }) {
  const a = ACCENT[stat.accent];
  return (
    <View className="flex-1 rounded-xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center gap-2">
        <View
          className="h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: a.bg }}
        >
          {stat.renderIcon ? (
            stat.renderIcon(a.fg)
          ) : (
            <Feather name={stat.icon} size={16} color={a.fg} />
          )}
        </View>
        <Text
          numberOfLines={2}
          className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100"
        >
          {stat.label}
        </Text>
        <InfoButton title={stat.label} text={stat.tooltip} />
      </View>
      <Text className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">
        {stat.value}
      </Text>
    </View>
  );
}

function statsFor(r: MembershipReport): Stat[] {
  const c = r.counts;
  return [
    {
      label: "Active",
      value: String(c.active),
      accent: "blue",
      icon: "users",
      tooltip:
        "Currently paying members in good standing. Their card is on file and the current term is active.",
    },
    {
      label: "Past Due",
      value: String(c.pastDue),
      accent: "orange",
      icon: "alert-circle",
      tooltip:
        "Last renewal payment failed. Member is in grace period — auto-retry attempts are scheduled per the plan settings.",
    },
    {
      label: "Suspended",
      value: String(c.suspended),
      accent: "red",
      icon: "x-circle",
      tooltip:
        "Grace period exhausted after failed payments. Access is blocked until payment is updated and a manual reactivation is performed.",
    },
    {
      label: "Frozen",
      value: String(c.frozen),
      accent: "blue",
      icon: "pause-circle",
      renderIcon: (color) => <Ionicons name="snow-outline" size={16} color={color} />,
      tooltip:
        "Member-paused membership. Billing is paused and visits cannot be redeemed until the freeze-until date is reached.",
    },
    {
      label: "New (range)",
      value: String(c.newInRange),
      accent: "green",
      icon: "trending-up",
      tooltip: "Memberships purchased between the selected From and To dates.",
    },
    {
      label: "Canceled (range)",
      value: String(c.canceledInRange),
      accent: "red",
      icon: "x-circle",
      tooltip:
        "Memberships canceled between the selected dates (immediate cancellations + end-of-term effective dates falling in range).",
    },
    {
      label: "MRR",
      value: money(r.mrr),
      accent: "green",
      icon: "dollar-sign",
      tooltip:
        "Monthly Recurring Revenue: sum of active membership prices normalized to a monthly cadence (annual plans / 12, etc.).",
    },
    {
      label: "ARR",
      value: money(r.arr),
      accent: "green",
      icon: "dollar-sign",
      tooltip:
        "Annual Recurring Revenue: MRR × 12. Projection of yearly run-rate from current active members.",
    },
  ];
}

/* ------------------------------------------------------- Section cards -- */

function SectionCard({
  icon,
  iconColor = PRIMARY,
  title,
  tooltip,
  children,
}: {
  icon: FeatherIconName;
  iconColor?: string;
  title: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-4 rounded-xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="mb-3 flex-row items-center gap-2">
        <Feather name={icon} size={16} color={iconColor} />
        <Text className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </Text>
        <InfoButton title={title} text={tooltip} />
      </View>
      {children}
    </View>
  );
}

const NoData = ({ text = "No data." }: { text?: string }) => (
  <Text className="text-sm text-gray-500 dark:text-gray-400">{text}</Text>
);

/** A name on the left, a figure on the right, hairline between rows. */
function ListRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between gap-3 py-2 ${
        last ? "" : "border-b border-gray-100 dark:border-neutral-800"
      }`}
    >
      <Text
        numberOfLines={2}
        className="flex-1 text-sm text-gray-700 dark:text-gray-300"
      >
        {label}
      </Text>
      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </Text>
    </View>
  );
}

function ReportSkeleton() {
  const box = "rounded-xl bg-gray-100 dark:bg-neutral-800";
  return (
    <View>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} className="mb-3 flex-row gap-3">
          <View className={`h-24 flex-1 ${box}`} />
          <View className={`h-24 flex-1 ${box}`} />
        </View>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className={`mb-4 h-36 ${box}`} />
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- Screen -- */

/**
 * Membership Reports — web parity with MembershipReports.tsx: a date range,
 * eight KPI tiles, then Top Plans, Visits by Location, Revenue and Underused
 * Memberships.
 */
const MembershipReports = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [range, setRange] = useState(lastMonth);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

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

  // Loads on open and whenever a range is applied from the date sheet.
  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const dateLabel = `${formatShortDate(range.from)} — ${formatShortDate(range.to)}`;

  // Pull-to-refresh keeps the report on screen; any other load shows skeletons.
  const busy = loading && !refreshing;
  const showReport = !!report && !busy && !error;

  const stats = report ? statsFor(report) : [];
  const statRows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += 2) statRows.push(stats.slice(i, i + 2));

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the web's Apply. */}
      <ModuleHeader
        title="Membership Reports"
        onBack={() => router.back()}
        action={{
          onPress: () => void load(),
          label: "Apply",
          icon: "refresh-cw",
          accessibilityLabel: "Apply the date range",
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

          {/* Date range — the web's range calendar. */}
          <Pressable
            onPress={() => setDateSheetOpen(true)}
            className="mb-4 h-11 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
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

          {!!error && !busy && (
            <ListErrorBanner
              title="Could not load membership reports"
              message={error}
              onRetry={() => void load()}
            />
          )}

          {busy && <ReportSkeleton />}

          {showReport && (
            <>
              {/* KPI tiles, two a row. */}
              <View className="mb-4 gap-3">
                {statRows.map((row) => (
                  <View key={row[0].label} className="flex-row gap-3">
                    {row.map((s) => (
                      <StatTile key={s.label} stat={s} />
                    ))}
                  </View>
                ))}
              </View>

              <SectionCard
                icon="star"
                title="Top Plans"
                tooltip="Plans ranked by total active members."
              >
                {report.topPlans.length === 0 ? (
                  <NoData />
                ) : (
                  report.topPlans.map((p, i) => (
                    <ListRow
                      key={p.id}
                      label={p.name}
                      value={String(p.activeCount)}
                      last={i === report.topPlans.length - 1}
                    />
                  ))
                )}
              </SectionCard>

              <SectionCard
                icon="map-pin"
                title="Visits by Location"
                tooltip="Total member check-ins per location within the selected date range."
              >
                {report.visitsByLocation.length === 0 ? (
                  <NoData />
                ) : (
                  report.visitsByLocation.map((v, i) => (
                    <ListRow
                      key={`${v.locationId}-${i}`}
                      label={v.locationName}
                      value={v.visits.toLocaleString()}
                      last={i === report.visitsByLocation.length - 1}
                    />
                  ))
                )}
              </SectionCard>

              <SectionCard
                icon="dollar-sign"
                iconColor="#16A34A"
                title="Revenue"
                tooltip="Sum of all successfully captured membership payments (initial purchases + renewals) in range. Refunds are not subtracted."
              >
                <Text className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  {prettyDate(report.dateRange.from)} →{" "}
                  {prettyDate(report.dateRange.to)}
                </Text>
                <Text className="text-3xl font-bold text-green-700 dark:text-green-400">
                  {money(report.revenueInRange)}
                </Text>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {report.failedPayments} failed payments in range
                  </Text>
                  <InfoButton
                    title="Failed payments"
                    text="Payment attempts that returned a declined/error response from the gateway. These trigger past-due status and retry scheduling."
                  />
                </View>
              </SectionCard>

              <SectionCard
                icon="activity"
                title="Underused Memberships"
                tooltip="Active members with abnormally low visit counts for the current term — good candidates for retention outreach before they churn."
              >
                {report.underused.length === 0 ? (
                  <NoData text="No underused samples." />
                ) : (
                  report.underused.map((u, i) => {
                    const ends = shortDate(u.termEnds);
                    return (
                      <View
                        key={u.id}
                        className={`flex-row items-start justify-between gap-3 py-2.5 ${
                          i < report.underused.length - 1
                            ? "border-b border-gray-100 dark:border-neutral-800"
                            : ""
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-sm font-medium text-gray-900 dark:text-white"
                          >
                            {u.customerName ?? `Customer #${u.customerId ?? "—"}`}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="text-xs text-gray-500 dark:text-gray-400"
                          >
                            {u.planName ?? `Membership #${u.id}`}
                          </Text>
                          {!!u.customerEmail && (
                            <Text
                              numberOfLines={1}
                              className="text-xs text-gray-400 dark:text-gray-500"
                            >
                              {u.customerEmail}
                            </Text>
                          )}
                        </View>
                        <View className="items-end">
                          <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {u.visitsUsed} / {u.visitsPerTerm} visits
                          </Text>
                          <Text className="text-xs text-gray-400 dark:text-gray-500">
                            {u.visitsRemaining} remaining
                          </Text>
                          {!!ends && (
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              ends {ends}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </SectionCard>
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
