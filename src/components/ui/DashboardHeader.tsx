import { Image } from "expo-image";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";
import { Bell, Settings } from "lucide-react-native";

type DashboardHeaderProps = {
  /** Unread notification count for the badge (hidden when 0). */
  unreadCount: number;
  /** Optional screen title rendered beneath the top row. */
  title?: string;
};

/**
 * Shared gradient app header (ZapZone logo + notification badge + settings) used
 * by the Home, Calendar, and Activity tabs. Pass `title` to add a heading below.
 */
export function DashboardHeader({ unreadCount, title }: DashboardHeaderProps) {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  return (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between relative z-10">
        <Pressable>
          <Image
            source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
            style={{ width: 70, height: 28 }}
            contentFit="contain"
          />
        </Pressable>
        <View className="flex-row items-center gap-3">
          {unreadCount > 0 && (
            <Pressable
              onPress={() => router.push("/notification/notification")}
              className="bg-gray-100 dark:bg-neutral-800 rounded-full px-3.5 py-1.5 flex-row items-center gap-2"
            >
              <Bell size={16} color={headerIcon} />
              <Text className="text-gray-900 dark:text-white text-xs font-semibold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/settings/settings")}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          >
            <Settings size={20} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      {title ? (
        <Text className="text-xl font-bold text-gray-900 dark:text-white mt-3">
          {title}
        </Text>
      ) : null}
    </View>
  );
}