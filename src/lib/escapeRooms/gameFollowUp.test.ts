import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GameFollowUp } from "../visitFollowUp/visitFollowUp.ts";
import {
  canCancelRetryingReview,
  canResendThanks,
  completeAndSendExtras,
  completeAndSendQuestion,
  emailedLaterToast,
  emailPlayersOptionLabel,
  escapeRoomEmailNote,
  followUpInfoParts,
  gameDayLabel,
  gameFollowUpState,
  newPlayersSummary,
  pastGameCompleteConfirm,
  pastGameEmailConfirm,
  recordedResultToast,
  recordOnlyQuestion,
  REMOVE_PLAYER_QUESTION,
  reviewBadge,
  reviewCountsLine,
  reviewResendLabel,
  sendToNewLabel,
  thanksBadge,
  thanksFailedLine,
  withoutPhotoSummary,
} from "./gameFollowUp.ts";

const followUp = (over: Partial<GameFollowUp> = {}): GameFollowUp => ({
  available: true,
  thanks_email: {
    active: true,
    id: 10,
    name: "Thanks for Playing (Guest)",
    hours: null,
    promo: { id: 1, code: "COMEBACK", offer: "10% off", name: null, ends_on: null, problem: null },
  },
  review_email: { active: true, id: 11, name: "Review Request", hours: 24, promo: null },
  reviews: null,
  ...over,
});

const state = (over: Partial<GameFollowUp> = {}, canEmailPlayers: boolean | null = true) =>
  gameFollowUpState({ followUp: followUp(over), canEmailPlayers });

const player = (thanks: string | null, review: { status: string; rating?: number | null } | null = null) => ({
  thanksEmail: thanks ? { status: thanks as "sent" } : null,
  review: review
    ? { status: review.status as "scheduled", rating: review.rating ?? null, due_at: "2026-10-01T19:05:00Z" }
    : null,
});

describe("game follow-up state", () => {
  it("reads the thank-you, promo and review settings", () => {
    const s = state();
    assert.equal(s.thanksName, "Thanks for Playing");
    assert.equal(s.thanksOn, true);
    assert.deepEqual(s.thanksPromo, { code: "COMEBACK", offer: "10% off" });
    assert.equal(s.reviewHours, 24);
    assert.equal(s.canEmailPlayers, true);
  });

  it("drops an unusable promo but reports its problem", () => {
    const s = state({
      thanks_email: {
        active: true,
        id: 10,
        name: null,
        hours: null,
        promo: { id: 1, code: "OLD", offer: "5% off", name: null, ends_on: null, problem: "This code expired." },
      },
    });
    assert.equal(s.thanksPromo, null);
    assert.equal(s.promoProblem, "This code expired.");
  });

  it("falls back like the web when the server omits can_email_players", () => {
    assert.equal(gameFollowUpState({ followUp: null, canEmailPlayers: null }).canEmailPlayers, true);
    const off = gameFollowUpState({
      followUp: followUp({
        thanks_email: { active: false, id: 10, name: null, hours: null, promo: null },
        review_email: { active: false, id: 11, name: null, hours: null, promo: null },
      }),
      canEmailPlayers: null,
    });
    assert.equal(off.canEmailPlayers, false);
  });
});

