import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GameFollowUp } from "../visitFollowUp/visitFollowUp.ts";
import {
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
  pastGameEmailConfirm,
  recordedResultToast,
  recordOnlyQuestion,
  REMOVE_PLAYER_QUESTION,
  reviewBadge,
  reviewCountsLine,
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
      pastGameEmailConfirm("Wed, Sep 30", 2),
      "This game was played on Wed, Sep 30. Email 2 players about it now?",
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

  it("counts only newly thanked players in the toast", () => {
    assert.equal(
      emailedLaterToast([player("sent"), player(null)], [player("sent"), player("sent")], state()),
      "Emailed the Thanks for Playing email to 1 player.",
    );
    assert.equal(
      emailedLaterToast([], [], { thanksOn: false, thanksName: "x" }),
      "Review requests are scheduled for those players.",
    );
  });
});

describe("Complete & Send", () => {
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
    assert.equal(canResendThanks({ status: "failed" }), true);
    assert.equal(canResendThanks({ status: "skipped" }), true);
    assert.equal(canResendThanks({ status: "sent" }), false);
    assert.equal(canResendThanks({ status: "scheduled" }), false);
  });

  it("warns that removing a player also stops their follow-ups", () => {
    assert.equal(
      REMOVE_PLAYER_QUESTION(""),
      "Remove this player from this game? They will not be sent this game's photo or follow-up emails. Their signed waiver is kept.",
    );
  });
});

describe("Photo Settings escape-room email note", () => {
  it("names the email and flags rooms it cannot cover", () => {
    const note = escapeRoomEmailNote({ name: "Thanks for Playing (Guest)", isActive: true, roomsWithoutEmail: ["Pharaoh"] });
    assert.equal(note.linkText, "Thanks for Playing");
    assert.match(note.after, /No active Thanks for Playing email covers Pharaoh, so photos from that room cannot be emailed\.$/);
  });

  it("flags a switched-off email", () => {
    assert.match(
      escapeRoomEmailNote({ name: "X", isActive: false, roomsWithoutEmail: [] }).after,
      / It is switched off right now, so escape-room photos cannot be emailed\.$/,
    );
    assert.equal(escapeRoomEmailNote(null).linkText, "Thanks for Playing");
  });
});
