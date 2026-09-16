import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Bell, Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useBrandLogo } from "../../lib/hooks/useBrandLogo";
import { getCurrentUser } from "../../lib/session";
import { BrandLogo } from "./BrandLogo";
import { InitialsAvatar } from "./InitialsAvatar";

/** Friendly labels for the backend staff roles. */
const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  location_manager: "Manager",
  attendant: "Attendant",
};

/** Round profile button on the brand layout — sized to match InitialsAvatar. */
const PROFILE_BUTTON_SIZE = 40;

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
  /**
   * `default` — avatar + greeting left, logo centre, notifications + settings
   * right. `brand` — profile button left, logo centred on the row itself,
   * notifications right, and no greeting at all (Home).
   */
  variant?: "default" | "brand";
};

/**
 * Shared app header — used by the Home, Calendar, Activity, Location, and
 * Profile tabs. Pass `transparent` to let a screen background (e.g. Home's
 * gradient) show through, `rightSlot` to swap the default actions (e.g.
 * Profile's Logout), or `variant="brand"` for Home's logo-first layout.
 */
export function DashboardHeader({
  unreadCount = 0,
  title,
  transparent,
  rightSlot,
  variant = "default",
}: DashboardHeaderProps) {
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const brandLogoSrc = useBrandLogo();

  const user = getCurrentUser();
  const roleLabel = user?.role
    ? (ROLE_LABELS[user.role] ??
      user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    : "there";
  const initials =
    `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`
      .toUpperCase()
      .trim() || "U";

  const notificationsButton = (
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
  );

  const wrapperClass = `pt-12 pb-4 px-5 w-full relative z-10 ${
    transparent
      ? ""
      : "bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800"
  }`;

  const titleLine = title ? (
    <Text className="text-xl font-bold text-gray-900 dark:text-white mt-3">
      {title}
    </Text>
  ) : null;

  if (variant === "brand") {
    return (
      <View className={wrapperClass}>
        <View
          className="flex-row items-center justify-between"
          style={{ height: PROFILE_BUTTON_SIZE }}
        >
          {/* Left: profile — pushed over the tabs, since Accounts holds the
              tab slot the Profile screen used to. */}
          <Pressable
            onPress={() => router.push("/profile")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            className="items-center justify-center rounded-full bg-blue-100 active:opacity-70 dark:bg-blue-900/40"
            style={{ width: PROFILE_BUTTON_SIZE, height: PROFILE_BUTTON_SIZE }}
          >
            <Ionicons name="person" size={20} color="#2563EB" />
          </Pressable>

          {/* Centre: the brand logo, centred on the row itself so an unread
              badge growing on the right can never nudge it off centre. */}
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <BrandLogo src={brandLogoSrc} size="sm" />
          </View>

          {/* Right: notifications (or a custom action, e.g. Logout) */}
          <View className="flex-row items-center gap-4">
            {rightSlot ?? notificationsButton}
          </View>
        </View>

        {titleLine}
      </View>
    );
  }

  return (
    <View className={wrapperClass}>
      <View className="flex-row items-center justify-between">
        {/* Left: avatar + greeting */}
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <InitialsAvatar initials={initials} />
          <View className="flex-1">
            <Text
              className="text-[15px] font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              Hello, {roleLabel}
            </Text>
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              Here's what's happening today
            </Text>
          </View>
        </View>

        {/* Center: the location/company brand logo — web parity. */}
        <BrandLogo src={brandLogoSrc} size="sm" className="mx-2" />

        {/* Right: notifications + settings, or a custom action (e.g. Logout) */}
        <View className="flex-row items-center gap-4">
          {rightSlot ?? (
            <>
              {notificationsButton}
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

      {titleLine}
    </View>
  );
}
