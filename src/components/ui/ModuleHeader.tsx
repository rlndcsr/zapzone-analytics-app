import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Pressable, Text, TextInput, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";

export type ModuleHeaderAction = {
  onPress: () => void;
  accessibilityLabel: string;
  label?: string;
  icon?: FeatherIconName;
};

export function ModuleHeader({
  title,
  action,
  onBack,
}: {
  title: string;
  action?: ModuleHeaderAction;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  return (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onBack ?? (() => router.back())}
          className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <Text
          numberOfLines={1}
          className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
        >
          {title}
        </Text>
        {!!action && (
          <Pressable
            onPress={action.onPress}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <Feather name={action.icon ?? "plus"} size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              {action.label ?? "New"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
      <Feather name="search" size={16} color="#9CA3AF" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        returnKeyType="search"
        className="flex-1 text-sm text-gray-900 dark:text-white"
        style={{ paddingVertical: 0 }}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Feather name="x-circle" size={16} color="#9CA3AF" />
        </Pressable>
      )}
    </View>
  );
}
