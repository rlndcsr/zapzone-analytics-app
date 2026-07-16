import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

const PILL_SHADOW = {
  shadowColor: "#424242",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;

/**
 * Shared segmented filter pill — a single rounded, bordered container whose
 * children are equal-width segments (each {@link PillSegment} is `flex-1`), so
 * the row always spans the full width and shares the extra space evenly. Used on
 * the dashboard and the catalog screens so every filter pill looks identical.
 */
export function FilterPill({ children }: { children: ReactNode }) {
  return (
    <View
      className="flex-row items-center gap-1.5 bg-white dark:bg-neutral-900 p-1.5 rounded-2xl border border-gray-100 dark:border-neutral-800 mb-5"
      style={PILL_SHADOW}
    >
      {children}
    </View>
  );
}

/** Thin vertical divider placed between {@link PillSegment}s inside a
 *  {@link FilterPill}; inset slightly so it reads as a separator, not a border. */
export function PillDivider() {
  return <View className="w-px self-stretch my-1 bg-gray-200 dark:bg-neutral-700" />;
}

/**
 * One equal-width segment inside a {@link FilterPill}. Renders blue (active) or
 * transparent (default); `renderIcon` receives the resolved icon color so it
 * works with any icon set (Feather / lucide).
 */
export function PillSegment({
  label,
  active = false,
  onPress,
  renderIcon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  renderIcon: (color: string) => ReactNode;
}) {
  const color = active ? "#FFFFFF" : "#6B7280";
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl ${
        active ? "bg-[#0644C7]" : "bg-transparent"
      }`}
      style={active ? { backgroundColor: PRIMARY } : undefined}
    >
      {renderIcon(color)}
      <Text
        className={`text-xs font-semibold shrink ${
          active ? "text-white" : "text-gray-600 dark:text-gray-300"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
