import type {
  PhotoRecipientIds,
  PhotoRecipientMatch,
  PhotoRegistrationMatch,
} from "../../services/photosService";

// The guest picker's rules (web: utils/photoRecipients + RecipientPicker).
// Waivers get every available channel; an event registration gets email, and
// a text only when staff tick "Also text" because the guest asked for one.

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const recipientKey = (row: Pick<PhotoRecipientMatch, "kind" | "id">): string =>
  `${row.kind}:${row.id}`;

export const isRegistration = (row: PhotoRecipientMatch): row is PhotoRegistrationMatch =>
  row.kind === "registration";

/** Whether this guest gets the link with the current "Also text" choice. */
export const receivesSomething = (row: PhotoRecipientMatch, textRegistrants: boolean): boolean =>
  isRegistration(row)
    ? row.contactable && (row.canEmail || (textRegistrants && row.canText))
    : row.contactable;

export const receivingCount = (selected: PhotoRecipientMatch[], textRegistrants: boolean): number =>
  selected.filter((row) => receivesSomething(row, textRegistrants)).length;

/** The ids a send posts; registrations and the text choice only when any are picked. */
export function recipientIds(selected: PhotoRecipientMatch[], textRegistrants: boolean): PhotoRecipientIds {
  const registrationIds = selected.filter(isRegistration).map((row) => row.id);
  return {
    waiverIds: selected.filter((row) => !isRegistration(row)).map((row) => row.id),
    ...(registrationIds.length > 0
      ? { registrationEntryIds: registrationIds, textRegistrants }
      : {}),
  };
}

/** Picked registrations that can only be reached by text. */
export const textOnlyRecipients = (selected: PhotoRecipientMatch[]): PhotoRegistrationMatch[] =>
  selected.filter(
    (row): row is PhotoRegistrationMatch =>
      isRegistration(row) && row.contactable && !row.canEmail && row.canText,
  );

/** True once any picked registration could also be texted. */
export const anyTextable = (selected: PhotoRecipientMatch[]): boolean =>
  selected.some((row) => isRegistration(row) && row.canText);

/** "A", "A and B", "A, B and C". */
export const joinNames = (names: string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function parseDay(day: string): Date | null {
  const [y, m, d] = day.split("T")[0].split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 3", or "Oct 3, 2025" outside the current year. */
export function shortDate(day: string | null | undefined, thisYear = new Date().getFullYear()): string {
  if (!day) return "";
  const date = parseDay(day);
  if (!date) return day;
  const base = `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === thisYear ? base : `${base}, ${date.getFullYear()}`;
}

/** "Oct 3" or "Oct 3 – Oct 5"; either end alone stands for both. */
export function dayRange(
  first: string | null | undefined,
  last: string | null | undefined,
  thisYear = new Date().getFullYear(),
): string {
  const start = first || last;
  const end = last || first;
  if (!start || !end) return "";
  return start === end
    ? shortDate(start, thisYear)
    : `${shortDate(start, thisYear)} – ${shortDate(end, thisYear)}`;
}

/** "Thursday, October 23" — the day registrations are listed for. */
export function longWeekday(day: string | null | undefined): string {
  if (!day) return "";
  const date = parseDay(day);
  if (!date) return day;
  return `${WEEKDAYS_LONG[date.getDay()]}, ${MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

/** The source chip: "Event registration · Spooky Night · Today" or "Waiver · signed Oct 3". */
export function sourceLabel(
  row: PhotoRecipientMatch,
  photoDay: string,
  thisYear = new Date().getFullYear(),
): string {
  if (isRegistration(row)) {
    const when = row.coversPhotoDay ? photoDay : dayRange(row.firstDay, row.eventDate, thisYear);
    return ["Event registration", row.eventName, when].filter(Boolean).join(" · ");
  }
  return row.signedOn ? `Waiver · signed ${shortDate(row.signedOn, thisYear)}` : "Waiver";
}
