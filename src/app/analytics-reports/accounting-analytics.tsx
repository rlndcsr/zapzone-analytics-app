import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnalyticsPanel,
  PanelEmpty,
  PeriodCaption,
} from "../../components/analytics/CustomerAnalyticsBlocks";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import { SheetSelect } from "../../components/ui/SheetSelect";
import {
  FilterChip,
  ListErrorBanner,
  SummaryPanel,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { ALL_LOCATIONS_SCOPE } from "../../lib/analytics/accountingScope";
import {
  analyticsViewState,
  formatClockTime,
  formatMoney,
  formatNumber,
} from "../../lib/customers/customerAnalyticsDisplay";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken, useCurrentUserRole } from "../../lib/session";
import {
  fetchAccountingReport,
  type AccountingCategory,
  type AccountingCategoryItem,
  type AccountingReport,
} from "../../services/analyticsService";

const PRIMARY = "#0644C7";

/**
 * Report across every location the account can see. The service turns this into
 * the backend's `location_id=all`; the server decides what "every" means, so a
 * manager picking it still only ever sees their own venue.
 */
const ALL_LOCATIONS = ALL_LOCATIONS_SCOPE;

/** Date -> "YYYY-MM-DD" (local). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

type DatePreset = "today" | "yesterday" | "7d" | "month" | "custom";

/** Local start/end dates for a quick pick ("Last 7 days" counts today in). */
function presetDates(preset: Exclude<DatePreset, "custom">, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  switch (preset) {
    case "today":
      return { start: ymd(today), end: ymd(today) };
    case "yesterday":
      return { start: shift(-1), end: shift(-1) };
    case "7d":
      return { start: shift(-6), end: ymd(today) };
    case "month":
      return {
        start: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: ymd(today),
      };
  }
}

const DATE_PRESETS: { value: Exclude<DatePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
];

