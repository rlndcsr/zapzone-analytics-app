import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { ParamListBase } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";

import { TAB_SCENE_DURATION } from "../../components/navigation/navMotion";

/** Slack past the scene animation, for a JS thread running a frame or two late. */
const SETTLE_SLACK_MS = 50;

/**
 * False on a tab screen's first render, true once the tab switch that brought
 * it up has finished animating.
 *
 * A tab holds its first data load on this, so a tap paints the screen (and its
 * skeleton) at once and the response — and the big render it triggers — lands
 * after the switch instead of in the middle of it.
 */
export function useTabTransitionDone(): boolean {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const finish = () => setDone(true);
    const unsubscribe = navigation.addListener("transitionEnd", finish);
    // A tab that mounts without a switch (the first one at launch) never gets
    // a transitionEnd, so the scene's own duration is the backstop.
    const timer = setTimeout(finish, TAB_SCENE_DURATION + SETTLE_SLACK_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [navigation, done]);

  return done;
}
