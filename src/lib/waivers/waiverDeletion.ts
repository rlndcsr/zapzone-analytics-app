export function canDeleteWaivers(
  role: string | null | undefined,
  adminDeleteEnabled: boolean | null | undefined,
): boolean {
  return role === "company_admin" && (adminDeleteEnabled ?? true);
}

export function waiverDeleteSubject(
  adultName: string | null | undefined,
): string {
  return adultName?.trim() || "this guest";
}

export function deletionReasonPayload(reason: string): string {
  return reason.trim();
}

export type WaiverDeleteResult =
  | { status: "deleted" }
  | { status: "failed"; message: string }
  | { status: "busy" }
  | { status: "unauthenticated" };

type DeleteFn = (token: string, id: number, reason: string) => Promise<void>;

export async function submitWaiverDeletion({
  token,
  waiverId,
  reason,
  lock,
  remove,
}: {
  token: string | null;
  waiverId: number;
  reason: string;
  lock: { current: boolean };
  remove: DeleteFn;
}): Promise<WaiverDeleteResult> {
  if (lock.current) return { status: "busy" };
  if (!token) return { status: "unauthenticated" };
  lock.current = true;
  try {
    await remove(token, waiverId, deletionReasonPayload(reason));
    return { status: "deleted" };
  } catch (e) {
    return {
      status: "failed",
      message:
        e instanceof Error && e.message
          ? e.message
          : "Could not delete this waiver.",
    };
  } finally {
    lock.current = false;
  }
}
