import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DashboardData } from "../../services/metricsService";
import {
  cardSubtitle,
  getCardInfo,
  getCardSections,
  getCardSubtitleFn,
  getDashboardConfig,
  METRIC_CARDS,
  newBookingBreakdowns,
  sectionShowsTotal,
  sectionTotal,
  withDerivedMetrics,
} from "./dashboardConfig.ts";

const manager = getDashboardConfig("location_manager");
const attendant = getDashboardConfig("attendant");
const company = getDashboardConfig("company_admin");

const row = (label: string, count: number, status?: string) => ({
  label,
  count,
  percentage: 0,
  ...(status ? { status } : {}),
});

const data = (overrides: Partial<DashboardData> = {}): DashboardData =>
  ({
    timeframe: { type: "today", date_from: null, date_to: null, description: "" },
    metrics: {
      totalBookings: 10,
      bookingRevenue: 300,
      purchaseRevenue: 100,
      eventPurchaseRevenue: 0,
      totalAttractionTickets: 12,
      completedWaivers: 4,
      pendingWaivers: 1,
      newCustomers: 3,
    },
    breakdowns: {
      packageStatusBreakdown: [
        row("Pending", 4, "pending"),
        row("Confirmed", 3, "confirmed"),
        row("Checked-in", 1, "checked-in"),
        row("Completed", 2, "completed"),
      ],
      packageBreakdown: [row("Birthday", 6), row("Field trip", 4)],
      attractionBreakdown: [row("Arcade", 12)],
      eventBreakdown: [],
      customerBreakdown: [row("New", 3), row("Returning", 5)],
      waiverStatusBreakdown: [row("Completed", 4), row("Checked in", 2)],
      waiverBreakdown: [row("Kiosk", 3), row("Online", 2)],
      waiverAgeBreakdown: [row("18-24", 1), row("25-34", 2)],
      waiverMinorAgeBreakdown: [],
    },
    ...overrides,
  }) as unknown as DashboardData;

const titles = (sections: { title: string }[] | null) =>
  (sections ?? []).map((s) => s.title);

describe("manager dashboard", () => {
  it("carries the seven web cards, Waivers last", () => {
    assert.deepEqual(manager.cards, [
      "packages",
      "newBookings",
      "revenue",
      "customers",
      "confirmed",
      "avgBooking",
      "waivers",
    ]);
  });

  it("names the period once, in the picker — not under every card", () => {
    assert.equal(cardSubtitle(manager, "3 new", "Today"), "3 new");
    assert.equal(cardSubtitle(manager, "  ", "Today"), null);
    // The company dashboard still does.
    assert.equal(cardSubtitle(company, "3 new", "Today"), "3 new • Today");
  });

  it("shows new customers under Unique Customers", () => {
    const fn = getCardSubtitleFn(manager, METRIC_CARDS.customers);
    assert.equal(fn?.(data().metrics), "3 new");
  });

  it("uses its own separator on the Waivers sub-line, the company keeps its own", () => {
    const m = data().metrics;
    assert.equal(
      getCardSubtitleFn(manager, METRIC_CARDS.waivers)?.(m),
      "4 signed • 1 pending",
    );
    assert.equal(
      getCardSubtitleFn(company, METRIC_CARDS.waivers)?.(m),
      "4 signed · 1 pending",
    );
  });

  it("opens revenue into where it came from, then tickets sold; empty blocks drop", () => {
    const sections = getCardSections(manager, METRIC_CARDS.revenue, data());
    assert.deepEqual(titles(sections), [
      "Where it came from",
      "Attraction tickets sold",
    ]);
    const money = sections![0];
    assert.equal(money.format, "currency");
    assert.equal(money.totalLabel, "Collected");
    assert.equal(sectionTotal(money), 400);
    assert.deepEqual(
      money.items.map((i) => [i.label, i.percentage]),
      [
        ["Package bookings", 75],
        ["Attraction tickets", 25],
      ],
    );
  });

  it("splits Confirmed by how far along, without the pending share", () => {
    const [section] = getCardSections(manager, METRIC_CARDS.confirmed, data())!;
    assert.equal(section.title, "How far along");
    assert.deepEqual(
      section.items.map((i) => [i.label, i.count, i.percentage]),
      [
        ["Confirmed", 3, 50],
        ["Checked-in", 1, 17],
        ["Completed", 2, 33],
      ],
    );
  });

  it("prints no total for overlapping waiver statuses, and labels the age totals", () => {
    const sections = getCardSections(manager, METRIC_CARDS.waivers, data())!;
    assert.deepEqual(titles(sections), [
      "By status",
      "By source",
      "Adult age brackets (signed)",
    ]);
    assert.equal(sectionShowsTotal(sections[0]), false);
    assert.equal(sectionShowsTotal(sections[1]), true);
    assert.equal(sections[2].totalLabel, "Adults with a birthdate");
  });

  it("has nothing to open on a waiver card the server could not count", () => {
    const d = data();
    (d.metrics as Record<string, unknown>).waiverMetricsAvailable = false;
    assert.deepEqual(getCardSections(manager, METRIC_CARDS.waivers, d), []);
  });

  it("does not open Avg Booking", () => {
    assert.deepEqual(getCardSections(manager, METRIC_CARDS.avgBooking, data()), []);
  });

  it("explains Waivers in the manager dashboard's words", () => {
    assert.match(
      getCardInfo(manager, METRIC_CARDS.waivers),
      /same rule the Waiver Records page uses/,
    );
    assert.equal(
      getCardInfo(company, METRIC_CARDS.waivers),
      METRIC_CARDS.waivers.info,
    );
  });
});

