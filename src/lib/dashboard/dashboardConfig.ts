import type {
  BreakdownKey,
  DashboardData,
  DashboardTotals,
  TimeframeType,
} from "../../services/metricsService";

// Role-based dashboard config: the web renders a component per role, mobile
// drives one screen from this so role logic (cards, endpoint, etc.) lives here.

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
    label: "Packages Brakedown",
    title: "Packages",
    valueField: "totalBookings",
    format: "number",
    breakdownKey: "packageBreakdown",
    subtitle: participantsPart,
    icon: "party.png",
    color: "#5B7EFF",
    gradient: ["#5B7EFF", "#7B9CFF"],
    info: "Package bookings placed in the selected period (counted by the date the booking was made, not the party date). Cancelled bookings are excluded. \"Confirmed\" counts bookings that were confirmed, including those already checked in or completed.",
  },
  participants: {
    key: "participants",
    label: "Participants",
    title: "Participants",
    valueField: "totalParticipants",
    format: "number",
    breakdownKey: "participantBreakdown",
    subtitle: () => "From package bookings",
    icon: "group.png",
    color: "#A78BFA",
    gradient: ["#A78BFA", "#C4B5FD"],
    info: "Total participant headcount across all non-cancelled package bookings placed in the period. Attraction and event tickets are not included here.",
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
    info: "Attraction ticket purchases placed in the selected period, counted by purchase date. The breakdown shows ticket quantities grouped by attraction category.",
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
    info: "Event ticket purchases placed in the selected period, counted by purchase date. Cancelled and refunded purchases are excluded from ticket and revenue totals. The breakdown shows ticket quantities grouped by event.",
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
    info: "New memberships created during the selected period, counted by sign-up date. The breakdown groups them by membership plan.",
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
    info: "Unique customers with at least one booking, attraction purchase, or event purchase in the selected period. \"New\" are customers whose account was first created within the period; the rest are counted as returning.",
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
    info: "Package bookings marked \"confirmed\" in the selected period (includes those later checked in or completed). The breakdown compares confirmed packages with event and attraction purchases for the same period.",
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
    info: "Combined revenue for the selected period: package booking payments plus attraction and event ticket sales. Cancelled bookings and cancelled or refunded purchases are excluded.",
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
    info: "Package bookings created during the selected period, counted by the date the booking was made (not the party date).",
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
    info: "Package bookings awaiting confirmation (status \"pending\") in the selected period.",
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
    info: "Average revenue per package booking in the selected period — total non-cancelled booking payments divided by the number of bookings.",
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
    info: "Attraction ticket purchases in the selected period, counted by purchase date. Revenue shown is from completed attraction purchases.",
  },
} satisfies Record<string, MetricCardDef>;

export type MetricCardKey = keyof typeof METRIC_CARDS;

/** Everything the screen needs to know to render one role's dashboard. */
export type DashboardConfig = {
  role: string;
  /** Home-screen header subtitle — role-scoped so wording matches the user's
   *  actual reach (multi-location vs a single assigned location). */
  subtitle: string;
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
    subtitle: "Multi-location booking overview and management",
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
    subtitle: "Location booking overview and management",
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
 * Compose a card's sub-line "<metric part> • <timeframe>" (just the timeframe
 * when empty); `timeframe` is the backend label, like the web.
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

/**
 * Bookings created within the timeframe — the web's `newBookings` (no cutoff =
 * all-time; missing/invalid `createdAt` excluded). Generic to keep the row type.
 */
export function filterNewBookings<T extends { createdAt: string | null }>(
  bookings: T[],
  cutoff: Date | null,
): T[] {
  if (!cutoff) return bookings;
  return bookings.filter((b) => {
    if (!b.createdAt) return false;
    const created = new Date(b.createdAt);
    return !Number.isNaN(created.getTime()) && created >= cutoff;
  });
}

/** Count of new bookings — `filterNewBookings(...).length`. */
export function countNewBookings(
  bookings: { createdAt: string | null }[],
  cutoff: Date | null,
): number {
  return filterNewBookings(bookings, cutoff).length;
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
