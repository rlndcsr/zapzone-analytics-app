import { Feather } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

export function NavTileCard({
  icon,
  title,
  desc,
  onPress,
  disabled = false,
  badge,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  title: string;
  desc: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 rounded-2xl border border-gray-100 bg-white p-4 m-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
        disabled ? "opacity-60" : "active:opacity-70"
      }`}
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-[#0644C7]/10">
        <Feather name={icon} size={20} color={PRIMARY} />
      </View>
      <Text
        numberOfLines={2}
        className="mt-3 text-sm font-bold text-gray-900 dark:text-white"
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        className="mt-1 text-xs text-gray-500 dark:text-gray-400"
      >
        {desc}
      </Text>
      {badge ? (
        <View className="mt-2 self-start rounded-full bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
          <Text className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
