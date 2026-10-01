export function eventCheckInRefusal(
  status: string | null | undefined,
): string | null {
  if (status === "completed") {
    return "This ticket is already marked Completed, so it cannot be checked in again.";
  }
  if (status === "cancelled")
    return "This ticket was cancelled, so it cannot be checked in.";
  return null;
}