describe("Result only can email the players", () => {
  it("asks without promising that no email is sent", () => {
    assert.equal(
      recordOnlyQuestion("Pharaoh", "7:00 PM", "45:10"),
      "Record Pharaoh at 7:00 PM with a finish time of 45:10 without a photo? A photo can't be added to this game later.",
    );
    assert.equal(
      recordOnlyQuestion("Pharaoh", "7:00 PM", null),
      "Record Pharaoh at 7:00 PM as didn't escape without a photo? A photo can't be added to this game later.",
    );
  });

  it("labels the email checkbox for thank-you on and off", () => {
    assert.equal(
      emailPlayersOptionLabel(state(), 3),
      "Email 3 players the Thanks for Playing email without a photo, with promo code COMEBACK, and the review request later.",
    );
    const thanksOff = state({ thanks_email: { active: false, id: 10, name: null, hours: null, promo: null } });
    assert.equal(
      emailPlayersOptionLabel(thanksOff, 1),
      "Send 1 player a review request about 24 hours from now. The Thanks for Playing email is switched off.",
    );
  });

  it("reports what the recording emailed", () => {
    assert.deepEqual(
      recordedResultToast([player("sent", { status: "scheduled" }), player("failed")], "Thanks for Playing"),
      {
        message:
          "Result recorded; the Thanks for Playing email went to 1 player, 1 email has not gone through yet, 1 review request is scheduled.",
        type: "info",
      },
    );
    assert.deepEqual(recordedResultToast([player(null)], "Thanks for Playing"), {
      message: "Result recorded. No email was sent.",
      type: "success",
    });
  });

  it("summarises a photo-less game in the completed notice", () => {
    assert.equal(
      withoutPhotoSummary([player("sent"), player("sent")], "Thanks for Playing"),
      "Recorded without a group photo; the Thanks for Playing email went to 2 players",
    );
    assert.equal(
      withoutPhotoSummary([player(null, { status: "scheduled" })], "Thanks for Playing"),
      "Recorded without a group photo; the players get a review request later",
    );
    assert.equal(withoutPhotoSummary([player(null)], "x"), "Recorded without a group photo, so no email was sent");
    assert.equal(
      thanksFailedLine(1),
      "1 thank-you email has not gone through. Use Send thank-you again next to the player.",
    );
  });
});

describe("emailing the players later", () => {
  it("names the day of a past game", () => {
    assert.equal(gameDayLabel("2026-09-30"), "Wed, Sep 30");
    assert.equal(
      pastGameEmailConfirm("Wed, Sep 30", 2, true),
      "This game was played on Wed, Sep 30. Email 2 players about it now?",
    );
    assert.equal(
      pastGameEmailConfirm("Wed, Sep 30", 1, false),
      "This game was played on Wed, Sep 30. Schedule review requests for 1 player?",
    );
  });

  it("describes players not yet emailed on a photo-less game", () => {
    const base = { newPlayers: 2, stuck: 0, completedWithoutPhoto: true, dayLabel: "Wed, Sep 30" };
    assert.equal(newPlayersSummary({ ...base, isToday: true }), "2 players have not been emailed.");
    assert.equal(
      newPlayersSummary({ ...base, isToday: false }),
      "2 players have not been emailed (this game was on Wed, Sep 30).",
    );
    assert.equal(
      newPlayersSummary({ ...base, completedWithoutPhoto: false, stuck: 1, isToday: true }),
      "2 players have signed since the photo was sent, and 1 email did not finish sending.",
    );
  });

  it("labels the button by game type", () => {
    const base = { newPlayers: 2, stuck: 0, thanksOn: true };
    assert.equal(sendToNewLabel({ ...base, completedWithoutPhoto: true }), "Email 2 players");
    assert.equal(sendToNewLabel({ ...base, completedWithoutPhoto: true, thanksOn: false }), "Schedule review requests");
    assert.equal(sendToNewLabel({ ...base, completedWithoutPhoto: false }), "Send to new players");
    assert.equal(sendToNewLabel({ ...base, stuck: 1, completedWithoutPhoto: false }), "Send now");
    assert.equal(sendToNewLabel({ ...base, newPlayers: 0, stuck: 1, completedWithoutPhoto: false }), "Try sending again");
  });

  it("reports what was sent, failed and scheduled — counting only this send", () => {
    assert.deepEqual(
      emailedLaterToast(
        [player("sent"), player(null), player(null)],
        [player("sent"), player("sent", { status: "scheduled" }), player("failed")],
        "Thanks for Playing",
      ),
      {
        message:
          "The Thanks for Playing email went to 1 player, 1 email has not gone through yet, 1 review request is scheduled.",
        type: "info",
      },
    );
  });

  it("is a success when everything went out", () => {
    assert.deepEqual(
      emailedLaterToast([player(null), player(null)], [player("sent"), player("sent")], "Thanks for Playing"),
      { message: "The Thanks for Playing email went to 2 players.", type: "success" },
    );
    assert.deepEqual(
      emailedLaterToast([player(null)], [player(null, { status: "scheduled" })], "x"),
      { message: "1 review request is scheduled.", type: "success" },
    );
  });

  it("says so when nothing was sent", () => {
    assert.deepEqual(emailedLaterToast([player("sent")], [player("sent")], "x"), {
      message: "No email was sent. See each player below.",
      type: "info",
    });
  });
});

