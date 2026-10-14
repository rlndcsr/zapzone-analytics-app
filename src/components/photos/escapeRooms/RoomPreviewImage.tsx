import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { mediaUrl } from "../../../lib/api";
import { roomImageCandidates } from "../../../lib/escapeRooms/escapeRooms";

/**
 * A room's package photo on the escape-room check-in (web RoomPreviewImage):
 * the preview, else the photo, over a door placeholder that pulses while the
 * preview is still being made.
 */
export function RoomPreviewImage({
  room,
  waiting = false,
  iconSize = 28,
  style,
}: {
  room: { image?: string | null; imagePreview?: string | null } | null | undefined;
  waiting?: boolean;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = roomImageCandidates(room, waiting, mediaUrl).find((url) => !failed.includes(url));

  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (waiting && !reduceMotion) {
      pulse.value = 0.4;
      pulse.value = withRepeat(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [waiting, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View
      className="overflow-hidden bg-blue-800"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.center, pulseStyle]}
      >
        <MaterialCommunityIcons
          name="door-open"
          size={iconSize}
          color="rgba(255,255,255,0.7)"
        />
      </Animated.View>
      {!!src && (
        <Image
          key={src}
          source={{ uri: src }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          onError={() =>
            setFailed((list) => (list.includes(src) ? list : [...list, src]))
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
