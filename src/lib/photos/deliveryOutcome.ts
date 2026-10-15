import type {
  PhotoDeliveryRow,
  PhotoOutcomeTone,
  PhotoSendOutcome,
  PhotoTestResult,
  PhotoTextingState,
  PhotoTextingStatus,
} from "../../services/photosService";

/** Chip colours per outcome tone (web: utils/photoDeliveryOutcome OUTCOME_TONE_BADGE). */
export const OUTCOME_TONE_STYLES: Record<PhotoOutcomeTone, { wrap: string; text: string }> = {
  success: { wrap: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300" },
  info: { wrap: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300" },
  warning: { wrap: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300" },
  danger: { wrap: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300" },
  muted: { wrap: "bg-gray-100 dark:bg-neutral-800", text: "text-gray-600 dark:text-gray-400" },
};

export const outcomeStyle = (tone: PhotoOutcomeTone | null) =>
  (tone && OUTCOME_TONE_STYLES[tone]) || OUTCOME_TONE_STYLES.muted;

/** The SMS card's badge per texting state (web: TEXTING_STATE_BADGE). */
export const TEXTING_STATE_BADGE: Record<PhotoTextingState, { label: string; className: string }> = {
  verified: { label: "confirmed working", className: "bg-green-600" },
  unverified: { label: "not confirmed yet", className: "bg-amber-500" },
  failing: { label: "not reaching phones", className: "bg-red-600" },
  not_configured: { label: "not sending", className: "bg-amber-500" },
};

/** The SMS card's border and fill per texting state (web: TEXTING_STATE_CARD). */
export const TEXTING_STATE_CARD: Record<PhotoTextingState, string> = {
  verified: "border-green-200 bg-green-50/60 dark:border-green-900/40 dark:bg-green-900/10",
  unverified: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10",
  failing: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10",
  not_configured: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10",
};

export const channelName = (row: Pick<PhotoDeliveryRow, "channel">): string =>
  row.channel === "email" ? "Email" : "Text message";

/** Fresh rows from the server laid over the ones on screen, by id; others untouched. */
export function mergeDeliveries<T extends PhotoDeliveryRow>(current: T[], updates: PhotoDeliveryRow[]): T[] {
  const byId = new Map(updates.map((row) => [row.id, row]));
  return current.map((row) => {
    const update = byId.get(row.id);
    return update ? { ...row, ...update } : row;
  });
}

/** Still worth asking the phone carrier about. */
export const isCarrierPending = (row: PhotoDeliveryRow): boolean =>
  row.carrierPending ?? row.awaitingCarrier;

/** The rows to check with the carrier — at most 50, as the web sends. */
export const pendingDeliveryIds = (rows: PhotoDeliveryRow[], limit = 50): number[] =>
  rows.filter(isCarrierPending).map((row) => row.id).slice(0, limit);

/** Resend in the delivery log: the server allows it and it would help. */
export const canRetryFromLog = (row: PhotoDeliveryRow): boolean =>
  row.canRetry && !row.isDuplicate && row.retryUseful !== false;

/**
 * Retry on the result screen: only a message that failed or was not delivered,
 * and never a text while the carrier is blocking the sending number.
 */
export const canRetryFromOutcome = (row: PhotoDeliveryRow, textsBlocked: boolean): boolean =>
  canRetryFromLog(row) &&
  !(textsBlocked && row.channel === "sms") &&
  (row.outcome === "failed" || row.outcome === "not_delivered");

/** A failed or partly failed send offers the session's QR code instead. */
export const needsQrFallback = (result?: PhotoSendOutcome["result"] | null): boolean =>
  result === "failed" || result === "partial";

export type ResultStyleKey = "sent" | "partial" | "failed" | "scheduled" | "waiting";

/** Sent-but-waiting shows as in progress while checking, then as held. */
export const resultStyleKey = (
  result: PhotoSendOutcome["result"],
  waiting: boolean,
  polling: boolean,
): ResultStyleKey => (result === "sent" && waiting ? (polling ? "waiting" : "scheduled") : result);

/** What the SMS card shows when the server sends no texting status. */
export const fallbackTextingStatus = (smsAvailable: boolean, smsNote: string | null): PhotoTextingStatus => ({
  state: smsAvailable ? "unverified" : "not_configured",
  headline: smsAvailable ? "Texting not confirmed yet" : "Texting is switched off",
  note: smsNote,
  sender: null,
  senderKind: "none",
  verified: null,
  problem: null,
  recent: {
    days: 14,
    attempted: 0,
    received: 0,
    delivered: 0,
    awaitingCarrier: 0,
    unconfirmed: 0,
    notDelivered: 0,
    failed: 0,
    skipped: 0,
    topProblem: null,
  },
});

/** "Confirmed on 10/14/2026 by Sam at Brighton." */
export function textingVerifiedLine(texting: PhotoTextingStatus): string | null {
  const v = texting.verified;
  if (!v) return null;
  const when = v.at ? ` on ${new Date(v.at).toLocaleDateString()}` : "";
  const how =
    v.method === "guest_opened_link"
      ? " when a guest opened the link from their text"
      : v.byName
        ? ` by ${v.byName}`
        : "";
  const where = v.locationName ? ` at ${v.locationName}` : "";
  const failing = texting.state === "failing" ? " Newer texts are not arriving." : "";
  return `${texting.state === "verified" ? "Confirmed" : "Last confirmed"}${when}${how}${where}.${failing}`;
}

/** "Last 14 days: 9 photo texts · 7 reached the phone · 1 not confirmed · 1 did not arrive" */
export function textingRecentLine(texting: PhotoTextingStatus): string | null {
  const r = texting.recent;
  if (r.attempted <= 0) return null;
  return (
    `Last ${r.days} days: ${r.attempted} photo texts · ` +
    `${r.received + r.delivered} reached the phone · ` +
    `${r.awaitingCarrier + r.unconfirmed} not confirmed · ` +
    `${r.notDelivered + r.failed} did not arrive`
  );
}

/** The most common carrier problem, unless it is the one already shown. */
export function textingTopProblemLine(texting: PhotoTextingStatus): string | null {
  const top = texting.recent.topProblem;
  if (!top || top.code === texting.problem?.code) return null;
  return `Most common problem (code ${top.code}, ${top.count}×): ${top.meaning ?? "see the provider console"}`;
}

/** How a real photo text is billed, from a test text's size. */
export function testTextSizeLine(result: PhotoTestResult): string | null {
  if (!result.success || !result.characters) return null;
  const segments = result.segments ?? 1;
  return `A real photo text is about ${result.characters} characters (${result.encoding ?? "GSM-7"}), billed as ${segments} message${segments === 1 ? "" : "s"}.`;
}
