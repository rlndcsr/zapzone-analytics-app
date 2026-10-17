import { Feather } from "@expo/vector-icons";
import { Switch, Text, View } from "react-native";

import {
  backendOnlyHint,
  ONLINE_FIELD_LOCKED,
  onlineFieldHelp,
} from "../../lib/packages/onlineAvailability";
import { Section } from "./attractionFormKit";

const PRIMARY = "#0644C7";

export function BackendOnlyBadge({
  isActive = true,
  size = "sm",
}: {
  isActive?: boolean;
  size?: "xs" | "sm";
}) {
  return (
    <View
      accessible
      accessibilityLabel={`Backend only. ${backendOnlyHint(isActive)}`}
      className={`flex-row items-center gap-1 self-start rounded-md bg-amber-100 dark:bg-amber-900/30 ${
        size === "xs" ? "px-1.5 py-0.5" : "px-2.5 py-1"
      }`}
    >
      <Feather name="eye-off" size={size === "xs" ? 10 : 11} color="#92400E" />
      <Text
        className={`font-medium text-amber-800 dark:text-amber-300 ${
          size === "xs" ? "text-[10px]" : "text-xs"
        }`}
      >
        Backend only
      </Text>
    </View>
  );
}

/**
 * The create / edit form's Front-End Availability box. Everyone sees the
 * setting; only managers and admins can change it (the server refuses others).
 */
export function OnlineAvailabilityField({
  checked,
  canChange,
  isActive = true,
  onChange,
}: {
  checked: boolean;
  canChange: boolean;
  isActive?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Section
      icon={checked ? "globe" : "eye-off"}
      title="Front-End Availability"
    >
      <View
        className={`flex-row items-start gap-3 rounded-xl border px-4 py-3 ${
          checked
            ? "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
        }`}
      >
        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${
              checked
                ? "text-gray-800 dark:text-gray-100"
                : "text-amber-950 dark:text-amber-200"
            }`}
          >
            Customers can see and book this package online
          </Text>
          <Text
            className={`mt-1 text-xs leading-5 ${
              checked
                ? "text-gray-500 dark:text-gray-400"
                : "text-amber-900 dark:text-amber-300"
            }`}
          >
            {onlineFieldHelp(checked, isActive)}
          </Text>
          {!canChange && (
            <Text
              className={`mt-1 text-xs ${
                checked
                  ? "text-gray-500 dark:text-gray-400"
                  : "text-amber-800 dark:text-amber-300"
              }`}
            >
              {ONLINE_FIELD_LOCKED}
            </Text>
          )}
        </View>
        <Switch
          value={checked}
          onValueChange={onChange}
          disabled={!canChange}
          accessibilityLabel="Customers can see and book this package online"
          trackColor={{ false: "#D1D5DB", true: "#86B7FF" }}
          thumbColor={checked ? PRIMARY : "#F3F4F6"}
        />
      </View>
    </Section>
  );
}
