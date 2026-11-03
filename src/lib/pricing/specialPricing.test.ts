import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applySpecialTarget,
  dealDatesFor,
  hhmm,
  isSpecialPricingDiscount,
  normalizeSpecialBreakdown,
  packageSpecialQuantity,
  perTicketLabel,
  perTicketOffLabel,
  repricingNotice,
  sameVisit,
  soldTicketPrice,
  specialCheckState,
  specialDealHeadline,
  specialDealHint,
  specialPaymentBlocker,
  specialPricingTotal,
  specialVisit,
  venueClock,
  venueTodayKey,
  visitChangeWhere,
  type SpecialDeal,
  type Visit,
} from "./specialPricing.ts";

const at = (iso: string) => new Date(iso);

describe("venue (Michigan) day and clock", () => {
  it("a sale just before midnight in Michigan is still that day, whatever UTC says", () => {
    assert.equal(venueTodayKey(at("2026-11-04T04:59:00Z")), "2026-11-03");
    assert.equal(venueClock(at("2026-11-04T04:59:00Z")), "23:59");
  });

  it("a sale just after midnight in Michigan is the next day", () => {
    assert.equal(venueTodayKey(at("2026-11-04T05:00:00Z")), "2026-11-04");
    assert.equal(venueClock(at("2026-11-04T05:00:00Z")), "00:00");
  });

  it("summer midnight uses the daylight-saving offset (UTC-4)", () => {
    assert.equal(venueTodayKey(at("2026-07-01T03:59:00Z")), "2026-06-30");
    assert.equal(venueTodayKey(at("2026-07-01T04:00:00Z")), "2026-07-01");
  });

  it("follows the spring-forward jump on Mar 8 2026", () => {
    assert.equal(venueClock(at("2026-03-08T06:30:00Z")), "01:30"); // EST
    assert.equal(venueClock(at("2026-03-08T07:30:00Z")), "03:30"); // EDT
  });

  it("follows the fall-back repeat on Nov 1 2026", () => {
    assert.equal(venueClock(at("2026-11-01T05:30:00Z")), "01:30"); // EDT
    assert.equal(venueClock(at("2026-11-01T06:30:00Z")), "01:30"); // EST
    assert.equal(venueTodayKey(at("2026-11-01T06:30:00Z")), "2026-11-01");
  });
});

describe("specialVisit — the visit the special is priced for", () => {
  it("prices the picked visit, not the day of the sale", () => {
    const v = specialVisit("2026-11-10", "18:00", at("2026-11-02T15:00:00Z"));
    assert.deepEqual(v, { date: "2026-11-10", time: "18:00" });
  });

  it("trims seconds off a picked time and drops an empty one", () => {
    assert.deepEqual(specialVisit("2026-11-10", "18:00:00"), {
      date: "2026-11-10",
      time: "18:00",
    });
    assert.deepEqual(specialVisit("2026-11-10", ""), {
      date: "2026-11-10",
      time: undefined,
    });
  });

  it("with no visit date, uses Michigan's today and current time (not the device's)", () => {
    const v = specialVisit("", "", at("2026-11-04T03:30:00Z"));
    assert.deepEqual(v, { date: "2026-11-03", time: "22:30" });
  });
});

describe("the payment gate", () => {
  it("waits while the special for the current inputs hasn't come back", () => {
    assert.equal(specialCheckState(true, "a|2|2026-11-10", null), "checking");
    assert.equal(
      specialPaymentBlocker("checking"),
      "Checking the special price for this visit…",
    );
  });

  it("an answer for the previous inputs doesn't count — the new ones are still checking", () => {
    const answer = { key: "a|2|2026-11-10", failed: false };
    assert.equal(specialCheckState(true, "a|2|2026-11-11", answer), "checking");
  });

  it("a failed check holds payment instead of charging full price", () => {
    const state = specialCheckState(true, "k", { key: "k", failed: true });
    assert.equal(state, "failed");
    assert.equal(
      specialPaymentBlocker(state),
      "The special price could not be checked.",
    );
  });

  it("Try again asks afresh (a new key), and a good answer releases payment", () => {
    const failed = { key: "k|0", failed: true };
    assert.equal(specialCheckState(true, "k|1", failed), "checking");
    assert.equal(
      specialCheckState(true, "k|1", { key: "k|1", failed: false }),
      "ready",
    );
    assert.equal(specialPaymentBlocker("ready"), null);
  });

  it("nothing to wait for when no special is looked up (no item / date not picked)", () => {
    assert.equal(specialCheckState(false, "", null), "idle");
    assert.equal(specialPaymentBlocker("idle"), null);
  });
});

