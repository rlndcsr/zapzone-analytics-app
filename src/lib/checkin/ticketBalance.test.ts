import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confirmedTicketBalance } from "./ticketBalance.ts";

describe("confirmedTicketBalance — balance due at check-in", () => {
  const ticket = {
    status: "confirmed",
    totalAmount: 40,
    amountPaid: 40,
    amountPaidRecorded: true,
  };

  it("a fully paid ticket owes nothing", () => {
    assert.equal(confirmedTicketBalance(ticket), 0);
  });

  it("a reschedule that raised the total leaves only the difference due", () => {
    assert.equal(confirmedTicketBalance({ ...ticket, totalAmount: 52 }), 12);
  });

  it("never treats the whole total as due when part was paid", () => {
    assert.equal(
      confirmedTicketBalance({ ...ticket, totalAmount: 52, amountPaid: 30 }),
      22,
    );
  });

  it("an overpaid ticket (total went down) owes nothing", () => {
    assert.equal(confirmedTicketBalance({ ...ticket, totalAmount: 27 }), 0);
  });

  it("no recorded payment → no balance claimed, rather than a false one", () => {
    assert.equal(
      confirmedTicketBalance({
        ...ticket,
        totalAmount: 52,
        amountPaid: 0,
        amountPaidRecorded: false,
      }),
      0,
    );
    assert.equal(
      confirmedTicketBalance({
        status: "confirmed",
        totalAmount: 52,
        amountPaid: 0,
      }),
      0,
    );
  });

  it("only confirmed tickets (pending already shows its outstanding amount)", () => {
    assert.equal(
      confirmedTicketBalance({ ...ticket, status: "pending", totalAmount: 52 }),
      0,
    );
    assert.equal(
      confirmedTicketBalance({
        ...ticket,
        status: "checked-in",
        totalAmount: 52,
      }),
      0,
    );
  });

  it("ignores sub-cent rounding", () => {
    assert.equal(confirmedTicketBalance({ ...ticket, totalAmount: 40.004 }), 0);
  });
});
