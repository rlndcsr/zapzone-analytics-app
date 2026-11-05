import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";

export type RowAction = {
  key: string;
  icon: FeatherIconName;
  color: string;
  label: string;
  onPress: () => void;
};

export function RowActionGroup({
  actions,
}: {
  actions: (RowAction | false | null | undefined)[];
}) {
  const shown = actions.filter((a): a is RowAction => !!a);
  if (shown.length === 0) return null;
  return (
    <View className="flex-row items-center self-start rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
      {shown.map((a, i) => (
        <Pressable
          key={a.key}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
            i > 0 ? "border-l border-gray-200 dark:border-neutral-700" : ""
          }`}
        >
          <Feather name={a.icon} size={15} color={a.color} />
        </Pressable>
      ))}
    </View>
  );
}
