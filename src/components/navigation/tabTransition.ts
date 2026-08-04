import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Dimensions, Easing } from "react-native";

type SceneStyleInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>;
type TabTransitionSpec = NonNullable<
  BottomTabNavigationOptions["transitionSpec"]
>;

export const NAV_SLIDE_DURATION = 350;

export const TAB_TRANSITION_SPEC: TabTransitionSpec = {
  animation: "timing",
  config: {
    duration: NAV_SLIDE_DURATION,
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  },
};

export const forDirectionalSlide: SceneStyleInterpolator = ({ current }) => {
  const width = Dimensions.get("window").width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  };
};

export const STACK_SCREEN_TRANSITION = {
  animation: "ios_from_right",
  animationDuration: NAV_SLIDE_DURATION,
} satisfies {
  animation: "ios_from_right";
  animationDuration: number;
};
