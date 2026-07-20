import { useCallback, useEffect, useRef, useState } from "react";

/**
 * State for a transient banner that auto-dismisses after `delayMs`. Calling
 * `show(value)` displays the value immediately and (re)starts the timer;
 * `show(null)` (or the elapsed timer) clears it. A fresh `show` always cancels
 * the previous timer, so the newest message gets the full window even if it
 * repeats an identical one. The timer is cleared on unmount to avoid leaks and
 * "setState on unmounted component" warnings.
 *
 * Intended for temporary notifications only (login errors, "session expired"),
 * NOT for messages that must persist until the user acts.
 */
export function useTransientAlert<T>(
  delayMs = 3000,
): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (next: T | null) => {
      clearTimer();
      setValue(next);
      if (next != null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setValue(null);
        }, delayMs);
      }
    },
    [clearTimer, delayMs],
  );

  // Clear any pending timer when the hosting component unmounts.
  useEffect(() => clearTimer, [clearTimer]);

  return [value, show];
}
