import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useRef } from "react";
import { BackHandler, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { surfaceFor } from "../components/navigation/navMotion";
import { InitialsAvatar } from "../components/ui/InitialsAvatar";
import { formatAccountRole } from "../components/ui/SavedAccountRow";
import {
  ACTIVE_ACCOUNT_BLUE,
  ACTIVE_ACCOUNT_TINT,
} from "../lib/accounts/accountAccent";
import { useSavedAccounts } from "../lib/accounts/savedAccountsStore";
import {
  commitPendingSwitch,
  SWITCH_MIN_DWELL_MS,
} from "../lib/accounts/switchAccount";
// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../lib/debug/authDebug";
import { isAuthenticated } from "../lib/session";

const DOT_PULSE_MS = 420;
const DOT_STAGGER_MS = 140;

function PulsingDot({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * DOT_STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_PULSE_MS }),
          withTiming(0, { duration: DOT_PULSE_MS }),
        ),
        -1,
        false,
      ),
    );
  }, [index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + progress.value * 0.75,
    transform: [{ scale: 0.8 + progress.value * 0.4 }],
  }));

  return (
    <Animated.View
      style={[
        { width: 7, height: 7, borderRadius: 4, backgroundColor: color },
        style,
      ]}
    />
  );
}

export default function SwitchAccount() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  const accounts = useSavedAccounts();
  const target = accounts.find((a) => a.userId === Number(userId));

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withSpring(1, { damping: 14, stiffness: 140 });
  }, [entrance]);

  const avatarStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: 0.9 + entrance.value * 0.1 }],
  }));

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const committedRef = useRef(false);
  useEffect(() => {
    if (committedRef.current) return;
    committedRef.current = true;

    const run = async () => {
      const startedAt = Date.now();
      const committed = await commitPendingSwitch();

      const remaining = SWITCH_MIN_DWELL_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      if (committed || isAuthenticated()) {
        authDebug('switch-account router.replace("/home")', { committed });
        router.replace("/home");
      } else {
        authDebug('switch-account router.replace("/")', { committed });
        router.replace("/");
      }
    };

    void run();
  }, [router]);

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: surfaceFor(colorScheme) }}
    >
      <StatusBar style="auto" />

      <Animated.View style={avatarStyle} className="items-center">
        {target ? (
          <View
            className="items-center justify-center rounded-full"
            style={{
              padding: 4,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: ACTIVE_ACCOUNT_BLUE,
            }}
          >
            <InitialsAvatar initials={target.initials} size={84} />
          </View>
        ) : (
          <View
            className="h-[92px] w-[92px] rounded-full"
            style={{ backgroundColor: ACTIVE_ACCOUNT_TINT }}
          />
        )}
      </Animated.View>

      <View className="mt-7 h-2 flex-row items-center gap-2">
        {[0, 1, 2].map((index) => (
          <PulsingDot key={index} index={index} color={ACTIVE_ACCOUNT_BLUE} />
        ))}
      </View>

      <Text className="mt-7 text-[13px] font-medium uppercase tracking-[1.5px] text-gray-400 dark:text-gray-500">
        Switching account
      </Text>
      <Text className="mt-2 text-center text-[20px] font-semibold text-gray-900 dark:text-white">
        {target?.name ?? "Please wait"}
      </Text>
      {target ? (
        <Text className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
          {formatAccountRole(target.role)}
        </Text>
      ) : null}
    </View>
  );
}
