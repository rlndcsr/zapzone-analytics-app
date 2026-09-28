import type {
  BreakdownItem,
  BreakdownKey,
  DashboardData,
  DashboardTotals,
} from "../../services/metricsService";
import {
  bookingStatusLabel,
  buildBreakdown,
  countBreakdown,
  rescaleBreakdown,
} from "./breakdowns.ts";

// Role-based dashboard config: the web renders a component per role, mobile
// drives one screen from this so role logic (cards, endpoint, etc.) lives here.

/** Which backend metrics endpoint powers the dashboard for a role. */
export type MetricsSource = "dashboard" | "attendant";

export type MetricFormat = "number" | "currency";

export type SubtitleFn = (metrics: DashboardTotals) => string;

export type MetricCardDef = {
  key: string;
  title: string;
  valueField: keyof DashboardTotals;
  /** Field used when `valueField` is absent/NaN in the response (mirrors the
   *  web's `metrics.a ?? metrics.b`, e.g. attraction tickets → orders). */
  fallbackField?: keyof DashboardTotals;
  format: MetricFormat;
  breakdownKey?: BreakdownKey;
  /** Extra breakdowns rendered above the main one, in order (the web's "By
   *  status" block on Packages, status + age brackets on Waivers). */
  secondaryBreakdowns?: { key: BreakdownKey; label: string }[];
  /** Heading for the main breakdown, shown when a card has several sections. */
  breakdownSectionLabel?: string;
  subtitle?: SubtitleFn;
  icon: string;
  color: string;
  gradient: [string, string];
  /**
   * Plain-language explanation of what this metric counts, shown when the user
   * taps the card's info icon. Written to match how the backend
   * (MetricsController) actually computes the value.
   */
  info: string;
};

// Subtitle metric-part builders — reproduce the web's strings (timeframe
// appended by the renderer); unnamed `$`-fields read via the index signature.
const amount = (metrics: DashboardTotals, key: string): number =>
  Number(metrics[key] ?? 0);

const participantsPart: SubtitleFn = (m) =>
  `${m.totalParticipants} participants`;
// Company-admin Packages sub-line: "N confirmed · M pending" (web wording).
const confirmedPendingPart: SubtitleFn = (m) =>
  `${m.confirmedBookings} confirmed · ${m.pendingBookings} pending`;
const completedPart: SubtitleFn = (m) => `Completed: ${m.completedBookings}`;
const newCustomersPart: SubtitleFn = (m) => `${m.newCustomers ?? 0} new`;
const eventTicketsPart: SubtitleFn = (m) => `${m.totalEventTickets} tickets`;
// Attractions "Sold" counts tickets; the sub-line shows how many orders they
// came from (matches the web's `${totalPurchases} orders`).
const attractionOrdersPart: SubtitleFn = (m) => `${m.totalPurchases} orders`;
// Waivers sub-line: "N signed · M pending" (web wording).
const signedPendingPart: SubtitleFn = (m) =>
  `${m.completedWaivers ?? 0} signed · ${m.pendingWaivers ?? 0} pending`;
// The manager dashboard's own separator for the same line.
const managerSignedPendingPart: SubtitleFn = (m) =>
  `${m.completedWaivers ?? 0} signed • ${m.pendingWaivers ?? 0} pending`;

// Total Revenue (manager and attendant): "Bkgs: $X • Tix: $Y[ • Events: $Z]" (rounded).
const revenuePart: SubtitleFn = (m) => {
  const base = `Bkgs: $${Math.round(amount(m, "bookingRevenue"))} • Tix: $${Math.round(
    amount(m, "purchaseRevenue"),
  )}`;
  const events = amount(m, "eventPurchaseRevenue");
  return events > 0 ? `${base} • Events: $${Math.round(events)}` : base;
};

// Manager Avg Booking: "N tickets sold[ • M event tickets]".
const avgBookingPart: SubtitleFn = (m) => {
  const base = `${m.totalPurchases} tickets sold`;
  return m.totalEventTickets > 0
    ? `${base} • ${m.totalEventTickets} event tickets`
    : base;
};

// Attendant Ticket Sales: "N tickets • $X.XX" — the card counts orders, the
// sub-line the tickets inside them and what they took.
const ticketSalesPart: SubtitleFn = (m) =>
  `${m.totalAttractionTickets ?? 0} tickets • $${amount(m, "purchaseRevenue").toFixed(2)}`;

