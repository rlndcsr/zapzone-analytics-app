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
    info: "Package bookings marked \"confirmed\" in the selected period (includes those later checked in or completed). The breakdown compares confirmed packages with event and attraction purchases for the same period.",
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
    ],
    breakdownSectionLabel: "By source",
    subtitle: signedPendingPart,
    icon: "file-signature.png",
    color: "#4338CA",
    gradient: ["#4338CA", "#6366F1"],
    info: 'Waivers created in the selected period (by creation date), scoped to the selected location. "Signed" are completed waivers; pending are not yet signed. Open the card for the split by status, by source, adults vs minors covered, and the adult age brackets.',
  },
  revenue: {
    key: "revenue",
    title: "Total Revenue",
    valueField: "totalRevenue",
    format: "currency",
    subtitle: managerRevenuePart,
    icon: "dollar-sign.png",
    color: "#16A34A",
    gradient: ["#16A34A", "#4ADE80"],
    info: "Combined revenue for the selected period: package booking payments plus attraction and event ticket sales. Cancelled bookings and cancelled or refunded purchases are excluded.",
  },

  newBookings: {
    key: "newBookings",
    title: "New Bookings",
    valueField: "newBookings",
    format: "number",
    subtitle: () => "Created",
    icon: "sparkles.png",
    color: "#2563EB",
    gradient: ["#2563EB", "#60A5FA"],
    info: "Package bookings created during the selected period, counted by the date the booking was made (not the party date).",
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
    info: "Package bookings awaiting confirmation (status \"pending\") in the selected period.",
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
    info: "Average revenue per package booking in the selected period — total non-cancelled booking payments divided by the number of bookings.",
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
      "confirmedSales",
      "waivers",
    ],
    showLocationSelector: true,
    showBreakdowns: true,
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
