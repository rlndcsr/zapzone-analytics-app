import type {
  BreakdownKey,
  DashboardData,
  DashboardTotals,
  TimeframeType,
} from "../../services/metricsService";

// ---------------------------------------------------------------------------
// Role-based dashboard configuration.
//
// The web admin renders a different dashboard component per role. Mobile keeps
// a single screen but drives it from this config so role logic lives in one
// place, cards stay reusable, and adding a role is a one-line change.
//
//   web company_admin  -> CompanyDashboard    (7 cards, location selector, breakdowns)
//   web location_manager -> ManagerDashboard   (6 cards, own location)
//   web attendant      -> AttendantDashboard   (6 cards, own location, /metrics/attendant)
// ---------------------------------------------------------------------------

/** Which backend metrics endpoint powers the dashboard for a role. */
export type MetricsSource = "dashboard" | "attendant";

export type MetricFormat = "number" | "currency";

export type SubtitleFn = (metrics: DashboardTotals) => string;

export type MetricCardDef = {
  key: string;
  label: string;
  title: string;
  valueField: keyof DashboardTotals;
  format: MetricFormat;
  breakdownKey?: BreakdownKey;
  subtitle?: SubtitleFn;
  icon: string;
  color: string;
  gradient: [string, string];
};

// Subtitle metric-part builders — reproduce the web's `change`/`description`
// strings (timeframe appended by the renderer). Unnamed `$`-fields are read via
// the payload's index signature.
const amount = (metrics: DashboardTotals, key: string): number =>
  Number(metrics[key] ?? 0);

const participantsPart: SubtitleFn = (m) =>
  `${m.totalParticipants} participants`;
const confirmedCountPart: SubtitleFn = (m) =>
  `${m.confirmedBookings} confirmed`;
const completedPart: SubtitleFn = (m) => `Completed: ${m.completedBookings}`;
const confirmedCompositionPart: SubtitleFn = () =>
  "Packages + events + attractions";
const newCustomersPart: SubtitleFn = (m) => `${m.newCustomers ?? 0} new`;
const eventTicketsPart: SubtitleFn = (m) => `${m.totalEventTickets} tickets`;

// Manager Total Revenue: "Bkgs: $X • Tix: $Y[ • Events: $Z]" (rounded).
const managerRevenuePart: SubtitleFn = (m) => {
  const base = `Bkgs: $${Math.round(amount(m, "bookingRevenue"))} • Tix: $${Math.round(
    amount(m, "purchaseRevenue"),
  )}`;
  const events = amount(m, "eventPurchaseRevenue");
  return events > 0 ? `${base} • Events: $${Math.round(events)}` : base;
};

// Attendant Total Revenue: "Bookings: $X.XX[ • Events: $Z.ZZ]".
const attendantRevenuePart: SubtitleFn = (m) => {
  const base = `Bookings: $${amount(m, "bookingRevenue").toFixed(2)}`;
  const events = amount(m, "eventPurchaseRevenue");
  return events > 0 ? `${base} • Events: $${events.toFixed(2)}` : base;
};

// Manager Avg Booking: "N tickets sold[ • M event tickets]".
const avgBookingPart: SubtitleFn = (m) => {
  const base = `${m.totalPurchases} tickets sold`;
  return m.totalEventTickets > 0
    ? `${base} • ${m.totalEventTickets} event tickets`
    : base;
};

// Attendant Ticket Sales: "Revenue: $X.XX[ • M event tickets]".
const ticketSalesPart: SubtitleFn = (m) => {
  const base = `Revenue: $${amount(m, "purchaseRevenue").toFixed(2)}`;
  return m.totalEventTickets > 0
    ? `${base} • ${m.totalEventTickets} event tickets`
    : base;
};

/**
 * Catalog of every KPI card used by any role. Roles reference these by key, so
 * a card's look/value lives in exactly one spot.
 */