describe("hhmm / sameVisit", () => {
  it("normalizes times", () => {
    assert.equal(hhmm("9:05"), "09:05");
    assert.equal(hhmm("14:30:00"), "14:30");
    assert.equal(hhmm(null), "");
    assert.equal(hhmm("soon"), "");
  });

  it("treats 14:30 and 14:30:00 as the same visit", () => {
    const a: Visit = {
      entityId: 1,
      date: "2026-11-10",
      time: "14:30:00",
      quantity: 2,
    };
    assert.equal(sameVisit(a, { ...a, time: "14:30" }), true);
    assert.equal(sameVisit(a, { ...a, date: "2026-11-11" }), false);
    assert.equal(sameVisit(a, { ...a, quantity: 3 }), false);
    assert.equal(sameVisit(a, { ...a, entityId: 2 }), false);
  });
});

describe("packageSpecialQuantity", () => {
  it("covers every participant on a per-person package", () => {
    assert.equal(packageSpecialQuantity("per_person", 6), 6);
    assert.equal(packageSpecialQuantity("per_person", "4"), 4);
  });
  it("covers the booking once otherwise, and never less than one", () => {
    assert.equal(packageSpecialQuantity("fixed", 6), 1);
    assert.equal(packageSpecialQuantity(null, 6), 1);
    assert.equal(packageSpecialQuantity("per_person", 0), 1);
    assert.equal(packageSpecialQuantity("per_person", ""), 1);
  });
});

describe("normalizeSpecialBreakdown", () => {
  it("passes a current server's per-ticket answer through untouched", () => {
    const raw = {
      original_price: 60,
      total_discount: 39,
      quantity: 3,
      discounts_applied: [
        { discount_amount: 39, unit_discount_amount: 13, quantity: 3 },
      ],
    };
    assert.equal(normalizeSpecialBreakdown(raw, 3), raw);
  });

  it("turns an older server's one-unit answer into the per-ticket one", () => {
    const out = normalizeSpecialBreakdown(
      {
        original_price: 20,
        discounted_price: 7,
        total_discount: 13,
        has_special_pricing: true,
        discounts_applied: [
          { name: "Tuesday", discount_type: "fixed", discount_amount: 13 },
        ],
      },
      3,
    );
    assert.equal(out.original_price, 60);
    assert.equal(out.total_discount, 39);
    assert.equal(out.discounted_price, 21);
    assert.equal(out.quantity, 3);
    assert.deepEqual(out.discounts_applied?.[0], {
      name: "Tuesday",
      discount_type: "fixed",
      discount_amount: 39,
      unit_discount_amount: 13,
      quantity: 3,
    });
  });

  it("a percentage scales the same way (10% of each $20 ticket)", () => {
    const out = normalizeSpecialBreakdown(
      { original_price: 20, total_discount: 2, discounts_applied: [] },
      4,
    );
    assert.equal(out.total_discount, 8);
    assert.equal(out.original_price, 80);
  });
});

describe("special entries", () => {
  const list = [
    { discount_name: "Tuesday", discount_amount: 26, special_pricing_id: 7 },
    {
      discount_name: "Promo",
      discount_amount: "5.00",
      special_pricing_id: null,
    },
    {
      discount_name: "Tagged",
      discount_amount: 1.5,
      source: "special_pricing",
    },
  ];

  it("recognizes specials by id or source", () => {
    assert.deepEqual(list.map(isSpecialPricingDiscount), [true, false, true]);
  });

  it("totals only the special part", () => {
    assert.equal(specialPricingTotal(list), 27.5);
    assert.equal(specialPricingTotal(null), 0);
  });
});

describe("per-ticket labels", () => {
  it("reads '$13.00 off each' for a fixed special on several tickets", () => {
    assert.equal(
      perTicketOffLabel({
        discount_label: "$13.00",
        discount_type: "fixed",
        quantity: 3,
      }),
      "$13.00 off each",
    );
    assert.equal(
      perTicketLabel({
        discount_label: "$13.00",
        discount_type: "fixed",
        quantity: 3,
      }),
      "$13.00 each",
    );
  });
  it("leaves single tickets and percentages alone", () => {
    assert.equal(
      perTicketOffLabel({
        discount_label: "$13.00",
        discount_type: "fixed",
        quantity: 1,
      }),
      "$13.00 off",
    );
    assert.equal(
      perTicketOffLabel({
        discount_label: "10%",
        discount_type: "percentage",
        quantity: 3,
      }),
      "10% off",
    );
    assert.equal(perTicketLabel({ discount_label: null }), "");
  });
});