describe("Complete & Send", () => {
  it("asks first on a game from an earlier day", () => {
    assert.equal(
      pastGameCompleteConfirm("Wed, Sep 30"),
      "This game was played on Wed, Sep 30. Complete it and email the players now?",
    );
  });

  it("names the thank-you email in the confirm", () => {
    assert.equal(
      completeAndSendQuestion("Thanks for Playing", 4, "Pharaoh", "7:00 PM", null),
      "Send the Thanks for Playing email with the group photo to 4 players in Pharaoh at 7:00 PM, marked as didn't escape? This can only be done once.",
    );
    assert.equal(
      completeAndSendExtras(state()),
      "It includes promo code COMEBACK (10% off) for their next visit. Each player gets a review request about 24 hours later.",
    );
  });

  it("explains what players get, or that the email is off", () => {
    const on = followUpInfoParts(state());
    assert.equal(on.before, "Players get the ");
    assert.equal(
      on.after,
      " email with the photo and finish time, plus promo code COMEBACK (10% off). A review request follows about 24 hours later.",
    );
    const off = followUpInfoParts(state({ thanks_email: { active: false, id: 10, name: null, hours: null, promo: null } }));
    assert.equal(off.after, " email is switched off in Email Notifications, so the photo cannot be emailed.");
  });

  it("summarises review requests", () => {
    assert.equal(
      reviewCountsLine({ scheduled: 2, sent: 1, skipped: 0, failed: 0, rated: 1, average_rating: 4, next_due_at: null }),
      "Review requests: 2 waiting · 1 sent · 1 rated, average 4/5.",
    );
    assert.equal(reviewCountsLine(null), null);
    assert.equal(
      reviewCountsLine({ scheduled: 0, sent: 0, skipped: 3, failed: 0, rated: 0, average_rating: null, next_due_at: null }),
      null,
    );
  });
});

describe("per-player follow-ups", () => {
  it("badges the thank-you and review state", () => {
    assert.deepEqual(thanksBadge({ status: "sent" }), { label: "Thank-you sent", tone: "green" });
    assert.deepEqual(thanksBadge({ status: "failed" }), { label: "Thank-you not delivered", tone: "red" });
    assert.equal(thanksBadge({ status: "sending" }).label, "Thank-you sending");
    assert.equal(thanksBadge({ status: "canceled" }).label, "Thank-you not sent");
    assert.equal(reviewBadge({ status: "sent", rating: 5, due_at: null }).label, "Rated 5/5");
    assert.equal(
      reviewBadge({ status: "scheduled", rating: null, due_at: "2026-10-01T19:05:00Z" }).label,
      "Review request Oct 1, 3:05 PM",
    );
    assert.equal(reviewBadge({ status: "skipped", rating: null, due_at: null }).label, "No review request");
  });

  it("offers Send thank-you again only after it did not go out", () => {
    const r = (status: string, reason: string | null = null, waiver_id: number | null = 5) =>
      ({ status, reason, waiver_id }) as Parameters<typeof canResendThanks>[0];
    assert.equal(canResendThanks(r("failed"), 5), true);
    assert.equal(canResendThanks(r("skipped"), 5), true);
    assert.equal(canResendThanks(r("sent"), 5), false);
    assert.equal(canResendThanks(r("scheduled"), 5), false);
    // a player back in the game may be thanked again; one who left it may not
    assert.equal(canResendThanks(r("canceled", "left_game", 5), 5), true);
    assert.equal(canResendThanks(r("canceled", "left_game", 9), 5), false);
  });

  it("offers Send review now for a player back in the game", () => {
    const r = (status: string, reason: string | null, waiver_id: number | string | null, rating: number | null = null) =>
      ({ status, reason, waiver_id, rating }) as Parameters<typeof reviewResendLabel>[0];
    assert.equal(reviewResendLabel(r("canceled", "left_game", 5), 5), "Send review now");
    assert.equal(reviewResendLabel(r("canceled", "left_game", "5"), 5), "Send review now");
    assert.equal(reviewResendLabel(r("failed", null, 5), 5), "Send review again");
    assert.equal(reviewResendLabel(r("canceled", "left_game", 9), 5), null);
    assert.equal(reviewResendLabel(r("canceled", "staff", 5), 5), null);
    assert.equal(reviewResendLabel(r("failed", null, 5, 4), 5), null);
  });

  it("warns that removing a player also stops their follow-ups", () => {
    assert.equal(
      REMOVE_PLAYER_QUESTION(""),
      "Remove this player from this game? They will not be sent this game's photo or follow-up emails. Their signed waiver is kept.",
    );
  });
});