export const METRIC_CARDS = {
  packages: {
    key: "packages",
    label: "Packages",
    title: "Total Bookings",
    valueField: "totalBookings",
    format: "number",
    breakdownKey: "packageBreakdown",
    subtitle: participantsPart,
    icon: "party.png",
    color: "#5B7EFF",
    gradient: ["#5B7EFF", "#7B9CFF"],
  },
  participants: {
    key: "participants",
    label: "Participants",
    title: "Party Participants",
    valueField: "totalParticipants",
    format: "number",
    breakdownKey: "participantBreakdown",
    subtitle: () => "From package bookings",
    icon: "group.png",
    color: "#A78BFA",
    gradient: ["#A78BFA", "#C4B5FD"],
  },
  attractions: {
    key: "attractions",
    label: "Attractions",
    title: "Tickets Sold",
    valueField: "totalPurchases",
    format: "number",
    breakdownKey: "attractionBreakdown",
    subtitle: () => "Tickets sold",
    icon: "ticket.png",
    color: "#10B981",
    gradient: ["#10B981", "#34D399"],
  },
  events: {
    key: "events",
    label: "Events",
    title: "Events Sold",
    valueField: "totalEventPurchases",
    format: "number",
    breakdownKey: "eventBreakdown",
    subtitle: eventTicketsPart,
    icon: "shopping-cart.png",
    color: "#EC4899",
    gradient: ["#EC4899", "#F472B6"],
  },
  memberships: {
    key: "memberships",
    label: "Memberships",
    title: "New Members",
    valueField: "newMemberships",
    format: "number",
    breakdownKey: "membershipBreakdown",
    subtitle: () => "New this period",
    icon: "membership.png",
    color: "#F59E0B",
    gradient: ["#F59E0B", "#FBBF24"],
  },
  customers: {
    key: "customers",
    label: "Customers",
    title: "Unique Customers",
    valueField: "totalCustomers",
    format: "number",
    breakdownKey: "customerBreakdown",
    subtitle: newCustomersPart,
    icon: "add-user.png",
    color: "#EF4444",
    gradient: ["#EF4444", "#F87171"],
  },
  confirmed: {
    key: "confirmed",
    label: "Confirmed",
    title: "Confirmed Bookings",
    valueField: "confirmedBookings",
    format: "number",
    breakdownKey: "confirmedBreakdown",
    subtitle: completedPart,
    icon: "checked.png",
    color: "#14B8A6",
    gradient: ["#14B8A6", "#2DD4BF"],
  },
  revenue: {
    key: "revenue",
    label: "Revenue",
    title: "Total Revenue",
    valueField: "totalRevenue",
    format: "currency",
    subtitle: managerRevenuePart,
    icon: "box.png",
    color: "#059669",
    gradient: ["#059669", "#34D399"],
  },

  newBookings: {
    key: "newBookings",
    label: "New",
    title: "New Bookings",
    valueField: "newBookings",
    format: "number",
    subtitle: () => "Created",
    icon: "calendar.png",
    color: "#5B7EFF",
    gradient: ["#5B7EFF", "#7B9CFF"],
  },
  pending: {
    key: "pending",
    label: "Pending",
    title: "Pending Approvals",
    valueField: "pendingBookings",
    format: "number",
    subtitle: () => "Require attention",
    icon: "info.png",
    color: "#F59E0B",
    gradient: ["#F59E0B", "#FBBF24"],
  },
  avgBooking: {
    key: "avgBooking",
    label: "Average",
    title: "Avg Booking",
    valueField: "avgBooking",
    format: "currency",
    subtitle: avgBookingPart,
    icon: "shopping-cart.png",
    color: "#A78BFA",
    gradient: ["#A78BFA", "#C4B5FD"],
  },
  ticketSales: {
    key: "ticketSales",
    label: "Tickets",
    title: "Ticket Sales",
    valueField: "totalPurchases",
    format: "number",
    subtitle: ticketSalesPart,
    icon: "ticket.png",
    color: "#10B981",
    gradient: ["#10B981", "#34D399"],
  },
} satisfies Record<string, MetricCardDef>;

export type MetricCardKey = keyof typeof METRIC_CARDS;

