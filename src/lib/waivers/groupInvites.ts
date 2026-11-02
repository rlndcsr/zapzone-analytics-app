import { formatPhoneForDisplay } from "../phone.ts";

export const chaperoneLinkPath = (manageToken: string): string =>
  `/waiver/bulk/${manageToken}`;

export const groupLinkPath = (shareableToken: string): string =>
  `/waiver/group/${shareableToken}`;

export type GroupLinkState = "copy" | "enabled" | "off";

export function groupLinkState(invite: {
  allowShareableLink: boolean;
  shareableToken: string | null;
}): GroupLinkState {
  if (!invite.allowShareableLink) return "off";
  return invite.shareableToken ? "copy" : "enabled";
}

export type RawInviteRecipient = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  resent_count?: number | null;
  last_sent_at?: string | null;
};

export type GroupInviteRecipient = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  resentCount: number;
  lastSentAt: string | null;
};

export function mapInviteRecipient(
  raw: RawInviteRecipient,
): GroupInviteRecipient {
  return {
    id: raw.id,
    name: raw.name?.trim() || null,
    email: raw.email?.trim() || null,
    phone: raw.phone?.trim() || null,
    status: raw.status || "not_sent",
    resentCount: Number(raw.resent_count ?? 0) || 0,
    lastSentAt: raw.last_sent_at ?? null,
  };
}

export type RecipientStatusMeta = {
  label: string;
  box: string;
  text: string;
};

const RECIPIENT_STATUS: Record<string, RecipientStatusMeta> = {
  complete: {
    label: "Signed",
    box: "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  sent: {
    label: "Invite sent",
    box: "bg-blue-50 border-blue-100 dark:bg-blue-900/30 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
  },
  not_sent: {
    label: "Not sent yet",
    box: "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-500 dark:text-gray-400",
  },
  not_complete: {
    label: "Not signed",
    box: "bg-gray-100 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-700 dark:text-gray-200",
  },
  failed: {
    label: "Not delivered",
    box: "bg-white border-red-300 dark:bg-red-950/40 dark:border-red-800",
    text: "text-red-700 dark:text-red-300",
  },
};

export function recipientStatusMeta(status: string): RecipientStatusMeta {
  return (
    RECIPIENT_STATUS[status] ?? {
      label: status,
      box: RECIPIENT_STATUS.not_sent.box,
      text: RECIPIENT_STATUS.not_sent.text,
    }
  );
}

export function recipientContactLine(r: GroupInviteRecipient): string {
  const phone = r.phone ? formatPhoneForDisplay(r.phone) || r.phone : null;
  return [r.email, phone].filter(Boolean).join(" · ");
}

export function recipientSummary(recipients: GroupInviteRecipient[]): {
  signed: number;
  total: number;
  failed: number;
} {
  let signed = 0;
  let failed = 0;
  for (const r of recipients) {
    if (r.status === "complete") signed++;
    else if (r.status === "failed") failed++;
  }
  return { signed, total: recipients.length, failed };
}

export function createInviteFeedback(
  res:
    | {
        message?: string | null;
        data?: { chaperone_notified?: boolean | null } | null;
      }
    | null
    | undefined,
): { notified: boolean; title: string; message: string } {
  const notified = res?.data?.chaperone_notified !== false;
  return {
    notified,
    title: notified ? "Invite sent" : "Invite created",
    message:
      res?.message?.trim() ||
      (notified
        ? "The chaperone has been notified."
        : "The chaperone was not notified. Copy the chaperone link and send it to them."),
  };
}
