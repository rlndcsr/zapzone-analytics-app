export const ACKNOWLEDGE_BLOCKED_PERIOD = "acknowledge_blocked_period";
export const ACKNOWLEDGED_BLOCK_IDS = "acknowledged_block_ids";
export const BLOCKED_PERIOD_DECLINED =
  "Not saved: that time is inside a blocked period.";

const REMEMBER_FOR_MS = 5 * 60 * 1000;

const TARGET_FIELDS = [
  "location_id",
  "package_id",
  "room_id",
  "booking_date",
  "booking_time",
  "attraction_id",
  "scheduled_date",
  "scheduled_time",
  "event_id",
  "purchase_date",
  "purchase_time",
  "items",
  "customer_id",
  "guest_name",
  "guest_email",
  "guest_phone",
];

/** One block the save falls inside, as the backend presents it. */
export type BlockedPeriod = {
  id: number;
  occurrenceDate: string | null;
  groupName: string | null;
  reason: string | null;
  windowLabel: string;
  scopeLabel: string;
  locationId: number | null;
  locationName: string | null;
  setByName: string | null;
};

export type BlockedPeriodWarning = {
  message: string;
  periods: BlockedPeriod[];
};

type RawPeriod = {
  id?: unknown;
  date?: string | null;
  occurrence_date?: string | null;
  group_name?: string | null;
  reason?: string | null;
  window_label?: string | null;
  scope_label?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  set_by?: { name?: string | null } | null;
};

const mapPeriod = (raw: RawPeriod): BlockedPeriod => ({
  id: Number(raw.id),
  occurrenceDate: (raw.occurrence_date ?? raw.date ?? "").split("T")[0] || null,
  groupName: raw.group_name?.trim() || null,
  reason: raw.reason?.trim() || null,
  windowLabel: raw.window_label ?? "",
  scopeLabel: raw.scope_label ?? "",
  locationId: raw.location_id ?? null,
  locationName: raw.location_name ?? null,
  setByName: raw.set_by?.name ?? null,
});

/** The warning in a 409 `BLOCKED_PERIOD` answer, or null for any other response. */
export function blockedPeriodWarning(
  status: number,
  data: unknown,
): BlockedPeriodWarning | null {
  const body = data as {
    code?: string;
    message?: string;
    blocked_periods?: RawPeriod[];
  } | null;
  if (status !== 409 || body?.code !== "BLOCKED_PERIOD") return null;
  return {
    message: body.message ?? "This time falls inside a blocked period.",
    periods: Array.isArray(body.blocked_periods)
      ? body.blocked_periods.map(mapPeriod)
      : [],
  };
}

export const warningBlockIds = (warning: BlockedPeriodWarning): number[] =>
  warning.periods.map((p) => p.id).filter((id) => Number.isFinite(id));

/** Whether answering `answered` also answers `warning` — every block it hits was in the answer. */
export function coveredBy(
  warning: BlockedPeriodWarning,
  answered: BlockedPeriodWarning,
): boolean {
  const ids = warningBlockIds(warning);
  const answeredIds = warningBlockIds(answered);
  return ids.length > 0 && ids.every((id) => answeredIds.includes(id));
}

/* --------------------------------------------------------------- handler -- */

type Handler = (warning: BlockedPeriodWarning) => Promise<boolean>;

let handler: Handler | null = null;

export function registerBlockedPeriodHandler(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function blockedPeriodPromptAvailable(): boolean {
  return handler !== null;
}

/** Ask staff to confirm; false when no prompt is mounted or it fails. */
export function confirmBlockedPeriod(
  warning: BlockedPeriodWarning,
): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  return handler(warning).catch(() => false);
}

/* -------------------------------------------------------- acknowledgement -- */

/** The request body as an object, or null when it cannot carry the acknowledgement. */
export function readBody(body: unknown): Record<string, unknown> | null {
  if (body === undefined || body === null) return {};
  return typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function withAcknowledgement(
  body: Record<string, unknown>,
  ids: number[],
): Record<string, unknown> {
  return {
    ...body,
    [ACKNOWLEDGE_BLOCKED_PERIOD]: true,
    [ACKNOWLEDGED_BLOCK_IDS]: ids,
  };
}

/** Who is saving what — the same booking target by the same staff member. */
export function targetKey(
  actor: number | null,
  method: string,
  path: string,
  body: Record<string, unknown>,
): string {
  const picked: Record<string, unknown> = {};
  for (const field of TARGET_FIELDS) {
    if (body[field] !== undefined && body[field] !== null)
      picked[field] = body[field];
  }
  return `${actor ?? "guest"} ${method.toLowerCase()} ${path.split("?")[0]} ${JSON.stringify(picked)}`;
}

const acknowledgedTargets = new Map<string, { ids: number[]; at: number }>();

/** Block ids this target was confirmed for in the last few minutes. */
export function rememberedBlockIds(key: string, now = Date.now()): number[] {
  const remembered = acknowledgedTargets.get(key);
  return remembered && now - remembered.at < REMEMBER_FOR_MS
    ? remembered.ids
    : [];
}

export function rememberAcknowledged(
  key: string,
  ids: number[],
  now = Date.now(),
): void {
  acknowledgedTargets.set(key, { ids, at: now });
}

/** Forget every confirmation (sign-out, tests). */
export function forgetAcknowledgements(): void {
  acknowledgedTargets.clear();
}
