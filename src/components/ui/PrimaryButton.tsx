import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  Text,
  type ViewStyle,
} from "react-native";

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
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      android_ripple={{ color: "#1E3A8A" }}
      className={`h-14 flex-row items-center justify-center rounded-full bg-[#0A2472] active:opacity-90 ${
        isDisabled ? "opacity-60" : ""
      } ${className ?? ""}`}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-base font-semibold text-white">{label}</Text>
      )}
    </Pressable>
  );
}