/**
 * Catalog of every KPI card used by any role. Roles reference these by key, so
 * a card's look/value lives in exactly one spot.
 */
export const METRIC_CARDS = {
  packages: {
    key: "packages",
    title: "Packages",
    valueField: "totalBookings",
    format: "number",
    breakdownKey: "packageBreakdown",
    secondaryBreakdowns: [
      { key: "packageStatusBreakdown", label: "By status" },
    ],
    breakdownSectionLabel: "By package",
    subtitle: participantsPart,
    icon: "box.png",
    color: "#1E40AF",
    gradient: ["#1E40AF", "#3B82F6"],
    info: "All package bookings placed in the selected period, counted by the date the booking was made (not the party date). Excludes cancelled bookings but still includes pending ones, so this total is higher than the confirmed count. Open the card for the split by status and by package.",
  },
  participants: {
    key: "participants",
    title: "Party Participants",
    valueField: "totalParticipants",
    format: "number",
    breakdownKey: "participantBreakdown",
    subtitle: () => "From package bookings",
    icon: "group.png",
    color: "#1D4ED8",
    gradient: ["#1D4ED8", "#3B82F6"],
    info: "Total participant headcount across all non-cancelled package bookings placed in the period. Attraction and event tickets are not included here.",
  },
  attractions: {
    key: "attractions",
    title: "Attractions Sold",
    valueField: "totalAttractionTickets",
    fallbackField: "totalPurchases",
    format: "number",
    breakdownKey: "attractionBreakdown",
    subtitle: attractionOrdersPart,
    icon: "ticket.png",
    color: "#15803D",
    gradient: ["#15803D", "#22C55E"],
    info: "Attraction tickets sold in the period (sum of ticket quantities across orders, counted by purchase date). Cancelled and refunded orders are excluded. The subtitle shows how many orders those tickets came from.",
  },
  events: {
    key: "events",
    title: "Events Sold",
    valueField: "totalEventPurchases",
    format: "number",
    breakdownKey: "eventBreakdown",
    subtitle: eventTicketsPart,
    icon: "calendar-days.png",
    color: "#7E22CE",
    gradient: ["#7E22CE", "#A855F7"],
    info: "Event orders placed in the period (counted by purchase date). Cancelled and refunded orders are excluded. The subtitle shows the total tickets across those orders.",
  },
  memberships: {
    key: "memberships",
    title: "Memberships",
    valueField: "newMemberships",
    format: "number",
    breakdownKey: "membershipBreakdown",
    subtitle: () => "New this period",
    icon: "membership.png",
    color: "#B45309",
    gradient: ["#B45309", "#F59E0B"],
    info: "New memberships created in the selected period. This is not the total number of active members — it counts sign-ups within the timeframe.",
  },
  customers: {
    key: "customers",
    title: "Unique Customers",
    valueField: "totalCustomers",
    format: "number",
    breakdownKey: "customerBreakdown",
    subtitle: newCustomersPart,
    icon: "add-user.png",
    color: "#BE123C",
    gradient: ["#BE123C", "#F43F5E"],
    info: "Customers with at least one package booking, attraction order, or event order in the period. Each customer is counted once. 'New' counts those whose customer account was also created in the period; guests who booked without an account are not included.",
  },
  confirmed: {
    key: "confirmed",
    title: "Confirmed Bookings",
    valueField: "confirmedBookings",
    format: "number",
    breakdownKey: "confirmedBreakdown",
    subtitle: completedPart,
    icon: "checked.png",
    color: "#059669",
    gradient: ["#059669", "#34D399"],
    info: "Package bookings that were confirmed, including those that have since checked in or completed. The subtitle shows how many of them are fully completed.",
  },
  // Company-admin variant of `confirmed`: counts ALL confirmed sales combined
  // (bookings + event tickets + attraction tickets), matching the web's
  // "Confirmed Sales" card. Managers/attendants keep the `confirmed` card above.
  confirmedSales: {
    key: "confirmedSales",
    title: "Confirmed Sales",
    valueField: "confirmedTotal",
    fallbackField: "confirmedBookings",
    format: "number",
    breakdownKey: "confirmedBreakdown",
    subtitle: () => "Bookings + tickets confirmed",
    icon: "checked.png",
    color: "#047857",
    gradient: ["#047857", "#10B981"],
    info: "All confirmed sales in the period combined by quantity: package bookings + event tickets + attraction tickets, matching the counts on the sold cards. Sales that progressed to checked-in or completed still count as confirmed. Open the card for the split by type.",
  },
  waivers: {
    key: "waivers",
    title: "Waivers",
    valueField: "totalWaivers",
    format: "number",
    breakdownKey: "waiverBreakdown",
    secondaryBreakdowns: [
      { key: "waiverStatusBreakdown", label: "By status" },
      { key: "waiverAgeBreakdown", label: "Adult age brackets (signed)" },
      // Minors' ages as of the waiver date; percentages are of minors covered,
      // not of all waivers, so this section does not sum with the adult one.
      {
        key: "waiverMinorAgeBreakdown",
        label: "Minor age brackets (at signing)",
      },
    ],
    breakdownSectionLabel: "By source",
    subtitle: signedPendingPart,
    icon: "file-signature.png",
    color: "#4338CA",
    gradient: ["#4338CA", "#6366F1"],
    info: 'Waivers for visits in the selected period, scoped to the selected location, counted on the day each waiver covers. "Signed" are completed waivers; pending are not yet signed. Open the card for the split by status, by source, adults vs minors covered, the adult age brackets, and the minors\' ages as of the waiver date.',
  },
  revenue: {
    key: "revenue",
    title: "Total Revenue",
    valueField: "totalRevenue",
    format: "currency",
    subtitle: revenuePart,
    icon: "dollar-sign.png",
    color: "#16A34A",
    gradient: ["#16A34A", "#4ADE80"],
    info: "Money actually collected (amount paid) on package bookings, attraction orders, and event orders placed in the period. Cancelled/refunded orders are excluded. Outstanding balances are not included.",
  },

  newBookings: {
    key: "newBookings",
    title: "New Bookings",
    valueField: "newBookings",
    format: "number",
    subtitle: () => "Created in this period",
    icon: "sparkles.png",
    color: "#2563EB",
    gradient: ["#2563EB", "#60A5FA"],
    info: "Bookings created within the selected timeframe, based on the loaded booking list.",
  },
  pending: {
    key: "pending",
    title: "Pending Approvals",
    valueField: "pendingBookings",
    format: "number",
    subtitle: () => "Require attention",
    icon: "alert-triangle.png",
    color: "#D97706",
    gradient: ["#D97706", "#FBBF24"],
    info: "Bookings still sitting at pending for this location in the period. They are included in Total Bookings.",
  },
  avgBooking: {
    key: "avgBooking",
    title: "Avg Booking",
    valueField: "avgBooking",
    format: "currency",
    subtitle: avgBookingPart,
    icon: "trending-up.png",
    color: "#1E40AF",
    gradient: ["#1E40AF", "#3B82F6"],
    info: "Average collected per package booking: booking revenue divided by the number of non-cancelled bookings in the period.",
  },
  ticketSales: {
    key: "ticketSales",
    title: "Ticket Sales",
    valueField: "totalPurchases",
    format: "number",
    subtitle: ticketSalesPart,
    icon: "ticket.png",
    color: "#9333EA",
    gradient: ["#9333EA", "#C084FC"],
    info: "Attraction orders placed in the period, counted by purchase date. Cancelled and refunded orders are excluded. The card counts orders; the breakdown counts the tickets inside them.",
  },
} satisfies Record<string, MetricCardDef>;

