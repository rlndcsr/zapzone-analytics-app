export type NotedBooking = {
  customerNotes?: string | null;
  specialRequests?: string | null;
  internalNotes?: string | null;
};

export type BookingNoteFlags = { guest: boolean; staff: boolean };

/** The guest's words: their notes and any special requests, the same audience. */
export function guestNoteOf(booking: NotedBooking): string {
  return [booking.customerNotes?.trim(), booking.specialRequests?.trim()]
    .filter(Boolean)
    .join("\n\n");
}

/** The desk's own note, never shown to the guest. */
export function staffNoteOf(booking: NotedBooking): string {
  return booking.internalNotes?.trim() ?? "";
}

export function noteFlagsOf(booking: NotedBooking): BookingNoteFlags {
  return {
    guest: !!(booking.customerNotes?.trim() || booking.specialRequests?.trim()),
    staff: !!booking.internalNotes?.trim(),
  };
}

/** For the block's accessibility label — says which kinds exist, not what they say. */
export function noteSummaryOf(booking: NotedBooking): string | null {
  const { guest, staff } = noteFlagsOf(booking);
  if (guest && staff) return "has a guest note and a staff note";
  if (guest) return "has a guest note";
  if (staff) return "has a staff note";
  return null;
}
