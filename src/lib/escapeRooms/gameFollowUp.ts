/*
 * Follow-up email wording for the escape-room game screen — web parity with
 * EscapeRoomSessions.tsx (2ce6f97): Result only can email the players, players
 * can be emailed later, and each player's thank-you / review request can be
 * sent or cancelled. Structural types so this runs under `node --test`.
 */
import {
  followUpEmailName,
  formatFollowUpTime,
  type FollowUpRow,
  type GameFollowUp,
  type GameReviewCounts,
} from "../visitFollowUp/visitFollowUp.ts";
import { plural } from "./escapeRooms.ts";

const players = (count: number) => plural(count, "player", "players");

type PlayerLike = {
  thanksEmail: Pick<FollowUpRow, "status"> | null;
  review: Pick<FollowUpRow, "status" | "rating" | "due_at"> | null;
};

export type GameFollowUpState = {
  available: boolean;
  thanksName: string;
  thanksEmailId: number | null;
  thanksOn: boolean;
  thanksPromo: { code: string | null; offer: string | null } | null;
  promoProblem: string | null;
  reviewHours: number | null;
  canEmailPlayers: boolean;
};

/** The game's follow-up settings, with the web's fallbacks for an older server. */
export function gameFollowUpState(game: {
  followUp: GameFollowUp | null;
  canEmailPlayers: boolean | null;
}): GameFollowUpState {
  const thanksEmail = game.followUp?.thanks_email;
  const reviewEmail = game.followUp?.review_email;
  const thanksOn = thanksEmail?.active !== false;
  const reviewOn = reviewEmail?.active === true;
  const promo = thanksEmail?.promo ?? null;
  return {
    available: game.followUp?.available === true,
    thanksName: followUpEmailName(thanksEmail?.name, "Thanks for Playing"),
    thanksEmailId: thanksEmail?.id ?? null,
    thanksOn,
    thanksPromo: promo && !promo.problem ? { code: promo.code, offer: promo.offer } : null,
    promoProblem: thanksOn ? (promo?.problem ?? null) : null,
    reviewHours: reviewEmail?.active ? (reviewEmail.hours ?? 24) : null,
    canEmailPlayers: game.canEmailPlayers ?? (thanksOn || reviewOn),
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Wed, Sep 30" for a YYYY-MM-DD game date. */
export function gameDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateKey;
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Toast after "Yes, record result only". */
export function recordedResultToast(
  gamePlayers: PlayerLike[],
  thanksName: string,
): { message: string; type: "success" | "info" } {
  const thanked = gamePlayers.filter((p) => p.thanksEmail?.status === "sent").length;
  const notDelivered = gamePlayers.filter((p) => p.thanksEmail?.status === "failed").length;
  const reviewsWaiting = gamePlayers.filter((p) => p.review?.status === "scheduled").length;
  const parts = [
    thanked > 0 ? `the ${thanksName} email went to ${players(thanked)}` : "",
    notDelivered > 0
      ? `${notDelivered} ${notDelivered === 1 ? "email has" : "emails have"} not gone through yet`
      : "",
    reviewsWaiting > 0
      ? `${reviewsWaiting} review ${reviewsWaiting === 1 ? "request is" : "requests are"} scheduled`
      : "",
  ].filter(Boolean);
  return {
    message:
      parts.length > 0 ? `Result recorded; ${parts.join(", ")}.` : "Result recorded. No email was sent.",
    type: notDelivered > 0 ? "info" : "success",
  };
}

/** The "Recorded without a group photo…" line in the completed notice. */
export function withoutPhotoSummary(gamePlayers: PlayerLike[], thanksName: string): string {
  const thanked = gamePlayers.filter((p) => p.thanksEmail?.status === "sent").length;
  if (thanked > 0) {
    return `Recorded without a group photo; the ${thanksName} email went to ${players(thanked)}`;
  }
  if (gamePlayers.some((p) => p.review)) {
    return "Recorded without a group photo; the players get a review request later";
  }
  return "Recorded without a group photo, so no email was sent";
}

export const thanksFailedLine = (count: number): string =>
  `${count} ${count === 1 ? "thank-you email has" : "thank-you emails have"} not gone through. Use Send thank-you again next to the player.`;

/** "Review requests: 2 waiting (next …) · 1 sent · 1 rated, average 4/5." or null. */
export function reviewCountsLine(reviews: GameReviewCounts | null | undefined): string | null {
  if (!reviews || reviews.scheduled + reviews.sent + reviews.rated <= 0) return null;
  const waiting =
    reviews.scheduled > 0
      ? `${reviews.scheduled} waiting${reviews.next_due_at ? ` (next ${formatFollowUpTime(reviews.next_due_at)})` : ""}`
      : "";
  const between = reviews.scheduled > 0 && reviews.sent > 0 ? " · " : "";
  const sent = reviews.sent > 0 ? `${reviews.sent} sent` : "";
  const rated =
    reviews.rated > 0
      ? ` · ${reviews.rated} rated${reviews.average_rating !== null ? `, average ${reviews.average_rating}/5` : ""}`
      : "";
  return `Review requests: ${waiting}${between}${sent}${rated}.`;
}

/** The note above Complete & Send, split around the linked email name. */
export function followUpInfoParts(state: GameFollowUpState): { before: string; after: string } {
  if (!state.thanksOn) {
    return {
      before: "The ",
      after: " email is switched off in Email Notifications, so the photo cannot be emailed.",
    };
  }
  const promo = state.thanksPromo ? `, plus promo code ${state.thanksPromo.code} (${state.thanksPromo.offer})` : "";
  const review =
    state.reviewHours !== null
      ? ` A review request follows about ${state.reviewHours} ${state.reviewHours === 1 ? "hour" : "hours"} later.`
      : "";
  const problem = state.promoProblem ? ` ${state.promoProblem}` : "";
  return {
    before: "Players get the ",
    after: ` email with the photo and finish time${promo}.${review}${problem}`,
  };
}

/** The Complete & Send confirm's opening sentence. */
export const completeAndSendQuestion = (
  thanksName: string,
  recipients: number,
  roomName: string | null,
  timeLabel: string,
  finish: string | null,
): string =>
  `Send the ${thanksName} email with the group photo to ${players(recipients)} in ${roomName} at ${timeLabel}${
    finish !== null ? ` with a finish time of ${finish}` : ", marked as didn't escape"
  }? This can only be done once.`;

/** The promo / review line under the Complete & Send confirm, or null. */
export function completeAndSendExtras(state: GameFollowUpState): string | null {
  if (!state.thanksPromo && state.reviewHours === null) return null;
  const promo = state.thanksPromo
    ? `It includes promo code ${state.thanksPromo.code} (${state.thanksPromo.offer}) for their next visit.`
    : "";
  const gap = state.thanksPromo && state.reviewHours !== null ? " " : "";
  const review =
    state.reviewHours !== null
      ? `Each player gets a review request about ${state.reviewHours} ${state.reviewHours === 1 ? "hour" : "hours"} later.`
      : "";
  return `${promo}${gap}${review}`;
}

/** The Result-only confirm's question (the email choice is a separate checkbox now). */
export const recordOnlyQuestion = (
  roomName: string | null,
  timeLabel: string,
  finish: string | null,
): string =>
  `Record ${roomName} at ${timeLabel}${
    finish !== null ? ` with a finish time of ${finish}` : " as didn't escape"
  } without a photo? A photo can't be added to this game later.`;

/** Label of the "email the players" checkbox on the Result-only confirm. */
export function emailPlayersOptionLabel(state: GameFollowUpState, recipients: number): string {
  if (state.thanksOn) {
    return `Email ${players(recipients)} the ${state.thanksName} email without a photo${
      state.thanksPromo ? `, with promo code ${state.thanksPromo.code}` : ""
    }${state.reviewHours !== null ? ", and the review request later" : ""}.`;
  }
  const hours = state.reviewHours ?? 24;
  return `Send ${players(recipients)} a review request about ${hours} ${hours === 1 ? "hour" : "hours"} from now. The ${state.thanksName} email is switched off.`;
}

export const PAST_GAME_EMAIL_NOTE =
  "This game was on an earlier day, so the players are emailed now about a past visit. Leave the box unticked to record the result only.";

export const EMAIL_LATER_NOTE = "You can also email the players later from this game.";

/** The status line above the send-to-new button. */
export function newPlayersSummary(input: {
  newPlayers: number;
  stuck: number;
  completedWithoutPhoto: boolean;
  isToday: boolean;
  dayLabel: string;
}): string {
  const newPart =
    input.newPlayers > 0
      ? input.completedWithoutPhoto
        ? `${plural(input.newPlayers, "player has", "players have")} not been emailed${input.isToday ? "" : ` (this game was on ${input.dayLabel})`}`
        : `${plural(input.newPlayers, "player has", "players have")} signed since the photo was sent`
      : "";
  const stuckPart =
    input.stuck > 0 ? `${plural(input.stuck, "email did", "emails did")} not finish sending` : "";
  return `${[newPart, stuckPart].filter(Boolean).join(", and ")}.`;
}

/** The send-to-new button's label. */
export function sendToNewLabel(input: {
  newPlayers: number;
  stuck: number;
  completedWithoutPhoto: boolean;
  thanksOn: boolean;
}): string {
  if (input.completedWithoutPhoto) {
    return input.thanksOn ? `Email ${players(input.newPlayers)}` : "Schedule review requests";
  }
  if (input.newPlayers > 0 && input.stuck > 0) return "Send now";
  return input.newPlayers > 0 ? "Send to new players" : "Try sending again";
}

/** Confirm before emailing the players of a past, photo-less game. */
export const pastGameEmailConfirm = (dayLabel: string, newPlayers: number): string =>
  `This game was played on ${dayLabel}. Email ${players(newPlayers)} about it now?`;

/** Toast after emailing the players of a photo-less game later. */
export function emailedLaterToast(
  before: PlayerLike[],
  after: PlayerLike[],
  state: Pick<GameFollowUpState, "thanksOn" | "thanksName">,
): string {
  const thanked =
    after.filter((p) => p.thanksEmail?.status === "sent").length -
    before.filter((p) => p.thanksEmail?.status === "sent").length;
  return state.thanksOn
    ? `Emailed the ${state.thanksName} email to ${players(Math.max(0, thanked))}.`
    : "Review requests are scheduled for those players.";
}

export type PlayerBadge = { label: string; tone: "green" | "red" | "gray" | "amber" | "blue" };

export function thanksBadge(row: Pick<FollowUpRow, "status">): PlayerBadge {
  switch (row.status) {
    case "sent":
      return { label: "Thank-you sent", tone: "green" };
    case "failed":
      return { label: "Thank-you not delivered", tone: "red" };
    case "scheduled":
    case "sending":
      return { label: "Thank-you sending", tone: "gray" };
    default:
      return { label: "Thank-you not sent", tone: "gray" };
  }
}

export function reviewBadge(row: Pick<FollowUpRow, "status" | "rating" | "due_at">): PlayerBadge {
  if (row.rating !== null) return { label: `Rated ${row.rating}/5`, tone: "amber" };
  switch (row.status) {
    case "scheduled":
      return { label: `Review request ${formatFollowUpTime(row.due_at)}`, tone: "blue" };
    case "sent":
      return { label: "Review request sent", tone: "blue" };
    case "failed":
      return { label: "Review request not delivered", tone: "red" };
    default:
      return { label: "No review request", tone: "blue" };
  }
}

export const canResendThanks = (row: Pick<FollowUpRow, "status">): boolean =>
  ["failed", "skipped", "canceled"].includes(row.status);

/** Photo Settings' note on which email carries escape-room photos (web PhotoSettings). */
export function escapeRoomEmailNote(
  email: { name: string; isActive: boolean; roomsWithoutEmail: string[] } | null,
): { linkText: string; after: string } {
  const rooms = email?.roomsWithoutEmail ?? [];
  const suffix =
    email && rooms.length > 0
      ? ` No active Thanks for Playing email covers ${rooms.join(", ")}, so photos from ${rooms.length === 1 ? "that room" : "those rooms"} cannot be emailed.`
      : email && !email.isActive
        ? " It is switched off right now, so escape-room photos cannot be emailed."
        : "";
  return {
    linkText: email ? followUpEmailName(email.name, "Thanks for Playing") : "Thanks for Playing",
    after: ` email in Email Notifications, together with the finish time and the return-visit promo code. Edit that email to change what players get.${suffix}`,
  };
}

export const REMOVE_PLAYER_QUESTION = (name: string) =>
  `Remove ${name || "this player"} from this game? They will not be sent this game's photo or follow-up emails. Their signed waiver is kept.`;
