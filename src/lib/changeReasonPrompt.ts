export type ChangeReasonRequest = {
  summary?: string;
  destructive?: boolean;
};

type Handler = (request: ChangeReasonRequest) => Promise<string | null>;

let handler: Handler | null = null;

export function registerChangeReasonHandler(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function changeReasonPromptAvailable(): boolean {
  return handler !== null;
}

export function requestChangeReason(
  request: ChangeReasonRequest = {},
): Promise<string | null> {
  if (!handler) return Promise.resolve(null);
  return handler(request).catch(() => null);
}

export function requiresChangeReason(status: number, data: unknown): boolean {
  if (status !== 422) return false;
  const errors = (data as { errors?: Record<string, unknown> } | null)?.errors;
  return Boolean(errors?.change_reason);
}

export function bodyCarriesChangeReason(body: unknown): boolean {
  const record = body as Record<string, unknown> | null | undefined;
  const value = record?.change_reason;
  return typeof value === "string" && value.trim() !== "";
}

export function withChangeReason(body: unknown, reason: string): unknown {
  const record = (body as Record<string, unknown> | null | undefined) ?? {};
  return { ...record, change_reason: reason };
}

const DESTRUCTIVE_PATH = /delete|cancel/i;

export function describeChangeReasonRequest(
  method: string | undefined,
  path: string,
): { summary: string; destructive: boolean } {
  const verb = String(method ?? "").toUpperCase();
  const destructive = DESTRUCTIVE_PATH.test(path) || verb === "DELETE";
  if (/\/cancel$/.test(path))
    return { summary: "Cancelling this booking", destructive };
  if (/bulk-delete$/.test(path))
    return { summary: "Deleting the selected bookings", destructive };
  if (/force-delete$/.test(path))
    return { summary: "Permanently deleting this booking", destructive };
  if (/bulk-restore$/.test(path))
    return { summary: "Restoring the selected bookings", destructive };
  if (/\/restore$/.test(path))
    return { summary: "Restoring this booking", destructive };
  if (/\/status$/.test(path))
    return { summary: "Changing this booking's status", destructive };
  if (/\/payment-status$/.test(path))
    return { summary: "Changing this booking's payment status", destructive };
  if (/\/internal-notes$/.test(path))
    return { summary: "Editing internal notes", destructive };
  if (/\/location$/.test(path))
    return { summary: "Moving this booking to another location", destructive };
  if (/\/complete$/.test(path))
    return { summary: "Marking this booking completed", destructive };
  if (/check-in$/.test(path))
    return { summary: "Checking in this booking", destructive };
  if (verb === "DELETE")
    return { summary: "Deleting this booking", destructive };
  return { summary: "Updating this booking", destructive };
}
