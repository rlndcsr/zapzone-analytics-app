import { usePathname } from "expo-router";

import { shouldShowUpdateNotice } from "../appUpdateNotice";
import { useUpdatePromptDeferred } from "../appUpdatePrompt";
import { useAppUpdateStatus } from "./useAppUpdateCheck";

export const UPDATE_NOTICE_SPACE = 76;

export function useAppUpdateNoticeVisible(): boolean {
  const status = useAppUpdateStatus();
  const deferred = useUpdatePromptDeferred();
  const pathname = usePathname();

  return shouldShowUpdateNotice({ status, deferred, pathname });
}

export function useAppUpdateNoticeInset(): number {
  return useAppUpdateNoticeVisible() ? UPDATE_NOTICE_SPACE : 0;
}
