import { webUrl } from "../api";

/**
 * Public chaperone URL for a group invite — the exact shape the web admin's
 * WaiverBulkInvites "Copy chaperone link" button builds
 * (`${origin}/waiver/bulk/${manage_token}`). Shared so the Group Invites table
 * cell and the actions sheet produce identical links.
 */
export const buildChaperoneLink = (manageToken: string): string =>
  webUrl(`/waiver/bulk/${manageToken}`);