/** "Nov 16" or "Nov 1 – Nov 16". */
const rangeLabel = (start: string, end: string) =>
  start === end ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`;

const UNCATEGORIZED = "Uncategorized";

type LabelGroup = {
  name: string;
  items: AccountingCategoryItem[];
  /** Only the figures this screen actually shows — not the web's full column set. */
  totals: { quantity: number; grossSales: number };
};

/**
 * Split a section by its item labels: Parties into Birthday / Escape Room,
 * Attractions into Activities / Wristband. Alphabetical, Uncategorized last.
 */
function groupItemsByLabel(items: AccountingCategoryItem[]): LabelGroup[] {
  const groups = new Map<string, AccountingCategoryItem[]>();
  items.forEach((item) => {
    const key = item.subCategory || UNCATEGORIZED;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  });

  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b),
    )
    .map(([name, groupItems]) => ({
      name,
      items: groupItems,
      totals: {
        quantity: groupItems.reduce((sum, it) => sum + it.quantity, 0),
        grossSales: groupItems.reduce((sum, it) => sum + it.grossSales, 0),
      },
    }));
}

/** One expandable category (Parties / Attractions / Events / Add-ons). */
function CategoryRow({
  category,
  first,
}: {
  category: AccountingCategory;
  first: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labelGroups = useMemo(
    () => groupItemsByLabel(category.items),
    [category.items],
  );
  // A single label still gets its heading — otherwise the section reads as a
  // flat list and you cannot tell which label you are looking at. Its totals
  // row is dropped, since it would only restate the section subtotal.
  const showLabelTotals = labelGroups.length > 1;
  return (
    <View className={first ? "" : "border-t border-gray-100 dark:border-neutral-800"}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2 py-3.5 active:opacity-70"
      >
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" />
        <View className="flex-1 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            {category.name}
          </Text>
          {category.informational && (
            <View className="bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Informational
              </Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {formatNumber(category.itemCount)} items
        </Text>
        <Text className="w-24 text-right text-sm font-semibold text-gray-900 dark:text-white">
          {formatMoney(category.total)}
        </Text>
      </Pressable>

      {open && (
        <View className="pb-3 pl-6">
          {category.items.length === 0 ? (
            <PanelEmpty message={`No ${category.name.toLowerCase()} for these dates.`} />
          ) : (
            labelGroups.map((group) => (
              <View key={group.name}>
                <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-2 mb-1">
                  {group.name}
                </Text>
                {group.items.map((it, i) => (
                  <View
                    key={`${it.name}-${i}`}
                    className="flex-row items-start justify-between gap-2 py-1.5"
                  >
                    <Text className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                      {it.name}
                    </Text>
                    <Text className="text-xs text-gray-400 dark:text-gray-500">
                      ×{formatNumber(it.quantity)}
                    </Text>
                    <Text className="w-24 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatMoney(it.grossSales)}
                    </Text>
                  </View>
                ))}
                {showLabelTotals && (
                  <View className="flex-row items-center justify-between gap-2 py-1.5 border-t border-gray-100 dark:border-neutral-800">
                    <Text className="flex-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {group.name} total
                    </Text>
                    <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      ×{formatNumber(group.totals.quantity)}
                    </Text>
                    <Text className="w-24 text-right text-sm font-semibold text-gray-900 dark:text-white">
                      {formatMoney(group.totals.grossSales)}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/** What a successful load was for, so the figures are labelled truthfully. */
type Loaded = { key: string; dates: string; at: Date };

const AccountingAnalytics = () => {
  const insets = useSafeAreaInsets();

  // The report follows the global location, as on the web: a company admin's
  // workspace selection ("All Locations" -> every location), everyone else
  // their own location (the server holds them to it either way).
  const activeLocation = useActiveLocation();
  const isCompanyAdmin = useCurrentUserRole() === "company_admin";
  const ownLocationId = getCurrentUser()?.location_id ?? null;
  const locationId: number | typeof ALL_LOCATIONS = isCompanyAdmin
    ? activeLocation.id === "all"
      ? ALL_LOCATIONS
      : activeLocation.id
    : (ownLocationId ?? ALL_LOCATIONS);

  // Today, as the web opens.
  const [preset, setPreset] = useState<DatePreset>("today");
  const [start, setStart] = useState(() => ymd(new Date()));
  const [end, setEnd] = useState(() => ymd(new Date()));
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [viewMode, setViewMode] = useState<"booked_on" | "booked_for">(
    "booked_on",
  );
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [report, setReport] = useState<AccountingReport | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const currentKey = `${locationId}|${start}|${end}|${viewMode}|${categoryFilter}`;

  // Bumped per load, so changing the location/dates/view quickly shows the last
  // choice's report, not whichever reply happened to arrive last.
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
      const next = await fetchAccountingReport({
        token,
        locationId: locationId === ALL_LOCATIONS ? null : locationId,
        startDate: start,
        endDate: end || undefined,
        viewMode,
        categoryFilter: categoryFilter || undefined,
      });
      if (!isCurrent()) return;
      setReport(next);
      setLoaded({ key: currentKey, dates: rangeLabel(start, end), at: new Date() });

      if (!categoryFilter) {
        setAvailableCategories(
          [
            ...new Set(
              next.categories
                .flatMap((c) => c.items.map((it) => it.subCategory))
                .filter((name) => !!name && name !== UNCATEGORIZED),
            ),
          ].sort((a, b) => a.localeCompare(b)),
        );
      }
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [locationId, start, end, viewMode, categoryFilter, currentKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const view = analyticsViewState({
    loading,
    error,
    hasData: !!report,
    loadedKey: loaded?.key ?? null,
    currentKey,
  });

  const pickPreset = (p: Exclude<DatePreset, "custom">) => {
    const d = presetDates(p);
    setPreset(p);
    setStart(d.start);
    setEnd(d.end);
  };

  // The scope the server actually ran on, which is not always the one asked
  // for — a manager picking All Locations still gets their own.
  const scope = report?.locationName
    ? `${report.locationName}${report.locationCount > 1 ? ` · ${report.locationCount} locations` : ""}`
    : undefined;

  const figures: SummaryFigure[] = useMemo(() => {
    const s = report?.summary;
    const money = (n: number | undefined) => formatMoney(n ?? 0);
    return [
      { icon: "hash", title: "Qty Sold", value: formatNumber(s?.qtySold ?? 0), hint: "" },
      { icon: "dollar-sign", title: "Gross Sales", value: money(s?.grossSales), hint: "" },
      { icon: "tag", title: "Discounts", value: `-${money(s?.discounts)}`, hint: "" },
      { icon: "file-text", title: "Net Sales", value: money(s?.netSales), hint: "" },
      { icon: "percent", title: "Fees", value: money(s?.fees), hint: "" },
      { icon: "briefcase", title: "Tax", value: money(s?.tax), hint: "" },
      { icon: "file", title: "Total Billed", value: money(s?.totalBilled), hint: "" },
      { icon: "dollar-sign", title: "Collected", value: money(s?.collected), hint: "" },
      { icon: "credit-card", title: "Authorize Payment", value: money(s?.authorizePayment), hint: "" },
      { icon: "credit-card", title: "Gateway Net", value: money(s?.gatewayNet), hint: "" },
    ];
  }, [report]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Accounting & Analytics"
        action={{
          onPress: () => void load(),
          accessibilityLabel: "Refresh the report",
          label: "Refresh",
          icon: "refresh-cw",
        }}
      />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        <View className="px-4 mt-4 gap-4">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Purchases made on the selected dates
          </Text>

          {/* Dates, date basis and category. */}
          <View>
            {/* The web's date-range calendar: shows the range, tap to pick. */}
            <Pressable
              onPress={() => setShowDateSheet(true)}
              className="mb-3 h-11 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel={`Dates, ${rangeLabel(start, end)}. Change dates`}
            >
              <Feather name="calendar" size={16} color="#9CA3AF" />
              <Text numberOfLines={1} className="flex-1 text-sm text-gray-900 dark:text-white">
                {rangeLabel(start, end)}
              </Text>
              <Feather name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 4, gap: 8 }}
              className="-mx-1 px-1"
            >
              {/* Quick picks; any other range comes from the calendar above. */}
              {DATE_PRESETS.map((p) => (
                <FilterChip
                  key={p.value}
                  label={p.label}
                  selected={preset === p.value}
                  onPress={() => pickPreset(p.value)}
                />
              ))}
            </ScrollView>

            {/* The web's "Created On" / "Booked For" switch. */}
            <View className="flex-row flex-wrap items-center gap-2 mt-3">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">
                Date basis
              </Text>
              <FilterChip
                label="Created On"
                selected={viewMode === "booked_on"}
                onPress={() => setViewMode("booked_on")}
              />
              <FilterChip
                label="Booked For"
                selected={viewMode === "booked_for"}
                onPress={() => setViewMode("booked_for")}
              />
            </View>

            {/* Narrows Parties and Attractions server-side. Events and Add-ons
                are reported whole whatever is picked here — the backend does
                not filter those two sections. */}
            <View className="mt-3">
              <SheetSelect
                icon="tag"
                title="Category"
                value={categoryFilter}
                options={[
                  { label: "All categories", value: "" },
                  ...availableCategories.map((name) => ({ label: name, value: name })),
                ]}
                onSelect={(v) => setCategoryFilter(String(v))}
              />
            </View>

            {view.body === "content" && loaded && (
              <PeriodCaption
                stale={view.stale}
                updating={view.updating && !refreshing}
                shownPeriod={loaded.dates}
                requestedPeriod={rangeLabel(start, end)}
                location={scope}
                updatedAt={formatClockTime(loaded.at)}
              />
            )}
          </View>

          {view.body === "skeleton" && <AnalyticsSkeleton tiles={10} panels={1} />}

          {view.body === "error" && (
            <ListErrorBanner
              title="Couldn't load the accounting report"
              message={error ?? "Something went wrong."}
              onRetry={() => void load()}
            />
          )}

          {view.banner && (
            <ListErrorBanner
              title={view.stale ? "Couldn't load that selection" : "Couldn't refresh the report"}
              message={
                view.stale
                  ? `${error} The figures below are still for ${loaded?.dates ?? "the earlier selection"}.`
                  : `${error} Showing the figures from ${loaded ? formatClockTime(loaded.at) : "earlier"}.`
              }
              onRetry={() => void load()}
            />
          )}

          {view.body === "content" && report && (
            // Figures for another selection are dimmed and can't be tapped, so
            // they can't pass for the one above.
            <View
              style={{ opacity: view.stale ? 0.45 : 1 }}
              pointerEvents={view.stale ? "none" : "auto"}
              className="gap-4"
            >
              <SummaryPanel figures={figures} />

              {/* Where the Discounts figure came from — the web's "Discounts by
                  source" strip, from the report's discount_by_source. */}
              {!!report.summary.discountBySource && (
                <AnalyticsPanel icon="tag" title="Discounts by source">
                  {(
                    [
                      ["Special Pricing", report.summary.discountBySource.specialPricing],
                      ["Membership", report.summary.discountBySource.membership],
                      ["Promo", report.summary.discountBySource.promo],
                      ["Gift Card", report.summary.discountBySource.giftCard],
                      ["Other", report.summary.discountBySource.other],
                    ] as [string, number][]
                  ).map(([label, value], i) => (
                    <View
                      key={label}
                      className={`flex-row items-center justify-between py-2.5 ${
                        i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                      }`}
                    >
                      <Text className="text-sm text-gray-700 dark:text-gray-200">{label}</Text>
                      <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
                        -{formatMoney(value)}
                      </Text>
                    </View>
                  ))}
                </AnalyticsPanel>
              )}

              <AnalyticsPanel
                icon="layers"
                title="Sales by Category"
                subtitle="Breakdown by Parties, Attractions, Events, and Add-ons"
              >
                {report.categories.length === 0 ? (
                  <PanelEmpty message="No sales for these dates." />
                ) : (
                  report.categories.map((c, i) => (
                    <CategoryRow key={c.name} category={c} first={i === 0} />
                  ))
                )}
              </AnalyticsPanel>
            </View>
          )}
        </View>
      </ScrollView>

      <DateRangeSheet
        visible={showDateSheet}
        initialStart={start}
        initialEnd={end}
        onClose={() => setShowDateSheet(false)}
        onApply={(s, e) => {
          setPreset("custom");
          setStart(s);
          setEnd(e);
          setShowDateSheet(false);
        }}
      />
    </View>
  );
};

export default AccountingAnalytics;
