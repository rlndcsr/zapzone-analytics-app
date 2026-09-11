export const ROLLBACK_REASON = "Payment failed - automatic rollback";

export type BookingRollbackOutcome =
  "force-deleted" | "soft-deleted" | "failed";

export async function forceDeleteThenSoftDelete(
  forceDelete: () => Promise<void>,
  softDelete: () => Promise<void>,
): Promise<BookingRollbackOutcome> {
  try {
    await forceDelete();
    return "force-deleted";
  } catch {}
  try {
    await softDelete();
    return "soft-deleted";
  } catch {
    return "failed";
  }
}