export type MetricCardKey = keyof typeof METRIC_CARDS;

/**
 * One titled block of a card's breakdown (web parity: MetricBreakdownSection in
 * components/admin/dashboard/MetricCardGrid.tsx). Its total is the sum of its
 * own rows, printed only when it has more than one row and `showTotal` is not
 * false.
 */
export type BreakdownSectionDef = {
  title: string;
  items: BreakdownItem[];
  /** Label of the total row; "Total" when omitted. */
  totalLabel?: string;
  format?: MetricFormat;
  /** False where the rows overlap and a sum would mean nothing (waiver status). */
  showTotal?: boolean;
};

export type SectionsFn = (data: DashboardData) => BreakdownSectionDef[];

/** Everything the screen needs to know to render one role's dashboard. */
export type DashboardConfig = {
  role: string;
  /** Home-screen header subtitle — role-scoped so wording matches the user's
   *  actual reach (multi-location vs a single assigned location). */
  subtitle: string;
  cards: MetricCardKey[];
  showLocationSelector: boolean;
  /** Company-admin breakdown sheet: `breakdownKey` + `secondaryBreakdowns`, with
   *  the card's own value as the total. Roles with `cardSections` leave it off. */
  showBreakdowns: boolean;
  /**
   * Per-card breakdown sections (manager / attendant). A card with no section
   * that has rows does not open. When set, it replaces `showBreakdowns`.
   */
  cardSections?: Partial<Record<MetricCardKey, SectionsFn>>;
  /** Append the picked timeframe to every card's sub-line. Off where the
   *  picker already names the period once (manager / attendant on the web). */
  timeframeOnCards: boolean;
  /** Customer Concerns panel for the user's own location, at the foot. */
  showConcerns: boolean;
  metricsSource: MetricsSource;
  subtitleOverrides?: Partial<Record<MetricCardKey, SubtitleFn>>;
  infoOverrides?: Partial<Record<MetricCardKey, string>>;
};

