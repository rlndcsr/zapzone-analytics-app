import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { markSplashPlayed } from "../lib/splashState";

const logo = require("../../assets/zapzone-assests/zapzone.png");

// Snappy: entrance is immediate, then a gentle breathe, then hand off to login.
const HOLD_MS = 1500;

export default function Splash() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const logoSize = Math.min(width * 0.28, 200);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.82);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    markSplashPlayed();
    SplashScreen.hideAsync().catch(() => {});

    const goToLogin = () => router.replace("/");

    // Smooth entrance — fade + scale in immediately (no delay).
    opacity.value = withTiming(1, {
      duration: 480,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.back(1.3)) }),
      // Gentle, continuous breathe while we wait — reads as "alive", not delayed.
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    // Fade the logo out, then navigate — the login's blue header makes the
    // hand-off read as one continuous blue surface.
    const timer = setTimeout(() => {
      opacity.value = withTiming(
        0,
        { duration: 260, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(goToLogin)();
        },
      );
    }, HOLD_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Radial-gradient blue backdrop (lighter glow near the top-center). */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="bg" cx="50%" cy="40%" r="80%">
            <Stop offset="0%" stopColor="#3E77F7" />
            <Stop offset="55%" stopColor="#2360EC" />
            <Stop offset="100%" stopColor="#1743C9" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#bg)" />
      </Svg>

      <Animated.View style={logoStyle}>
        <Image
          source={logo}
          style={{ width: logoSize, height: logoSize }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1743C9",
  },
});
