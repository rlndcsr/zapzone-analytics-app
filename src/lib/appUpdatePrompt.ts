import { useSyncExternalStore } from "react";

/**
 * Whether the user has waved off this launch's optional update prompt.
 *
 * This used to be a `useState` inside AppUpdateGate, which was enough while the
 * dialog was the only thing that cared. It isn't any more: the same flag now
 * decides whether the standing reminder notice is showing and is what the
 * Settings "Update" row acts on, and those live in different trees. Hence one
 * module-level flag with subscribers, in the same shape as the other shared
 * stores here (lib/dashboard/timeframeStore.ts).
 *
 * Deliberately in memory only, not SecureStore. The version check itself runs
 * once per launch (services/appUpdateService.ts), so the prompt is a
 * per-launch affair: persisting "Later" would silently suppress the dialog on
 * every subsequent launch, which is the opposite of what a pending update
 * should do.
 *
 * Note there is no "notice dismissed" flag. Declining the dialog moves the
 * reminder out of the way; it does not make it go away. The notice stays on
 * every screen until the update is actually installed, which is the point of
 * it — a reminder the user can close is a reminder they close once and then
 * never see again.
 */
let deferred = false;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Listen for changes to the flag. The hook below is the usual way in; this is
 * exported for consumers that aren't components (and for the tests).
 */
export function subscribeToUpdatePrompt(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function isUpdatePromptDeferred(): boolean {
  return deferred;
}

/** "Later" — close the dialog and fall back to the standing reminder notice. */
export function deferUpdatePrompt(): void {
  if (deferred) return;
  deferred = true;
  emit();
}

/**
 * Bring the update dialog back. The notice's Update button and the Settings
 * row both route through here rather than owning a second install flow, so
 * there is still exactly one download in flight no matter where it was started
 * from.
 */
export function reopenUpdatePrompt(): void {
  if (!deferred) return;
  deferred = false;
  emit();
}

/** Subscribe a component to the deferral flag. */
export function useUpdatePromptDeferred(): boolean {
  return useSyncExternalStore(
    subscribeToUpdatePrompt,
    isUpdatePromptDeferred,
    isUpdatePromptDeferred,
  );
}
