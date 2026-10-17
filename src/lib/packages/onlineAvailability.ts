/**
 * Front-End Availability ("backend only" packages) — web parity: zappoint
 * 4d165ce (Packages / CustomPackages / Create / Edit / OnlineAvailabilityField)
 * against zapzone-backend b3a71fb (`packages.available_online`).
 *
 * A backend-only package is hidden from the booking site and refused online,
 * but staff of the venue's company still book it from the admin app.
 */

/** Roles the server lets change the setting (`Package::canChangeOnlineAvailability`). */
const MAY_CHANGE = ["company_admin", "admin", "location_manager"];

export const canChangeOnlineAvailability = (role: string | null | undefined): boolean =>
  MAY_CHANGE.includes(String(role ?? ""));

/** What a "Backend only" tag says when pressed or read aloud. */
export const backendOnlyHint = (isActive: boolean): string =>
  isActive
    ? "Customers cannot see or book this package online. Staff can still book it."
    : "Customers cannot see or book this package online. Staff can book it once it is switched on.";

/** The confirmation before the list's globe / crossed-out-eye switch flips it. */
export function onlineToggleQuestion(
  name: string,
  makeBackendOnly: boolean,
  isActive: boolean,
): { title: string; message: string } {
  if (makeBackendOnly) {
    return {
      title: `Make "${name}" backend only?`,
      message: isActive
        ? "Customers will no longer see it or book it online. Staff can still book it here, and existing bookings are not affected."
        : "It is switched off right now, so nobody can book it yet. Once it is switched on, customers will not see it or book it online, and staff can book it here.",
    };
  }
  return isActive
    ? {
        title: `Show "${name}" on the booking site again?`,
        message: "Customers will be able to see it and book it online.",
      }
    : {
        title: `Let customers book "${name}" online?`,
        message: "It is switched off right now, so it will appear on the booking site once it is switched on.",
      };
}

/** The line after the switch saved. */
export const onlineToggleDone = (name: string, online: boolean, isActive: boolean): string =>
  !online
    ? `"${name}" is now backend only.`
    : isActive
      ? `"${name}" is on the booking site again.`
      : `"${name}" can be booked online once it is switched on.`;

/** The server answered without the new value: it predates Front-End Availability. */
export const ONLINE_NOT_APPLIED =
  "Front-End Availability could not be changed yet because the server has not been updated for it. Please try again later.";

export const CREATE_STAYED_ONLINE =
  "The package was created, but it is on the booking site: the server has not been updated for Front-End Availability yet, so it could not be made backend only.";

export const EDIT_NOT_APPLIED =
  "The package was saved, but Front-End Availability could not be changed yet because the server has not been updated for it.";

export const DUPLICATE_STAYED_ONLINE =
  "The copy could not be made backend only because the server has not been updated for Front-End Availability yet.";

export const importStayedOnlineNote = (count: number): string =>
  `${count} imported package(s) meant to be backend only are on the booking site, because the server has not been updated for Front-End Availability yet.`;

/** The Front-End Availability box's explanation, by setting and active state. */
export function onlineFieldHelp(checked: boolean, isActive: boolean): string {
  if (checked) {
    return isActive
      ? "On: the package shows on the booking site and customers can book it there. Staff can always book it here."
      : "On: once the package is switched on, it shows on the booking site and customers can book it there.";
  }
  return isActive
    ? "Off (backend only): the package is hidden from the booking site and cannot be booked online, even from a saved link. Staff can still book it here, and its schedule and existing bookings stay as they are."
    : "Off (backend only): the package is hidden from the booking site and cannot be booked online, even from a saved link. Staff can book it here once it is switched on. Its schedule and existing bookings stay as they are.";
}

export const ONLINE_FIELD_LOCKED = "Only a location manager or an admin can change this.";

/** The duplicate sheet's note when the source package is backend only. */
export const duplicateBackendOnlyNote = (canChange: boolean): string =>
  canChange
    ? "This package is backend only, so the copy will be backend only too."
    : "This package is backend only. The copy will be on the booking site once it is switched on. Only a location manager or an admin can make it backend only.";

/**
 * A staff booking refused as if it came from a guest: the server did not
 * accept the login, so the backend-only gate applied.
 */
export function isStaffLoginRefusal(e: unknown): boolean {
  const err = e as { status?: unknown; body?: unknown } | null;
  const code = (err?.body as { code?: unknown } | null | undefined)?.code;
  return err?.status === 422 && code === "PACKAGE_NOT_BOOKABLE_ONLINE";
}

export const STAFF_LOGIN_REFUSED =
  "Your staff login was not accepted, so this was handled as an online booking and refused. Nothing new was booked or charged. Please sign in again and try once more.";

/**
 * How many imported packages the file asked to be backend only but the server
 * saved as online. `importedOnline` lines up with the rows that did not fail.
 */
export function importStayedOnline(
  requestedOnline: boolean[],
  failedIndexes: Set<number>,
  importedOnline: (boolean | null)[],
): number {
  const kept = requestedOnline.filter((_, index) => !failedIndexes.has(index));
  return importedOnline.filter((online, index) => kept[index] === false && online !== false).length;
}