describe("Photo Settings escape-room email note", () => {
  const email = (over: Partial<Parameters<typeof escapeRoomEmailNote>[0] & object> = {}) => ({
    id: 10,
    name: "Thanks for Playing (Guest)",
    isActive: true,
    roomsWithoutEmail: [] as string[],
    emails: [] as { id: number; name: string; rooms: string[] }[],
    ...over,
  });

  it("keeps the single-email wording when one email covers every room", () => {
    const note = escapeRoomEmailNote(email({ emails: [{ id: 10, name: "Thanks for Playing (Guest)", rooms: ["Pharaoh", "Heist"] }] }));
    assert.equal(note.before, "Escape-room games send their group photo with the ");
    assert.deepEqual(note.links, [{ id: 10, text: "Thanks for Playing", rooms: null }]);
    assert.equal(
      note.after,
      " email in Email Notifications, together with the finish time and the return-visit promo code. Edit that email to change what players get.",
    );
  });

  it("lists each Thanks email with the rooms it covers", () => {
    const note = escapeRoomEmailNote(
      email({
        emails: [
          { id: 10, name: "Thanks for Playing (Guest)", rooms: ["Pharaoh", "Heist"] },
          { id: 12, name: "Escape Zone Thanks", rooms: ["Asylum"] },
        ],
      }),
    );
    assert.equal(
      note.before,
      "Escape-room games send their group photo with the Thanks for Playing email that covers each room: ",
    );
    assert.deepEqual(note.links, [
      { id: 10, text: "Thanks for Playing", rooms: "Pharaoh, Heist" },
      { id: 12, text: "Escape Zone Thanks", rooms: "Asylum" },
    ]);
    assert.equal(
      note.after,
      ". Each includes the finish time and the return-visit promo code. Edit the one for a room to change what its players get.",
    );
  });

  it("still flags rooms without an active Thanks email", () => {
    const single = escapeRoomEmailNote(email({ roomsWithoutEmail: ["Pharaoh"] }));
    assert.match(single.after, /No active Thanks for Playing email covers Pharaoh, so photos from that room cannot be emailed\.$/);
    const many = escapeRoomEmailNote(
      email({
        roomsWithoutEmail: ["Vault", "Lab"],
        emails: [
          { id: 10, name: "A", rooms: ["Pharaoh"] },
          { id: 12, name: "B", rooms: ["Asylum"] },
        ],
      }),
    );
    assert.match(many.after, /No active Thanks for Playing email covers Vault, Lab, so photos from those rooms cannot be emailed\.$/);
  });

  it("flags a switched-off email", () => {
    assert.match(
      escapeRoomEmailNote(email({ name: "X", isActive: false })).after,
      / It is switched off right now, so escape-room photos cannot be emailed\.$/,
    );
    assert.deepEqual(escapeRoomEmailNote(null).links, [{ id: null, text: "Thanks for Playing", rooms: null }]);
  });
});

describe("cancelling a review request that is still retrying", () => {
  it("is offered only for a failed request that has not given up", () => {
    assert.equal(canCancelRetryingReview({ status: "failed", gave_up: false, rating: null }), true);
    assert.equal(canCancelRetryingReview({ status: "failed", gave_up: true, rating: null }), false);
    assert.equal(canCancelRetryingReview({ status: "failed", gave_up: false, rating: 4 }), false);
    // scheduled requests keep their own Don't ask for a review action
    assert.equal(canCancelRetryingReview({ status: "scheduled", gave_up: false, rating: null }), false);
  });
});
