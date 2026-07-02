import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

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
  return (
    <View className="bg-[#0644C7] pt-12 pb-4 px-5 w-full relative overflow-hidden z-10">
      <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <View className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
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
              className="bg-white/20 backdrop-blur-sm rounded-full px-3.5 py-1.5 flex-row items-center gap-2"
            >
              <Image
                source={require("../../../assets/zapzone-assests/icon/notification-bell.png")}
                style={{ width: 16, height: 16 }}
                contentFit="contain"
                tintColor="#FFFFFF"
              />
              <Text className="text-white text-xs font-semibold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/settings/settings")}
            className="bg-white/20 backdrop-blur-sm p-2 rounded-full"
          >
            <Image
              source={require("../../../assets/zapzone-assests/icon/settings.png")}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
              tintColor="#FFFFFF"
            />
          </Pressable>
        </View>
      </View>

      {title ? (
        <Text className="text-xl font-bold text-white mt-3">{title}</Text>
      ) : null}
    </View>
  );
}
