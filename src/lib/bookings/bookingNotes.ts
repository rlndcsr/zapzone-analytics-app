export type NotedBooking = {
  customerNotes?: string | null;
  specialRequests?: string | null;
  internalNotes?: string | null;
};

export type BookingNoteFlags = { guest: boolean; staff: boolean };

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