describe("deal wording", () => {
  const weekly: SpecialDeal = {
    special_pricing_id: 1,
    name: "Tuesday Deal",
    description: null,
    discount_type: "fixed",
    discount_amount: 5,
    discount_label: "$5.00",
    recurrence_type: "weekly",
    recurrence_value: 2,
    recurrence_display: "Every Tuesday",
    specific_date: null,
    start_date: "2026-12-01",
    end_date: "2026-12-31",
    time_start: "17:00",
    time_end: "21:00",
    next_dates: [],
  };

  it("says what comes off, per unit, and when", () => {
    assert.equal(
      specialDealHeadline(weekly, "ticket", "2026-11-03"),
      "$5.00 off each ticket for visits on Tuesdays, 5:00 PM–9:00 PM from Dec 1 through Dec 31",
    );
    assert.equal(
      specialDealHeadline(weekly, "booking", "2026-12-05"),
      "$5.00 off the booking for visits on Tuesdays, 5:00 PM–9:00 PM through Dec 31",
    );
  });

  it("names a one-time day by its calendar date, with no window", () => {
    const once: SpecialDeal = {
      ...weekly,
      discount_type: "percentage",
      discount_label: "20%",
      recurrence_type: "one_time",
      recurrence_value: null,
      specific_date: "2026-11-10",
      time_start: null,
      time_end: null,
    };
    assert.equal(
      specialDealHeadline(once, "person", "2026-11-03"),
      "20% off visits on Tuesday, Nov 10",
    );
  });

  it("the special's last day is still a deal day; days with nothing are dropped", () => {
    const dates = dealDatesFor({
      "2026-12-29": [{ discount_label: "$5.00" }],
      "2026-12-30": [],
      "2026-12-31": [{ discount_label: "$5.00" }, { discount_label: "10%" }],
    });
    assert.deepEqual(dates, {
      "2026-12-29": "$5.00 off",
      "2026-12-31": "$5.00 off, 10% off",
    });
    assert.equal(dealDatesFor({}), undefined);
    assert.equal(dealDatesFor(null), undefined);
  });

  it("explains that the visit day decides", () => {
    assert.equal(
      specialDealHint(true, "2026-11-10"),
      "Your visit date gets the special price.",
    );
    assert.match(
      specialDealHint(false, "2026-11-11"),
      /day you visit, not the day you buy/,
    );
  });
});

describe("applySpecialTarget — swapping the special on an edit", () => {
  const promo = {
    discount_name: "Promo",
    discount_amount: 5,
    special_pricing_id: null,
  };
  const tue = {
    discount_name: "Tuesday",
    discount_amount: 26,
    special_pricing_id: 7,
  };

  it("a reschedule onto a bigger special raises the discount by the difference", () => {
    const bigger = {
      discount_name: "Big Tuesday",
      discount_amount: 40,
      special_pricing_id: 9,
    };
    const out = applySpecialTarget([tue, promo], 31, [bigger], {
      raw: null,
      lastSet: null,
    });
    assert.ok(out);
    assert.equal(out.discountAmount, 45);
    assert.deepEqual(out.applied, [bigger, promo]);
  });

  it("a reschedule off the special day removes it and lowers the discount", () => {
    const out = applySpecialTarget([tue, promo], 31, [], {
      raw: null,
      lastSet: null,
    });
    assert.ok(out);
    assert.equal(out.discountAmount, 5);
    assert.deepEqual(out.applied, [promo]);
  });

  it("does nothing when the special is unchanged", () => {
    assert.equal(
      applySpecialTarget([tue, promo], 31, [{ ...tue }], {
        raw: null,
        lastSet: null,
      }),
      null,
    );
  });

  it("keeps the running figure so moving away and back again lands where it started", () => {
    const away = applySpecialTarget([tue], 3, [], { raw: null, lastSet: null });
    assert.ok(away);
    assert.equal(away.discountAmount, 0);
    const back = applySpecialTarget(
      away.applied,
      away.discountAmount,
      [tue],
      away.memo,
    );
    assert.ok(back);
    assert.equal(back.discountAmount, 3);
  });

  it("starts over from the typed figure once staff change the discount by hand", () => {
    const away = applySpecialTarget([tue], 3, [], { raw: null, lastSet: null });
    assert.ok(away);
    const back = applySpecialTarget(away.applied, 10, [tue], away.memo);
    assert.ok(back);
    assert.equal(back.discountAmount, 36);
  });
});