/** Everything the screen needs to know to render one role's dashboard. */
export type DashboardConfig = {
  role: string;
  cards: MetricCardKey[];
  showLocationSelector: boolean;
  showBreakdowns: boolean;
  metricsSource: MetricsSource;
  subtitleOverrides?: Partial<Record<MetricCardKey, SubtitleFn>>;
};

/**
 * Role → dashboard mapping. Mirrors the three web dashboard components. To add
 * a role, add an entry here — no screen changes required.
 */
export const ROLE_DASHBOARDS: Record<string, DashboardConfig> = {
  company_admin: {
    role: "company_admin",
    cards: [
      "packages",
      "participants",
      "attractions",
      "events",
      "memberships",
      "customers",
      "confirmed",
    ],
    showLocationSelector: true,
    showBreakdowns: true,
    metricsSource: "dashboard",
    subtitleOverrides: {
      packages: confirmedCountPart,
      confirmed: confirmedCompositionPart,
    },
  },
  location_manager: {
    role: "location_manager",
    cards: [
      "packages",
      "newBookings",
      "revenue",
      "customers",
      "confirmed",
      "avgBooking",
    ],
    showLocationSelector: false,
    showBreakdowns: false,
    metricsSource: "dashboard",
    subtitleOverrides: {
      customers: () => "",
    },
  },
  attendant: {
    role: "attendant",
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
    metricsSource: "attendant",
    subtitleOverrides: {
      revenue: attendantRevenuePart,
    },
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

/**
 * Compose a card's full sub-line: "<metric part> • <timeframe>", or just the
 * timeframe when the metric part is empty. `timeframe` is the backend-supplied
 * label (data.timeframe.description), mirroring the web's `timeframeDescription`.
 */
export function composeSubtitle(metricPart: string, timeframe: string): string {
  const part = metricPart.trim();
  return part ? `${part} • ${timeframe}` : timeframe;
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

// ---------------------------------------------------------------------------
// Client-derived metrics.
//
// A couple of cards are not returned by the metrics endpoint; the web derives
// them (see web src/pages/admin/ManagerDashboard.tsx):
//   - Avg Booking  = metrics.bookingRevenue / metrics.totalBookings  (metrics-only)
//   - New Bookings = count of the location's bookings created within the
//                    selected timeframe (needs the bookings list)
// These helpers reproduce those exact rules so mobile matches the web.
// ---------------------------------------------------------------------------

/** True when the role's dashboard shows a card derived from the bookings list. */
export function dashboardNeedsBookings(config: DashboardConfig): boolean {
  return config.cards.includes("newBookings");
}

/** True when the role's dashboard shows the (metrics-only) Avg Booking card. */
export function dashboardNeedsAvgBooking(config: DashboardConfig): boolean {
  return config.cards.includes("avgBooking");
}

export function getNewBookingsCutoff(
  timeframe: TimeframeType,
  customDateFrom?: string,
  now: Date = new Date(),
): Date | null {
  switch (timeframe) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "last_24h": {
      const d = new Date(now);
      d.setDate(now.getDate() - 1);
      return d;
    }
    case "last_7d": {
      const d = new Date(now);
      d.setDate(now.getDate() - 7);
      return d;
    }
    case "last_30d": {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      return d;
    }
    case "custom":
      return customDateFrom ? new Date(customDateFrom) : null;
    case "all_time":
    default:
      return null; // no cutoff — every booking counts as new
  }
}

export function countNewBookings(
  bookings: { createdAt: string | null }[],
  cutoff: Date | null,
): number {
  if (!cutoff) return bookings.length;
  return bookings.filter((b) => {
    if (!b.createdAt) return false;
    const created = new Date(b.createdAt);
    return !Number.isNaN(created.getTime()) && created >= cutoff;
  }).length;
}

export function computeAvgBooking(metrics: DashboardTotals): number {
  const total = metrics.totalBookings ?? 0;
  const revenue = metrics["bookingRevenue"] ?? 0;
  return total > 0 ? revenue / total : 0;
}

export function withDerivedMetrics(
  data: DashboardData,
  derived: { newBookings?: number; avgBooking?: number },
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
  };
}
