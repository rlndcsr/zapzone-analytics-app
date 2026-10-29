import type {
  SmsNotification,
  SmsOptions,
} from "../../services/smsNotificationService";

// Pure helpers behind the SMS Notifications screen, kept apart from the API
// calls so they can be unit-tested. Each mirrors the web page
// (zappoint src/pages/admin/sms/SmsNotifications.tsx) or the backend.

/** The body that will be sent (web: `effective_body ?? body ?? default_body`). */
export const smsBodyOf = (n: SmsNotification): string =>
  n.effective_body ?? n.body ?? n.default_body ?? "";

/**
 * A saved row as the list endpoint would return it. Update / toggle / reset
 * answer with the bare model, without the list's computed fields, so they are
 * filled in here by the backend's own rules (getEffectiveBody,
 * isBodyCustomized) — the list stays right without a reload.
 */
export function withListFields(n: SmsNotification): SmsNotification {
  return {
    ...n,
    effective_body: n.body !== null ? n.body : (n.default_body ?? ""),
    is_body_customized:
      !!n.is_default && n.body !== null && n.body !== n.default_body,
  };
}

/** Characters as the server counts them (code points, not UTF-16 units). */
export const smsCharCount = (message: string): number => [...message].length;

/** GSM-7 vs UCS-2 aware segment count — mirrors the backend and the web. */
export function smsSegments(message: string): number {
  const chars = [...message];
  if (chars.length === 0) return 0;
  const unicode = chars.some((ch) => ch.charCodeAt(0) > 127);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return chars.length <= single ? 1 : Math.ceil(chars.length / multi);
}

/** The picker's label for a trigger key, else the key itself (web `triggerLabel`). */
export function smsTriggerLabel(
  options: SmsOptions | null,
  trigger: string,
): string {
  if (!options) return trigger;
  for (const group of Object.values(options.trigger_types ?? {})) {
    if (group?.[trigger]) return group[trigger];
  }
  return trigger;
}

/** Section heading per segment, in the web's wording. */
const SEGMENT_LABEL: Record<string, string> = {
  package: "Parties",
  attraction: "Attractions",
  event: "Events",
  all: "All Segments",
  waiver: "Waiver",
};

export const smsSegmentLabel = (segment: string): string =>
  SEGMENT_LABEL[segment] ?? segment;

/** Templates grouped by segment, groups in the order they first appear (web parity). */
export function groupSmsNotifications(
  items: SmsNotification[],
): { segment: string; items: SmsNotification[] }[] {
  const groups = new Map<string, SmsNotification[]>();
  for (const n of items) {
    const key = n.entity_type;
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  }
  return [...groups].map(([segment, list]) => ({ segment, items: list }));
}

/** Merge fields offered under the editor (web COMMON_FIELDS, same order). */
export const SMS_MERGE_FIELDS = [
  "{{company_name}}", "{{customer_first_name}}", "{{customer_name}}", "{{location_name}}", "{{location_phone}}",
  "{{booking_reference}}", "{{booking_date}}", "{{booking_time}}", "{{booking_balance}}", "{{package_name}}",
  "{{attraction_name}}", "{{purchase_reference}}", "{{purchase_date}}", "{{purchase_quantity}}",
  "{{event_name}}", "{{event_reference}}", "{{event_date}}", "{{event_time}}", "{{payment_amount}}", "{{payment_reference}}",
] as const;
