import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bulkCompleteBookingsNotice,
  bulkCompleteConfirmMessage,
  canCancelFollowUp,
  canSendFollowUpNow,
  describeFollowUp,
  followUpCardText,
  followUpEmailName,
  followUpOf,
  followUpSendLabel,
  followUpStatusLine,
  formatFollowUpTime,
  ratingsRequestedLine,
  visitRoute,
  type FollowUpRow,
  type VisitFollowUpSummary,
} from "./visitFollowUp.ts";

const row = (over: Partial<FollowUpRow> = {}): FollowUpRow => ({
  id: 1,
  kind: "thanks",
  visit_type: "booking",
  visit_id: 7,
  recipient_name: "Dana",
  recipient_email_masked: "d***@example.com",
  waiver_id: null,
  status: "scheduled",
  gave_up: false,
  due_at: "2026-10-01T19:05:00Z",
  sent_at: null,
  attempts: 0,
  error: null,
  reason: null,
  rating: null,
  comment: null,
  rated_at: null,
  email_notification_id: 3,
  is_current_recipient: true,
  ...over,
});

const summary = (over: Partial<VisitFollowUpSummary> = {}): VisitFollowUpSummary => ({
  available: true,
  visit_type: "booking",
  visit_id: 7,
  completed: true,
  handled_by_game: false,
  recipient_email_masked: "d***@example.com",
  max_visit_age_days: 3,
  thanks_email: { active: true, id: 10, name: "Thanks for Playing (Customer)", hours: null, promo: null },
  review_email: { active: true, id: 11, name: "Review Request (Guest)", hours: 24, promo: null },
  thanks: [],
  reviews: [],
  can_send_thanks: false,
  ...over,
});

describe("follow-up wording helpers", () => {
  it("strips the (Customer)/(Guest) suffix from email names, with a fallback", () => {
    assert.equal(followUpEmailName("Thanks for Playing (Customer)", "x"), "Thanks for Playing");
    assert.equal(followUpEmailName("  ", "Review Request"), "Review Request");
    assert.equal(followUpEmailName(null, "Review Request"), "Review Request");
  });

  it("formats times in venue time like the web (Oct 1, 3:05 PM)", () => {
    assert.equal(formatFollowUpTime("2026-10-01T19:05:00Z"), "Oct 1, 3:05 PM");
    assert.equal(formatFollowUpTime(null), "");
  });

  it("describes each row's status", () => {
    assert.equal(followUpStatusLine(row()), "Goes out Oct 1, 3:05 PM");
    assert.equal(followUpStatusLine(row({ status: "failed", gave_up: true })), "Could not be delivered after 3 tries");
    assert.equal(followUpStatusLine(row({ status: "failed" })), "Delivery failed, trying again soon");
    assert.equal(followUpStatusLine(row({ status: "skipped" })), "Not sent");
    assert.equal(followUpStatusLine(row({ status: "skipped", error: "Guest opted out." })), "Guest opted out.");
  });
});

describe("describeFollowUp — the notice after completing a visit", () => {
  it("is silent when follow-ups are unavailable", () => {
    assert.equal(describeFollowUp(undefined), null);
    assert.equal(describeFollowUp(summary({ available: false })), null);
  });

  it("explains escape-room bookings are emailed from the game screen", () => {
    assert.equal(
      describeFollowUp(summary({ handled_by_game: true })),
      "This is an escape-room booking, so the Thanks for Playing email goes out from the game screen with the group photo.",
    );
  });

  it("reports the thank-you just sent and the scheduled review", () => {
    const text = describeFollowUp(
      summary({
        thanks: [row({ status: "sent", sent_in_this_action: true })],
        reviews: [row({ id: 2, kind: "review", status: "scheduled" })],
      }),
    );
    assert.equal(
      text,
      "The Thanks for Playing email went to d***@example.com. Review request goes out Oct 1, 3:05 PM.",
    );
  });

  it("uses the server's visit-date reason when nothing went out", () => {
    const text = describeFollowUp(
      summary({ thanks: [row({ status: "skipped", reason: "visit_date", error: "That visit was more than 3 days ago." })] }),
    );
    assert.equal(text, "That visit was more than 3 days ago.");
  });

  it("says when there is no email address", () => {
    assert.equal(
      describeFollowUp(summary({ recipient_email_masked: null })),
      "No email address on file, so no follow-up email went out.",
    );
  });
});

