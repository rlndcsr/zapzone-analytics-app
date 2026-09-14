import {
  ActivityIndicator,
  type StyleProp,
  Text,
  type ViewStyle,
} from "react-native";

import { PressableScale } from "./motion/PressableScale";

/**
 * The soft — not pill — corner radius for buttons and fields on screens that
 * have moved off the fully-rounded look. Pass it as `style={{ borderRadius:
 * CONTROL_RADIUS }}`: NativeWind resolves conflicting utilities by CSS order,
 * not string order, and `rounded-full` sorts after `rounded-xl`, so a className
 * override would silently lose. The inline style wins.
 */
export const CONTROL_RADIUS = 12;

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Escape hatch for per-screen overrides (e.g. a squarer corner radius) —
   *  takes precedence over the className defaults. */
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  className,
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    // `surface`, not the default: this is a full-width control, where the
    // smaller chip scale would be too subtle to register. The old
    // `active:opacity-90` is gone — PressableScale owns the press feedback now,
    // and leaving both would dim it twice.
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      pressScale="surface"
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      android_ripple={{ color: "#1E3A8A" }}
      className={`h-14 flex-row items-center justify-center rounded-full bg-[#0A2472] ${
        isDisabled ? "opacity-60" : ""
      } ${className ?? ""}`}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-base font-semibold text-white">{label}</Text>
      )}
    </PressableScale>
  );
}