describe("repricingNotice / visitChangeWhere", () => {
  const original: Visit = {
    entityId: 1,
    date: "2026-11-10",
    time: "18:00",
    quantity: 2,
  };
  const tue = [
    { discount_name: "Tuesday", discount_amount: 26, special_pricing_id: 7 },
  ];

  it("names what moved", () => {
    assert.equal(
      visitChangeWhere(
        original,
        { ...original, date: "2026-11-11" },
        "visit date",
      ),
      "on the new visit date",
    );
    assert.equal(
      visitChangeWhere(original, { ...original, time: "19:00" }, "date"),
      "at the new time",
    );
    assert.equal(
      visitChangeWhere(original, { ...original, entityId: 2 }, "date"),
      "for the new attraction",
    );
    assert.equal(
      visitChangeWhere(original, { ...original, quantity: 1 }, "date"),
      "for 1 ticket",
    );
  });

  it("is silent when the special did not change", () => {
    const quote = {
      changed: false,
      specialDiscounts: tue,
      specialPricingDiscount: 26,
      givenSpecial: 26,
      proposedSpecial: 26,
      delta: 0,
    };
    assert.equal(
      repricingNotice({
        quote,
        isOrderLine: false,
        where: "x",
        originalSpecial: tue,
      }),
      null,
    );
  });

  it("says the special is removed when the new day has none", () => {
    const quote = {
      changed: true,
      specialDiscounts: [],
      specialPricingDiscount: 0,
      givenSpecial: 26,
      proposedSpecial: 0,
      delta: -26,
    };
    assert.equal(
      repricingNotice({
        quote,
        isOrderLine: false,
        where: "on the new visit date",
        originalSpecial: tue,
      }),
      "Tuesday does not apply on the new visit date — the $26.00 special discount is removed.",
    );
  });

  it("says what applies now when a different special does", () => {
    const big = [
      {
        discount_name: "Big Tuesday",
        discount_amount: 40,
        special_pricing_id: 9,
      },
    ];
    const quote = {
      changed: true,
      specialDiscounts: big,
      specialPricingDiscount: 40,
      givenSpecial: 26,
      proposedSpecial: 40,
      delta: 14,
    };
    assert.equal(
      repricingNotice({
        quote,
        isOrderLine: false,
        where: "at the new time",
        originalSpecial: tue,
      }),
      "Big Tuesday applies at the new time: $40.00 off (was $26.00 off).",
    );
  });

  it("tells bulk-order lines they keep the price paid", () => {
    const quote = {
      changed: true,
      specialDiscounts: [],
      specialPricingDiscount: 0,
      givenSpecial: 26,
      proposedSpecial: 0,
      delta: -26,
    };
    assert.match(
      repricingNotice({
        quote,
        isOrderLine: true,
        where: "on the new date",
        originalSpecial: tue,
      }) ?? "",
      /keep the price that was paid/,
    );
  });
});

describe("soldTicketPrice — older purchases keep the price paid", () => {
  const base = {
    totalAmount: 0,
    discountAmount: 0,
    quantity: 1,
    addOns: [],
    fees: [],
  };

  it("uses the stored unit price, even if the catalog price has changed since", () => {
    assert.equal(soldTicketPrice({ ...base, unitPrice: 18 }), 18);
  });

  it("works an older row's price back out of what was charged", () => {
    const price = soldTicketPrice({
      unitPrice: null,
      totalAmount: 40,
      discountAmount: 13,
      quantity: 2,
      addOns: [{ priceAtPurchase: 5, quantity: 2 }],
      fees: [
        { fee_amount: 3, fee_application_type: "additive" },
        { fee_amount: 1, fee_application_type: "inclusive" },
      ],
    });
    assert.equal(price, 20);
  });

  it("gives up (catalog price) when the figures don't add up to a price", () => {
    assert.equal(
      soldTicketPrice({ ...base, unitPrice: null, totalAmount: 0 }),
      null,
    );
  });
});