describe("attendant dashboard", () => {
  it("opens revenue into where it came from only", () => {
    assert.deepEqual(
      titles(getCardSections(attendant, METRIC_CARDS.revenue, data())),
      ["Where it came from"],
    );
  });

  it("shows the revenue split, not bookings-only, under Total Revenue", () => {
    const fn = getCardSubtitleFn(attendant, METRIC_CARDS.revenue);
    assert.equal(fn?.(data().metrics), "Bkgs: $300 • Tix: $100");
  });

  it("counts tickets and their takings under Ticket Sales", () => {
    const fn = getCardSubtitleFn(attendant, METRIC_CARDS.ticketSales);
    assert.equal(fn?.(data().metrics), "12 tickets • $100.00");
    assert.deepEqual(
      titles(getCardSections(attendant, METRIC_CARDS.ticketSales, data())),
      ["Attraction tickets by category"],
    );
  });

  it("does not open Pending Approvals", () => {
    assert.deepEqual(getCardSections(attendant, METRIC_CARDS.pending, data()), []);
  });

  it("has no concerns panel; the manager does", () => {
    assert.equal(attendant.showConcerns, false);
    assert.equal(manager.showConcerns, true);
    assert.equal(company.showConcerns, false);
  });
});

describe("company dashboard", () => {
  it("keeps its own breakdown sheet", () => {
    assert.equal(getCardSections(company, METRIC_CARDS.packages, data()), null);
  });
});

describe("new bookings split", () => {
  it("counts by status and package, blank status as pending, no package as Other", () => {
    const split = newBookingBreakdowns([
      { status: "confirmed", packageNameRaw: "Birthday" },
      { status: "", packageNameRaw: null },
      { status: "confirmed", packageNameRaw: "Birthday" },
    ]);
    assert.deepEqual(
      split.newBookingsByStatus.map((i) => [i.label, i.count]),
      [
        ["Confirmed", 2],
        ["Pending", 1],
      ],
    );
    assert.deepEqual(
      split.newBookingsByPackage.map((i) => [i.label, i.count]),
      [
        ["Birthday", 2],
        ["Other", 1],
      ],
    );
  });

  it("rides along on the payload and feeds the New Bookings card", () => {
    const d = withDerivedMetrics(data(), {
      newBookings: 1,
      newBookingBreakdowns: newBookingBreakdowns([
        { status: "pending", packageNameRaw: "Birthday" },
      ]),
    });
    assert.equal(d.metrics.newBookings, 1);
    assert.deepEqual(
      titles(getCardSections(manager, METRIC_CARDS.newBookings, d)),
      ["By status", "By package"],
    );
  });

  it("has nothing to open when the bookings list could not be read", () => {
    assert.deepEqual(
      getCardSections(manager, METRIC_CARDS.newBookings, data()),
      [],
    );
  });
});
