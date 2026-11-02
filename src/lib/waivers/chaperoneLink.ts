import { webUrl } from "../api";
import { chaperoneLinkPath, groupLinkPath } from "./groupInvites";

/**
 * Public chaperone URL for a group invite — the exact shape the web admin's
 * WaiverBulkInvites "Copy chaperone link" button builds
 * (`${origin}/waiver/bulk/${manage_token}`). Shared so the Group Invites table
 * cell and the actions sheet produce identical links.
 */
export const buildChaperoneLink = (manageToken: string): string =>
  webUrl(chaperoneLinkPath(manageToken));

/**
 * The one link parents open to sign for the group
 * (`${origin}/waiver/group/${shareable_token}`), as the web's "Group link"
 * Copy builds it. The page is web-only; the app only hands the URL out.
 */
export const buildGroupLink = (shareableToken: string): string =>
  webUrl(groupLinkPath(shareableToken));
