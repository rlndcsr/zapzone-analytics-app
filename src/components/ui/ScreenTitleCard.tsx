import { Text, View } from "react-native";

type ScreenTitleCardProps = {
  /** Screen title (bold, primary line). */
  title: string;
  /** Short description shown beneath the title. */
  subtitle: string;
};

/**
 * White rounded title card rendered directly below the blue DashboardHeader on
 * the Calendar and Activity tabs. Only the title/subtitle text differs per screen.
 */
export function ScreenTitleCard({ title, subtitle }: ScreenTitleCardProps) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
      <Text className="text-lg font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {subtitle}
      </Text>
    </View>
  );
}
