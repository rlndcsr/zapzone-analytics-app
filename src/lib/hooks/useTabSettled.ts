import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";

import { TAB_SETTLE_MS } from "../../components/navigation/navMotion";

/**
 * False on a tab screen's first render, true once the tab has stayed on screen
 * for {@link TAB_SETTLE_MS}.
 *
 * A tab holds its first data load and its heaviest render on this, so a tap
 * paints the screen (and its skeleton) at once. Leaving the tab before it
 * settles cancels the wait, so tapping quickly through the bar never starts a
 * screen's heavy work behind the one actually chosen — it starts the next time
 * that tab is shown and stays.
 */
export function useTabSettled(): boolean {
  const navigation = useNavigation();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSettled(true), TAB_SETTLE_MS);
    };
    const disarm = () => clearTimeout(timer);

    if (navigation.isFocused()) arm();
    const unsubscribeFocus = navigation.addListener("focus", arm);
    const unsubscribeBlur = navigation.addListener("blur", disarm);
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      clearTimeout(timer);
    };
  }, [navigation, settled]);

  return settled;
}