describe("follow-up card — Send now / Don't send", () => {
  it("offers Send now only on a completed visit, for the current recipient", () => {
    assert.equal(canSendFollowUpNow(row(), true), true);
    assert.equal(canSendFollowUpNow(row(), false), false);
    assert.equal(canSendFollowUpNow(row({ status: "sent" }), true), false);
    assert.equal(canSendFollowUpNow(row({ is_current_recipient: false }), true), false);
    assert.equal(canSendFollowUpNow(row({ reason: "opted_out" }), true), false);
    assert.equal(canSendFollowUpNow(row({ reason: "left_game" }), true), false);
    // after a guest email change the current guest's row can be sent again
    assert.equal(canSendFollowUpNow(row({ status: "canceled", reason: "recipient_changed" }), true), true);
    assert.equal(
      canSendFollowUpNow(row({ status: "canceled", reason: "recipient_changed", is_current_recipient: false }), true),
      false,
    );
    assert.equal(canSendFollowUpNow(row({ kind: "review", reason: "asked_recently" }), true), false);
    assert.equal(canSendFollowUpNow(row({ kind: "thanks", reason: "asked_recently" }), true), true);
  });

  it("labels the button by what happened before", () => {
    assert.equal(followUpSendLabel(row()), "Send now");
    assert.equal(followUpSendLabel(row({ status: "failed", attempts: 2 })), "Try again");
    assert.equal(followUpSendLabel(row({ status: "canceled", attempts: 1 })), "Send again");
  });

  it("lets only a scheduled email be cancelled", () => {
    assert.equal(canCancelFollowUp(row()), true);
    assert.equal(canCancelFollowUp(row({ status: "sent" })), false);
  });

  it("explains what completing will send on a visit not yet completed", () => {
    const text = followUpCardText(summary({ completed: false }), "booking");
    assert.equal(
      text.intro,
      "When this booking is set to Completed, Thanks for Playing goes to d***@example.com right away and Review Request follows about 24 hours later (never overnight). Visits more than 3 days old or still ahead are not emailed automatically.",
    );
    assert.equal(text.switchedOff, null);
  });

  it("names the noun and the missing address on a completed purchase", () => {
    const text = followUpCardText(summary({ recipient_email_masked: null }), "event_purchase");
    assert.equal(text.intro, "This purchase has no email address, so no follow-up emails can be sent.");
  });

  it("explains bulk ticket order lines never get follow-ups", () => {
    const text = followUpCardText(summary({ is_ticket_order_line: true, thanks_email: { active: false, id: null, name: null, hours: null, promo: null } }), "event_purchase");
    assert.match(text.intro ?? "", /bulk ticket order/);
    assert.equal(text.switchedOff, null);
  });

  it("notes switched-off emails", () => {
    const text = followUpCardText(
      summary({ review_email: { active: false, id: 11, name: "Review Request", hours: 24, promo: null } }),
      "booking",
    );
    assert.equal(text.switchedOff, "Review Request is switched off in Email Notifications.");
  });

  it("offers to send the thank-you to the new address when only an old one was emailed", () => {
    const text = followUpCardText(
      summary({ can_send_thanks: true, thanks: [row({ status: "sent", is_current_recipient: false })] }),
      "booking",
    );
    assert.equal(text.sendThanksLabel, "Send Thanks for Playing to d***@example.com");
    assert.equal(
      followUpCardText(summary({ can_send_thanks: true }), "booking").sendThanksLabel,
      "Send Thanks for Playing now",
    );
    assert.equal(followUpCardText(summary(), "booking").sendThanksLabel, null);
  });
});

describe("bulk Complete", () => {
  it("asks first, with singular / plural nouns", () => {
    assert.equal(
      bulkCompleteConfirmMessage(1, "booking"),
      "Mark 1 booking as Completed? Guests of visits from the last 3 days get the Thanks for Playing email right away and a review request later. Older or future visits are marked Completed without emailing anyone.",
    );
    assert.match(bulkCompleteConfirmMessage(3, "purchase"), /^Mark 3 purchases as Completed\?/);
  });

  it("reports what was sent", () => {
    const sent = summary({
      thanks: [row({ status: "sent", sent_in_this_action: true })],
      reviews: [row({ id: 2, kind: "review" })],
    });
    const held = summary({ thanks: [row({ status: "skipped", reason: "visit_date" })] });
    assert.equal(
      bulkCompleteBookingsNotice([sent, held, undefined], 3),
      "Thanks for Playing sent for 1 of 3 bookings; 1 review request scheduled. 1 visit was not emailed because of the visit date.",
    );
  });

  it("says nothing when no follow-up happened", () => {
    assert.equal(bulkCompleteBookingsNotice([undefined, summary()], 2), null);
  });
});

describe("reading follow_up off a response", () => {
  it("returns the summary or undefined", () => {
    const s = summary();
    assert.equal(followUpOf({ success: true, data: {}, follow_up: s }), s);
    assert.equal(followUpOf({ success: true }), undefined);
    assert.equal(followUpOf(null), undefined);
  });
});

describe("guest ratings", () => {
  it("shows the answer rate", () => {
    assert.equal(
      ratingsRequestedLine({ requested: 8, rated: 2, average: 4, distribution: {} }),
      "8 requested · 25% answered",
    );
    assert.equal(ratingsRequestedLine({ requested: 0, rated: 0, average: null, distribution: {} }), "0 requested");
  });

  it("opens each visit type on its app screen", () => {
    assert.deepEqual(visitRoute({ visit_type: "booking", visit_id: 4 }), {
      pathname: "/bookings/bookings",
      params: { openId: "4" },
    });
    assert.deepEqual(visitRoute({ visit_type: "event_purchase", visit_id: 5 }), {
      pathname: "/events/purchase-details",
      params: { id: "5" },
    });
    assert.deepEqual(visitRoute({ visit_type: "escape_room_session", visit_id: 6 }), {
      pathname: "/photos/escape-rooms",
      params: { session: "6" },
    });
  });
});