// Breakdown sections — the same blocks, titles and total labels as the web
// manager / attendant dashboards.

const packageSections: SectionsFn = (d) => [
  { title: "By status", items: d.breakdowns?.packageStatusBreakdown ?? [] },
  { title: "By package", items: d.breakdowns?.packageBreakdown ?? [] },
];

const newBookingSections: SectionsFn = (d) => [
  {
    title: "By status",
    items: d.derivedBreakdowns?.newBookingsByStatus ?? [],
  },
  {
    title: "By package",
    items: d.derivedBreakdowns?.newBookingsByPackage ?? [],
  },
];

// Keyed on the status slug, not the display label.
const confirmedSections: SectionsFn = (d) => [
  {
    title: "How far along",
    items: rescaleBreakdown(d.breakdowns?.packageStatusBreakdown, [
      "confirmed",
      "checked-in",
      "completed",
    ]),
  },
];

const revenueSourceSection = (d: DashboardData): BreakdownSectionDef => ({
  title: "Where it came from",
  items: buildBreakdown([
    { label: "Package bookings", count: amount(d.metrics, "bookingRevenue") },
    { label: "Attraction tickets", count: amount(d.metrics, "purchaseRevenue") },
    { label: "Event tickets", count: amount(d.metrics, "eventPurchaseRevenue") },
  ]),
  format: "currency",
  totalLabel: "Collected",
});

const managerRevenueSections: SectionsFn = (d) => [
  revenueSourceSection(d),
  {
    title: "Attraction tickets sold",
    items: d.breakdowns?.attractionBreakdown ?? [],
    totalLabel: "Tickets",
  },
  {
    title: "Event tickets sold",
    items: d.breakdowns?.eventBreakdown ?? [],
    totalLabel: "Tickets",
  },
];

const attendantRevenueSections: SectionsFn = (d) => [revenueSourceSection(d)];

const ticketSalesSections: SectionsFn = (d) => [
  {
    title: "Attraction tickets by category",
    items: d.breakdowns?.attractionBreakdown ?? [],
    totalLabel: "Tickets",
  },
  {
    title: "Event tickets",
    items: d.breakdowns?.eventBreakdown ?? [],
    totalLabel: "Tickets",
  },
];

const customerSections: SectionsFn = (d) => [
  { title: "New vs returning", items: d.breakdowns?.customerBreakdown ?? [] },
];

// Waiver statuses overlap — a checked-in waiver is also a completed one — so
// that block alone prints no total. An uncounted card has nothing to open.
const waiverSections: SectionsFn = (d) =>
  metricUncounted(d, METRIC_CARDS.waivers)
    ? []
    : [
        {
          title: "By status",
          items: d.breakdowns?.waiverStatusBreakdown ?? [],
          showTotal: false,
        },
        { title: "By source", items: d.breakdowns?.waiverBreakdown ?? [] },
        {
          title: "Adult age brackets (signed)",
          items: d.breakdowns?.waiverAgeBreakdown ?? [],
          totalLabel: "Adults with a birthdate",
        },
        {
          title: "Minor age brackets (at signing)",
          items: d.breakdowns?.waiverMinorAgeBreakdown ?? [],
          totalLabel: "Minors with a birthdate",
        },
      ];

/**
 * Role → dashboard mapping. Mirrors the three web dashboard components. To add
 * a role, add an entry here — no screen changes required.
 */
