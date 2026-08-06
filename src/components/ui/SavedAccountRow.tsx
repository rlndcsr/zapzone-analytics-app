import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  ACTIVE_ACCOUNT_BLUE,
  ACTIVE_ACCOUNT_TINT,
} from "../../lib/accounts/accountAccent";
import type { SavedAccount } from "../../lib/accounts/savedAccountsStore";
import { InitialsAvatar } from "./InitialsAvatar";

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  location_manager: "Location Manager",
  attendant: "Attendant",
};

export function formatAccountRole(role?: string | null): string {
  if (!role) return "Staff";
  return (
    ROLE_LABELS[role] ??
    role
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function contextLine(account: SavedAccount): string {
  return [
    formatAccountRole(account.role),
    account.companyName,
    account.locationName,
  ]
    .filter(Boolean)
    .join(" · ");
}

type SavedAccountRowProps = {
  account: SavedAccount;
  isActive?: boolean;
  compact?: boolean;
  onPress?: () => void;
  onMore?: () => void;
  onRemove?: () => void;
  busy?: boolean;
  disabled?: boolean;
};

export function SavedAccountRow({
  account,
  isActive = false,
  compact = false,
  onPress,
  onMore,
  onRemove,
  busy = false,
  disabled = false,
}: SavedAccountRowProps) {
  const needsPassword = account.tokenState === "signin_required";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy || !onPress}
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${account.email}`}
      accessibilityState={{ selected: isActive, disabled: disabled || busy }}

      className={`flex-row items-center rounded-2xl border border-gray-100 bg-white active:opacity-80 dark:border-neutral-800 dark:bg-neutral-900 ${
        compact ? "px-3 py-2.5" : "px-4 py-4"
      }`}
      style={{
        opacity: disabled ? 0.5 : 1,

        ...(isActive
          ? {
              backgroundColor: ACTIVE_ACCOUNT_TINT,
              borderColor: ACTIVE_ACCOUNT_BLUE,
              borderWidth: 1.5,
            }
          : null),
      }}
    >
      <InitialsAvatar initials={account.initials} />

      <View className="ml-3 flex-1">
        <Text
          numberOfLines={1}
          className={`font-semibold text-gray-900 dark:text-white ${
            compact ? "text-[14px]" : "text-[15px]"
          }`}
        >
          {account.name}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400"
        >
          {account.email}
        </Text>
        {!compact && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-[12px] text-gray-400 dark:text-gray-500"
          >
            {contextLine(account)}
          </Text>
        )}
        {compact && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500"
          >
            {formatAccountRole(account.role)}
          </Text>
        )}

        {isActive && (
          <View className="mt-2 flex-row items-center">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: ACTIVE_ACCOUNT_BLUE }}
            />
            <Text
              className="ml-2 text-[12px] font-semibold"
              style={{ color: ACTIVE_ACCOUNT_BLUE }}
            >
              Current Session
            </Text>
          </View>
        )}

        {!isActive && needsPassword && (
          <View className="mt-1.5 flex-row items-center">
            <Feather name="lock" size={11} color="#B45309" />
            <Text className="ml-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
              Sign-in required
            </Text>
          </View>
        )}
      </View>

      {busy ? (
        <ActivityIndicator size="small" color={ACTIVE_ACCOUNT_BLUE} />
      ) : (
        <View className="flex-row items-center">
          {!isActive && onPress && !onRemove && (
            <Feather name="chevron-right" size={18} color="#9CA3AF" />
          )}
          {onRemove && (
            <Pressable
              onPress={onRemove}
              disabled={busy}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${account.name}`}
              className="h-9 w-9 items-center justify-center rounded-full bg-red-50 active:opacity-60 dark:bg-red-900/20"
            >
              <Feather name="trash-2" size={16} color="#EF4444" />
            </Pressable>
          )}
          {onMore && (
            <Pressable
              onPress={onMore}
              disabled={disabled || busy}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${account.name}`}
              className="ml-1 h-8 w-8 items-center justify-center rounded-full active:opacity-60"
            >
              <Feather name="more-horizontal" size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}
