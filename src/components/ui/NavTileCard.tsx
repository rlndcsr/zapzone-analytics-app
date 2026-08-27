import { Feather } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#424242",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

/** A square shortcut tile — the shared design every module's sub-page grid
 *  uses: icon chip, title, two-line description and a bottom action row whose
 *  chevron sits at the card's right edge. A `badge` replaces that action row. */
export function NavTileCard({
  icon,
  renderIcon,
  title,
  desc,
  cta = "Open",
  onPress,
  disabled = false,
  badge,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  /**
   * Draws the icon chip's glyph instead of `icon`, for the odd tile whose web
   * counterpart uses a symbol Feather doesn't have (e.g. footprints). Receives
   * the chip's colour and size so any icon set matches the Feather ones.
   */
  renderIcon?: (color: string, size: number) => ReactNode;
  title: string;
  desc: string;
  cta?: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`aspect-square rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
        disabled ? "opacity-60" : "active:opacity-70"
      }`}
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-xl bg-[#0644C7]/10">
        {renderIcon ? (
          renderIcon(PRIMARY, 20)
        ) : (
          <Feather name={icon} size={20} color={PRIMARY} />
        )}
      </View>
      <Text
        numberOfLines={1}
        className="mb-1 text-sm font-bold text-gray-900 dark:text-white"
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={{ minHeight: 28 }}
        className="text-[10px] leading-tight text-gray-500 dark:text-gray-400"
      >
        {desc}
      </Text>
      <View className="mt-auto flex-row items-center justify-between border-t border-gray-100 pt-3 dark:border-neutral-800">
        {badge ? (
          <View className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
            <Text className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {badge}
            </Text>
          </View>
        ) : (
          <>
            <Text
              numberOfLines={1}
              className="mr-1 flex-1 text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              {cta}
            </Text>
            <Feather name="chevron-right" size={16} color={PRIMARY} />
          </>
        )}
      </View>
    </Pressable>
  );
}
