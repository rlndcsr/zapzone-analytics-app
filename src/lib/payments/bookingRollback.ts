export type BookingRollbackOutcome = "force-deleted" | "kept" | "gone";

/**
 * Removes a booking whose card was not charged, or keeps it — never anything in
 * between (web `bookingService.rollbackBooking`).
 *
 * There is deliberately no fallback to the ordinary soft delete. The force
 * delete refuses (403) a booking that has payments or is no longer pending, and
 * a soft delete on top of that refusal could trash a booking that had already
 * been paid. A refused or failed rollback keeps the booking for staff to check;
 * a 404 means it is already gone.
 */
export async function forceDeleteOrKeep(
  forceDelete: () => Promise<void>,
): Promise<BookingRollbackOutcome> {
  try {
    await forceDelete();
    return "force-deleted";
  } catch (err) {
    return (err as { status?: unknown } | null)?.status === 404 ? "gone" : "kept";
  }
}