export const ROLE_DASHBOARDS: Record<string, DashboardConfig> = {
  company_admin: {
    role: "company_admin",
    subtitle: "Multi-location booking overview and management",
    cards: [
      "packages",
      "participants",
      "attractions",
      "events",
      "memberships",
      "customers",
      "confirmedSales",
      "waivers",
    ],
    showLocationSelector: true,
    showBreakdowns: true,
    timeframeOnCards: true,
    showConcerns: false,
    metricsSource: "dashboard",
    subtitleOverrides: {
      packages: confirmedPendingPart,
    },
  },
  location_manager: {
    role: "location_manager",
    subtitle: "Location booking overview and management",
    cards: [
      "packages",
      "newBookings",
      "revenue",
      "customers",
      "confirmed",
      "avgBooking",
      "waivers",
    ],
    showLocationSelector: false,
    showBreakdowns: false,
    cardSections: {
      packages: packageSections,
      newBookings: newBookingSections,
      revenue: managerRevenueSections,
      customers: customerSections,
      confirmed: confirmedSections,
      waivers: waiverSections,
    },
    timeframeOnCards: false,
    showConcerns: true,
    metricsSource: "dashboard",
    subtitleOverrides: {
      waivers: managerSignedPendingPart,
    },
    infoOverrides: {
      waivers:
        "Waivers covering visit days in this period, counted on the day they cover — the same rule the Waiver Records page uses, so the numbers agree. Open the card for the split by status, by source, the adult age brackets, and the minors’ ages as of the waiver date.",
    },
  },
  attendant: {
    role: "attendant",
    subtitle: "Location booking overview and daily operations",
    cards: [
      "packages",
      "newBookings",
      "pending",
      "confirmed",
      "revenue",
      "ticketSales",
    ],
    showLocationSelector: false,
    showBreakdowns: false,
    cardSections: {
      packages: packageSections,
      newBookings: newBookingSections,
      confirmed: confirmedSections,
      revenue: attendantRevenueSections,
      ticketSales: ticketSalesSections,
    },
    timeframeOnCards: false,
    showConcerns: false,
    metricsSource: "attendant",
  },
};

/**
 * Least-privilege fallback for unknown/missing roles: the most restricted
 * dashboard (matches the web, which redirects unknown roles to /attendant).
 */
export const DEFAULT_DASHBOARD_CONFIG = ROLE_DASHBOARDS.attendant;

/** Resolve the dashboard config for a role, defaulting to least privilege. */
export function getDashboardConfig(role?: string | null): DashboardConfig {
  if (role && ROLE_DASHBOARDS[role]) return ROLE_DASHBOARDS[role];
  return DEFAULT_DASHBOARD_CONFIG;
}

/** The subtitle builder for a card under a role (role override → catalog default). */
export function getCardSubtitleFn(
  config: DashboardConfig,
  card: MetricCardDef,
): SubtitleFn | undefined {
  return config.subtitleOverrides?.[card.key as MetricCardKey] ?? card.subtitle;
}

/** What a card counts, in the role's own words (role override → catalog). */
export function getCardInfo(config: DashboardConfig, card: MetricCardDef): string {
  return config.infoOverrides?.[card.key as MetricCardKey] ?? card.info;
}

/**
 * The breakdown sections a card opens under a role, empty ones dropped (so a
 * card whose every section is empty does not open). `null` when the role does
 * not use sections at all — the company-admin sheet then applies.
 */
export function getCardSections(
  config: DashboardConfig,
  card: MetricCardDef,
  data: DashboardData | null | undefined,
): BreakdownSectionDef[] | null {
  if (!config.cardSections) return null;
  const build = config.cardSections[card.key as MetricCardKey];
  if (!build || !data) return [];
  return build(data).filter((section) => section.items.length > 0);
}

/** A section's total: the sum of its own rows. */
export const sectionTotal = (section: BreakdownSectionDef): number =>
  section.items.reduce((sum, item) => sum + item.count, 0);

/** Whether a section prints a total row — only a real partition of 2+ rows. */
export const sectionShowsTotal = (section: BreakdownSectionDef): boolean =>
  section.items.length > 1 && section.showTotal !== false;

/**
 * Compose a card's sub-line "<metric part> • <timeframe>" (just the timeframe
 * when empty); `timeframe` is the backend label, like the web.
 */
/** What an uncountable card says instead of a number (the web's wording). */
export const UNCOUNTED_SUBTITLE = "Could not be counted — see the server log";

