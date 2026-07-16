import { router } from "expo-router";
import { Bell, Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { getCurrentUser } from "../../lib/session";

/** Friendly labels for the backend staff roles. */
const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  location_manager: "Manager",
  attendant: "Attendant",
};

type DashboardHeaderProps = {
  /** Unread notification count for the badge (hidden when 0). */
  unreadCount?: number;
  /** Optional screen title rendered beneath the top row. */
  title?: string;
  /** Drop the white background + border so a screen gradient shows through. */
  transparent?: boolean;
  /**
   * Replaces the default notifications + settings actions on the right (e.g. a
   * Logout button on the Profile tab). When set, `unreadCount` is ignored.
   */
  rightSlot?: ReactNode;
};

/**
 * Shared app header — avatar + greeting on the left, notifications + settings on
 * the right. Used by the Home, Calendar, Activity, Location, and Profile tabs.
 * Pass `transparent` to let a screen background (e.g. Home's gradient) show
 * through, or `rightSlot` to swap the default actions (e.g. Profile's Logout).
 */
export function DashboardHeader({
  unreadCount = 0,
  title,
  transparent,
  rightSlot,
}: DashboardHeaderProps) {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const user = getCurrentUser();
  const roleLabel = user?.role
    ? (ROLE_LABELS[user.role] ??
      user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    : "there";
  const initials =
    `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`
      .toUpperCase()
      .trim() || "U";

  return (
    <View
      className={`pt-12 pb-4 px-5 w-full relative z-10 ${
        transparent
          ? ""
          : "bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800"
      }`}
    >
      <View className="flex-row items-center justify-between">
        {/* Left: avatar + greeting */}
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <View className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
            <Text className="text-sm font-bold text-[#2563EB] dark:text-blue-300">
              {initials}
            </Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-[15px] font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              Hello, {roleLabel}
            </Text>
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              Welcome back
            </Text>
          </View>
        </View>

        {/* Right: notifications + settings, or a custom action (e.g. Logout) */}
        <View className="flex-row items-center gap-4">
          {rightSlot ?? (
            <>
              <Pressable
                onPress={() => router.push("/notification/notification")}
                hitSlop={8}
                className="flex-row items-center gap-1"
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Bell size={22} color={headerIcon} />
                {unreadCount > 0 && (
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => router.push("/settings/settings")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Settings size={22} color={headerIcon} />
              </Pressable>
            </>
          )}
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
