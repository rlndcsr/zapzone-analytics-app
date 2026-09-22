import { clockToMinutes } from "./bookingPrefill.ts";

import type { AvailableSlot } from "../../services/bookingsService";

/**
 * Start times customers can still book online that this booking would take away.
 *
 * A booking holds its space for its whole duration, so it sits across every start that begins
 * before it ends. That alone costs the website nothing while another space is still free for those
 * starts — the customer simply gets the other one. The start only disappears from the website when
 * the space being taken was the *last* one free for it.
 *
 * That distinction is the whole point of this file, and it is why the result is a warning rather
 * than a block: nothing is double-booked here. Something is merely no longer on sale.
 *
 * Returns the lost starts as "HH:MM", in the order the slots came in. Formatting for a human is
 * the screen's job.
 */
export function onlineStartsLost({
  slots,
  startTime,
  roomId,
  durationMinutes,
}: {
  /** The package's offered starts for the date, as the server listed them. */
  slots: AvailableSlot[];
  /** The start this booking is being saved at, "HH:MM". */
  startTime: string | null;
  /** The space this booking takes. Null means none is chosen, so nothing is taken. */
  roomId: number | null;
  durationMinutes: number;
}): string[] {
  if (!startTime || roomId == null || durationMinutes <= 0) return [];

  const start = clockToMinutes(startTime);
  if (start == null) return [];

  const end = start + durationMinutes;
  const lost: string[] = [];

  for (const slot of slots) {
    // The booking's own start is not something it takes away from anyone.
    if (slot.startTime === startTime) continue;

    const slotStart = clockToMinutes(slot.startTime);
    if (slotStart == null) continue;

    // Only a start this booking would actually sit across. Compared both ways because a start
    // BEFORE this one still clashes when it runs long enough to reach into it.
    if (!(slotStart < end && slotStart + durationMinutes > start)) continue;

    // The line between "the website loses this start" and "the customer gets the other space".
    const rooms = slot.availableRoomIds;
    if (rooms.length === 1 && rooms[0] === roomId) lost.push(slot.startTime);
  }

  return lost;
}