/*
 * The old/new server formulas, line for line from backend SpecialPricing
 * (44e1a85^ and 44e1a85 getFullPriceBreakdown + calculateDiscount), so the
 * older-server fallback is checked against what the current server charges.
 */
type Rule = { type: "fixed" | "percentage"; amount: number; stackable: boolean };
const r2 = (n: number) => Math.round(n * 100) / 100;
const discountOn = (rule: Rule, price: number) =>
  rule.type === "fixed" ? Math.min(rule.amount, price) : r2(price * (rule.amount / 100));

function oldServer(unitPrice: number, rules: Rule[]) {
  let current = unitPrice;
  let total = 0;
  let nonStackable = false;
  const lines: { discount_amount: number }[] = [];
  for (const rule of rules) {
    if (nonStackable && !rule.stackable) continue;
    const d = discountOn(rule, current);
    lines.push({ discount_amount: d });
    current -= d;
    total += d;
    if (!rule.stackable) nonStackable = true;
    if (current <= 0) break;
  }
  return { original_price: unitPrice, total_discount: r2(total), discounts_applied: lines, has_special_pricing: lines.length > 0 };
}

function newServer(unitPrice: number, qty: number, rules: Rule[]) {
  const q = Math.max(1, qty);
  let current = unitPrice;
  let total = 0;
  let nonStackable = false;
  const lines: { discount_amount: number }[] = [];
  for (const rule of rules) {
    if (nonStackable && !rule.stackable) continue;
    const unit = discountOn(rule, current);
    const line = r2(unit * q);
    lines.push({ discount_amount: line });
    current -= unit;
    total += line;
    if (!rule.stackable) nonStackable = true;
    if (current <= 0) break;
  }
  return { original_price: r2(unitPrice * q), total_discount: r2(total), discounts_applied: lines, quantity: q };
}

describe("older-server fallback charges exactly what the current server does", () => {
  const fixed13: Rule = { type: "fixed", amount: 13, stackable: false };
  const pct15: Rule = { type: "percentage", amount: 15, stackable: true };
  const fixed5s: Rule = { type: "fixed", amount: 5, stackable: true };
  const cases: { name: string; unit: number; qty: number; rules: Rule[] }[] = [
    { name: "one ticket, fixed", unit: 20, qty: 1, rules: [fixed13] },
    { name: "several tickets, fixed", unit: 20, qty: 3, rules: [fixed13] },
    { name: "fixed larger than the ticket (capped per ticket)", unit: 9.99, qty: 4, rules: [fixed13] },
    { name: "one ticket, percentage", unit: 19.99, qty: 1, rules: [pct15] },
    { name: "several tickets, percentage with sub-cent rounding", unit: 19.99, qty: 7, rules: [pct15] },
    { name: "stacked fixed + percentage", unit: 24.5, qty: 5, rules: [fixed5s, pct15] },
    { name: "large order", unit: 17.35, qty: 250, rules: [pct15, fixed5s] },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const expected = newServer(c.unit, c.qty, c.rules);
      const fallback = normalizeSpecialBreakdown(oldServer(c.unit, c.rules), c.qty);
      assert.equal(fallback.total_discount, expected.total_discount);
      assert.equal(fallback.original_price, expected.original_price);
      assert.deepEqual(
        (fallback.discounts_applied ?? []).map((d) => d.discount_amount),
        expected.discounts_applied.map((d) => d.discount_amount),
      );
    });
  }

  it("a missing, zero, negative or invalid quantity is priced as one ticket — as the server does", () => {
    for (const bad of [0, -3, Number.NaN, 0.4]) {
      const fallback = normalizeSpecialBreakdown(oldServer(20, [fixed13]), bad);
      assert.equal(fallback.quantity, 1);
      assert.equal(fallback.total_discount, newServer(20, 1, [fixed13]).total_discount);
    }
  });

  it("add-ons and a manual discount never reach the special (it is priced from the ticket alone)", () => {
    // The lookup sends one ticket's price × tickets; a $30 add-on or a $10
    // manual discount on the order changes neither input, so not the answer.
    const withoutExtras = normalizeSpecialBreakdown(oldServer(20, [pct15]), 2);
    assert.equal(withoutExtras.total_discount, 6);
    assert.equal(withoutExtras.original_price, 40);
  });
});