/**
 * True when the server says it could not count this card's figures — today
 * only waivers (`metrics.waiverMetricsAvailable === false`, set when the waiver
 * query throws). The card then shows "—" rather than a 0 nobody can tell apart
 * from a real zero. A missing flag (older server, attendant endpoint) means
 * counted, as on the web.
 */
export function metricUncounted(
  data: DashboardData | null | undefined,
  card: MetricCardDef,
): boolean {
  if (card.key !== "waivers") return false;
  const metrics = data?.metrics as Record<string, unknown> | undefined;
  return metrics?.waiverMetricsAvailable === false;
}

export function composeSubtitle(metricPart: string, timeframe: string): string {
  const part = metricPart.trim();
  return part ? `${part} • ${timeframe}` : timeframe;
}

/**
 * A card's sub-line under a role: "<metric part> • <timeframe>" where the role
 * shows the period on every card, otherwise the metric part alone (null when
 * there is none, so no empty line is drawn).
 */
export function cardSubtitle(
  config: DashboardConfig,
  metricPart: string,
  timeframe: string,
): string | null {
  if (config.timeframeOnCards) return composeSubtitle(metricPart, timeframe);
  const part = metricPart.trim();
  return part || null;
}

/**
 * A card's numeric value with the web's `metrics.a ?? metrics.b` fallback
 * applied (e.g. `totalAttractionTickets ?? totalPurchases`). `null` when the
 * response has no usable number — the card then renders "—".
 *
 * Both the card face and its breakdown Total row go through this, so they can
 * never disagree.
 */
export function resolveMetricValue(
  metrics: DashboardTotals | undefined | null,
  card: MetricCardDef,
): number | null {
  if (!metrics) return null;
  const primary = metrics[card.valueField];
  const raw =
    (primary == null || Number.isNaN(primary)) && card.fallbackField
      ? metrics[card.fallbackField]
      : primary;
  return raw == null || Number.isNaN(raw) ? null : raw;
}

/** Format a metric value for display (currency vs plain count). */
export function formatMetricValue(
  value: number,
  format: MetricFormat = "number",
): string {
  if (format === "currency") {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return String(value);
}

// Client-derived metrics the endpoint doesn't return — Avg Booking
// (bookingRevenue / totalBookings) and New Bookings (created within timeframe).

/** True when the role's dashboard shows a card derived from the bookings list. */
export function dashboardNeedsBookings(config: DashboardConfig): boolean {
  return config.cards.includes("newBookings");
}

/** True when the role's dashboard shows the (metrics-only) Avg Booking card. */
export function dashboardNeedsAvgBooking(config: DashboardConfig): boolean {
  return config.cards.includes("avgBooking");
}

// New Bookings (created within the timeframe, venue day, not cancelled) lives
// in ./dashboardTimeframe — filterNewBookings.

export function computeAvgBooking(metrics: DashboardTotals): number {
  const total = metrics.totalBookings ?? 0;
  const revenue = metrics["bookingRevenue"] ?? 0;
  return total > 0 ? revenue / total : 0;
}

export type DerivedMetrics = {
  newBookings?: number;
  avgBooking?: number;
  newBookingBreakdowns?: NonNullable<DashboardData["derivedBreakdowns"]>;
};

/**
 * New Bookings split by status and by package, as the web builds it from the
 * same list: a blank status is pending, a booking without a package is "Other".
 */
export function newBookingBreakdowns(
  bookings: { status?: string | null; packageNameRaw?: string | null }[],
): NonNullable<DashboardData["derivedBreakdowns"]> {
  return {
    newBookingsByStatus: countBreakdown(bookings, (b) =>
      bookingStatusLabel(b.status),
    ),
    newBookingsByPackage: countBreakdown(
      bookings,
      (b) => b.packageNameRaw || "Other",
    ),
  };
}

export function withDerivedMetrics(
  data: DashboardData,
  derived: DerivedMetrics,
): DashboardData {
  return {
    ...data,
    metrics: {
      ...data.metrics,
      ...(derived.avgBooking != null ? { avgBooking: derived.avgBooking } : {}),
      ...(derived.newBookings != null
        ? { newBookings: derived.newBookings }
        : {}),
    },
    ...(derived.newBookingBreakdowns
      ? { derivedBreakdowns: derived.newBookingBreakdowns }
      : {}),
  };
}
