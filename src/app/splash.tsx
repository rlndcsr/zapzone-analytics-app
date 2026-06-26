import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { markSplashPlayed } from "../lib/splashState";

const logo = require("../../assets/zapzone-assests/zapzone.png");

// --- Animation timeline (kept around the 2.5-3s target) ---
const ENTRANCE_MS = 600; // fade + scale-in
const ENTRANCE_PAUSE_MS = 120; // brief settle before the bounce starts
const BOUNCE_MS = 600; // full bounce cycle period (matches web 0.6s)
const BOUNCE_CYCLES = 3; // finite bounces, then rest
const SETTLE_PAUSE_MS = 400; // pause after settling, before navigating
const SPLASH_DURATION_MS =
  ENTRANCE_MS + ENTRANCE_PAUSE_MS + BOUNCE_CYCLES * BOUNCE_MS + SETTLE_PAUSE_MS;

// --- Logo motion (kept in lockstep with the web admin-login keyframes) ---
const RISE = 30;
const STRETCH_X = 1.05;
const SQUASH_Y = 0.95;

// --- Two-layer ground shadow ---
const INNER = { d: 0.2, blur: 0.06, alpha: 0.22, sx: 2.8, sy: 0.76 }; // dark core
const OUTER = { d: 0.32, blur: 0.13, alpha: 0.08, sx: 3.0, sy: 0.72 }; // ambient halo

// How each layer reacts as the logo rises (bounce 0 = landed, 1 = apex): both shrink
// and fade; the ambient halo fades a bit more so the shadow "lifts off" the floor.
const INNER_UP = { opacity: 0.7, scale: 0.9 };
const OUTER_UP = { opacity: 0.45, scale: 0.85 };

export default function Splash() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Responsive logo: ~half the screen width, capped so it never gets huge on tablets.
  const logoSize = Math.min(width * 0.5, 240);

  // Layout of the "animation area": logo floats a gap above a fixed ground shadow.
  // The logo and shadow are separate, anchored elements; only the logo translates.
  const groundHeight = logoSize * OUTER.d;
  const floatGap = logoSize * 0.1;
  const stageHeight = logoSize + floatGap + groundHeight;

  const intro = useSharedValue(0);
  const bounce = useSharedValue(0);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [
      { translateY: interpolate(bounce.value, [0, 1], [0, -RISE]) },
      { scale: interpolate(intro.value, [0, 1], [0.85, 1]) },
      { scaleX: interpolate(bounce.value, [0, 1], [1, STRETCH_X]) },
      { scaleY: interpolate(bounce.value, [0, 1], [1, SQUASH_Y]) },
    ],
  }));

  const innerShadowStyle = useAnimatedStyle(() => {
    const breathe = interpolate(bounce.value, [0, 1], [1, INNER_UP.scale]);
    return {
      opacity:
        intro.value * interpolate(bounce.value, [0, 1], [1, INNER_UP.opacity]),
      transform: [
        { scaleX: INNER.sx * breathe },
        { scaleY: INNER.sy * breathe },
      ],
    };
  });
  const outerShadowStyle = useAnimatedStyle(() => {
    const breathe = interpolate(bounce.value, [0, 1], [1, OUTER_UP.scale]);
    return {
      opacity:
        intro.value * interpolate(bounce.value, [0, 1], [1, OUTER_UP.opacity]),
      transform: [
        { scaleX: OUTER.sx * breathe },
        { scaleY: OUTER.sy * breathe },
      ],
    };
  });

  useEffect(() => {
    markSplashPlayed();

    SplashScreen.hideAsync().catch(() => {});

    intro.value = withTiming(1, {
      duration: ENTRANCE_MS,
      easing: Easing.out(Easing.cubic),
    });

    bounce.value = withDelay(
      ENTRANCE_MS + ENTRANCE_PAUSE_MS,
      withRepeat(
        withTiming(1, {
          duration: BOUNCE_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        BOUNCE_CYCLES * 2,
        true,
      ),
    );

    const timer = setTimeout(() => router.replace("/"), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={[styles.stage, { width: logoSize, height: stageHeight }]}>
        {/* Ground shadow: a soft ambient halo with a darker core on top, both
            anchored to the floor at the bottom of the stage. */}
        <View style={[styles.shadowGround, { height: groundHeight }]}>
          <Animated.View
            style={[
              styles.shadowOval,
              {
                width: logoSize * OUTER.d,
                height: logoSize * OUTER.d,
                backgroundColor: `rgba(0,0,0,${OUTER.alpha})`,
                filter: [{ blur: logoSize * OUTER.blur }],
              },
              outerShadowStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.shadowOval,
              {
                width: logoSize * INNER.d,
                height: logoSize * INNER.d,
                backgroundColor: `rgba(0,0,0,${INNER.alpha})`,
                filter: [{ blur: logoSize * INNER.blur }],
              },
              innerShadowStyle,
            ]}
          />
        </View>

        {/* Logo: floats a gap above the ground and bounces vertically. */}
        <Animated.View
          style={[
            styles.logoFloat,
            { bottom: groundHeight + floatGap },
            logoStyle,
          ]}
        >
          <Image
            source={logo}
            style={{ width: logoSize, height: logoSize }}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  stage: {
    alignItems: "center",
  },
  shadowGround: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  shadowOval: {
    position: "absolute",
    borderRadius: 999,
  },
  logoFloat: {
    position: "absolute",
  },
});
