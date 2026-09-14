import { usePathname } from "expo-router";

import { shouldShowUpdateNotice } from "../appUpdateNotice";
import { useUpdatePromptDeferred } from "../appUpdatePrompt";
import { useAppUpdateStatus } from "./useAppUpdateCheck";

/**
 * Vertical room the standing update notice occupies, including the gap it
 * keeps from whatever is beneath it.
 *
 * Screens with their own bottom action bar add this to the bar's padding so
 * the notice never sits on top of a Save button. Kept as a constant rather
 * than measured: the notice is a fixed two-line bar, and a measured height
 * would arrive a frame late and shift the footer under the user's thumb.
 */
export const UPDATE_NOTICE_SPACE = 76;

/**
 * Is the standing update notice on screen right now? The rule itself is in
 * lib/appUpdateNotice.ts; this wires it to the live check, the deferral store
 * and the current route.
 *
 * Deliberately ignores whether a download is mid-flight. That case swaps the
 * notice for the dialog, which is a modal covering the whole screen — so what
 * the screen underneath reserves makes no difference.
 */
export function useAppUpdateNoticeVisible(): boolean {
  // The raw verdict, not `useAppUpdateCheck`: the rule wants to see
  // `hasUpdate` itself, since "the app is now current" is precisely the
  // condition that retires the notice. The request is deduped in the service,
  // so the extra subscriber costs nothing.
  const status = useAppUpdateStatus();
  const deferred = useUpdatePromptDeferred();
  const pathname = usePathname();

  return shouldShowUpdateNotice({ status, deferred, pathname });
}

/**
 * Extra bottom padding a screen's own action bar needs so the notice clears
 * it. `0` whenever the notice isn't showing, so layouts are untouched in the
 * normal case — including after the update is installed.
 */
export function useAppUpdateNoticeInset(): number {
  return useAppUpdateNoticeVisible() ? UPDATE_NOTICE_SPACE : 0;
}
