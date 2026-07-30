import { Feather } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

const NAV_ROW_SHADOW = {
  shadowColor: "#424242",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

/**
 * Full-width sub-page shortcut: icon tile, title + one-line description, and a
 * chevron. The single design for every module's navigation "box" (Packages'
 * Space / Add-ons / Promos, Bookings' Space Schedule / Location Requests …), so
 * stacking any number of them stays balanced.
 */
export function NavRowCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
      style={NAV_ROW_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="w-11 h-11 rounded-xl bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={20} color={PRIMARY} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
        <Text
          numberOfLines={1}
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
        >
          {desc}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={PRIMARY} />
    </Pressable>
  );
}
