import { ActivityIndicator, Pressable, Text } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  className,
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
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-base font-semibold text-white">{label}</Text>
      )}
    </Pressable>
  );
}
